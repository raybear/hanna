/** Incomplete type for package.json (just stuff we use for the Plugins) */
export interface PackageJSON {
  /** */
  name: string;
  /** */
  version: string;
  /** */
  main?: string;
  /** */
  keywords?: string[];
  /** */
  engines?: Record<string, string>;
  /** */
  dependencies?: Record<string, string>;
  /** */
  devDependencies?: Record<string, string>;
  /** */
  peerDependencies?: Record<string, string>;
}
