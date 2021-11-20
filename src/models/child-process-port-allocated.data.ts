import {MacAddress} from '../classes/mac.utility';

export interface ChildProcessPortAllocatedEventData {
  username: MacAddress;
  port?: number;
}
