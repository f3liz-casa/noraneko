// SPDX-License-Identifier: MPL-2.0

/**
 * Module Registry - Data-Oriented Programming Style
 * 
 * Julia/Kotlin-like functional patterns:
 * - Module-level state (data) + pure functions
 * - No classes, just data and functions
 * 
 * Manages the lifecycle of browser-features/chrome modules for hotswapping support.
 */

import { unregisterModuleEventDispatcher } from "./event-dispatcher-registry.ts";

// ============================================================================
// Types - Data Structures
// ============================================================================

/** Module metadata */
export interface ModuleMetadata {
  moduleName: string;
  dependencies: string[];
  softDependencies: string[];
}

/** Module info stored in registry */
export interface ModuleInfo {
  name: string;
  instance: any;
  metadata: ModuleMetadata;
  loadedAt: number;
  isHotfixModule: boolean;
  hotfixId?: string;
}

/** Hotswap event types */
export interface HotswapEvent {
  type: "cleanup" | "load" | "hotswap_start" | "hotswap_complete";
  moduleName?: string;
  success?: boolean;
  timestamp: number;
}

/** Hotswap listener function type */
export type HotswapListener = (event: HotswapEvent) => void;

// ============================================================================
// Module State - Data (Julia-like module-level state)
// ============================================================================

/** Registry: maps module name -> module info */
const _modules: Map<string, ModuleInfo> = new Map();

/** Hotswap event listeners */
const _listeners: Set<HotswapListener> = new Set();

// ============================================================================
// Internal Functions - Helpers
// ============================================================================

/**
 * Notify all listeners of a hotswap event
 */
const notifyListeners = (event: HotswapEvent): void => {
  for (const listener of _listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[ModuleRegistry] Error in hotswap listener:", error);
    }
  }
};

/**
 * Build reverse dependency graph (who depends on who)
 */
const buildDependedByGraph = (): Map<string, Set<string>> => {
  const dependedBy: Map<string, Set<string>> = new Map();
  
  for (const [name, info] of _modules) {
    const allDeps = [...info.metadata.dependencies, ...info.metadata.softDependencies];
    for (const dep of allDeps) {
      if (!dependedBy.has(dep)) {
        dependedBy.set(dep, new Set());
      }
      dependedBy.get(dep)!.add(name);
    }
  }
  
  return dependedBy;
};

/**
 * Get modules sorted for cleanup (dependents first - topological sort)
 */
const getSortedModulesForCleanup = (): string[] => {
  const sorted: string[] = [];
  const processed = new Set<string>();
  const dependedBy = buildDependedByGraph();

  const visit = (name: string): void => {
    if (processed.has(name)) return;

    // First process modules that depend on this one
    const dependents = dependedBy.get(name) ?? new Set();
    for (const dependent of dependents) {
      if (_modules.has(dependent)) {
        visit(dependent);
      }
    }

    processed.add(name);
    sorted.push(name);
  };

  for (const name of _modules.keys()) {
    visit(name);
  }

  return sorted;
};

// ============================================================================
// Public API - Module Registry Functions
// ============================================================================

/**
 * Register a loaded module
 */
export function registerModule(
  name: string,
  instance: any,
  metadata: ModuleMetadata,
  isHotfixModule: boolean = false,
  hotfixId?: string
): void {
  _modules.set(name, {
    name,
    instance,
    metadata,
    loadedAt: Date.now(),
    isHotfixModule,
    hotfixId,
  });
  console.debug(`[ModuleRegistry] Registered module: ${name}`);
}

/**
 * Get a module's info
 */
export function getModule(name: string): ModuleInfo | undefined {
  return _modules.get(name);
}

/**
 * Get all registered modules (returns a copy)
 */
export function getAllModules(): Map<string, ModuleInfo> {
  return new Map(_modules);
}

/**
 * Check if a module is registered
 */
export function hasModule(name: string): boolean {
  return _modules.has(name);
}

/**
 * Unregister a module (after cleanup)
 */
export function unregisterModule(name: string): void {
  _modules.delete(name);
  console.debug(`[ModuleRegistry] Unregistered module: ${name}`);
}

/**
 * Run cleanup on a specific module
 */
export async function cleanupModule(name: string): Promise<boolean> {
  const moduleInfo = _modules.get(name);
  if (!moduleInfo) {
    console.warn(`[ModuleRegistry] Module ${name} not found for cleanup`);
    return false;
  }

  try {
    // Call the cleanup method if it exists
    if (moduleInfo.instance && typeof moduleInfo.instance.cleanup === "function") {
      console.debug(`[ModuleRegistry] Running cleanup for module: ${name}`);
      await moduleInfo.instance.cleanup();
    }

    // Unregister from EventDispatcher
    unregisterModuleEventDispatcher(name);

    // Notify listeners
    notifyListeners({
      type: "cleanup",
      moduleName: name,
      timestamp: Date.now(),
    });

    return true;
  } catch (error) {
    console.error(`[ModuleRegistry] Error cleaning up module ${name}:`, error);
    return false;
  }
}

/**
 * Run cleanup on all modules
 */
export async function cleanupAllModules(): Promise<void> {
  console.log("[ModuleRegistry] Running cleanup on all modules...");

  // Sort modules by dependencies (reverse order - dependents first)
  const sortedModules = getSortedModulesForCleanup();

  for (const moduleName of sortedModules) {
    await cleanupModule(moduleName);
  }

  _modules.clear();
  console.log("[ModuleRegistry] All modules cleaned up");
}

// ============================================================================
// Public API - Hotswap Listener Functions
// ============================================================================

/**
 * Add a listener for hotswap events
 */
export function addHotswapListener(listener: HotswapListener): void {
  _listeners.add(listener);
}

/**
 * Remove a hotswap listener
 */
export function removeHotswapListener(listener: HotswapListener): void {
  _listeners.delete(listener);
}

/**
 * Notify listeners that hotswap is starting
 */
export function notifyHotswapStart(): void {
  notifyListeners({
    type: "hotswap_start",
    timestamp: Date.now(),
  });
}

/**
 * Notify listeners that hotswap is complete
 */
export function notifyHotswapComplete(success: boolean): void {
  notifyListeners({
    type: "hotswap_complete",
    success,
    timestamp: Date.now(),
  });
}

// ============================================================================
// Backward Compatibility - Legacy API
// ============================================================================

/**
 * Legacy moduleRegistry object for backward compatibility
 * Wraps the pure functions in an object interface
 */
export const moduleRegistry = {
  registerModule,
  getModule,
  getAllModules,
  hasModule,
  cleanupModule,
  cleanupAllModules,
  unregisterModule,
  addHotswapListener,
  removeHotswapListener,
  notifyHotswapStart,
  notifyHotswapComplete,
} as const;
