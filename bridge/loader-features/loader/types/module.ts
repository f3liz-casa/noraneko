// SPDX-License-Identifier: MPL-2.0

/**
 * Module Types - Data-Oriented Programming Style
 *
 * Core type definitions for module system.
 */

/** Module metadata */
export interface ModuleMetadata {
  moduleName: string;
  dependencies: string[];
  softDependencies: string[];
}

/** Loaded module with exports and metadata */
export interface LoadedModule {
  name: string;
  metadata: ModuleMetadata;
  init?: typeof Function;
  initBeforeSessionStoreInit?: typeof Function;
  default?: any;
}

/** Module loader function type */
export type ModuleLoader = () => Promise<unknown>;

/** Module category record */
export type ModuleCategory = Record<string, ModuleLoader>;

/** All modules by category */
export interface ModulesRegistry {
  common: ModuleCategory;
  static: ModuleCategory;
}

/** Module keys by category */
export interface ModulesKeys {
  common: string[];
  static: string[];
}
