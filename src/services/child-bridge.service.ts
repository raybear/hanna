import {ChildProcessMessageEvent} from '../events/child-process.event';
import path from 'path';
import fs from 'fs-extra';
import child_process from 'child_process';

import {ChildStatus, PluginType, ChildEventType} from '../catalogs';
import {BridgeOptions} from '../options/bridge.options';
import {IpcOutgoingEvent} from '../events/ipc-outgoing.event';
import {HannaAPI} from '../hanna.api';
import {AccessoryConfig} from '../models/accessory.configuration';
import {BridgeConfiguration} from '../models/bridge.configuration';
import {ChildMetadata} from '../models/child-meta.model';
import {ChildProcessLoadEventData} from '../models/child-process-load-event.model';
import {ChildProcessPluginLoadedEventData} from '../models/child-process-plugin-loaded.data';
import {ChildProcessPortAllocatedEventData} from '../models/child-process-port-allocated.data';
import {ChildProcessPortRequestEventData} from '../models/child-process-port-request.data';
import {HannaConfig} from '../models/hanna.configuration';
import {PlatformConfig} from '../models/platform.configuration';
import {User} from '../models/user.model';
import {HannaOptions} from '../options/hanna.options';
import {Plugin} from '../plugins/plugin';
import {IpcService} from '../services/ipc.service';
import {PortService} from '../services/port.service';
import {Logger, Logging} from '../services/logger.service';

/**
 * Manages the child processes of platforms/accessories being exposed as separate forked bridges.
 * A child bridge runs a single platform or accessory.
 */
export default class ChildBridgeService {
  private _child?: child_process.ChildProcess;
  private _args: string[] = [];
  private _shuttingDown                                          = false;
  private _lastBridgeStatus: ChildStatus                         = ChildStatus.PENDING;
  private _pluginConfig: Array<PlatformConfig | AccessoryConfig> = [];
  private _log: Logging = Logger.withPrefix(this._plugin.getPluginIdentifier());
  private _displayName?: string;

  constructor(
    public type: PluginType,
    public identifier: string,
    private _plugin: Plugin,
    private _bridgeConfig: BridgeConfiguration,
    private _hannaConfig: HannaConfig,
    private _hannaOptions: HannaOptions,
    private _api: HannaAPI,
    private _ipcService: IpcService,
    private _externalPortService: PortService,
  ) {
    this._api.on('shutdown', () => {
      this._shuttingDown = true;
      this.teardown();
    });

    // Make sure we don't hit the max listeners limit
    this._api.setMaxListeners(this._api.getMaxListeners() + 1);
  }

  /** Start the child bridge service */
  public start(): void {
    this.setProcessFlags();
    this._startChildProcess();

    // Set Display name
    if(this._pluginConfig.length > 1 || this._pluginConfig.length === 0) {
      this._displayName = this._plugin.getPluginIdentifier();
    } else {
      this._displayName = this._pluginConfig[0]?.name || this._plugin.getPluginIdentifier();
    }

    // Reconfigure log with new display name
    this._log = Logger.withPrefix(this._displayName);
  }

  /**
   * Add a config block to a child bridge.
   * Platform child bridges can only contain one config block.
   * @param config
   */
  public addConfig(config: PlatformConfig | AccessoryConfig): void {
    this._pluginConfig.push(config);
  }

  private get bridgeStatus(): ChildStatus {
    return this._lastBridgeStatus;
  }

  private set _bridgeStatus(value: ChildStatus) {
    this._lastBridgeStatus = value;
    this._ipcService.sendMessage(IpcOutgoingEvent.CHILD_BRIDGE_STATUS_UPDATE, this.getMetadata());
  }

