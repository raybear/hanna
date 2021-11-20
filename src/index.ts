/** Export HAP */
import type { HannaAPI } from './hanna.api';
export type HAP = HannaAPI['hap'];

export { APIEvent } from './events/api.event';
export { PluginType } from './catalogs/plugin.catalog';

export type { IHannaAPI } from './interfaces/api.model';
export type {
  PluginIdentifier,
  PluginName,
  ScopedPluginName,
  AccessoryName,
  PlatformName,

  AccessoryIdentifier,
  PlatformIdentifier,

  UnknownContext
} from './declarations/hanna.type';

export type {PluginInitializer} from './interfaces/plugin.initializer';
export type {AccessoryPluginConstructor} from './interfaces/accessory-plugin.constructor';
export type {AccessoryPlugin} from './interfaces/accessory-plugin';
export type {PlatformPluginConstructor} from './interfaces/platform-plugin.constructor';
export type {DynamicPlatformPlugin} from './interfaces/dynamic-platform-plugin';
export type {StaticPlatformPlugin} from './interfaces/static-platform-plugin';
export type {IndependentPlatformPlugin} from './interfaces/independent-platform-plugin';

export {PlatformAccessoryEvent} from './events/accessory.event';

export type {PlatformAccessory} from './interfaces/accessory.model';
export type {HannaOptions} from './options/hanna.options';

// Configuration
export type {HannaConfig} from './models/hanna.configuration';
export type {BridgeConfiguration} from './models/bridge.configuration';
export type {AccessoryConfig} from './models/accessory.configuration';
export type {PlatformConfig} from './models/platform.configuration';
export type {PortConfiguration} from './models/port.model';

export type {User} from './models/user.model';

export {LogLevel} from './catalogs/log-level.catalog';

export type {Logger, Logging} from './services/logger.service';
