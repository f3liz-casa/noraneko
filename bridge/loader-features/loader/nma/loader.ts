// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Orchestrator (Loader)
 *
 * Facade that orchestrates data flow between Core, State, and types.
 * This is the high-level API exposed to the rest of the application.
 */

import {
  NMAManifest,
  NMAVerificationStatus,
  NMAVerificationResult,
} from "./types.ts";

import { state, emitEvent, getNMATrustedConfig } from "./state.ts";

import * as Core from "./core.ts";

// ============================================================================
// NMA Initialization
// ============================================================================

export const initializeNMALoader = async (): Promise<boolean> => {
  console.log("[NMA] Initializing...");

  const nmaPath = await Core.resolveNMAPath();
  if (!nmaPath) {
    console.log("[NMA] No NMA file found, using built-in modules");
    return false;
  }

  state.loader.nmaPath = nmaPath;
  console.log(`[NMA] Found archive: ${nmaPath}`);

  const verificationResult = await verifyNMA(nmaPath);
  if (!verificationResult.isValid) {
    console.error("[NMA] Verification failed:", verificationResult.errorMessage);
    emitEvent("nma-error", { error: verificationResult.errorMessage, status: verificationResult.status });
    state.loader.nmaPath = null;
    return false;
  }

  const manifest = await readNMAManifest(nmaPath);
  if (!manifest) {
    console.error("[NMA] Failed to read manifest");
    state.loader.nmaPath = null;
    return false;
  }

  state.loader.currentNMA = manifest;
  state.loader.isActive = true;
  Core.registerNMAResource(nmaPath);

  console.log(`[NMA] Loaded: ${manifest.buildId} (v${manifest.noranekoVersion})`);
  emitEvent("nma-loaded", { manifest });
  return true;
};

// ============================================================================
// NMA Logic
// ============================================================================

export const verifyNMA = async (path: string): Promise<NMAVerificationResult> => {
  try {
    const rawManifest = await Core.readFromZip(path, "manifest.json");
    const manifest = JSON.parse(rawManifest) as NMAManifest;

    if (isDevModeNMAAllowed() && !manifest.sigstoreBundle?.bundle) {
      console.warn("[NMA] Allowing unsigned NMA in dev mode");
      return { isValid: true, status: NMAVerificationStatus.VALID, manifest };
    }

    const result = await Core.verifyNMAManifest(manifest, rawManifest);
    state.loader.lastVerification = result;
    emitEvent("nma-verified", { result });
    return result;
  } catch (error) {
    return { isValid: false, status: NMAVerificationStatus.UNKNOWN_ERROR, errorMessage: String(error) };
  }
};

const readNMAManifest = async (path: string): Promise<NMAManifest | null> => {
  try {
    return JSON.parse(await Core.readFromZip(path, "manifest.json")) as NMAManifest;
  } catch { return null; }
};

export const verifyNMAModuleHash = async (moduleUrl: string, expectedHash: string): Promise<boolean> => {
  try {
    const content = moduleUrl.startsWith("jar:")
      ? await (await fetch(moduleUrl)).text()
      : await Core.readTextFile(moduleUrl);
    return (await Core.computeSha256(content)) === expectedHash;
  } catch { return false; }
};

export const isDevModeNMAAllowed = (): boolean => {
  const config = getNMATrustedConfig();
  if (!config.allowUnsignedInDev) return false;
  if (import.meta.env.MODE === "dev") return true;
  try {
    const { AppConstants } = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs",
    ) as any;
    const channel = (AppConstants.MOZ_UPDATE_CHANNEL || "").toLowerCase();
    return (AppConstants.DEBUG ?? false) || channel.includes("nightly") || channel === "default";
  } catch { return true; }
};

// ============================================================================
// Module Loading
// ============================================================================

export const getNMAModuleUrl = (modulePath: string): string => {
  if (!state.loader.nmaPath) throw new Error("NMA not loaded");
  return `resource://noraneko-nma/${modulePath}`;
};

export const hasNMAModule = (moduleName: string): boolean =>
  state.loader.currentNMA?.modules.some((m) => m.name === moduleName) ?? false;

export const getNMAModule = (moduleName: string) =>
  state.loader.currentNMA?.modules.find((m) => m.name === moduleName) ?? null;

