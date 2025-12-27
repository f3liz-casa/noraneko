// SPDX-License-Identifier: MPL-2.0

import { initI18NForBrowserChrome } from "#i18n/config-browser-chrome.ts";

import { MODULES, MODULES_KEYS } from "./modules.ts";
import {
  onModuleLoaded,
  _registerModuleLoadState,
  _rejectOtherLoadStates,
} from "./modules-hooks.ts";
import { registerModuleEventDispatcher } from "./event-dispatcher-registry.ts";

console.log("[noraneko] Initializing scripts...");

// Hotfix system preference keys
const PREF_HOTFIX_DISABLED_MODULES = "noraneko.hotfix.disabled_modules";

export const loader = {
  load: initScripts,
};

export async function initScripts() {
  // Import required modules and initialize i18n
  ChromeUtils.importESModule("resource://noraneko/modules/BrowserGlue.sys.mjs");
  const { NoranekoConstants } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NoranekoConstants.sys.mjs",
  );
  initI18NForBrowserChrome();
  console.debug(
    `[noraneko-buildid2]\nuuid: ${NoranekoConstants.buildID2}\ndate: ${new Date(
      Number.parseInt(
        NoranekoConstants.buildID2.slice(0, 13).replace("-", ""),
        16,
      ),
    ).toISOString()}`,
  );

  // Initialize hotfix system
  await initializeHotfixSystem();

  setPrefFeatures(MODULES_KEYS);

  // Get enabled features from preferences
  const enabled_features = JSON.parse(
    Services.prefs.getStringPref("noraneko.features.enabled", "{}"),
  ) as typeof MODULES_KEYS;

  // Load enabled modules (filtering out hotfix-disabled modules)
  const modules = await loadEnabledModules(enabled_features);

  // Initialize modules after session is ready
  await initializeModules(modules);
}

/**
 * Initialize the hotfix system
 */
async function initializeHotfixSystem(): Promise<void> {
  try {
    const { hotfixLoader } = ChromeUtils.importESModule(
      "resource://noraneko/modules/HotfixLoader.sys.mjs",
    );
    await hotfixLoader.initialize();
    console.log("[noraneko] Hotfix system initialized");
  } catch (error) {
    console.error("[noraneko] Failed to initialize hotfix system:", error);
    // Continue without hotfix system - non-fatal error
  }
}

/**
 * Check if a module is disabled by the hotfix system
 */
function isModuleDisabledByHotfix(moduleName: string): boolean {
  try {
    const disabled = Services.prefs.getStringPref(
      PREF_HOTFIX_DISABLED_MODULES,
      "[]",
    );
    const disabledModules = JSON.parse(disabled) as string[];
    return disabledModules.includes(moduleName);
  } catch {
    return false;
  }
}

/**
 * Get the patched module path if available
 */
function getPatchedModulePath(moduleName: string): string | null {
  try {
    const { hotfixLoader } = ChromeUtils.importESModule(
      "resource://noraneko/modules/HotfixLoader.sys.mjs",
    );
    return hotfixLoader.getPatchedModulePath(moduleName);
  } catch {
    return null;
  }
}

async function setPrefFeatures(all_features_keys: typeof MODULES_KEYS) {
  // Set up preferences for features
  const prefs = Services.prefs.getDefaultBranch(null as unknown as string);
  prefs.setStringPref(
    "noraneko.features.all",
    JSON.stringify(all_features_keys),
  );
  Services.prefs.lockPref("noraneko.features.all");

  prefs.setStringPref(
    "noraneko.features.enabled",
    JSON.stringify(all_features_keys),
  );
}

interface ModuleMetadata {
  moduleName: string;
  dependencies: string[];
  softDependencies: string[];
}

interface LoadedModule {
  name: string;
  metadata: ModuleMetadata;
  init?: typeof Function;
  initBeforeSessionStoreInit?: typeof Function;
  default?: any; // Module class constructor
}

async function loadEnabledModules(
  enabled_features: typeof MODULES_KEYS,
): Promise<LoadedModule[]> {
  const modules: LoadedModule[] = [];

  const loadModulePromises = Object.entries(MODULES).flatMap(
    ([categoryKey, categoryValue]) =>
      Object.keys(categoryValue).map(async (moduleName) => {
        if (
          categoryKey in enabled_features &&
          enabled_features[
            categoryKey as keyof typeof enabled_features
          ].includes(moduleName)
        ) {
          // Check if module is disabled by hotfix
          if (isModuleDisabledByHotfix(moduleName)) {
            console.log(`[noraneko] Module ${moduleName} disabled by hotfix, loading patched version`);
            const patchedPath = getPatchedModulePath(moduleName);
            if (patchedPath) {
              try {
                // Load the patched module from the hotfix directory
                const patchedModule = await loadPatchedModule(patchedPath, moduleName);
                if (patchedModule) {
                  modules.push(patchedModule);
                  return;
                }
              } catch (e) {
                console.error(`[noraneko] Failed to load patched module ${moduleName}:`, e);
                // Fall through to load original module as fallback
              }
            }
            // Skip the original module if no patched version available
            console.warn(`[noraneko] No patched version found for disabled module ${moduleName}`);
            return;
          }

          try {
            const moduleExports = await categoryValue[moduleName]();
            const metadata =
              (moduleExports as any).default?._metadata?.() ||
              ({
                moduleName,
                dependencies: [],
                softDependencies: [],
              } satisfies ModuleMetadata);

            const module: LoadedModule = {
              name: moduleName,
              metadata,
              ...(moduleExports as {
                init?: typeof Function;
                initBeforeSessionStoreInit?: typeof Function;
                default?: any;
              }),
            };
            console.log(module);
            modules.push(module);
          } catch (e) {
            console.error(`[noraneko] Failed to load module ${moduleName}:`, e);
          }
        }
      }),
  );

  await Promise.all(loadModulePromises);
  return modules;
}

