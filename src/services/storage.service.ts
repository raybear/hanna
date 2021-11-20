import path from 'path';
import {
  ensureDirSync,
  readJSONSync, readJSON,
  pathExistsSync, pathExists,
  writeJsonSync, writeJSON,
  copyFileSync, copyFile,
  removeSync, remove
} from 'fs-extra';

export class StorageService {
  constructor(public base: string) {}

  public initSync(): void {
    return ensureDirSync(this.base);
  }

  public getItemSync<T>(item: string): T | null {
    const itemPath = path.resolve(this.base, item);
    if(!pathExistsSync(itemPath)) return null;
    return readJSONSync(itemPath);
  }

  public async getItem<T>(item: string): Promise<T | null> {
    const itemPath = path.resolve(this.base, item);
    if(!await pathExists(itemPath)) return null;
    return await readJSON(itemPath);
  }

  public setItemSync(item: string, data: Record<any, any> | Array<any>): void {
    return writeJsonSync(path.resolve(this.base, item), data);
  }

  public async setItem(item: string, data: Record<any, any> | Array<any>): Promise<void> {
    return await writeJSON(path.resolve(this.base, item), data);
  }

  public copyItemSync(source: string, destination: string): void {
    return copyFileSync(path.resolve(this.base, source), path.resolve(this.base, destination));
  }

  public async copyItem(source: string, destination: string): Promise<void> {
    return await copyFile(path.resolve(this.base, source), path.resolve(this.base, destination));
  }

  public removeItemSync(item: string): void {
    return removeSync(path.resolve(this.base, item));
  }

  public async removeItem(item: string): Promise<void> {
    return await remove(path.resolve(this.base, item));
  }
}
