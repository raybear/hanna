import {PluginIdentifier} from '../declarations/hanna.type';

export interface PluginManagerOptions {
  /** Additional path to search for plugins in. Specified relative to the current working directory. */
  customPluginPath?: string;
  /** When defined, only plugins specified here will be initialized. */
  activePlugins?: PluginIdentifier[];
  /** Plugins that are marked as disabled and whose corresponding config blocks should be ignored. */
  disabledPlugins?: PluginIdentifier[];
}
