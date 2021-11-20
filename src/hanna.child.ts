import {PluginType, ChildEventType} from './catalogs';
import {MacAddress} from './classes/mac.utility';
import {ChildProcessMessageEvent} from './events/child-process.event';
import {HannaAPI} from './hanna.api';
import {AccessoryPlugin} from './interfaces/accessory-plugin';
import {AccessoryConfig} from './models/accessory.configuration';
import {BridgeConfiguration} from './models/bridge.configuration';
import {ChildProcessLoadEventData} from './models/child-process-load-event.model';
import {ChildProcessPluginLoadedEventData} from './models/child-process-plugin-loaded.data';
import {ChildProcessPortAllocatedEventData} from './models/child-process-port-allocated.data';
import {ChildProcessPortRequestEventData} from './models/child-process-port-request.data';
import {HannaConfig} from './models/hanna.configuration';
import {PlatformPlugin} from './models/platform-plugin';
import {PlatformConfig} from './models/platform.configuration';
import {User} from './models/user.model';
import {BridgeOptions} from './options';
import {PluginManager} from './plugins/manager/plugin.manager';
import {Plugin} from './plugins/plugin';
import BridgeService from './services/bridge.service';
import {Logger} from './services/logger.service';
import {ChildBridgePortService} from './services/port.service';
import {HAPStorage} from 'hap-nodejs';

process.title = 'hanna: child bridge';

/** This is a standalone script executed as a child process fork */
export default class HannaChild {
  private _bridgeService!: BridgeService;
  private _api!: HannaAPI;
  private _pluginManager!: PluginManager;
  private _externalPortService!: ChildBridgePortService;

  private _type!: PluginType;
  private _plugin!: Plugin;
  private _identifier!: string;
  private _pluginConfig!: Array<PlatformConfig | AccessoryConfig>;
  private _bridgeConfig!: BridgeConfiguration;
  private _bridgeOptions!: BridgeOptions;
  private _hannaConfig!: HannaConfig;

  private _portRequestCallback: Map<MacAddress, (port: number | undefined) => void> = new Map();

  constructor() {
    // tell the parent process we are ready to accept plugin config
    this.sendMessage(ChildEventType.READY);
  }

  public sendMessage<T = unknown>(type: ChildEventType, data?: T): void {
    if (process.send) {
      process.send({ id: type, data });
    }
  }

  public loadPlugin(data: ChildProcessLoadEventData): void {
    this._type          = data.type;
    this._identifier    = data.identifier;
    this._pluginConfig  = data.pluginConfig;
    this._bridgeConfig  = data.bridgeConfig;
    this._bridgeOptions = data.bridgeOptions;
    this._hannaConfig   = data.hannaConfig;

    // Remove the _bridge key (some plugins do not like unknown config)
    for (const config of this._pluginConfig) delete config._bridge;

    // Set bridge settings (inherited from main bridge)
    if (this._bridgeOptions.noLogTimestamps)    Logger.setTimestampEnabled(false);
    if (this._bridgeOptions.debugModeEnabled)   Logger.setDebugEnabled(true);
    if (this._bridgeOptions.forceColourLogging) Logger.forceColor();

    if (this._bridgeOptions.customStoragePath)  User.setStoragePath(this._bridgeOptions.customStoragePath);

    // Initialize HAP-NodeJS with a custom persist directory
    HAPStorage.setCustomStoragePath(User.persistPath());

    // Load API
    this._api                 = new HannaAPI();
    this._pluginManager       = new PluginManager(this._api);
    this._externalPortService = new ChildBridgePortService(this);

    // Load Plugin
    this._plugin = this._pluginManager.loadPlugin(data.pluginPath);
    this._plugin.load();
    this._pluginManager.initializePlugin(this._plugin, data.identifier);

    // Change process title to include plugin name
    process.title = `hanna: ${this._plugin.getPluginIdentifier()}`;

    this.sendMessage<ChildProcessPluginLoadedEventData>(ChildEventType.LOADED, {
      version: this._plugin.version
    });
  }

