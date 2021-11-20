import assert from 'assert';
import path from 'path';
import {satisfies} from 'semver';

import {
  AccessoryIdentifier,
  AccessoryName,
  PlatformIdentifier,
  PlatformName,
  PluginIdentifier,
  PluginName
} from '../declarations/hanna.type';
import {Version} from '../classes/version';
import {IHannaAPI} from '../interfaces/api.model';
import {AccessoryPluginConstructor} from '../interfaces/accessory-plugin.constructor';
import {DynamicPlatformPlugin} from '../interfaces/dynamic-platform-plugin';
import {PlatformPluginConstructor} from '../interfaces/platform-plugin.constructor';
import {PluginInitializer} from '../interfaces/plugin.initializer';
import {PackageJSON} from '../models/package.model';
import {PluginManager} from '../plugins/manager/plugin.manager';
import {Logger} from '../services/logger.service';

const log = Logger.internal;

/** Represents a loaded Hanna plugin. */
export class Plugin {
  private readonly _pluginName: PluginName;
  private readonly _scope?: string;     // npm package scope
  private readonly _pluginPath: string; // like "/usr/local/lib/node_modules/hanna-stellar"

  // Mark the Plugin as disabled
  public disabled = false;

  // Package JSON content
  public readonly version: string;
  private readonly _main: string;
  // Used to store data for a limited time until the load method is called, will be reset afterwards
  private _loadContext?: {
    engines?: Record<string, string>;
    dependencies?: Record<string, string>;
  }

  // Default exported function from the plugin that initializes it
  private pluginInitializer?: PluginInitializer;

  private readonly _registeredAccessories: Map<AccessoryName, AccessoryPluginConstructor> = new Map();
  private readonly _registeredPlatforms: Map<PlatformName, PlatformPluginConstructor> = new Map();
  private readonly _activeDynamicPlatforms: Map<PlatformName, DynamicPlatformPlugin[]> = new Map();

  constructor(name: PluginName, path: string, packageJSON: PackageJSON, scope?: string) {
    this._pluginName  = name;
    this._scope       = scope;
    this._pluginPath  = path;

    this.version      = packageJSON.version || '0.0.0';
    this._main        = packageJSON.main || './index.js'; // figure out the main module - index.js unless otherwise specified

    // Very temporary fix for first wave of Plugins
    if (packageJSON.peerDependencies && (!packageJSON.engines || !packageJSON.engines.hanna)) {
      packageJSON.engines = packageJSON.engines || {};
      packageJSON.engines.hanna = packageJSON.peerDependencies.hanna;
    }

    this._loadContext = {
      engines: packageJSON.engines,
      dependencies: packageJSON.dependencies,
    };
  }

  // return full plugin name with scope prefix
  public getPluginIdentifier(): PluginIdentifier {
    return `${this._scope ? this._scope + '/' : ''}${this._pluginName}`;
  }

  public getPluginPath(): string {
    return this._pluginPath;
  }

  public registerAccessory(name: AccessoryName, constructor: AccessoryPluginConstructor): void {
    if (this._registeredAccessories.has(name))
      throw new Error(`Plugin '${this.getPluginIdentifier()}' tried to register an accessory '${name}' which has already been registered!`);

    if (!this.disabled)
      log.info("Registering accessory '%s'", this.getPluginIdentifier() + "." + name);

    this._registeredAccessories.set(name, constructor);
  }

  public registerPlatform(name: PlatformName, constructor: PlatformPluginConstructor): void {
    if (this._registeredPlatforms.has(name))
      throw new Error(`Plugin '${this.getPluginIdentifier()}' tried to register a platform '${name}' which has already been registered!`);

    if (!this.disabled)
      log.info("Registering platform '%s'", this.getPluginIdentifier() + "." + name);

    this._registeredPlatforms.set(name, constructor);
  }

