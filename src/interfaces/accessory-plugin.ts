import {Controller, Service} from 'hap-nodejs';

export interface AccessoryPlugin {
  /** Optional method which will be called if a 'identify' of a Accessory is requested. */
  identify?(): void;
  /**
   * This method will be called once on startup, to query all services to be exposed by the Accessory.
   * All event handlers for characteristics should be set up before the array is returned.
   * @returns {Service[]} services - returned services will be added to the Accessory
   */
  getServices(): Service[];
  /**
   * This method will be called once on startup, to query all controllers to be exposed by the Accessory.
   * It is optional to implement.
   *
   * This includes controllers like the RemoteController or the CameraController.
   * Any necessary controller specific setup should have been done when returning the array.
   * In most cases the plugin will only return a array of the size 1.
   *
   * In the case that the Plugin does not add any additional services (returned by {@link getServices}) the
   * method {@link getServices} must defined in any way and should just return an empty array.
   *
   * @returns {Controller[]} controllers - returned controllers will be configured for the Accessory
   */
  getControllers?(): Controller[];
}
