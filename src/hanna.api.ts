import EventEmitter from 'events';
import semver from 'semver';
import * as hapNodeJs from 'hap-nodejs';

import {Logger} from './services/logger.service';
import {AccessoryName, PlatformName, PluginIdentifier} from './declarations';

import {APIEvent} from './events/api.event';
import {InternalAPIEvent} from './events/internal-api.event';
import {AccessoryPluginConstructor} from './interfaces/accessory-plugin.constructor';
import {DynamicPlatformPlugin} from './interfaces/dynamic-platform-plugin';
import {PlatformPluginConstructor} from './interfaces/platform-plugin.constructor';
import {StaticPlatformPlugin} from './interfaces/static-platform-plugin';
import {IHannaAPI} from './interfaces/api.model';
import {PlatformPlugin} from './models/platform-plugin';
import {User} from './models/user.model';
import {PlatformAccessory} from './platform.accessory';
import {PluginManager} from './plugins/manager/plugin.manager';

import {Version} from './classes';

const log = Logger.internal;

export class HannaAPI extends EventEmitter implements IHannaAPI {
  /** The Hanna API version as a floating point number. */
  public readonly version       = 1.0;
  /** The current Hanna semver version. */
  public readonly serverVersion = Version.getVersion();

  // LEGACY EXPORTS FOR PRE TYPESCRIPT
  readonly user = User;
  readonly hap = hapNodeJs;
  readonly hapLegacyTypes = hapNodeJs.LegacyTypes;
  readonly platformAccessory = PlatformAccessory;

  constructor() { super() }

  public versionGreaterOrEqual(version: string): boolean {
    return semver.gte(this.serverVersion, version);
  }

  public static isDynamicPlatformPlugin(platformPlugin: PlatformPlugin): platformPlugin is DynamicPlatformPlugin {
    return 'configureAccessory' in platformPlugin;
  }

  public static isStaticPlatformPlugin(platformPlugin: PlatformPlugin): platformPlugin is StaticPlatformPlugin {
    return 'accessories' in platformPlugin;
  }

  /**
   * Event is fired once Hanna has finished with booting up and initializing all components and plugins.
   * When this event is fired it is possible that the Bridge accessory isn't published yet, if Hanna still needs
   * to wait for some {@see StaticPlatformPlugin | StaticPlatformPlugins} to finish accessory creation.
   */
  public signalFinished(): void {
    this.emit(APIEvent.DID_FINISH_LAUNCHING);
  }

  /**
   * This event is fired when Hanna got shutdown. This could be a regular shutdown or a unexpected crash.
   * At this stage all Accessories are already unpublished and all PlatformAccessories are already saved to disk!
   */
  public signalShutdown(): void {
    this.emit(APIEvent.SHUTDOWN);
  }

  public registerAccessory(accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;
  public registerAccessory(pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;

  public registerAccessory(pluginIdentifier: PluginIdentifier | AccessoryName, accessoryName: AccessoryName | AccessoryPluginConstructor, constructor?: AccessoryPluginConstructor): void {
    if (typeof accessoryName === 'function') {
      constructor = accessoryName;
      accessoryName = pluginIdentifier;
      this.emit(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, constructor);
    } else {
      this.emit(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, constructor!, pluginIdentifier);
    }
  }

  public registerPlatform(platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  public registerPlatform(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor): void;

  public registerPlatform(pluginIdentifier: PluginIdentifier | PlatformName, platformName: PlatformName | PlatformPluginConstructor, constructor?: PlatformPluginConstructor): void {
    if (typeof platformName === 'function') {
      constructor = platformName;
      platformName = pluginIdentifier;
      this.emit(InternalAPIEvent.REGISTER_PLATFORM, platformName, constructor);
    } else {
      this.emit(InternalAPIEvent.REGISTER_PLATFORM, platformName, constructor!, pluginIdentifier);
    }
  }

  public publishExternalAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void {
    if (!PluginManager.isQualifiedPluginIdentifier(pluginIdentifier)) {
      log.info(`One of your plugins incorrectly registered an external accessory using the platform name (${pluginIdentifier}) and not the plugin identifier. Please report this to the developer!`);
    }

    accessories.forEach(accessory => {
      // Noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory))
        throw new Error(`${pluginIdentifier} attempt to register an accessory that isn't PlatformAccessory!`);

      accessory._associatedPlugin = pluginIdentifier;
    });

    this.emit(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories);
  }

  public registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
    accessories.forEach(accessory => {
      if (!(accessory instanceof PlatformAccessory))
        throw new Error(`${pluginIdentifier} - ${platformName} attempt to register an accessory that isn't PlatformAccessory!`);

      accessory._associatedPlugin = pluginIdentifier;
      accessory._associatedPlatform = platformName;
    });

    this.emit(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories);
  }

  public updatePlatformAccessories(accessories: PlatformAccessory[]): void {
    this.emit(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories);
  }

  public unregisterPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
    accessories.forEach(accessory => {
      if (!(accessory instanceof PlatformAccessory))
        throw new Error(`${pluginIdentifier} - ${platformName} attempt to unregister an accessory that isn't PlatformAccessory!`);
    });

    this.emit(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories);
  }
}
