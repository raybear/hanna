import {IpcIncomingEvent} from '../events/ipc-incomming.event';

export declare interface IpcService {
  on(event: IpcIncomingEvent.RESTART_CHILD_BRIDGE, listener: (childBridgeUsername: string) => void): this;
  on(event: IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, listener: () => void): this;
}
