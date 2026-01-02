// SPDX-License-Identifier: MPL-2.0

/**
 * NMA (Noraneko Module Archive) Loader
 *
 * Loads and manages modules from the NMA archive.
 * The NMA file is placed alongside omni.ja in the Firefox installation
 * directory, making modules part of the core installation.
 *
 * Features:
 * - Loads modules from ZIP-based NMA archive
 * - Verifies Sigstore signatures on startup
 * - Supports hot-swapping when new NMA is detected
 * - Falls back to built-in modules if NMA is invalid
 */

import {
  type NMALoaderState,
  type NMAManifest,
  type NMAModule,
  type NMAVerificationResult,
  NMAVerificationStatus,
  NMA_PATHS,
} from "./nma-types.ts";
import {
  verifyNMAManifest,
  verifyNMAModuleHash,
  isDevModeNMAAllowed,
  validateNMAManifestStructure,
  computeNMAHash,
} from "./nma-verifier.ts";

// ============================================================================
// Module State
// ============================================================================

/** Current NMA loader state */
let _loaderState: NMALoaderState = {
  currentNMA: null,
  nmaPath: null,
  isActive: false,
  loadedModules: [],
  lastVerification: null,
};

/** Event listeners for NMA events */
const _eventListeners: Map<string, Array<(data: unknown) => void>> = new Map();

// ============================================================================
// Path Helpers
// ============================================================================

/** Get the Firefox installation directory */
const getInstallDir = (): string => {
  const appDir = Services.dirsvc.get("GreD", Ci.nsIFile);
  return appDir.path;
};

/** Get path to NMA file in installation directory */
const getNMAFilePath = (): string => {
  const installDir = getInstallDir();
  return PathUtils.join(installDir, NMA_PATHS.NMA_FILENAME);
};

/** Get fallback NMA file path */
const getFallbackNMAFilePath = (): string => {
  const installDir = getInstallDir();
  return PathUtils.join(installDir, NMA_PATHS.NMA_FALLBACK_FILENAME);
};

/** Get path to extracted modules directory */
const getExtractedModulesDir = (): string => {
  const installDir = getInstallDir();
  return PathUtils.join(installDir, NMA_PATHS.EXTRACTED_DIR);
};

// ============================================================================
// Event System
// ============================================================================

/** Emit an NMA event */
const emitEvent = (event: string, data: unknown): void => {
  const listeners = _eventListeners.get(event) || [];
  for (const listener of listeners) {
    try {
      listener(data);
    } catch (error) {
      console.error(`[NMALoader] Event listener error for ${event}:`, error);
    }
  }
};

/** Add event listener */
export const onNMAEvent = (
  event: string,
  listener: (data: unknown) => void,
): void => {
  const listeners = _eventListeners.get(event) || [];
  listeners.push(listener);
  _eventListeners.set(event, listeners);
};

/** Remove event listener */
export const offNMAEvent = (
  event: string,
  listener: (data: unknown) => void,
): void => {
  const listeners = _eventListeners.get(event) || [];
  const index = listeners.indexOf(listener);
  if (index !== -1) {
    listeners.splice(index, 1);
    _eventListeners.set(event, listeners);
  }
};

// ============================================================================
// NMA File Operations
// ============================================================================

