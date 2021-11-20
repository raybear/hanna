import {InterfaceName, IPAddress, MDNSAdvertiser} from 'hap-nodejs';

import {MacAddress} from '../classes/mac.utility';

export interface BridgeConfiguration {
  name: string;
  username: MacAddress;
  pin: string; // format like '000-00-000'
  advertiser: MDNSAdvertiser;
  port?: number;
  bind?: (InterfaceName | IPAddress) | (InterfaceName | IPAddress)[];
  setupID?: string[4];
  manufacturer?: string;
  model?: string;
  disableIpc?: boolean;
}