/**
 * Load a patched module from the hotfix directory
 * Security: Validates the path is within the expected hotfix directory
 */
async function loadPatchedModule(
  patchedPath: string,
  moduleName: string,
): Promise<LoadedModule | null> {
  try {
    // Security: Validate the path is within the hotfix directory
    const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
    const hotfixBaseDir = PathUtils.join(profileDir, "noraneko-hotfixes");
    const normalizedPath = PathUtils.normalize(patchedPath);
    
    // Ensure the path doesn't escape the hotfix directory (path traversal protection)
    if (!normalizedPath.startsWith(hotfixBaseDir)) {
      console.error(`[noraneko] Security: Patched module path is outside hotfix directory: ${patchedPath}`);
      return null;
    }

    // Convert file path to file:// URL for loading
    const fileUrl = `file://${normalizedPath}`;
    const moduleExports = ChromeUtils.importESModule(fileUrl);

    const metadata =
      (moduleExports as any).default?._metadata?.() ||
      ({
        moduleName,
        dependencies: [],
        softDependencies: [],
      } satisfies ModuleMetadata);

    return {
      name: moduleName,
      metadata,
      ...(moduleExports as {
        init?: typeof Function;
        initBeforeSessionStoreInit?: typeof Function;
        default?: any;
      }),
    };
  } catch (error) {
    console.error(`[noraneko] Failed to load patched module from ${patchedPath}:`, error);
    return null;
  }
}

async function initializeModules(modules: LoadedModule[]) {
  // Validate dependencies
  validateDependencies(modules);

  // Sort modules by dependencies
  const sortedModules = sortModulesByDependencies(modules);

  // Run initBeforeSessionStoreInit for all modules
  for (const module of sortedModules) {
    try {
      await module?.initBeforeSessionStoreInit?.();
    } catch (e) {
      console.error(
        `[noraneko] Failed to initBeforeSessionStoreInit module ${module.name}:`,
        e,
      );
    }
  }

  // Wait for SessionStore to be ready
  // @ts-expect-error SessionStore type not defined
  await SessionStore.promiseInitialized;

  // Initialize each module and register EventDispatcher after init
  for (const module of sortedModules) {
    try {
      console.log("init " + module.name);

      // Wait for hard dependencies to load
      for (const dep of module.metadata.dependencies) {
        await onModuleLoaded(dep);
      }

      // Create instance (decorator auto-runs init via constructor)
      let instance: any;
      if (module?.default) {
        instance = new module.default();
      }

      // Register EventDispatcher methods after initialization
      if (instance && typeof instance.eventMethods === "function") {
        try {
          const eventMethods = instance.eventMethods();
          console.log(module.metadata.moduleName);
          console.log(eventMethods);
          registerModuleEventDispatcher(module.metadata.moduleName, eventMethods);

          console.debug(
            `[noraneko] Registered EventDispatcher methods for module ${module.metadata.moduleName}`,
          );
        } catch (e) {
          console.error(
            `[noraneko] Failed to register EventDispatcher methods for module ${module.metadata.moduleName}:`,
            e,
          );
        }
      }

      _registerModuleLoadState(module.name, true);
    } catch (e) {
      console.error(`[noraneko] Failed to init module ${module.name}:`, e);
      _registerModuleLoadState(module.name, false);
    }
  }

  _registerModuleLoadState("__init_all__", true);
  await _rejectOtherLoadStates();
}

function validateDependencies(modules: LoadedModule[]): void {
  const moduleNames = new Set(modules.map((m) => m.name));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const moduleMap = new Map(modules.map((m) => [m.name, m]));

  const checkCircular = (
    name: string,
    deps: string[],
    path: string[] = [],
  ): void => {
    if (visiting.has(name)) {
      const cycle = [...path, name].join(" -> ");
      throw new Error(`Circular dependency detected: ${cycle}`);
    }
    if (visited.has(name)) return;

    visiting.add(name);
    const newPath = [...path, name];
    for (const dep of deps) {
      const depModule = moduleMap.get(dep);
      if (depModule) {
        checkCircular(dep, depModule.metadata.dependencies, newPath);
      }
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const module of modules) {
    // Check hard dependencies exist
    for (const dep of module.metadata.dependencies) {
      if (!moduleNames.has(dep)) {
        throw new Error(
          `Missing dependency: ${dep} required by ${module.name}`,
        );
      }
    }

    // Check for circular dependencies
    checkCircular(module.name, module.metadata.dependencies);
  }
}

function sortModulesByDependencies(modules: LoadedModule[]): LoadedModule[] {
  const sorted: LoadedModule[] = [];
  const processed = new Set<string>();
  const moduleMap = new Map(modules.map((m) => [m.name, m]));

  const process = (module: LoadedModule): void => {
    if (processed.has(module.name)) return;

    // Process dependencies first
    for (const depName of module.metadata.dependencies) {
      const depModule = moduleMap.get(depName);
      if (depModule && !processed.has(depName)) {
        process(depModule);
      }
    }

    sorted.push(module);
    processed.add(module.name);
  };

  for (const module of modules) {
    process(module);
  }

  return sorted;
}
