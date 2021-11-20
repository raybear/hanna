import {Mac, MacAddress} from '../classes/mac.utility';
import {Version} from '../classes/version';
import {AccessoryIdentifier, AccessoryName, PlatformIdentifier, PlatformName} from '../declarations/hanna.type';
import {InternalAPIEvent} from '../events/internal-api.event';
import {HannaAPI} from '../hanna.api';
import {AccessoryPlugin} from '../interfaces/accessory-plugin';
import {StaticPlatformPlugin} from '../interfaces/static-platform-plugin';
import {BridgeConfiguration} from '../models/bridge.configuration';
import {HannaConfig} from '../models/hanna.configuration';
import {SerializedPlatformAccessory} from '../models/serialized-platform-accessory.model';
import {BridgeOptions} from '../options/bridge.options';
import {CharacteristicWarningOpts} from '../options/characteristic-warning.options';
import {PlatformAccessory} from '../platform.accessory';
import {PluginManager} from '../plugins/manager/plugin.manager';
import {Plugin} from '../plugins/plugin';
import {PortService} from '../services/port.service';
import {
  Accessory,
  AccessoryEventTypes, AccessoryLoader,
  Bridge, Categories, Characteristic, CharacteristicEventTypes,
  CharacteristicWarning,
  CharacteristicWarningType, once, PublishInfo, Service,
  uuid, VoidCallback
} from 'hap-nodejs';

import {getLogPrefix, Logger, Logging} from '../services/logger.service';
import {StorageService} from '../services/storage.service';

const log = Logger.internal;

export default class BridgeService {
  public bridge: Bridge;
  private _storageService: StorageService;

  private readonly _allowInsecureAccess: boolean;

  private _cachedPlatformAccessories: PlatformAccessory[] = [];
  private _cachedAccessoriesFileLoaded = false;
  private readonly _publishedExternalAccessories: Map<MacAddress, PlatformAccessory> = new Map();

