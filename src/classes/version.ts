import fs from 'fs';
import path from 'path';

import {PackageJSON} from '../models/package.model';

/**  */
export class Version {
  /**
   * Returns the current Hanna version.
   * @returns {string} Version
   */
  public static getVersion(): string {
    return Version.loadPackage().version;
  }

  /**
   * Returns the minimum NodeJS engine version required to run Hanna.
   * @returns {string} Version
   */
  public static getRequiredEngineVersion(): string | undefined {
    return Version.loadPackage().engines?.node;
  }

  /**
   * Loads the Package JSON file and parses it for further processing.
   * @returns {PackageJSON} Package Information
   */
  public static loadPackage(): PackageJSON {
    const packagePath = path.join(__dirname, '../../package.json');
    return JSON.parse(fs.readFileSync(packagePath, {encoding: 'utf8'}))
  }
}
