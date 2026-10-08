/**
 * Types for scripts/preflight.mjs, so the launcher's checks can be tested.
 *
 * The checks themselves have to be plain JavaScript: npm run class runs them
 * before anything is built, so there is no compiled output and no tsx to lean
 * on at that moment. This file is the one place that pays for that, and it is
 * kept honest by tests/unit/launcher.test.ts, which would stop compiling if a
 * signature here drifted from the real one.
 */

export declare class CheckFailed extends Error {}

export declare const REPO_ROOT: string;
export declare const MIN_NODE_MAJOR: number;

export declare function nodeVersionCheck(version?: string): string;
export declare function dataFolderCheck(dataDir: string): Promise<string>;

export declare function buildIsCurrent(root?: string): Promise<{ current: boolean; why: string }>;

export declare function portIsFree(port: number, host?: string): Promise<boolean>;
export declare function firstFreePort(from: number, host?: string, tries?: number): Promise<number>;

export declare function isFirstStart(dataDir: string): Promise<boolean>;
export declare function rememberStart(dataDir: string): Promise<void>;

export interface LocalAddress {
  /** The network card's name, as the operating system gives it. */
  name: string;
  address: string;
  /** 3 = a normal private network, 1 = unusual, 0 = this network is not working. */
  rank: number;
}

export declare function localAddresses(interfaces?: {
  [name: string]: Array<{ family: string; address: string; internal: boolean }> | undefined;
}): LocalAddress[];
