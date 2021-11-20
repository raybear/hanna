import {AccessoryIdentifier, AccessoryName, PlatformIdentifier, PlatformName} from './declarations';
import {IpcIncomingEvent} from './events/ipc-incomming.event';
import {IpcOutgoingEvent} from './events/ipc-outgoing.event';
import {BridgeConfiguration} from './models/bridge.configuration';
import {HannaConfig} from './models/hanna.configuration';
import {BridgeOptions, HannaOptions, PluginManagerOptions} from './options';
import BridgeService from './services/bridge.service';
import ChildBridgeService from './services/child-bridge.service';
import chalk from 'chalk';
import fs from 'fs';
import qrcode from 'qrcode-terminal';

import {AccessoryEventTypes, MDNSAdvertiser} from 'hap-nodejs';

import {HannaAPI} from './hanna.api';
import {AccessoryPlugin} from './interfaces/accessory-plugin';
import {AccessoryPluginConstructor} from './interfaces/accessory-plugin.constructor';
import {PlatformPlugin} from './models/platform-plugin';
import {PlatformPluginConstructor} from './interfaces/platform-plugin.constructor';
import {PluginType, ServerStatus} from './catalogs';
import {Mac, MacAddress} from './classes/mac.utility';
import {User} from './models/user.model';
import {PluginManager} from './plugins/manager/plugin.manager';
import {Plugin} from './plugins/plugin';
import {IpcService} from './services/ipc.service';
import {Logger} from './services/logger.service';
import {PortService} from './services/port.service';

const log = Logger.internal;

export class HannaServer {
  private readonly _api: HannaAPI;
  private readonly _pluginManager: PluginManager;
  private readonly _bridgeService: BridgeService;
  private readonly _ipcService: IpcService;
  private readonly _externalPortService: PortService;

  private readonly _config: HannaConfig;

  // Keep track of child bridges
  private readonly _childBridges: Map<MacAddress, ChildBridgeService> = new Map();

  // Current server status
  private _serverStatus: ServerStatus = ServerStatus.PENDING;

  constructor(private _options: HannaOptions = {}) {
    this._config = HannaServer.loadConfig();

    // Object we feed to Plugins and BridgeService
    this._api                 = new HannaAPI();
    this._ipcService          = new IpcService();
    this._externalPortService = new PortService(this._config.ports);

    // Set status to pending
    this.setServerStatus(ServerStatus.PENDING);

    // Create new plugin manager
    const pluginManagerOptions: PluginManagerOptions = {
      activePlugins:    this._config.plugins,
      disabledPlugins:  this._config.disabledPlugins,
      customPluginPath: _options.customPluginPath
    };
    this._pluginManager = new PluginManager(this._api, pluginManagerOptions);

    // Create new bridge service
    const bridgeConfig: BridgeOptions = {
      cachedAccessoriesDir:       User.accessoryPath(),
      cachedAccessoriesItemName:  'cachedAccessories'
    };

    // Shallow copy the Hanna options to the bridge options object
    Object.assign(bridgeConfig, this._options);

    this._bridgeService = new BridgeService(
      this._api,
      this._pluginManager,
      this._externalPortService,
      bridgeConfig,
      this._config.bridge,
      this._config,
    );

    // Watch bridge events to check when server is online
    this._bridgeService.bridge.on(AccessoryEventTypes.LISTENING, () => {
      this.setServerStatus(ServerStatus.OK);
    });
  }

  /** Set the current server status and update parent via IPC */
  private setServerStatus(status: ServerStatus) {
    this._serverStatus = status;
    this._ipcService.sendMessage(IpcOutgoingEvent.SERVER_STATUS_UPDATE, {
      status: this._serverStatus
    });
  }