/** Check if NMA file exists */
export const nmaFileExists = async (): Promise<boolean> => {
  const primaryPath = getNMAFilePath();
  const fallbackPath = getFallbackNMAFilePath();

  try {
    if (await IOUtils.exists(primaryPath)) {
      return true;
    }
    if (await IOUtils.exists(fallbackPath)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

/** Find and return the path to the NMA file */
export const findNMAFile = async (): Promise<string | null> => {
  const primaryPath = getNMAFilePath();
  const fallbackPath = getFallbackNMAFilePath();

  try {
    if (await IOUtils.exists(primaryPath)) {
      return primaryPath;
    }
    if (await IOUtils.exists(fallbackPath)) {
      return fallbackPath;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Read and parse NMA manifest from the archive
 * Note: In Firefox, we use jar: protocol to read from ZIP archives
 */
const readNMAManifest = async (nmaPath: string): Promise<NMAManifest | null> => {
  try {
    // Use jar: URL to read manifest from ZIP archive
    const manifestUrl = `jar:file://${nmaPath}!/manifest.json`;

    // Use fetch to read from jar URL (supported in Firefox privileged code)
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      console.error(`[NMALoader] Failed to read manifest: ${response.status}`);
      return null;
    }

    const manifestContent = await response.text();
    const manifest = JSON.parse(manifestContent);

    if (!validateNMAManifestStructure(manifest)) {
      console.error("[NMALoader] Invalid manifest structure");
      return null;
    }

    return manifest;
  } catch (error) {
    console.error("[NMALoader] Error reading NMA manifest:", error);
    return null;
  }
};

/**
 * Read raw manifest content for signature verification
 */
const readNMAManifestRaw = async (nmaPath: string): Promise<string | null> => {
  try {
    const manifestUrl = `jar:file://${nmaPath}!/manifest.json`;
    const response = await fetch(manifestUrl);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
};

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify the NMA file and its contents
 */
export const verifyNMA = async (nmaPath: string): Promise<NMAVerificationResult> => {
  console.log(`[NMALoader] Verifying NMA: ${nmaPath}`);

  // Check if file exists
  if (!(await IOUtils.exists(nmaPath))) {
    return {
      isValid: false,
      status: NMAVerificationStatus.NOT_FOUND,
      errorMessage: `NMA file not found: ${nmaPath}`,
    };
  }

  // Read manifest
  const manifestRaw = await readNMAManifestRaw(nmaPath);
  if (!manifestRaw) {
    return {
      isValid: false,
      status: NMAVerificationStatus.INVALID_MANIFEST,
      errorMessage: "Failed to read NMA manifest",
    };
  }

  const manifest = JSON.parse(manifestRaw);
  if (!validateNMAManifestStructure(manifest)) {
    return {
      isValid: false,
      status: NMAVerificationStatus.INVALID_MANIFEST,
      errorMessage: "Invalid manifest structure",
    };
  }

  // In dev mode, allow unsigned NMA
  if (isDevModeNMAAllowed() && !manifest.sigstoreBundle?.bundle) {
    console.warn("[NMALoader] Allowing unsigned NMA in development mode");
    return {
      isValid: true,
      status: NMAVerificationStatus.VALID,
      manifest,
    };
  }

  // Verify Sigstore signature
  const verificationResult = await verifyNMAManifest(manifest, manifestRaw);

  // Store result
  _loaderState.lastVerification = verificationResult;
  emitEvent("nma-verified", { result: verificationResult });

  return verificationResult;
};

// ============================================================================
// Module Loading
// ============================================================================

/**
 * Get the URL for a module in the NMA archive
 */
export const getNMAModuleUrl = (modulePath: string): string => {
  if (!_loaderState.nmaPath) {
    throw new Error("NMA not loaded");
  }
  return `jar:file://${_loaderState.nmaPath}!/${modulePath}`;
};

/**
 * Check if a module exists in the NMA
 */
export const hasNMAModule = (moduleName: string): boolean => {
  if (!_loaderState.currentNMA) return false;
  return _loaderState.currentNMA.modules.some(m => m.name === moduleName);
};

/**
 * Get module info from NMA
 */
export const getNMAModule = (moduleName: string): NMAModule | null => {
  if (!_loaderState.currentNMA) return null;
  return _loaderState.currentNMA.modules.find(m => m.name === moduleName) || null;
};

/**
 * Load a module from the NMA archive
 */
export const loadNMAModule = async (
  moduleName: string,
): Promise<Record<string, unknown> | null> => {
  const module = getNMAModule(moduleName);
  if (!module) {
    console.warn(`[NMALoader] Module not found in NMA: ${moduleName}`);
    return null;
  }

  try {
    const moduleUrl = getNMAModuleUrl(module.path);
    console.log(`[NMALoader] Loading module from NMA: ${moduleName} -> ${moduleUrl}`);

    const exports = await ChromeUtils.importESModule(moduleUrl);

    _loaderState.loadedModules.push(moduleName);
    return exports as Record<string, unknown>;
  } catch (error) {
    console.error(`[NMALoader] Failed to load module ${moduleName}:`, error);
    return null;
  }
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the NMA loader
 * This should be called early in the browser startup
 */
export const initializeNMALoader = async (): Promise<boolean> => {
  console.log("[NMALoader] Initializing NMA loader...");

  // Find NMA file
  const nmaPath = await findNMAFile();
  if (!nmaPath) {
    console.log("[NMALoader] No NMA file found, using built-in modules");
    return false;
  }

  console.log(`[NMALoader] Found NMA file: ${nmaPath}`);
  _loaderState.nmaPath = nmaPath;

  // Verify NMA
  const verificationResult = await verifyNMA(nmaPath);
  if (!verificationResult.isValid) {
    console.error("[NMALoader] NMA verification failed:", verificationResult.errorMessage);
    emitEvent("nma-error", {
      error: verificationResult.errorMessage,
      status: verificationResult.status,
    });

    // Reset state
    _loaderState.nmaPath = null;
    return false;
  }

  // Load manifest
  const manifest = await readNMAManifest(nmaPath);
  if (!manifest) {
    console.error("[NMALoader] Failed to load NMA manifest");
    _loaderState.nmaPath = null;
    return false;
  }

  _loaderState.currentNMA = manifest;
  _loaderState.isActive = true;

  console.log(`[NMALoader] NMA loaded successfully: ${manifest.buildId}`);
  console.log(`[NMALoader] Noraneko version: ${manifest.noranekoVersion}`);
  console.log(`[NMALoader] Modules: ${manifest.modules.map(m => m.name).join(", ")}`);

  emitEvent("nma-loaded", { manifest });

  return true;
};

/**
 * Activate NMA modules (load all essential modules)
 */
export const activateNMAModules = async (): Promise<string[]> => {
  if (!_loaderState.currentNMA || !_loaderState.isActive) {
    console.warn("[NMALoader] No active NMA to activate");
    return [];
  }

  const activatedModules: string[] = [];
  const essentialModules = _loaderState.currentNMA.modules.filter(m => m.essential);

  for (const module of essentialModules) {
    const loaded = await loadNMAModule(module.name);
    if (loaded) {
      activatedModules.push(module.name);
    } else if (module.essential) {
      console.error(`[NMALoader] Failed to load essential module: ${module.name}`);
    }
  }

  emitEvent("nma-activated", { modules: activatedModules });

  return activatedModules;
};

// ============================================================================
// State Accessors
// ============================================================================

/** Get current NMA loader state */
export const getNMALoaderState = (): NMALoaderState => ({ ..._loaderState });

/** Check if NMA is active */
export const isNMAActive = (): boolean => _loaderState.isActive;

/** Get current NMA manifest */
export const getCurrentNMAManifest = (): NMAManifest | null => _loaderState.currentNMA;

/** Get list of loaded modules from NMA */
export const getLoadedNMAModules = (): string[] => [..._loaderState.loadedModules];

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup NMA loader state
 */
export const cleanupNMALoader = (): void => {
  _loaderState = {
    currentNMA: null,
    nmaPath: null,
    isActive: false,
    loadedModules: [],
    lastVerification: null,
  };
  console.log("[NMALoader] NMA loader cleaned up");
};
