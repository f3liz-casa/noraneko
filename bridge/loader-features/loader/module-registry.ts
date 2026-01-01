// SPDX-License-Identifier: MPL-2.0

/**
 * Module Registry
 * 
 * Manages the lifecycle of browser-features/chrome modules for hotswapping support.
 * This registry tracks loaded modules and provides methods to:
 * - Register module instances
 * - Run cleanup on modules before hotswapping
 * - Reload modules from hotfix directories
 */

import { unregisterModuleEventDispatcher } from "./event-dispatcher-registry.ts";

interface ModuleInfo {
  name: string;
  instance: any;
  metadata: {
    moduleName: string;
    dependencies: string[];
    softDependencies: string[];
  };
  loadedAt: number;
  isHotfixModule: boolean;
  hotfixId?: string;
}

class ModuleRegistry {
  private static _instance: ModuleRegistry | null = null;
  private modules: Map<string, ModuleInfo> = new Map();
  private hotswapListeners: Set<(event: HotswapEvent) => void> = new Set();

  private constructor() {}

  static getInstance(): ModuleRegistry {
    if (!ModuleRegistry._instance) {
      ModuleRegistry._instance = new ModuleRegistry();
    }
    return ModuleRegistry._instance;
  }

  /**
   * Register a loaded module
   */
  registerModule(
    name: string,
    instance: any,
    metadata: ModuleInfo["metadata"],
    isHotfixModule: boolean = false,
    hotfixId?: string
  ): void {
    this.modules.set(name, {
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
  getModule(name: string): ModuleInfo | undefined {
    return this.modules.get(name);
  }

  /**
   * Get all registered modules
   */
  getAllModules(): Map<string, ModuleInfo> {
    return new Map(this.modules);
  }

  /**
   * Check if a module is registered
   */
  hasModule(name: string): boolean {
    return this.modules.has(name);
  }

  /**
   * Run cleanup on a specific module
   */
  async cleanupModule(name: string): Promise<boolean> {
    const moduleInfo = this.modules.get(name);
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
      this.notifyListeners({
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
  async cleanupAllModules(): Promise<void> {
    console.log("[ModuleRegistry] Running cleanup on all modules...");

    // Sort modules by dependencies (reverse order - dependents first)
    const sortedModules = this.getSortedModulesForCleanup();

    for (const moduleName of sortedModules) {
      await this.cleanupModule(moduleName);
    }

    this.modules.clear();
    console.log("[ModuleRegistry] All modules cleaned up");
  }

  /**
   * Unregister a module (after cleanup)
   */
  unregisterModule(name: string): void {
    this.modules.delete(name);
    console.debug(`[ModuleRegistry] Unregistered module: ${name}`);
  }

  /**
   * Get modules sorted for cleanup (dependents first)
   */
  private getSortedModulesForCleanup(): string[] {
    const sorted: string[] = [];
    const processed = new Set<string>();
    const moduleNames = Array.from(this.modules.keys());

    // Build dependency graph (reverse - who depends on who)
    const dependedBy: Map<string, Set<string>> = new Map();
    for (const [name, info] of this.modules) {
      for (const dep of [...info.metadata.dependencies, ...info.metadata.softDependencies]) {
        if (!dependedBy.has(dep)) {
          dependedBy.set(dep, new Set());
        }
        dependedBy.get(dep)!.add(name);
      }
    }

    // Topological sort (dependents first)
    const visit = (name: string) => {
      if (processed.has(name)) return;

      // First process modules that depend on this one
      const dependents = dependedBy.get(name) || new Set();
      for (const dependent of dependents) {
        if (this.modules.has(dependent)) {
          visit(dependent);
        }
      }

      processed.add(name);
      sorted.push(name);
    };

    for (const name of moduleNames) {
      visit(name);
    }

    return sorted;
  }

  /**
   * Add a listener for hotswap events
   */
  addHotswapListener(listener: (event: HotswapEvent) => void): void {
    this.hotswapListeners.add(listener);
  }

  /**
   * Remove a hotswap listener
   */
  removeHotswapListener(listener: (event: HotswapEvent) => void): void {
    this.hotswapListeners.delete(listener);
  }

  /**
   * Notify all listeners of a hotswap event
   */
  private notifyListeners(event: HotswapEvent): void {
    for (const listener of this.hotswapListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[ModuleRegistry] Error in hotswap listener:", error);
      }
    }
  }

  /**
   * Notify listeners that hotswap is starting
   */
  notifyHotswapStart(): void {
    this.notifyListeners({
      type: "hotswap_start",
      timestamp: Date.now(),
    });
  }

  /**
   * Notify listeners that hotswap is complete
   */
  notifyHotswapComplete(success: boolean): void {
    this.notifyListeners({
      type: "hotswap_complete",
      success,
      timestamp: Date.now(),
    });
  }
}

/**
 * Hotswap event types
 */
export interface HotswapEvent {
  type: "cleanup" | "load" | "hotswap_start" | "hotswap_complete";
  moduleName?: string;
  success?: boolean;
  timestamp: number;
}

// Export singleton instance
export const moduleRegistry = ModuleRegistry.getInstance();

// Export helper functions
export function registerModule(
  name: string,
  instance: any,
  metadata: ModuleInfo["metadata"],
  isHotfixModule: boolean = false,
  hotfixId?: string
): void {
  moduleRegistry.registerModule(name, instance, metadata, isHotfixModule, hotfixId);
}

export function getModule(name: string): ModuleInfo | undefined {
  return moduleRegistry.getModule(name);
}

export function hasModule(name: string): boolean {
  return moduleRegistry.hasModule(name);
}

export async function cleanupModule(name: string): Promise<boolean> {
  return moduleRegistry.cleanupModule(name);
}

export async function cleanupAllModules(): Promise<void> {
  return moduleRegistry.cleanupAllModules();
}

export function unregisterModule(name: string): void {
  moduleRegistry.unregisterModule(name);
}