  /** Start the child bridge process */
  private _startChildProcess(): void {
    this._bridgeStatus = ChildStatus.PENDING;

    this._child = child_process.fork(path.resolve(__dirname, 'hanna.child.js'), this._args, {
      silent: true,
    });

    this._child.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });

    this._child.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    this._child.on('exit', () => {
      this._log.warn('Child bridge process ended');
    });

    this._child.on('error', (e) => {
      this._bridgeStatus = ChildStatus.DOWN;
      this._log.error('Child process error', e);
    });

    this._child.on('close', (code: number, signal: string) => {
      this._bridgeStatus = ChildStatus.DOWN;
      this.handleProcessClose(code, signal);
    });

    // Handle incoming IPC messages from the child process
    this._child.on('message', (message: ChildProcessMessageEvent<unknown>) => {
      if (typeof message !== 'object' || !message.id) {
        return;
      }

      switch(message.id) {
        case ChildEventType.READY: {
          this._log(`Launched child bridge with PID ${this._child?.pid}`);
          this.loadPlugin();
          break;
        }
        case ChildEventType.LOADED: {
          const version = (message.data as ChildProcessPluginLoadedEventData).version;
          if (this._pluginConfig.length > 1) {
            this._log(`Loaded ${this._plugin.getPluginIdentifier()} v${version} child bridge successfully with ${this._pluginConfig.length} accessories`);
          } else {
            this._log(`Loaded ${this._plugin.getPluginIdentifier()} v${version} child bridge successfully`);
          }
          this.startBridge();
          break;
        }
        case ChildEventType.ONLINE: {
          this._bridgeStatus = ChildStatus.OK;
          break;
        }
        case ChildEventType.PORT_REQUEST: {
          this.handlePortRequest(message.data as ChildProcessPortRequestEventData).then(_ => {});
          break;
        }
      }
    });
  }

  /**
   * Called when the child bridge process exits, if Hanna is not shutting down, it will restart the process
   * @param code
   * @param signal
   */
  private handleProcessClose(code: number, signal: string): void {
    this._log(`Process Ended. Code: ${code}, Signal: ${signal}`);

    setTimeout(() => {
      if (!this._shuttingDown) {
        this._log('Restarting Process...');
        this._startChildProcess();
      }
    }, 7000);
  }

  /**
   * Helper function to send a message to the child process
   * @param type
   * @param data
   */
  private sendMessage<T = unknown>(type: ChildEventType, data?: T): void {
    if (this._child && this._child.connected)
      this._child.send({ id: type, data });
  }

  /**
   * Some plugins may make use of the Hanna process flags
   * These will be passed through to the forked process
   */
  private setProcessFlags(): void {
    if (this._hannaOptions.debugModeEnabled)                this._args.push('-D');
    if (this._hannaOptions.forceColourLogging)              this._args.push('-C');
    if (this._hannaOptions.insecureAccess)                  this._args.push('-I');
    if (this._hannaOptions.noLogTimestamps)                 this._args.push('-T');
    if (this._hannaOptions.keepOrphanedCachedAccessories)   this._args.push('-K');

    if (this._hannaOptions.customStoragePath) this._args.push('-U', this._hannaOptions.customStoragePath);
    if (this._hannaOptions.customPluginPath)  this._args.push('-P', this._hannaOptions.customPluginPath);
  }

  /** Tell the child process to load the given plugin */
  private loadPlugin(): void {
    const bridgeConfig: BridgeConfiguration = {
      name: this._bridgeConfig.name || this._displayName || this._plugin.getPluginIdentifier(),
      port: this._bridgeConfig.port,
      username: this._bridgeConfig.username,
      advertiser: this._hannaConfig.bridge.advertiser,
      pin: this._bridgeConfig.pin || this._hannaConfig.bridge.pin,
      bind: this._hannaConfig.bridge.bind,
      setupID: this._bridgeConfig.setupID,
      manufacturer: this._bridgeConfig.manufacturer || this._hannaConfig.bridge.manufacturer,
      model: this._bridgeConfig.model || this._hannaConfig.bridge.model,
    };

    const bridgeOptions: BridgeOptions = {
      cachedAccessoriesDir: User.accessoryPath(),
      cachedAccessoriesItemName: 'cachedAccessories.' + this._bridgeConfig.username.replace(/:/g, '').toUpperCase(),
    };

    // Shallow copy the Hanna options to the bridge options object
    Object.assign(bridgeOptions, this._hannaOptions);

    this.sendMessage<ChildProcessLoadEventData>(ChildEventType.LOAD, {
      type: this.type,
      identifier: this.identifier,
      pluginPath: this._plugin.getPluginPath(),
      pluginConfig: this._pluginConfig,
      bridgeConfig,
      bridgeOptions,
      hannaConfig: { // need to break this out to avoid a circular structure to JSON from other plugins modifying their config at runtime.
        bridge: this._hannaConfig.bridge,
        ports: this._hannaConfig.ports,
        disabledPlugins: [],  // not used by child bridges
        accessories: [],      // not used by child bridges
        platforms: [],        // not used by child bridges
      },
    });
  }

  /** Tell the child bridge to start broadcasting */
  private startBridge(): void {
    this.sendMessage(ChildEventType.START);
  }

  /** Handle external port requests from child */
  private async handlePortRequest(request: ChildProcessPortRequestEventData) {
    const port = await this._externalPortService.requestPort(request.username);
    this.sendMessage<ChildProcessPortAllocatedEventData>(ChildEventType.PORT_ALLOCATED, {
      username: request.username,
      port: port
    });
  }

  /** Send sigterm to the child bridge */
  private teardown(): void {
    if (this._child && this._child.connected) {
      this._bridgeStatus = ChildStatus.DOWN;
      this._child.kill('SIGTERM');
    }
  }

  /** Restarts the child bridge process */
  public restartBridge(): void {
    this._log.warn('Restarting child bridge...');
    this.refreshConfig().then(r => console.log(r));
    this.teardown();
  }

  /** Read the config.json file from disk and refresh the plugin config block for just this plugin */
  public async refreshConfig(): Promise<void> {
    try {
      const hannaConfig: HannaConfig = await fs.readJson(User.configPath());

      if (this.type === PluginType.PLATFORM) {
        const config = hannaConfig.platforms?.filter(x => x.platform === this.identifier && x._bridge?.username === this._bridgeConfig.username);
        if (config.length) {
          this._pluginConfig = config;
          this._bridgeConfig = this._pluginConfig[0]._bridge || this._bridgeConfig;
        } else {
          this._log.warn("Platform config could not be found, using existing config.");
        }
      } else if (this.type === PluginType.ACCESSORY) {
        const config = hannaConfig.accessories?.filter(x => x.accessory === this.identifier && x._bridge?.username === this._bridgeConfig.username);
        if (config.length) {
          this._pluginConfig = config;
          this._bridgeConfig = this._pluginConfig[0]._bridge || this._bridgeConfig;
        } else {
          this._log.warn('Accessory config could not be found, using existing config.');
        }
      }

    } catch (e) {
      this._log.error('Failed to refresh plugin config:', e.message);
    }
  }

  /** Returns metadata about this child bridge */
  public getMetadata(): ChildMetadata {
    return {
      status: this.bridgeStatus,
      username: this._bridgeConfig.username,
      name: this._bridgeConfig.name || this._displayName || this._plugin.getPluginIdentifier(),
      plugin: this._plugin.getPluginIdentifier(),
      identifier: this.identifier,
      pid: this._child?.pid
    };
  }
}
