import {PlatformIdentifier, PlatformName} from '../declarations/hanna.type';
import {BridgeConfiguration} from '../models/bridge.configuration';

export interface PlatformConfig extends Record<string, any> {
  platform: PlatformName | PlatformIdentifier;
  name?: string;
  _bridge?: BridgeConfiguration,
}