export const loadNMAModule = async (moduleName: string): Promise<Record<string, unknown> | null> => {
  const module = getNMAModule(moduleName);
  if (!module) return null;
  if (module.size === 0) {
    console.debug(`[NMA] Skipping empty module: ${moduleName}`);
    return null;
  }
  try {
    const exports = await Core.loadModule(getNMAModuleUrl(module.path));
    if (!state.loader.loadedModules.includes(moduleName))
      state.loader.loadedModules.push(moduleName);
    return exports;
  } catch (e) {
    console.error(`[NMA] Failed to load module ${moduleName}:`, e);
    return null;
  }
};

export const activateNMAModules = async (): Promise<string[]> => {
  if (!state.loader.currentNMA || !state.loader.isActive) return [];
  const activated: string[] = [];
  for (const mod of state.loader.currentNMA.modules.filter((m) => m.essential)) {
    if (await loadNMAModule(mod.name)) activated.push(mod.name);
  }
  emitEvent("nma-activated", { modules: activated });
  return activated;
};

// ============================================================================
// Hotswap Support
// ============================================================================

const getCoreLib = async () => {
  try { return await Core.loadModule(getNMAModuleUrl("lib/core/mod.ts")); }
  catch (e) { console.error("[NMA] Failed to load Core Lib:", e); return null; }
};

const cleanupModuleInstance = async (name: string): Promise<void> => {
  const core = await getCoreLib();
  if (core && typeof core.unregister === "function") {
    try { core.unregister(name); emitEvent("nma-module-cleanup", { name }); }
    catch (e) { console.error(`[NMA] Error cleaning up module ${name}:`, e); }
  }
};

export const hotswapModule = async (moduleName: string): Promise<boolean> => {
  const module = getNMAModule(moduleName);
  if (!module) { console.error(`[NMA] Module ${moduleName} not found in manifest`); return false; }

  console.log(`[NMA] Hotswapping module: ${moduleName}`);
  await cleanupModuleInstance(moduleName);

  try {
    await Core.loadModule(`${getNMAModuleUrl(module.path)}?t=${Date.now()}`);
    if (!state.loader.loadedModules.includes(moduleName))
      state.loader.loadedModules.push(moduleName);
    emitEvent("nma-module-reload", { name: moduleName });
    return true;
  } catch (e) {
    console.error(`[NMA] Failed to reload module ${moduleName}:`, e);
    return false;
  }
};

export const hotswapByRecommendation = async (
  recommendation: import("./types.ts").HotswapRecommendation,
): Promise<{ swapped: string[]; failed: string[] }> => {
  const { HotswapMode } = await import("./types.ts");

  if (recommendation.mode === HotswapMode.NONE) return { swapped: [], failed: [] };
  if (recommendation.mode === HotswapMode.FULL) {
    console.warn(`[NMA] Full reload required: ${recommendation.reason}`);
    return { swapped: [], failed: [...state.loader.loadedModules] };
  }

  const swapped: string[] = [];
  const failed: string[] = [];
  emitEvent("nma-hotswap-start", { modules: recommendation.modulesToReload });

  for (const moduleName of recommendation.modulesToReload) {
    (await hotswapModule(moduleName) ? swapped : failed).push(moduleName);
  }

  emitEvent("nma-hotswap-complete", { swapped, failed });
  if (swapped.length > 0) console.log(`[NMA] Hotswapped ${swapped.length} modules: ${swapped.join(", ")}`);
  if (failed.length > 0) console.error(`[NMA] Failed to hotswap ${failed.length} modules: ${failed.join(", ")}`);

  return { swapped, failed };
};

export const checkModuleChanges = async (): Promise<import("./types.ts").HotswapRecommendation> => {
  const { HotswapMode } = await import("./types.ts");
  if (!state.loader.currentNMA)
    return { mode: HotswapMode.NONE, modulesToReload: [], reason: "No NMA loaded" };

  const analysis = await Core.analyzeNMAChanges(
    Core.getInstallDir(),
    state.loader.currentNMA.buildId,
    state.loader.currentNMA.modules.map((m) => m.path),
  );
  return analysis.recommendation;
};
