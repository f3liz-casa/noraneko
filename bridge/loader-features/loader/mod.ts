// SPDX-License-Identifier: MPL-2.0

/**
 * Feature module loader.
 *
 * The chrome bundle entry (browser-features/chrome/main.ts) hands us the
 * `import.meta.glob` maps; we turn them into a registry, honour the
 * enable/disable prefs, order modules by their dependencies and run the two
 * lifecycle phases. Nothing here is hot-swappable: a changed module means a
 * restart, like the rest of Firefox.
 */

import { sortByDependencies, validateDependencies } from "./deps.ts";
import type {
  LoadedModule,
  ModuleCategory,
  ModuleGlobs,
  ModuleLoader,
  ModuleMetadata,
  ModulesKeys,
  ModulesRegistry,
} from "./types.ts";

export type { LoadedModule, ModuleGlobs, ModuleMetadata } from "./types.ts";

// ============================================================================
// Registry
// ============================================================================

/** `./features/tabbrowser/mod.ts` -> `tabbrowser` */
const bareName = (globKey: string): string => {
  const parts = globKey.split("/");
  return parts.length >= 3 ? parts[parts.length - 2] : globKey;
};

const toCategory = (maps: Record<string, ModuleLoader>[]): ModuleCategory => {
  const out: ModuleCategory = {};
  for (const map of maps) {
    for (const [key, loader] of Object.entries(map)) out[bareName(key)] = loader;
  }
  return out;
};

const buildRegistry = (globs: ModuleGlobs): ModulesRegistry => ({
  common: toCategory(globs.common),
  static: toCategory(globs.static),
});

const keysOf = (registry: ModulesRegistry): ModulesKeys => ({
  common: Object.keys(registry.common),
  static: Object.keys(registry.static),
});

// ============================================================================
// Prefs
// ============================================================================

const PREF_ALL = "noraneko.features.all";
const PREF_ENABLED = "noraneko.features.enabled";

/** Publish the full list (locked) and the default enabled list. */
const publishPrefs = (all: ModulesKeys): void => {
  const prefs = Services.prefs.getDefaultBranch("");
  prefs.setStringPref(PREF_ALL, JSON.stringify(all));
  Services.prefs.lockPref(PREF_ALL);
  prefs.setStringPref(PREF_ENABLED, JSON.stringify(all));
};

const enabledKeys = (): ModulesKeys =>
  JSON.parse(Services.prefs.getStringPref(PREF_ENABLED, "{}")) as ModulesKeys;

// ============================================================================
// Loading
// ============================================================================

const defaultMetadata = (moduleName: string): ModuleMetadata => ({
  moduleName,
  dependencies: [],
  softDependencies: [],
});

const loadOne = async (
  name: string,
  loader: ModuleLoader,
): Promise<LoadedModule | null> => {
  try {
    // deno-lint-ignore no-explicit-any
    const exports = (await loader()) as any;
    const metadata: ModuleMetadata =
      exports.default?._metadata?.() ?? exports._metadata?.() ?? defaultMetadata(name);
    console.debug(`[noraneko] Loaded module: ${name}`);
    return { name, metadata, ...exports };
  } catch (e) {
    console.error(`[noraneko] Failed to load module ${name}:`, e);
    return null;
  }
};

const loadEnabled = async (
  registry: ModulesRegistry,
  enabled: ModulesKeys,
): Promise<LoadedModule[]> => {
  const jobs: Promise<LoadedModule | null>[] = [];
  for (const category of ["common", "static"] as const) {
    const wanted = new Set(enabled[category] ?? []);
    for (const [name, loader] of Object.entries(registry[category])) {
      if (wanted.has(name)) jobs.push(loadOne(name, loader));
    }
  }
  const results = await Promise.all(jobs);
  const loaded = results.filter((m): m is LoadedModule => m !== null);
  const failed = results.length - loaded.length;
  if (failed > 0) {
    console.warn(`[noraneko] ${failed} module(s) failed to load out of ${results.length}`);
  }
  return loaded;
};

// ============================================================================
// Lifecycle
// ============================================================================

const runPhase = async (
  modules: LoadedModule[],
  phase: "initBeforeSessionStoreInit" | "init",
): Promise<void> => {
  for (const module of modules) {
    const fn = module[phase];
    if (typeof fn !== "function") continue;
    try {
      if (phase === "init") console.debug(`[noraneko] init ${module.name}`);
      await fn();
    } catch (e) {
      console.error(`[noraneko] ${phase} failed for ${module.name}:`, e);
    }
  }
};

const orderModules = (modules: LoadedModule[]): LoadedModule[] => {
  const invalid = validateDependencies(modules);
  return sortByDependencies(
    modules.filter((m) => {
      if (invalid.has(m.name)) {
        console.warn(`[noraneko] Skipping module ${m.name} due to dependency issues`);
        return false;
      }
      return true;
    }),
  );
};

const domReady = (): Promise<void> => {
  const doc = document;
  if (!doc || doc.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) =>
    doc.addEventListener("DOMContentLoaded", () => resolve(), { once: true }),
  );
};

// ============================================================================
// Entry
// ============================================================================

/**
 * Load and initialize every enabled feature module.
 * Called once per browser window from the chrome bundle entry.
 */
export async function initScripts(globs: ModuleGlobs): Promise<void> {
  ChromeUtils.importESModule("resource://noraneko/modules/BrowserGlue.sys.mjs");
  const { NoranekoConstants } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NoranekoConstants.sys.mjs",
  );
  console.debug(
    `[noraneko-buildid2]\nuuid: ${NoranekoConstants.buildID2}\ndate: ${new Date(
      Number.parseInt(NoranekoConstants.buildID2.slice(0, 13).replace("-", ""), 16),
    ).toISOString()}`,
  );

  // chrome_root.js is an async module script in <head>; feature modules
  // touch the browser chrome DOM, so wait until browser.xhtml is parsed.
  await domReady();

  const registry = buildRegistry(globs);
  const all = keysOf(registry);
  console.debug(
    `[noraneko] Modules: common=[${all.common.join(", ")}] static=[${all.static.join(", ")}]`,
  );
  publishPrefs(all);

  const modules = orderModules(await loadEnabled(registry, enabledKeys()));

  await runPhase(modules, "initBeforeSessionStoreInit");
  await SessionStore.promiseInitialized;
  await runPhase(modules, "init");
}
