import {AccessoryPlugin} from '../interfaces/accessory-plugin';
import {IHannaAPI} from '../interfaces/api.model';
import {AccessoryConfig} from '../models/accessory.configuration';
import {Logging} from '../services/logger.service';

export interface AccessoryPluginConstructor {
  new(logger: Logging, config: AccessoryConfig, api: IHannaAPI): AccessoryPlugin;
}
