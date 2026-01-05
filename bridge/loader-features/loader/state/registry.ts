// SPDX-License-Identifier: MPL-2.0

/**
 * Registry State - Data-Oriented Programming Style
 *
 * Module-level state for the module registry.
 * Julia/Kotlin-like module-level state management.
 */

import type { ModuleInfo } from "../types/mod.ts";
import type { HotswapListener } from "../types/mod.ts";

// ============================================================================
// Module State - Registry Data
// ============================================================================

/** Map of module name -> module info (registry state) */
const _modules: Map<string, ModuleInfo> = new Map();

/** Set of hotswap listeners */
const _listeners: Set<HotswapListener> = new Set();

// ============================================================================
// State Access Functions
// ============================================================================

export const getModulesMap = (): Map<string, ModuleInfo> => _modules;
export const getListenersSet = (): Set<HotswapListener> => _listeners;
