import {MacAddress} from '../classes/mac.utility';
import HannaChild from '../hanna.child';
import {PortConfiguration} from '../models/port.model';
import {Logger} from '../services/logger.service';

/**
 * Allocates ports from the user defined config.ports option
 * This service is used to allocate ports for external accessories on the main bridge, and child bridges.
 */
export class PortService {
  private _nextExternalPort?: number;
  private _allocatedPorts: Map<MacAddress, number | undefined> = new Map();

  constructor(private _externalPorts?: PortConfiguration) {}

  /**
   * Returns the next available port in the external port config.
   * If the external port is not configured by the user it will return null.
   * If the port range has ben exhausted it will return null.
   */
  public async requestPort(username: MacAddress): Promise<number | undefined> {
    // Check to see if this device has already requested an external port
    const existingPortAllocation = this._allocatedPorts.get(username);
    if (existingPortAllocation) return existingPortAllocation;

    // Get the next unused port
    const port = this._getNextFreePort();
    this._allocatedPorts.set(username, port);
    return port;
  }

  private _getNextFreePort(): number | undefined  {
    if (!this._externalPorts) return undefined;
    if (this._nextExternalPort === undefined) {
      this._nextExternalPort = this._externalPorts.start;
      return this._nextExternalPort;
    }

    this._nextExternalPort++;

    if (this._nextExternalPort <= this._externalPorts.end) return this._nextExternalPort;
    Logger.internal.warn("External port pool ran out of ports. Falling back to random port assignment.");
    return undefined;
  }
}

/**
 * This is the child bridge version of the port allocation service.
 * It requests a free port from the main bridge's port service.
 */
export class ChildBridgePortService extends PortService {
  constructor(private _childBridge: HannaChild) { super() }

  public async requestPort(username: MacAddress): Promise<number | undefined> {
    return await this._childBridge.requestExternalPort(username);
  }
}
