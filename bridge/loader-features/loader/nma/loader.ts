// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Orchestrator (Loader)
 *
 * Facade that orchestrates data flow between IO, Verifier, and State.
 * This is the high-level API exposed to the rest of the application.
 */

import {
  NMAManifest,
  NMAVerificationStatus,
  NMAVerificationResult,
} from "./types.ts";

import { state, emitEvent, getNMATrustedConfig } from "./state.ts";

import * as IO from "./io.ts";
import * as Verifier from "./verifier.ts";

// ============================================================================
// NMA Initialization
// ============================================================================

export const initializeNMALoader = async (): Promise<boolean> => {
  console.log("[NMA] Initializing...");

  // Locate NMA File
  const nmaPath = await IO.resolveNMAPath();
  if (!nmaPath) {
    console.log("[NMA] No NMA file found, using built-in modules");
    return false;
  }

  state.loader.nmaPath = nmaPath;
  console.log(`[NMA] Found archive: ${nmaPath}`);

  // Verify NMA
  const verificationResult = await verifyNMA(nmaPath);
  if (!verificationResult.isValid) {
    console.error(
      "[NMA] Verification failed:",
      verificationResult.errorMessage,
    );
    emitEvent("nma-error", {
      error: verificationResult.errorMessage,
      status: verificationResult.status,
    });
    state.loader.nmaPath = null;
    return false;
  }

  // Load Manifest
  const manifest = await readNMAManifest(nmaPath);
  if (!manifest) {
    console.error("[NMA] Failed to read manifest");
    state.loader.nmaPath = null;
    return false;
  }

  state.loader.currentNMA = manifest;
  state.loader.isActive = true;

  console.log(
    `[NMA] Loaded: ${manifest.buildId} (v${manifest.noranekoVersion})`,
  );
  emitEvent("nma-loaded", { manifest });

  return true;
};

// ============================================================================
// NMA Logic
// ============================================================================

export const verifyNMA = async (
  path: string,
): Promise<NMAVerificationResult> => {
  try {
    const rawManifest = await IO.readFromZip(path, "manifest.json");
    const manifest = JSON.parse(rawManifest) as NMAManifest;

    // Dev mode check
    const isDev = isDevModeNMAAllowed();
    if (isDev && !manifest.sigstoreBundle?.bundle) {
      console.warn("[NMA] Allowing unsigned NMA in dev mode");
      return { isValid: true, status: NMAVerificationStatus.VALID, manifest };
    }

    const result = await Verifier.verifyNMAManifest(manifest, rawManifest);
    state.loader.lastVerification = result;
    emitEvent("nma-verified", { result });
    return result;
  } catch (error) {
    return {
      isValid: false,
      status: NMAVerificationStatus.UNKNOWN_ERROR,
      errorMessage: String(error),
    };
  }
};

const readNMAManifest = async (path: string): Promise<NMAManifest | null> => {
  try {
    const raw = await IO.readFromZip(path, "manifest.json");
    return JSON.parse(raw) as NMAManifest;
  } catch {
    return null;
  }
};

export const verifyNMAModuleHash = async (
  moduleUrl: string,
  expectedHash: string,
): Promise<boolean> => {
  try {
    let content: string;
    if (moduleUrl.startsWith("jar:")) {
      const response = await fetch(moduleUrl);
      if (!response.ok) return false;
      content = await response.text();
    } else {
      content = await IO.readTextFile(moduleUrl);
    }
    const hash = await Verifier.computeSha256(content);
    return hash === expectedHash;
  } catch {
    return false;
  }
};

export const isDevModeNMAAllowed = (): boolean => {
  try {
    const { AppConstants } = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs",
    ) as any;
    const isDebug = AppConstants.DEBUG ?? false;
    const channel = (AppConstants.MOZ_UPDATE_CHANNEL || "").toLowerCase();
    const config = getNMATrustedConfig();
    return (
      config.allowUnsignedInDev && (isDebug || channel.includes("nightly"))
    );
  } catch {
    return false;
  }
};

// ============================================================================
// Module Loading
// ============================================================================

