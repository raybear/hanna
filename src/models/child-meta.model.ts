import { ChildStatus } from '../catalogs';
import { MacAddress } from '../classes/mac.utility';

/** */
export interface ChildMetadata {
  /** */
  status: ChildStatus;
  /** */
  username: MacAddress;
  /** */
  name: string;
  /** */
  plugin: string;
  /** */
  identifier: string;
  /** */
  pid?: number;
}
