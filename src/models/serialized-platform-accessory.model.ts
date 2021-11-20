import {SerializedAccessory} from 'hap-nodejs';
import {PlatformName, PluginName, UnknownContext} from '../declarations/hanna.type';

export interface SerializedPlatformAccessory<T extends UnknownContext = UnknownContext> extends SerializedAccessory {
  plugin:   PluginName;
  platform: PlatformName;
  context:  T;
}
