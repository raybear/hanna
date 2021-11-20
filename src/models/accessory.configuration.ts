import {AccessoryIdentifier, AccessoryName} from '../declarations/hanna.type';
import {BridgeConfiguration} from '../models/bridge.configuration';

export interface AccessoryConfig extends Record<string, any> {
  accessory: AccessoryName | AccessoryIdentifier;
  name: string;
  uuid_base?: string;
  _bridge?: BridgeConfiguration,
}
