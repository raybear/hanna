import {PlatformPlugin} from '../models/platform-plugin';

/**
 * Platform that does not aim to add any accessories to the main bridge accessory.
 * This platform should be used if for example a plugin aims to only expose external accessories.
 * It should also be used when the platform doesn't intend to expose any accessories at all, like plugins
 * providing a UI for Hanna.
 */
export interface IndependentPlatformPlugin extends PlatformPlugin {
  // does not expose any methods
}
