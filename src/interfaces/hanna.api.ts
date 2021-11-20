import {InternalAPIEvent} from '../events/internal-api.event';
import {AccessoryPluginConstructor} from '../interfaces/accessory-plugin.constructor';
import {PlatformAccessory} from '../interfaces/accessory.model';
import {PlatformPluginConstructor} from '../interfaces/platform-plugin.constructor';
import {AccessoryName, PlatformName, PluginIdentifier} from '../declarations/hanna.type';

export declare interface HannaAPI {
  on(event: 'didFinishLaunching', listener: () => void): this;
  on(event: 'shutdown', listener: () => void): this;

  // Internal events (using enums directly to restrict access)
  on(event: InternalAPIEvent.REGISTER_ACCESSORY, listener: (accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier) => void): this;
  on(event: InternalAPIEvent.REGISTER_PLATFORM, listener: (platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier) => void): this;
  on(event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
  on(event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
  on(event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;
  on(event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void): this;

  emit(event: 'didFinishLaunching'): boolean;
  emit(event: 'shutdown'): boolean;

  emit(event: InternalAPIEvent.REGISTER_ACCESSORY, accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier): boolean;
  emit(event: InternalAPIEvent.REGISTER_PLATFORM, platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier): boolean;

  emit(event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
  emit(event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
  emit(event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
  emit(event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]): boolean;
}
