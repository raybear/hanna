import path from 'path';
import os from 'os';

export class User {
  private static _customStoragePath?: string;
  private static _storageAccessed = false;

  public static storagePath(): string {
    User._storageAccessed = true;
    return User._customStoragePath ? User._customStoragePath : path.join(os.homedir(), '.hanna');
  }

  public static configPath(): string {
    return path.join(User.storagePath(), 'config.json');
  }

  public static persistPath(): string {
    return path.join(User.storagePath(), 'persist');
  }

  public static accessoryPath(): string {
    return path.join(User.storagePath(), 'accessories');
  }

  public static setStoragePath(...pathSegments: string[]): void {
    if(User._storageAccessed)
      throw new Error('Storage path was already accessed and cannot be changed anymore.');
    User._customStoragePath = path.resolve(...pathSegments);
  }
}
