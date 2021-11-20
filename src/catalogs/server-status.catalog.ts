/** */
export const enum ServerStatus {
  /** When the server is starting up */
  PENDING = 'pending',
  /** When the server is online and has published the main bridge */
  OK      = 'ok',
  /** When the server is shutting down */
  DOWN    = 'down',
}
