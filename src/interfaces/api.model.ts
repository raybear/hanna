import {AccessoryPluginConstructor} from '../interfaces/accessory-plugin.constructor';
import {PlatformPluginConstructor} from '../interfaces/platform-plugin.constructor';
import {User} from '../models/user.model';
import {PlatformAccessory} from '../platform.accessory';
import {AccessoryName, HAP, HAPLegacyTypes, PlatformName, PluginIdentifier} from '../declarations/hanna.type';

export interface IHannaAPI {
  /** The Hanna API version as a floating point number. */
  readonly version: number;
  /** The current Hanna semver version. */
  readonly serverVersion: string;

  // LEGACY EXPORTS FOR PRE TYPESCRIPT
  readonly user: typeof User;
  readonly hap: HAP;
  readonly hapLegacyTypes: HAPLegacyTypes;
  readonly platformAccessory: typeof PlatformAccessory;

  /**
   * Returns true if the current running Hanna version is greater or equal to the passed version string.
   *
   * Example:
   * We assume the Hanna version 1.3.0-beta.12 ({@link serverVersion}) and the following example calls below
   * ```
   *  versionGreaterOrEqual("1.2.0"); // will return true
   *  versionGreaterOrEqual("1.3.0"); // will return false (the RELEASE version 1.3.0 is bigger than the BETA version 1.3.0-beta.12)
   *  versionGreaterOrEqual("1.3.0-beta.8); // will return true
   * ```
   *
   * @param version
   */
  versionGreaterOrEqual(version: string): boolean;
  registerAccessory(accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;
  registerAccessory(pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;
  registerPlatform(platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  registerPlatform(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void;
  updatePlatformAccessories(accessories: PlatformAccessory[]): void;
  unregisterPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void;
  publishExternalAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void;

  on(event: 'didFinishLaunching', listener: () => void): this;
  on(event: 'shutdown', listener: () => void): this;
}
