import {PluginType} from '../catalogs/plugin.catalog';
import {AccessoryConfig} from '../models/accessory.configuration';
import {BridgeConfiguration} from '../models/bridge.configuration';
import {HannaConfig} from '../models/hanna.configuration';
import {PlatformConfig} from '../models/platform.configuration';
import {BridgeOptions} from '../options/bridge.options';

export interface ChildProcessLoadEventData {
  type: PluginType;
  identifier: string;
  pluginPath: string;
  pluginConfig: Array<PlatformConfig | AccessoryConfig>;
  bridgeConfig: BridgeConfiguration;
  hannaConfig: HannaConfig;
  bridgeOptions: BridgeOptions;
}
