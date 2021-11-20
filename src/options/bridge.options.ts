import {HannaOptions} from '../options/hanna.options';

export interface BridgeOptions extends HannaOptions {
  cachedAccessoriesDir: string;
  cachedAccessoriesItemName: string;
}
