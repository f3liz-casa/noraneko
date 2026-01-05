// SPDX-License-Identifier: MPL-2.0

/**
 * NMA State Managment
 *
 * Implements a singleton state container for the NMA system.
 * This holds the runtime state of loaded modules, verification results,
 * and configuration.
 */

import {
  NMALoaderState,
  NMATrustedConfig,
  TrustedSignerConfig,
  HotfixAutoUpdateConfig,
  UpdateChannel,
} from "./types.ts";

// ============================================================================
// Defaults & Constants
// ============================================================================

export const DEFAULT_NMA_TRUSTED_CONFIG: NMATrustedConfig = {
  allowedIssuers: ["https://token.actions.githubusercontent.com"],
  allowedRepositories: ["f3liz-dev/noraneko", "noraneko-browser/noraneko"],
  allowedWorkflows: [
    ".github/workflows/package*.yml",
    ".github/workflows/build*.yml",
    ".github/workflows/nma*.yml",
  ],
  allowUnsignedInDev: true,
};

export const DEFAULT_TRUSTED_SIGNER_CONFIG: TrustedSignerConfig = {
  allowedIssuers: ["https://token.actions.githubusercontent.com"],
  allowedRepositories: [
    "f3liz-dev/noraneko",
    "noraneko-browser/noraneko",
    "*/noraneko",
  ],
  allowedWorkflows: [
    ".github/workflows/hotfix*.yml",
    ".github/workflows/hotfix*.yaml",
    ".github/workflows/package*.yml",
    ".github/workflows/build*.yml",
    ".github/workflows/nma*.yml",
  ],
};

export const DEFAULT_AUTO_UPDATE_CONFIG: HotfixAutoUpdateConfig = {
  enabled: true,
  checkInterval: 24 * 60 * 60 * 1000,
  lastCheckTime: new Date(0).toISOString(),
};

// NMA Naming Convention: <type>_<version>_noraneko.nma.zip
export const NMA_PATHS = {
  FILE_PATTERN: /^([a-z0-9-]+)_([a-z0-9.-]+)_noraneko\.nma\.zip$/i,
  EXTRACTED_DIR: "noraneko-modules",
} as const;

// ============================================================================
// State Container
// ============================================================================

class StateContainer {
  loader: NMALoaderState = {
    currentNMA: null,
    nmaPath: null,
    isActive: false,
    loadedModules: [],
    lastVerification: null,
    moduleVersions: new Map(),
  };

  hotfixDir: string | null = null;
  profileDir: string | null = null;
  currentChannel: UpdateChannel = UpdateChannel.DEFAULT;
  autoUpdateTimer: number | null = null;

  nmaTrustedConfig: NMATrustedConfig = DEFAULT_NMA_TRUSTED_CONFIG;
  hotfixTrustedConfig: TrustedSignerConfig = DEFAULT_TRUSTED_SIGNER_CONFIG;

  // Event listeners
  listeners: Map<string, Array<(data: unknown) => void>> = new Map();
}

/** Global singleton state instance */
export const state = new StateContainer();

// ============================================================================
// State Accessors (Getters/Setters)
// ============================================================================

export const getLoaderState = (): NMALoaderState => ({ ...state.loader });

export const resetLoaderState = (): void => {
  state.loader = {
    currentNMA: null,
    nmaPath: null,
    isActive: false,
    loadedModules: [],
    lastVerification: null,
    moduleVersions: new Map(),
  };
};

export const getNMATrustedConfig = (): NMATrustedConfig =>
  state.nmaTrustedConfig;
export const setNMATrustedConfig = (cfg: NMATrustedConfig): void => {
  state.nmaTrustedConfig = cfg;
};

export const getHotfixTrustedConfig = (): TrustedSignerConfig =>
  state.hotfixTrustedConfig;
export const setHotfixTrustedConfig = (cfg: TrustedSignerConfig): void => {
  state.hotfixTrustedConfig = cfg;
};

// ============================================================================
// Event Management
// ============================================================================

export const isNMAActive = (): boolean => state.loader.isActive;

export const getCurrentNMAManifest = (): typeof state.loader.currentNMA =>
  state.loader.currentNMA;

export const emitEvent = (event: string, data: unknown): void => {
  const listeners = state.listeners.get(event) || [];
  for (const listener of listeners) {
    try {
      listener(data);
    } catch (e) {
      console.error(`[NMA] Event listener error for ${event}:`, e);
    }
  }
};

export const onEvent = (
  event: string,
  listener: (data: unknown) => void,
): void => {
  const listeners = state.listeners.get(event) || [];
  listeners.push(listener);
  state.listeners.set(event, listeners);
};

export const offEvent = (
  event: string,
  listener: (data: unknown) => void,
): void => {
  const listeners = state.listeners.get(event) || [];
  const index = listeners.indexOf(listener);
  if (index !== -1) {
    listeners.splice(index, 1);
    state.listeners.set(event, listeners);
  }
};
