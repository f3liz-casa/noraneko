// SPDX-License-Identifier: MPL-2.0

/** What a feature module may export. Everything is optional except the name. */
export interface ModuleMetadata {
  moduleName: string;
  dependencies: string[];
  softDependencies: string[];
}

export interface LoadedModule {
  name: string;
  metadata: ModuleMetadata;
  /** Runs after browser.xhtml is parsed and gBrowser exists, before SessionStore restores tabs. */
  initBeforeSessionStoreInit?: () => void | Promise<void>;
  /** Runs after SessionStore has initialized. */
  init?: () => void | Promise<void>;
}

/** Lazy importer, as produced by `import.meta.glob`. */
export type ModuleLoader = () => Promise<unknown>;

/** Bare module name -> loader */
export type ModuleCategory = Record<string, ModuleLoader>;

export interface ModulesRegistry {
  common: ModuleCategory;
  static: ModuleCategory;
}

/** Module names by category (what the prefs carry). */
export interface ModulesKeys {
  common: string[];
  static: string[];
}

/** Glob maps per category from the chrome bundle entry. Later maps win. */
export interface ModuleGlobs {
  common: Record<string, ModuleLoader>[];
  static: Record<string, ModuleLoader>[];
}
