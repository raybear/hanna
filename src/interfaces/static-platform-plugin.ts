import {AccessoryPlugin} from '../interfaces/accessory-plugin';
import {PlatformPlugin} from '../models/platform-plugin';

/**
 * Platform that exposes all available characteristics at the start of the plugin.
 * The set of accessories can not change at runtime.
 * The bridge waits for all callbacks to return before it is published and accessible by HomeKit controllers.
 */
export interface StaticPlatformPlugin extends PlatformPlugin {
  /**
   * This method is called once at startup. The Platform should pass all accessories which need to be created
   * to the callback in form of a {@link AccessoryPlugin}.
   * The Platform must respond in a timely manner as otherwise the startup of the bridge would be unnecessarily delayed.
   *
   * @param {(foundAccessories: AccessoryPlugin[]) => void} callback
   */
  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void;
}
