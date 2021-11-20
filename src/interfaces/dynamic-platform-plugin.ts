import {PlatformAccessory} from '../interfaces/accessory.model';
import {PlatformPlugin} from '../models/platform-plugin';

/**
 * Platform that is able to dynamically add or remove accessories.
 * All configured accessories are stored to disk and recreated on startup.
 * Accessories can be added or removed by using {@link API.registerPlatformAccessories} or {@link API.unregisterPlatformAccessories}.
 */
export interface DynamicPlatformPlugin extends PlatformPlugin {
  /**
   * This method is called for every PlatformAccessory, which is recreated from disk on startup.
   * It should be used to properly initialize the Accessory and setup all event handlers for
   * all services and their characteristics.
   *
   * @param {PlatformAccessory} accessory which needs to be configured
   */
  configureAccessory(accessory: PlatformAccessory): void;
}
