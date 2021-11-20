/**
 *
 */
export const enum APIEvent {
  /**
   * Event is fired once Hanna has finished with booting up and initializing all components and plugins.
   * When this event is fired it is possible that the Bridge accessory isn't published yet, if Hanna still needs
   * to wait for some {@see StaticPlatformPlugin | StaticPlatformPlugins} to finish accessory creation.
   */
  DID_FINISH_LAUNCHING  = 'didFinishLaunching',
  /**
   * This event is fired when Hanna got shutdown. This could be a regular shutdown or a unexpected crash.
   * At this stage all Accessories are already unpublished and all PlatformAccessories are already saved to disk!
   */
  SHUTDOWN              = 'shutdown',
}