  public async start(): Promise<void> {
    if (this._config.bridge.disableIpc !== true) {
      this.initializeIpcEventHandlers();
    }
    const promises: Promise<void>[] = [];
    // Load the cached accessories
    await this._bridgeService.loadCachedPlatformAccessoriesFromDisk();
    // Initialize plugins
    this._pluginManager.initializeInstalledPlugins();
    if (this._config.platforms.length > 0) {
      promises.push(...this.loadPlatforms());
    }
    if (this._config.accessories.length > 0) {
      this.loadAccessories();
    }
    // Start child bridges
    for (const childBridge of this._childBridges.values()) {
      childBridge.start();
    }
    // Restore cached accessories
    this._bridgeService.restoreCachedPlatformAccessories();
    this._api.signalFinished();
    // Wait for all platforms to publish their accessories before we publish the bridge
    await Promise.all(promises)
      .then(() => this.publishBridge());
  }

  public teardown(): void {
    this._bridgeService.teardown();
    this.setServerStatus(ServerStatus.DOWN);
  }

  private publishBridge(): void {
    this._bridgeService.publishBridge();
    this.printSetupInfo(this._config.bridge.pin);
  }

  private static loadConfig(): HannaConfig {
    // Look for the configuration file
    const configPath = User.configPath();
    const defaultBridge: BridgeConfiguration = {
      name: 'Hanna',
      username: 'C1:F2:D3:69:CE:30',
      pin: '031-20-021',
      advertiser: MDNSAdvertiser.BONJOUR
    };

    if (!fs.existsSync(configPath)) {
      log.warn('config.json (%s) not found.', configPath);
      // return a default configuration
      return {
        bridge: defaultBridge,
        accessories: [],
        platforms: []
      };
    }

    let config: Partial<HannaConfig>;
    try {
      config = JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }));
    } catch (err) {
      log.error('There was a problem reading config.json file.');
      throw err;
    }

    if (config.ports !== undefined) {
      if (config.ports.start && config.ports.end) {
        if (config.ports.start > config.ports.end) {
          log.error('Invalid port pool configuration. End should be greater than or equal to start.');
          config.ports = undefined;
        }
      } else {
        log.error("Invalid configuration for 'ports'. Missing 'start' and 'end' properties! Ignoring it!");
        config.ports = undefined;
      }
    }

    const bridge: BridgeConfiguration = config.bridge || defaultBridge;
    bridge.name     = bridge.name || defaultBridge.name;
    bridge.username = bridge.username || defaultBridge.username;
    bridge.pin      = bridge.pin || defaultBridge.pin;
    config.bridge   = bridge;

    const username = config.bridge.username;
    if (!Mac.isValidMacAddress(username))
      throw new Error(`Not a valid username: ${username}. Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`);

    config.accessories  = config.accessories || [];
    config.platforms    = config.platforms || [];
    log.info('Loaded config.json with %s accessories and %s platforms.', config.accessories.length, config.platforms.length);

    if (config.bridge.advertiser) {
      if (![
        MDNSAdvertiser.BONJOUR,
        MDNSAdvertiser.CIAO,
      ].includes(config.bridge.advertiser)) {
        config.bridge.advertiser = MDNSAdvertiser.BONJOUR;
        log.error(`Value provided in bridge.advertiser is not valid, reverting to "${MDNSAdvertiser.BONJOUR}".`);
      }
    } else {
      config.bridge.advertiser = MDNSAdvertiser.BONJOUR;
    }
    return config as HannaConfig;
  }

  private loadAccessories(): void {
    log.info(`Loading ${this._config.accessories.length} accessories...`);

    this._config.accessories.forEach((accessoryConfig, index) => {
      if (!accessoryConfig.accessory) {
        log.warn("Your config.json contains an illegal accessory configuration object at position %d. " +
          "Missing property 'accessory'. Skipping entry...", index + 1);
        return;
      }

      const accessoryIdentifier: AccessoryName | AccessoryIdentifier = accessoryConfig.accessory;
      const displayName = accessoryConfig.name;
      if (!displayName) {
        log.warn('Could not load accessory %s at position %d as it is missing the required \'name\' property!', accessoryIdentifier, index + 1);
        return;
      }

      let plugin: Plugin;
      let constructor: AccessoryPluginConstructor;

      try {
        plugin = this._pluginManager.getPluginForAccessory(accessoryIdentifier);
      } catch (error) {
        log.error(error.message);
        return;
      }

      // Check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the accessory "${accessoryIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`);
        return;
      }

      try {
        constructor = plugin.getAccessoryConstructor(accessoryIdentifier);
      } catch (error) {
        log.error(`Error loading the accessory "${accessoryIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`);
        log.error(error);
        return;
      }

      const logger = Logger.withPrefix(displayName);
      logger("Initializing %s accessory...", accessoryIdentifier);

      if (accessoryConfig._bridge) {
        // Ensure the username is always uppercase
        accessoryConfig._bridge.username = accessoryConfig._bridge.username.toUpperCase();

        try {
          this.validateChildBridgeConfig(PluginType.ACCESSORY, accessoryIdentifier, accessoryConfig._bridge);
        } catch (error) {
          log.error(error.message);
          return;
        }

        let childBridge: ChildBridgeService;

        if (this._childBridges.has(accessoryConfig._bridge.username)) {
          childBridge = this._childBridges.get(accessoryConfig._bridge.username)!;
          logger(`Adding to existing child bridge ${accessoryConfig._bridge.username}`);
        } else {
          logger(`Initializing child bridge ${accessoryConfig._bridge.username}`);
          childBridge = new ChildBridgeService(
            PluginType.ACCESSORY,
            accessoryIdentifier,
            plugin,
            accessoryConfig._bridge,
            this._config,
            this._options,
            this._api,
            this._ipcService,
            this._externalPortService,
          );

          this._childBridges.set(accessoryConfig._bridge.username, childBridge);
        }

        // Add config to child bridge service
        childBridge.addConfig(accessoryConfig);
        return;
      }

      const accessoryInstance: AccessoryPlugin = new constructor(logger, accessoryConfig, this._api);
      // Pass accessoryIdentifier for UUID generation, and optional parameter uuid_base
      // which can be used instead of displayName for UUID generation
      const accessory = this._bridgeService.createHAPAccessory(plugin, accessoryInstance, displayName, accessoryIdentifier, accessoryConfig.uuid_base);

      if (accessory) {
        try {
          this._bridgeService.bridge.addBridgedAccessory(accessory);
        } catch (e) {
          logger.error(`Error loading the accessory "${accessoryIdentifier}" from "${plugin.getPluginIdentifier()}" requested in your config.json:`, e.message);
          return;
        }
      } else {
        logger.info("Accessory %s returned empty set of services; not adding it to the bridge.", accessoryIdentifier);
      }
    });
  }

  private loadPlatforms(): Promise<void>[] {
    log.info(`Loading ${this._config.platforms.length} platforms...`);

    const promises: Promise<void>[] = [];
    this._config.platforms.forEach((platformConfig, index) => {
      if (!platformConfig.platform) {
        log.warn("Your config.json contains an illegal platform configuration object at position %d. " +
          "Missing property 'platform'. Skipping entry...", index + 1);
        return;
      }

      const platformIdentifier: PlatformName | PlatformIdentifier = platformConfig.platform;
      const displayName = platformConfig.name || platformIdentifier;

      let plugin: Plugin;
      let constructor: PlatformPluginConstructor;

      try {
        plugin = this._pluginManager.getPluginForPlatform(platformIdentifier);
      } catch (error) {
        log.error(error.message);
        return;
      }

      // Check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the platform "${platformIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`);
        return;
      }

      try {
        constructor = plugin.getPlatformConstructor(platformIdentifier);
      } catch (error) {
        log.error(`Error loading the platform "${platformIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`);
        log.error(error);
        return;
      }

      const logger = Logger.withPrefix(displayName);
      logger('Initializing %s platform...', platformIdentifier);

      if (platformConfig._bridge) {
        // Ensure the username is always uppercase
        platformConfig._bridge.username = platformConfig._bridge.username.toUpperCase();

        try {
          this.validateChildBridgeConfig(PluginType.PLATFORM, platformIdentifier, platformConfig._bridge);
        } catch (error) {
          log.error(error.message);
          return;
        }

        logger(`Initializing child bridge ${platformConfig._bridge.username}`);
        const childBridge = new ChildBridgeService(
          PluginType.PLATFORM,
          platformIdentifier,
          plugin,
          platformConfig._bridge,
          this._config,
          this._options,
          this._api,
          this._ipcService,
          this._externalPortService,
        );

        this._childBridges.set(platformConfig._bridge.username, childBridge);

        // Add config to child bridge service
        childBridge.addConfig(platformConfig);
        return;
      }

      const platform: PlatformPlugin = new constructor(logger, platformConfig, this._api);

      if (HannaAPI.isDynamicPlatformPlugin(platform)) {
        plugin.assignDynamicPlatform(platformIdentifier, platform);
      } else if (HannaAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
        promises.push(this._bridgeService.loadPlatformAccessories(plugin, platform, platformIdentifier, logger));
      } else {
        // otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
        // We just call the constructor and let it be enabled.
      }
    });

    return promises;
  }

  /** Validate an external bridge config */
  private validateChildBridgeConfig(type: PluginType, identifier: string, bridgeConfig: BridgeConfiguration): void {
    if (!Mac.isValidMacAddress(bridgeConfig.username)) {
      throw new Error(
        `Error loading the ${type} "${identifier}" requested in your config.json - ` +
        `not a valid username in _bridge.username: "${bridgeConfig.username}". Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`,
      );
    }

    if (this._childBridges.has(bridgeConfig.username)) {
      const childBridge = this._childBridges.get(bridgeConfig.username);
      if (type === PluginType.PLATFORM) {
        // Only a single platform can exist on one child bridge
        throw new Error(
          `Error loading the ${type} "${identifier}" requested in your config.json - ` +
          `Duplicate username found in _bridge.username: "${bridgeConfig.username}". Each platform child bridge must have it's own unique username.`,
        );
      } else if (childBridge?.identifier !== identifier) {
        // Only accessories of the same type can be added to the same child bridge
        throw new Error(
          `Error loading the ${type} "${identifier}" requested in your config.json - ` +
          `Duplicate username found in _bridge.username: "${bridgeConfig.username}". You can only group accessories of the same type in a child bridge.`,
        );
      }
    }

    if (bridgeConfig.username === this._config.bridge.username.toUpperCase()) {
      throw new Error(
        `Error loading the ${type} "${identifier}" requested in your config.json - ` +
        `Username found in _bridge.username: "${bridgeConfig.username}" is the same as the main bridge. Each child bridge platform/accessory must have it's own unique username.`,
      );
    }
  }

  /** Takes care of the IPC Events sent to Hanna */
  private initializeIpcEventHandlers() {
    // Start IPC Service
    this._ipcService.start();
    // Handle restart child bridge event
    this._ipcService.on(IpcIncomingEvent.RESTART_CHILD_BRIDGE, (username) => {
      if (typeof username === 'string') {
        const childBridge = this._childBridges.get(username.toUpperCase());
        childBridge?.restartBridge();
      }
    });
    this._ipcService.on(IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, () => {
      this._ipcService.sendMessage(
        IpcOutgoingEvent.CHILD_BRIDGE_METADATA_RESPONSE,
        Array.from(this._childBridges.values()).map(x => x.getMetadata())
      );
    });
  }

  private printSetupInfo(pin: string): void {
    console.log('Setup Payload:');
    console.log(this._bridgeService.bridge.setupURI());

    if(!this._options.hideQRCode) {
      console.log('Scan this code with your HomeKit to pair with Hanna:');
      qrcode.setErrorLevel('H'); // HAP specifies level M or higher for ECC
      qrcode.generate(this._bridgeService.bridge.setupURI());
      console.log('Or enter this code with your HomeKit app to pair with Hanna:');
    } else {
      console.log('Enter this code with your HomeKit app to pair with Hanna:');
    }

    console.log(chalk.black.bgWhite("┌────────────┐"));
    console.log(chalk.black.bgWhite("│ " +pin + " │"));
    console.log(chalk.black.bgWhite("└────────────┘"));
  }
}
