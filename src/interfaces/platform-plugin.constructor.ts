import {IHannaAPI} from '../interfaces/api.model';
import {DynamicPlatformPlugin} from '../interfaces/dynamic-platform-plugin';
import {IndependentPlatformPlugin} from '../interfaces/independent-platform-plugin';
import {StaticPlatformPlugin} from '../interfaces/static-platform-plugin';
import {PlatformConfig} from '../models/platform.configuration';
import {Logging} from '../services/logger.service';

export interface PlatformPluginConstructor {
  new(logger: Logging, config: PlatformConfig, api: IHannaAPI): DynamicPlatformPlugin | StaticPlatformPlugin | IndependentPlatformPlugin;
}