export const getNMAModuleUrl = (modulePath: string): string => {
  if (!state.loader.nmaPath) throw new Error("NMA not loaded");
  return `jar:file://${state.loader.nmaPath}!/${modulePath}`;
};

export const hasNMAModule = (moduleName: string): boolean => {
  return (
    state.loader.currentNMA?.modules.some((m) => m.name === moduleName) ?? false
  );
};

export const getNMAModule = (moduleName: string) => {
  return (
    state.loader.currentNMA?.modules.find((m) => m.name === moduleName) ?? null
  );
};

export const loadNMAModule = async (
  moduleName: string,
): Promise<Record<string, unknown> | null> => {
  const module = getNMAModule(moduleName);
  if (!module) return null;

  try {
    const url = getNMAModuleUrl(module.path);
    const exports = await IO.loadModule(url);
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
  const essential = state.loader.currentNMA.modules.filter((m) => m.essential);

  for (const mod of essential) {
    if (await loadNMAModule(mod.name)) {
      activated.push(mod.name);
    }
  }
  emitEvent("nma-activated", { modules: activated });
  return activated;
};

// ============================================================================
// Hotswap Support
// ============================================================================

const getCoreLib = async () => {
  try {
    const url = getNMAModuleUrl("lib/core/mod.ts");
    return await IO.loadModule(url);
  } catch (e) {
    console.error("[NMA] Failed to load Core Lib:", e);
    return null;
  }
};

const cleanupModuleInstance = async (name: string): Promise<void> => {
  const core = await getCoreLib();
  if (core && typeof core.unregister === "function") {
    try {
      core.unregister(name);
      emitEvent("nma-module-cleanup", { name });
    } catch (e) {
      console.error(`[NMA] Error cleaning up module ${name}:`, e);
    }
  }
};

export const hotswapModule = async (moduleName: string): Promise<boolean> => {
  const module = getNMAModule(moduleName);
  if (!module) {
    console.error(`[NMA] Module ${moduleName} not found in manifest`);
    return false;
  }

  console.log(`[NMA] Hotswapping module: ${moduleName}`);

  await cleanupModuleInstance(moduleName);

  const moduleUrl = getNMAModuleUrl(module.path);
  const bustUrl = `${moduleUrl}?t=${Date.now()}`;

  try {
    await IO.loadModule(bustUrl);

    if (!state.loader.loadedModules.includes(moduleName)) {
      state.loader.loadedModules.push(moduleName);
    }

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

  if (recommendation.mode === HotswapMode.NONE) {
    return { swapped: [], failed: [] };
  }

  if (recommendation.mode === HotswapMode.FULL) {
    console.warn(`[NMA] Full reload required: ${recommendation.reason}`);
    return { swapped: [], failed: [...state.loader.loadedModules] };
  }

  const swapped: string[] = [];
  const failed: string[] = [];

  emitEvent("nma-hotswap-start", { modules: recommendation.modulesToReload });

  for (const moduleName of recommendation.modulesToReload) {
    const success = await hotswapModule(moduleName);
    if (success) {
      swapped.push(moduleName);
    } else {
      failed.push(moduleName);
    }
  }

  emitEvent("nma-hotswap-complete", { swapped, failed });

  if (swapped.length > 0) {
    console.log(
      `[NMA] Hotswapped ${swapped.length} modules: ${swapped.join(", ")}`,
    );
  }
  if (failed.length > 0) {
    console.error(
      `[NMA] Failed to hotswap ${failed.length} modules: ${failed.join(", ")}`,
    );
  }

  return { swapped, failed };
};

export const checkModuleChanges = async (): Promise<
  import("./types.ts").HotswapRecommendation
> => {
  const { analyzeNMAChanges } = await import("./hashing.ts");

  if (!state.loader.currentNMA) {
    const { HotswapMode } = await import("./types.ts");
    return {
      mode: HotswapMode.NONE,
      modulesToReload: [],
      reason: "No NMA loaded",
    };
  }

  const installDir = IO.getInstallDir();
  const modulePaths = state.loader.currentNMA.modules.map((m) => m.path);
  const analysis = await analyzeNMAChanges(
    installDir,
    state.loader.currentNMA.buildId,
    modulePaths,
  );

  return analysis.recommendation;
};

