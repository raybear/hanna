import crypto from 'crypto';

export type MacAddress = string;

/** */
export class Mac {
  private static _VALID_MAC = /^([0-9A-F]{2}:){5}([0-9A-F]{2})$/;

  /**
   * Check if address is a valid MAC address.
   * @param {string} address
   * @returns {boolean}
   */
  public static isValidMacAddress(address: string): boolean {
    return Mac._VALID_MAC.test(address);
  }

  /**
   * Generates a random MAC address.
   * @param {string | Buffer | NodeJS.TypedArray | DataView} data
   * @returns {MacAddress} Newly generated MAC address.
   */
  public static generate(data: string | Buffer | NodeJS.TypedArray | DataView): MacAddress {
    const sha = crypto.createHash('sha1')
      .update(data)
      .digest('hex');
    let i = 0;
    return 'xx:xx:xx:xx:xx:xx'.replace(/[x]/g, () => sha[i++]).toUpperCase();
  }
}