  public async startBridge(): Promise<void> {
    this._bridgeService = new BridgeService(
      this._api,
      this._pluginManager,
      this._externalPortService,
      this._bridgeOptions,
      this._bridgeConfig,
      this._hannaConfig
    );

    // Load the cached accessories
    await this._bridgeService.loadCachedPlatformAccessoriesFromDisk();

    for (const config of this._pluginConfig) {
      if (this._type === PluginType.PLATFORM) {
        const plugin                    = this._pluginManager.getPluginForPlatform(this._identifier);
        const displayName               = config.name || plugin.getPluginIdentifier();
        const logger                    = Logger.withPrefix(displayName);
        const constructor               = plugin.getPlatformConstructor(this._identifier);
        const platform: PlatformPlugin  = new constructor(logger, config as PlatformConfig, this._api);

        if (HannaAPI.isDynamicPlatformPlugin(platform)) {
          plugin.assignDynamicPlatform(this._identifier, platform);
        } else if (HannaAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
          await this._bridgeService.loadPlatformAccessories(plugin, platform, this._identifier, logger);
        } else {
          // Otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
          // We just call the constructor and let it be enabled.
        }

      } else if (this._type === PluginType.ACCESSORY) {
        const plugin = this._pluginManager.getPluginForAccessory(this._identifier);
        const displayName = config.name;

        if (!displayName) {
          Logger.internal.warn("Could not load accessory %s as it is missing the required 'name' property!", this._identifier);
          return;
        }

        const logger                              = Logger.withPrefix(displayName);
        const constructor                         = plugin.getAccessoryConstructor(this._identifier);
        const accessoryInstance: AccessoryPlugin  = new constructor(logger, config as AccessoryConfig, this._api);

        //pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
        const accessory = this._bridgeService.createHAPAccessory(plugin, accessoryInstance, displayName, this._identifier, config.uuid_base);

        if (accessory) {
          this._bridgeService.bridge.addBridgedAccessory(accessory);
        } else {
          logger("Accessory %s returned empty set of services. Won't adding it to the bridge!", this._identifier);
        }
      }
    }

    // Restore the cached accessories
    this._bridgeService.restoreCachedPlatformAccessories();

    this._bridgeService.publishBridge();
    this._api.signalFinished();

    // Tell the parent we are online
    this.sendMessage(ChildEventType.ONLINE);
  }

  /**
   * Request the next available external port from the parent process
   * @param username
   */
  public async requestExternalPort(username: MacAddress): Promise<number | undefined> {
    return new Promise((resolve) => {
      const requestTimeout = setTimeout(() => {
        Logger.internal.warn('Parent process did not respond to port allocation request within 5 seconds - assigning random port.');
        resolve(undefined);
      }, 5000);

      // Setup callback
      const callback = (port: number | undefined) => {
        clearTimeout(requestTimeout);
        resolve(port);
        this._portRequestCallback.delete(username);
      };
      this._portRequestCallback.set(username, callback);

      // send port request
      this.sendMessage<ChildProcessPortRequestEventData>(ChildEventType.PORT_REQUEST, { username });
    });
  }

  /**
   * Handles the port allocation response message from the parent process
   * @param data
   */
  public handleExternalResponse(data: ChildProcessPortAllocatedEventData): void {
    const callback = this._portRequestCallback.get(data.username);
    if (callback) callback(data.port);
  }

  public shutdown(): void {
    this._bridgeService.teardown();
  }
}

/** Start Self */
const childPluginFork = new HannaChild();

/** Handle incoming IPC messages from the parent Hanna process */
process.on('message', (message: ChildProcessMessageEvent<unknown>) => {
  if (typeof message !== "object" || !message.id) return;

  switch (message.id) {
    case ChildEventType.LOAD: {
      childPluginFork.loadPlugin(message.data as ChildProcessLoadEventData);
      break;
    }
    case ChildEventType.START: {
      childPluginFork.startBridge();
      break;
    }
    case ChildEventType.PORT_ALLOCATED: {
      childPluginFork.handleExternalResponse(message.data as ChildProcessPortAllocatedEventData);
      break;
    }
  }
});

/** Handle the sigterm shutdown signals */
let shuttingDown = false;

const signalHandler = (signal: NodeJS.Signals, signalNum: number): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  Logger.internal.info("Got %s, shutting down child bridge process...", signal);

  try {
    childPluginFork.shutdown();
  } catch (e) {
    // do nothing
  }

  setTimeout(() => process.exit(128 + signalNum), 5000);
};

process.on('SIGINT', signalHandler.bind(undefined, 'SIGINT', 2));
process.on('SIGTERM', signalHandler.bind(undefined, 'SIGTERM', 15));

/** Ensure orphaned processes are cleaned up */
setInterval(() => {
  if (!process.connected) {
    Logger.internal.info('Parent process not connected, terminating process...');
    process.exit(1);
  }
}, 5000);
