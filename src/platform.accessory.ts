import EventEmitter from 'events';
import {
  Accessory,
  AccessoryEventTypes,
  Categories,
  Controller,
  ControllerConstructor,
  Service,
  VoidCallback,
  WithUUID
} from 'hap-nodejs';

import {PlatformName, PluginIdentifier, UnknownContext} from './declarations';
import {PlatformAccessoryEvent} from './events/accessory.event';
import {SerializedPlatformAccessory} from './models/serialized-platform-accessory.model';

export class PlatformAccessory<T extends UnknownContext = UnknownContext> extends EventEmitter {
  private static _injectedAccessory?: Accessory;

  public _associatedPlugin?: PluginIdentifier;
  public _associatedPlatform?: PlatformName;
  public _associatedHAPAccessory: Accessory;

  // HAP Accessory mirror
  public displayName: string;
  public UUID: string;
  public category: Categories;
  public services: Service[] = [];

  /** This is a way for Plugin developers to store custom data with their accessory */
  public context: T = {} as T;

  constructor(displayName: string, uuid: string, category?: Categories) {
    super();

    this._associatedHAPAccessory = PlatformAccessory._injectedAccessory
      ? PlatformAccessory._injectedAccessory
      : new Accessory(displayName, uuid);

    if (category) this._associatedHAPAccessory.category = category;

    this.displayName  = this._associatedHAPAccessory.displayName;
    this.UUID         = this._associatedHAPAccessory.UUID;
    this.category     = category || Categories.OTHER;
    this.services     = this._associatedHAPAccessory.services;

    // Forward identify event
    this._associatedHAPAccessory.on(AccessoryEventTypes.IDENTIFY, (paired: boolean, callback: VoidCallback) => {
      this.emit(PlatformAccessoryEvent.IDENTIFY, paired, () => {});
      callback();
    });
  }

  public addService(service: Service | typeof Service, ...constructorArgs: any[]): Service {
    return this._associatedHAPAccessory.addService(service, ...constructorArgs);
  }

  public removeService(service: Service): void {
    this._associatedHAPAccessory.removeService(service);
  }

  public getService<T extends WithUUID<typeof Service>>(name: string | T): Service | undefined {
    return this._associatedHAPAccessory.getService(name);
  }

  public getServiceByUUIDAndSubType<T extends WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined {
    return this.getServiceById(uuid, subType);
  }

  public getServiceById<T extends WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined {
    return this._associatedHAPAccessory.getServiceById(uuid, subType);
  }

  public configureController(controller: Controller | ControllerConstructor): void {
    this._associatedHAPAccessory.configureController(controller);
  }

  public removeController(controller: Controller): void {
    this._associatedHAPAccessory.removeController(controller);
  }

  public static serialize(accessory: PlatformAccessory): SerializedPlatformAccessory {
    return {
      plugin: accessory._associatedPlugin!,
      platform: accessory._associatedPlatform!,
      context: accessory.context,
      ...Accessory.serialize(accessory._associatedHAPAccessory),
    };
  }

  public static deserialize(json: SerializedPlatformAccessory): PlatformAccessory {
    const accessory = Accessory.deserialize(json);

    PlatformAccessory._injectedAccessory = accessory;
    const platformAccessory = new PlatformAccessory(accessory.displayName, accessory.UUID);
    PlatformAccessory._injectedAccessory = undefined;

    platformAccessory._associatedPlugin = json.plugin;
    platformAccessory._associatedPlatform = json.platform;
    platformAccessory.context = json.context;
    platformAccessory.category = json.category;

    return platformAccessory;
  }
}