  public getAccessoryConstructor(accessoryIdentifier: AccessoryIdentifier | AccessoryName): AccessoryPluginConstructor {
    const name: AccessoryName = PluginManager.getAccessoryName(accessoryIdentifier);
    const constructor = this._registeredAccessories.get(name);
    if (!constructor)
      throw new Error(`The requested accessory '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);
    return constructor;
  }

  public getPlatformConstructor(platformIdentifier: PlatformIdentifier | PlatformName): PlatformPluginConstructor {
    const name: PlatformName = PluginManager.getPlatformName(platformIdentifier);
    const constructor = this._registeredPlatforms.get(name);
    if (!constructor)
      throw new Error(`The requested platform '${name}' was not registered by the plugin '${this.getPluginIdentifier()}'.`);

    // if it's a dynamic platform check that it is not enabled multiple times
    if (this._activeDynamicPlatforms.has(name))
      log.error("The dynamic platform " + name + " from the plugin " + this.getPluginIdentifier() + " seems to be configured " +
        "multiple times in your config.json. This behaviour is deprecated");

    return constructor;
  }

  public assignDynamicPlatform(platformIdentifier: PlatformIdentifier | PlatformName, platformPlugin: DynamicPlatformPlugin): void {
    const name: PlatformName = PluginManager.getPlatformName(platformIdentifier);
    let platforms = this._activeDynamicPlatforms.get(name);
    if (!platforms) {
      platforms = [];
      this._activeDynamicPlatforms.set(name, platforms);
    }
    // the last platform published should be at the first position for easy access
    // we just try to mimic pre 1.0.0 behavior
    platforms.unshift(platformPlugin);
  }

  public getActiveDynamicPlatform(platformName: PlatformName): DynamicPlatformPlugin | undefined {
    const platforms = this._activeDynamicPlatforms.get(platformName);
    // We always use the last registered
    return platforms && platforms[0];
  }

  public load(): void {
    const context = this._loadContext!;
    assert(context, "Reached illegal state. Plugin state is undefined!");
    // Free up memory
    this._loadContext = undefined;

    // Pluck out the Hanna version requirement
    if (!context.engines || !context.engines.hanna) {
      throw new Error(`Plugin ${this._pluginPath} does not contain the 'hanna' package in 'engines'.`);
    }

    const versionRequired = context.engines.hanna;
    const nodeVersionRequired = context.engines.node;

    // Make sure the version is satisfied by the currently running Hanna version
    if (!satisfies(Version.getVersion(), versionRequired, { includePrerelease: true })) {
      // TODO - change this back to an error
      log.error(`The plugin "${this._pluginName}" requires a Hanna version of ${versionRequired} which does \
not satisfy the current Hanna version of ${Version.getVersion()}. You may need to update this plugin (or Hanna) to a newer version. \
You may face unexpected issues or stability problems running this plugin.`);
    }

    // make sure the version is satisfied by the currently running version of Node
    if (nodeVersionRequired && !satisfies(process.version, nodeVersionRequired)) {
      log.warn(`The plugin "${this._pluginName}" requires Node.js version of ${nodeVersionRequired} which does \
not satisfy the current Node.js version of ${process.version}. You may need to upgrade your installation of Node.js - see https://git.io/JTKEF`);
    }

    const dependencies = context.dependencies || {};
    if (dependencies.hanna || dependencies["hap-nodejs"]) {
      log.error(`The plugin "${this._pluginName}" defines 'hanna' and/or 'hap-nodejs' in their 'dependencies' section, \
meaning they carry an additional copy of hanna and hap-nodejs. This not only wastes disk space, but also can cause \
major incompatibility issues and thus is considered bad practice. Please inform the developer to update their plugin!`);
    }

    const mainPath = path.join(this._pluginPath, this._main);

    // Try to require() it and grab the exported initialization hook
    const pluginModules = require(mainPath);

    if (typeof pluginModules === "function") {
      this.pluginInitializer = pluginModules;
    } else if (pluginModules && typeof pluginModules.default === "function") {
      this.pluginInitializer = pluginModules.default;
    } else {
      throw new Error(`Plugin ${this._pluginPath} does not export a initializer function from main.`);
    }
  }

  public initialize(api: IHannaAPI): void {
    if (!this.pluginInitializer)
      throw new Error('Tried to initialize a plugin which hasn\'t been loaded yet!');
    this.pluginInitializer(api);
  }
}
