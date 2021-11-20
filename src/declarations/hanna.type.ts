import * as hapNodeJs from 'hap-nodejs';

export type HAP                 = typeof hapNodeJs;
export type HAPLegacyTypes      = typeof hapNodeJs.LegacyTypes;

export type PluginIdentifier    = PluginName | ScopedPluginName;
export type PluginName          = string; // plugin name like "hanna-stellar"
export type ScopedPluginName    = string; // plugin name like "@scope/hanna-stellar"
export type AccessoryName       = string;
export type PlatformName        = string;

export type AccessoryIdentifier = string; // format: "PluginIdentifier.AccessoryName"
export type PlatformIdentifier  = string; // format: "PluginIdentifier.PlatformName"

export type UnknownContext      = Record<string, any>;
