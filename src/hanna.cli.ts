import {satisfies} from 'semver';
import {Command} from 'commander';
import {HAPStorage} from 'hap-nodejs';

import {Version} from './classes';
import {HannaServer} from './hanna.server';
import {User} from './models/user.model';
import {HannaOptions} from './options';
import {Logger} from './services/logger.service';

import Signals = NodeJS.Signals;

const log = Logger.internal;
const engineVersion = Version.getRequiredEngineVersion();

if (engineVersion && !satisfies(process.version, engineVersion)) {
  log.warn(`Hanna requires Node.js version of ${engineVersion} which does not satisfy the current Node.js version of ${process.version}.`);
}

export = function cli(): void {
  let insecureAccess      = false;
  let hideQRCode          = false;
  let keepOrphans         = false;
  let noLogTimestamps     = false;
  let debugModeEnabled    = false;
  let forceColourLogging  = false;

  let customPluginPath: string | undefined  = undefined;
  let customStoragePath: string | undefined = undefined;

  let shuttingDown        = false;

  const commander = new Command();

  commander
    .version(Version.getVersion())
    .option(
      '-C, --color',
      'Force color in logging',
      () => forceColourLogging = true
    )
    .option(
      '-D, --debug',
      'Turn on debug level logging',
      () => debugModeEnabled = true
    )
    .option(
      '-I, --insecure',
      'Allow unauthenticated requests (for easier hacking)',
      () => insecureAccess = true
    )
    .option(
      '-P, --plugin-path [path]',
      'Look for plugins installed at [path] as well as the default locations; [path] can also point to a single plugin',
      (path: string) => customPluginPath = path
    )
    .option(
      '-Q, --no-qrcode',
      'Do not issue QR Code in logging',
      () => hideQRCode = true
    )
    .option(
      '-K, --keep-orphans',
      'Keep cached accessories for which the associated plugin is not loaded',
      () => keepOrphans = true
    )
    .option(
      '-T, --no-timestamp',
      'Do not issue timestamps in logging',
      () => noLogTimestamps = true
    )
    .option(
      '-U, --user-storage-path [path]',
      'Look for Hanna user files at [path] instead of the default location (~/.hanna)',
      (path: string) => customStoragePath = path
    ).parse(process.argv);

  if (noLogTimestamps)    Logger.setTimestampEnabled(false);
  if (debugModeEnabled)   Logger.setDebugEnabled(true);
  if (forceColourLogging) Logger.forceColor();

  if (customStoragePath)  User.setStoragePath(customStoragePath);

  // Initialize HAP-NodeJS with a custom persist directory
  HAPStorage.setCustomStoragePath(User.persistPath());

  const options: HannaOptions = {
    keepOrphanedCachedAccessories: keepOrphans,
    insecureAccess: insecureAccess,
    hideQRCode: hideQRCode,
    customPluginPath: customPluginPath,
    noLogTimestamps: noLogTimestamps,
    debugModeEnabled: debugModeEnabled,
    forceColourLogging: forceColourLogging,
    customStoragePath: customStoragePath
  };

  const server = new HannaServer(options);

  const signalHandler = (signal: Signals, signalNum: number): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info('Got %s, shutting down Hanna...', signal);
    setTimeout(() => process.exit(128 + signalNum), 5000);

    server.teardown();
  };

  process.on('SIGINT', signalHandler.bind(undefined, 'SIGINT', 2));
  process.on('SIGTERM', signalHandler.bind(undefined, 'SIGTERM', 15));

  const errorHandler = (error: Error): void => {
    if (error.stack)    log.error(error.stack);
    if (!shuttingDown)  process.kill(process.pid, 'SIGTERM');
  };

  process.on('uncaughtException', errorHandler);
  server.start().catch(errorHandler);
}
