import {IHannaAPI} from '../interfaces/api.model';

/**
 * The {PluginInitializer} is a method which must be the default export for every Hanna plugin.
 * It is called once the plugin is loaded from disk.
 */
export interface PluginInitializer {
  /**
   * When the initializer is called the plugin must use the provided api instance and call the appropriate
   * register methods - {@link IHannaAPI.registerAccessory} or {@link IHannaAPI.registerPlatform} - in order to
   * correctly register for the following startup sequence.
   * @param {IHannaAPI} api
   */
  (api: IHannaAPI): void;
}
