import {PluginIdentifier} from '../declarations/hanna.type';
import {AccessoryConfig} from '../models/accessory.configuration';
import {BridgeConfiguration} from '../models/bridge.configuration';
import {PlatformConfig} from '../models/platform.configuration';
import {PortConfiguration} from '../models/port.model';

export interface HannaConfig {
  bridge: BridgeConfiguration;
  accessories: AccessoryConfig[];
  platforms: PlatformConfig[];
  // Array to define set of active plugins
  plugins?: PluginIdentifier[];

  /**
   * Array of disabled plugins.
   * Unlike the plugins[] config which prevents plugins from being initialised at all, disabled plugins still have
   * their alias loaded so we can match config blocks of disabled plugins and show an appropriate message in the logs.
   */
  disabledPlugins?: PluginIdentifier[];

  // This section is used to control the range of ports (inclusive) that separate accessory
  // (like camera or television) should be bind to
  ports?: PortConfiguration;
}
