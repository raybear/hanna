export declare interface PlatformAccessory {
  on(event: 'identify', listener: () => void): this;
  emit(event: 'identify'): boolean;
}
