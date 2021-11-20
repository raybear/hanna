/**
 *
 */
export const enum ChildEventType {
  /** Sent to the child process with a ChildProcessLoadEventData payload */
  LOAD            = 'load',
  /** Sent to the child process telling it to start */
  START           = 'start',
  /** Sent from the child process when it is ready to accept config */
  READY           = 'ready',
  /** Sent from the child process once it has loaded the plugin */
  LOADED          = 'loaded',
  /** Sent from the child process when the bridge is online */
  ONLINE          = 'online',
  /** Sent from the child when it wants to request port allocation for an external accessory */
  PORT_REQUEST    = 'portRequest',
  /** Sent from the parent with the port allocation response */
  PORT_ALLOCATED  = 'portAllocated',
}
