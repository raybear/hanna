import {ChildEventType} from '../catalogs';

export interface ChildProcessMessageEvent<T> {
  id: ChildEventType;
  data?: T
}
