/**
 *
 */
export const enum ChildStatus {
  /** When the child bridge is loading, or restarting */
  PENDING = 'pending',
  /** The child bridge is online and has published it's accessory */
  OK      = 'ok',
  /** The bridge is shutting down, or the process ended unexpectedly */
  DOWN    = 'down'
}