  constructor(
    private _api: HannaAPI,
    private _pluginManager: PluginManager,
    private _externalPortService: PortService,
    private _bridgeOptions: BridgeOptions,
    private _bridgeConfig: BridgeConfiguration,
    private _config: HannaConfig
  ) {
    this._storageService = new StorageService(this._bridgeOptions.cachedAccessoriesDir);
    this._storageService.initSync();

    // Server is "secure by default", meaning it creates a top-level Bridge accessory that
    // will not allow unauthenticated requests. This matches the behavior of actual HomeKit
    // accessories. However you can set this to true to allow all requests without authentication,
    // which can be useful for easy hacking. Note that this will expose all functions of your
    // bridged accessories, like changing characteristics (i.e. flipping your lights on and off).
    this._allowInsecureAccess = this._bridgeOptions.insecureAccess || false;

    this._api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, this.handleRegisterPlatformAccessories.bind(this));
    this._api.on(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, this.handleUpdatePlatformAccessories.bind(this));
    this._api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, this.handleUnregisterPlatformAccessories.bind(this));
    this._api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, this.handlePublishExternalAccessories.bind(this));

    this.bridge = new Bridge(_bridgeConfig.name, uuid.generate('HannaBridge'));
    this.bridge.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, () => {
      // We register characteristic warning handlers on every bridged accessory (to have a reference to the plugin).
      // For Bridges the warnings will propagate to the main Bridge accessory, thus we need to silence them here.
      // Otherwise those would be printed twice (by us and HAP-NodeJS as it detects no handlers on the bridge).
    });
  }

  // Characteristic warning event has additional parameter originatorChain: string[] which is currently unused
  public static printCharacteristicWriteWarning(plugin: Plugin, accessory: Accessory, opts: CharacteristicWarningOpts, warning: CharacteristicWarning): void {
    const wikiInfo = 'See https://git.io/JtMGR for more info.';
    switch (warning.type) {
      case CharacteristicWarningType.SLOW_READ:
      case CharacteristicWarningType.SLOW_WRITE:
        if (!opts.ignoreSlow) {
          log.info(getLogPrefix(plugin.getPluginIdentifier()), 'This plugin slows down Hanna.', warning.message, wikiInfo);
        }
        break;
      case CharacteristicWarningType.TIMEOUT_READ:
      case CharacteristicWarningType.TIMEOUT_WRITE:
        log.error(getLogPrefix(plugin.getPluginIdentifier()), 'This plugin slows down Hanna.', warning.message, wikiInfo);
        break;
      case CharacteristicWarningType.WARN_MESSAGE:
        log.info(getLogPrefix(plugin.getPluginIdentifier()), `This plugin generated a warning from the characteristic '${warning.characteristic.displayName}':`, warning.message + ".", wikiInfo);
        break;
      case CharacteristicWarningType.ERROR_MESSAGE:
        log.error(getLogPrefix(plugin.getPluginIdentifier()), `This plugin threw an error from the characteristic '${warning.characteristic.displayName}':`, warning.message + ".", wikiInfo);
        break;
      case CharacteristicWarningType.DEBUG_MESSAGE:
        log.debug(getLogPrefix(plugin.getPluginIdentifier()), `Characteristic '${warning.characteristic.displayName}':`, warning.message + ".", wikiInfo);
        break;
      default: // generic message for yet unknown types
        log.info(getLogPrefix(plugin.getPluginIdentifier()), `This plugin generated a warning from the characteristic '${warning.characteristic.displayName}':`, warning.message + ".", wikiInfo);
        break;
    }
    if (warning.stack) {
      log.debug(getLogPrefix(plugin.getPluginIdentifier()), warning.stack);
    }
  }

  public publishBridge(): void {
    const bridgeConfig = this._bridgeConfig;

    const info = this.bridge.getService(Service.AccessoryInformation)!;
    info.setCharacteristic(Characteristic.Manufacturer, bridgeConfig.manufacturer || 'Trilogy Enterprises, Inc.');
    info.setCharacteristic(Characteristic.Model, bridgeConfig.model || 'Hanna');
    info.setCharacteristic(Characteristic.SerialNumber, bridgeConfig.username);
    info.setCharacteristic(Characteristic.FirmwareRevision, Version.getVersion());

    this.bridge.on(AccessoryEventTypes.LISTENING, (port: number) => {
      log.info('Hanna v%s (%s) is running on port %s.', Version.getVersion(), bridgeConfig.name, port);
    });

    const publishInfo: PublishInfo = {
      username: bridgeConfig.username,
      port: bridgeConfig.port,
      pincode: bridgeConfig.pin,
      category: Categories.BRIDGE,
      bind: bridgeConfig.bind,
      addIdentifyingMaterial: true,
      advertiser: bridgeConfig.advertiser,
    };

    if (bridgeConfig.setupID && bridgeConfig.setupID.length === 4) {
      publishInfo.setupID = bridgeConfig.setupID;
    }

    this.bridge.publish(publishInfo, this._allowInsecureAccess);
  }

  /** Attempt to load the cached accessories from disk. */
  public async loadCachedPlatformAccessoriesFromDisk(): Promise<void> {
    let cachedAccessories: SerializedPlatformAccessory[] | null = null;

    try {
      cachedAccessories = await this._storageService.getItem<SerializedPlatformAccessory[]>(this._bridgeOptions.cachedAccessoriesItemName);
    } catch (e) {
      log.error('Failed to load cached accessories from disk:', e.message);
      if (e instanceof SyntaxError) {
        // syntax error probably means invalid json / corrupted file; try and restore from backup
        cachedAccessories = await this.restoreCachedAccessoriesBackup();
      } else {
        log.error('Not restoring cached accessories - some accessories may be reset.');
      }
    }

    if (cachedAccessories) {
      log.info(`Loaded ${cachedAccessories.length} cached accessories from ${this._bridgeOptions.cachedAccessoriesItemName}.`);

      this._cachedPlatformAccessories = cachedAccessories.map(serialized => {
        return PlatformAccessory.deserialize(serialized);
      });

      if (cachedAccessories.length) {
        // create a backup of the cache file
        await this.createCachedAccessoriesBackup();
      }
    }

    this._cachedAccessoriesFileLoaded = true;
  }

  /** Return the name of the backup cache file */
  private get backupCacheFileName() {
    return `.${this._bridgeOptions.cachedAccessoriesItemName}.bak`;
  }

  /**
   * Create a backup of the cached file
   * This is used if we ever have trouble reading the main cache file
   */
  private async createCachedAccessoriesBackup(): Promise<void> {
    try {
      await this._storageService.copyItem(this._bridgeOptions.cachedAccessoriesItemName, this.backupCacheFileName);
    } catch (e) {
      log.warn(`Failed to create a backup of the ${this._bridgeOptions.cachedAccessoriesItemName} cached accessories file:`, e.message);
    }
  }

  /**
   * Restore a cached accessories backup
   * This is used if the main cache file has a JSON syntax error / is corrupted
   */
  private async restoreCachedAccessoriesBackup(): Promise<SerializedPlatformAccessory[] | null> {
    try {
      const cachedAccessories = await this._storageService.getItem<SerializedPlatformAccessory[]>(this.backupCacheFileName);
      if (cachedAccessories && cachedAccessories.length) {
        log.warn(`Recovered ${cachedAccessories.length} accessories from ${this._bridgeOptions.cachedAccessoriesItemName} cache backup.`);
      }
      return cachedAccessories;
    } catch (e) {
      return null;
    }
  }

  public restoreCachedPlatformAccessories(): void {
    this._cachedPlatformAccessories = this._cachedPlatformAccessories.filter(accessory => {
      let plugin = this._pluginManager.getPlugin(accessory._associatedPlugin!);
      if (!plugin) { // a little explainer here. This section is basically here to resolve plugin name changes of dynamic platform plugins
        try {
          // resolve platform accessories by searching for plugins which registered a dynamic platform for the given name
          plugin = this._pluginManager.getPluginByActiveDynamicPlatform(accessory._associatedPlatform!);

          if (plugin) { // if it's undefined the no plugin was found
            // could improve on this by calculating the Levenshtein distance to only allow platform ownership changes
            // when something like a typo happened. Are there other reasons the name could change?
            // And how would we define the threshold?

            log.info("When searching for the associated plugin of the accessory '" + accessory.displayName + "' " +
              "it seems like the plugin name changed from '" + accessory._associatedPlugin + "' to '" +
              plugin.getPluginIdentifier() + "'. Plugin association is now being transformed!");

            accessory._associatedPlugin = plugin.getPluginIdentifier(); // update the associated plugin to the new one
          }
        } catch (error) { // error is thrown if multiple plugins where found for the given platform name
          log.info("Could not find the associated plugin for the accessory '" + accessory.displayName + "'. " +
            "Tried to find the plugin by the platform name but " + error.message);
        }
      }

      const platformPlugins = plugin && plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);
      if (plugin) {
        accessory._associatedHAPAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory._associatedHAPAccessory, {}));
      }

      if (!platformPlugins) {
        log.info(`Failed to find plugin to handle accessory ${accessory._associatedHAPAccessory.displayName}`);
        if (!this._bridgeOptions.keepOrphanedCachedAccessories) {
          log.info(`Removing orphaned accessory ${accessory._associatedHAPAccessory.displayName}`);
          return false; // filter it from the list
        }
      } else {
        // we set the current plugin version before configureAccessory is called, so the dev has the opportunity to override it
        accessory.getService(Service.AccessoryInformation)!
          .setCharacteristic(Characteristic.FirmwareRevision, plugin!.version);

        platformPlugins.configureAccessory(accessory);
      }

      try {
        this.bridge.addBridgedAccessory(accessory._associatedHAPAccessory);
      } catch (e) {
        log.warn(`${accessory._associatedPlugin ? getLogPrefix(accessory._associatedPlugin): ""} Could not restore cached accessory '${accessory._associatedHAPAccessory.displayName}':`, e?.message);
        return false; // filter it from the list
      }
      return true; // keep it in the list
    });
  }

  /** Save the cached accessories back to disk. */
  public saveCachedPlatformAccessoriesOnDisk(): void {
    try {
      // only save the cache file back to disk if we have already attempted to load it
      // this should prevent the cache being deleted should Hanna be shutdown before it has finished launching
      if (this._cachedAccessoriesFileLoaded) {
        const serializedAccessories = this._cachedPlatformAccessories.map(accessory => PlatformAccessory.serialize(accessory));
        this._storageService.setItemSync(this._bridgeOptions.cachedAccessoriesItemName, serializedAccessories);
      }
    } catch (e) {
      log.error("Failed to save cached accessories to disk:", e.message);
      log.error("Your accessories will not persist between restarts until this issue is resolved.");
    }
  }

  handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    const hapAccessories = accessories.map(accessory => {
      this._cachedPlatformAccessories.push(accessory);

      const plugin = this._pluginManager.getPlugin(accessory._associatedPlugin!);
      if (plugin) {
        const informationService = accessory.getService(Service.AccessoryInformation)!;
        if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
          // overwrite the default value with the actual plugin version
          informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
        }

        const platforms = plugin.getActiveDynamicPlatform(accessory._associatedPlatform!);

        if (!platforms) {
          log.warn("The plugin '%s' registered a new accessory for the platform '%s'. The platform couldn't be found though!", accessory._associatedPlugin!, accessory._associatedPlatform!);
        }

        accessory._associatedHAPAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory._associatedHAPAccessory, {}));
      } else {
        log.warn("A platform configured a new accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
      }

      return accessory._associatedHAPAccessory;
    });

    this.bridge.addBridgedAccessories(hapAccessories);
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  handleUpdatePlatformAccessories(accessories: PlatformAccessory[]): void {
    // Update persisted accessories
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    const hapAccessories = accessories.map(accessory => {
      const index = this._cachedPlatformAccessories.indexOf(accessory);
      if (index >= 0) {
        this._cachedPlatformAccessories.splice(index, 1);
      }

      return accessory._associatedHAPAccessory;
    });

    this.bridge.removeBridgedAccessories(hapAccessories);
    this.saveCachedPlatformAccessoriesOnDisk();
  }

  async handlePublishExternalAccessories(accessories: PlatformAccessory[]): Promise<void> {
    const accessoryPin = this._bridgeConfig.pin;

    for (const accessory of accessories) {
      const hapAccessory = accessory._associatedHAPAccessory;
      const advertiseAddress = Mac.generate(hapAccessory.UUID);

      // get external port allocation
      const accessoryPort = await this._externalPortService.requestPort(advertiseAddress);

      if (this._publishedExternalAccessories.has(advertiseAddress)) {
        throw new Error(`Accessory ${hapAccessory.displayName} experienced an address collision.`);
      } else {
        this._publishedExternalAccessories.set(advertiseAddress, accessory);
      }

      const plugin = this._pluginManager.getPlugin(accessory._associatedPlugin!);
      if (plugin) {
        const informationService = hapAccessory.getService(Service.AccessoryInformation)!;
        if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
          // overwrite the default value with the actual plugin version
          informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
        }

        hapAccessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, hapAccessory, { ignoreSlow: true }));
      } else if (PluginManager.isQualifiedPluginIdentifier(accessory._associatedPlugin!)) {
        // we did already complain in api.ts if it wasn't a qualified name
        log.warn("A platform configured a external accessory under the plugin name '%s'. However no loaded plugin could be found for the name!", accessory._associatedPlugin);
      }

      hapAccessory.on(AccessoryEventTypes.LISTENING, (port: number) => {
        log.info("%s is running on port %s.", hapAccessory.displayName, port);
        log.info("Please add [%s] manually in Home app. Setup Code: %s", hapAccessory.displayName, accessoryPin);
      });

      // noinspection JSDeprecatedSymbols
      hapAccessory.publish({
        username: advertiseAddress,
        pincode: accessoryPin,
        category: accessory.category,
        port: accessoryPort,
        bind: this._bridgeConfig.bind,
        addIdentifyingMaterial: true,
        advertiser: this._bridgeConfig.advertiser,
      }, this._allowInsecureAccess);
    }
  }

  public createHAPAccessory(plugin: Plugin, accessoryInstance: AccessoryPlugin, displayName: string, accessoryType: AccessoryName | AccessoryIdentifier, uuidBase?: string): Accessory | undefined {
    const services = (accessoryInstance.getServices() || [])
      .filter(service => !!service); // filter out undefined values; a common mistake
    const controllers = (accessoryInstance.getControllers && accessoryInstance.getControllers() || [])
      .filter(controller => !!controller);

    if (services.length === 0 && controllers.length === 0) { // check that we only add valid accessory with at least one service
      return undefined;
    }

    if (!(services[0] instanceof Service)) {
      // The returned "services" for this accessory is assumed to be the old style: a big array
      // of JSON-style objects that will need to be parsed by HAP-NodeJS's AccessoryLoader.

      return AccessoryLoader.parseAccessoryJSON({ // Create the actual HAP-NodeJS "Accessory" instance
        displayName: displayName,
        services: services,
      });
    } else {
      // The returned "services" for this accessory are simply an array of new-API-style
      // Service instances which we can add to a created HAP-NodeJS Accessory directly.
      const accessoryUUID = uuid.generate(accessoryType + ":" + (uuidBase || displayName));
      const accessory = new Accessory(displayName, accessoryUUID);

      // listen for the identify event if the accessory instance has defined an identify() method
      if (accessoryInstance.identify) {
        accessory.on(AccessoryEventTypes.IDENTIFY, (paired: boolean, callback: VoidCallback) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          accessoryInstance.identify!(() => { }); // empty callback for backwards compatibility
          callback();
        });
      }

      const informationService = accessory.getService(Service.AccessoryInformation)!;
      services.forEach(service => {
        // if you returned an AccessoryInformation service, merge its values with ours
        if (service instanceof Service.AccessoryInformation) {
          service.setCharacteristic(Characteristic.Name, displayName); // ensure display name is set
          // ensure the plugin has not hooked already some listeners (some weird ones do).
          // Otherwise they would override our identify listener registered by the HAP-NodeJS accessory
          service.getCharacteristic(Characteristic.Identify).removeAllListeners(CharacteristicEventTypes.SET);

          // pull out any values and listeners (get and set) you may have defined
          informationService.replaceCharacteristicsFromService(service);
        } else {
          accessory.addService(service);
        }
      });

      if (informationService.getCharacteristic(Characteristic.FirmwareRevision).value === "0.0.0") {
        // overwrite the default value with the actual plugin version
        informationService.setCharacteristic(Characteristic.FirmwareRevision, plugin.version);
      }

      accessory.on(AccessoryEventTypes.CHARACTERISTIC_WARNING, BridgeService.printCharacteristicWriteWarning.bind(this, plugin, accessory, {}));

      controllers.forEach(controller => {
        accessory.configureController(controller);
      });

      return accessory;
    }
  }

  public async loadPlatformAccessories(plugin: Plugin, platformInstance: StaticPlatformPlugin, platformType: PlatformName | PlatformIdentifier, logger: Logging): Promise<void> {
    // Plugin 1.0, load accessories
    return new Promise(resolve => {
      // warn the user if the static platform is blocking the startup of Hanna for to long
      const loadDelayWarningInterval = setInterval(() => {
        log.warn(getLogPrefix(
          plugin.getPluginIdentifier()),
          "This plugin is taking long time to load and preventing Hanna from starting.");
      }, 20000);

      platformInstance.accessories(once((accessories: AccessoryPlugin[]) => {
        // clear the load delay warning interval
        clearInterval(loadDelayWarningInterval);

        // loop through accessories adding them to the list and registering them
        accessories.forEach((accessoryInstance, index) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const accessoryName = accessoryInstance.name; // assume this property was set
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const uuidBase: string | undefined = accessoryInstance.uuid_base; // optional base uuid

          log.info("Initializing platform accessory '%s'...", accessoryName);

          const accessory = this.createHAPAccessory(plugin, accessoryInstance, accessoryName, platformType, uuidBase);

          if (accessory) {
            this.bridge.addBridgedAccessory(accessory);
          } else {
            logger("Platform %s returned an accessory at index %d with an empty set of services. Won't adding it to the bridge!", platformType, index);
          }
        });

        resolve();
      }));
    });
  }

  public teardown(): void {
    this.bridge.unpublish();
    for (const accessory of this._publishedExternalAccessories.values()) {
      accessory._associatedHAPAccessory.unpublish();
    }
    this.saveCachedPlatformAccessoriesOnDisk();
    this._api.signalShutdown();
  }
}
