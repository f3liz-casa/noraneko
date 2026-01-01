// SPDX-License-Identifier: MPL-2.0

/**
 * Module Definition - Data-Oriented Programming Style
 * 
 * Julia/Kotlin-like patterns:
 * - Plain data structures for module definitions
 * - Pure functions for lifecycle management
 * - No decorators, no class inheritance magic
 */

import { ViteHotContext } from "vite/types/hot";
import { kebabCase } from "es-toolkit/string";
import { createRootHMR } from "@nora/solid-xul";
import { onCleanup } from "solid-js";
import { createDependencyEventDispatchers } from "#bridge-loader-features/loader/modules-hooks.ts";

// ============================================================================
// Types - Module Definition
// ============================================================================

/** Module configuration */
export interface ModuleConfig {
  name: string;
  dependencies?: string[];
  softDependencies?: string[];
  hot?: ViteHotContext;
}

/** Module metadata (exported for loader) */
export interface ModuleMetadata {
  moduleName: string;
  dependencies: string[];
  softDependencies: string[];
}

/** Module state passed to lifecycle functions */
export interface ModuleContext {
  /** Logger with module prefix */
  log: ConsoleInstance;
  /** Event dispatchers for dependencies */
  events: Record<string, any>;
  /** Module name */
  name: string;
}

/** Module lifecycle functions */
export interface ModuleLifecycle {
  /** Called when module is initialized */
  init?: (ctx: ModuleContext) => void | Promise<void>;
  /** Called before SessionStore is initialized */
  initBeforeSessionStoreInit?: (ctx: ModuleContext) => void | Promise<void>;
  /** Called when module is being cleaned up (required for hotswap) */
  cleanup: (ctx: ModuleContext) => void | Promise<void>;
  /** Event methods exposed to other modules */
  eventMethods?: (ctx: ModuleContext) => Record<string, (...args: any[]) => any>;
}

// ============================================================================
// Module State - Data
// ============================================================================

/** Active module contexts for cleanup */
const _moduleContexts: Map<string, ModuleContext> = new Map();

/** Module disposers for HMR */
const _moduleDisposers: Map<string, () => void> = new Map();

/** Hot contexts for HMR */
const _hotContexts: Map<string, ViteHotContext | undefined> = new Map();

// ============================================================================
// Public API - Module Definition Functions
// ============================================================================

/**
 * Define a module with DOP-style lifecycle functions
 * 
 * @example
 * ```typescript
 * // sidebar/index.ts
 * import { defineModule } from "#features-chrome/utils/base.ts";
 * 
 * const state = {
 *   icons: new Map<string, SidebarIcon>(),
 *   dockBarElement: null as Element | null,
 * };
 * 
 * export default defineModule({
 *   name: "sidebar",
 *   hot: import.meta.hot,
 * }, {
 *   init(ctx) {
 *     ctx.log.debug("Sidebar initializing...");
 *     renderDockBar(state);
 *   },
 *   
 *   cleanup(ctx) {
 *     state.icons.clear();
 *     state.dockBarElement?.remove();
 *   },
 *   
 *   eventMethods(ctx) {
 *     return {
 *       registerIcon: (icon) => state.icons.set(icon.name, icon),
 *       getIcons: () => Array.from(state.icons.values()),
 *     };
 *   },
 * });
 * ```
 */
export function defineModule(
  config: ModuleConfig,
  lifecycle: ModuleLifecycle,
) {
  const allDeps = [...(config.dependencies ?? []), ...(config.softDependencies ?? [])];
  
  // Create the module object that will be instantiated by the loader
  return class {
    private ctx: ModuleContext;
    
    constructor() {
      // Create context
      this.ctx = {
        log: console.createInstance({ prefix: `nora@${kebabCase(config.name)}` }),
        events: createDependencyEventDispatchers(allDeps),
        name: config.name,
      };
      
      // Store for cleanup
      _moduleContexts.set(config.name, this.ctx);
      _hotContexts.set(config.name, config.hot);
      
      // Set up HMR root
      createRootHMR((disposer) => {
        _moduleDisposers.set(config.name, disposer);
        
        // Call init
        if (lifecycle.init) {
          lifecycle.init(this.ctx);
        }
        
        // Register cleanup on HMR dispose
        onCleanup(() => {
          _hotContexts.delete(config.name);
          _moduleContexts.delete(config.name);
          _moduleDisposers.delete(config.name);
        });
      }, config.hot);
    }
    
    /** Metadata for loader */
    static _metadata(): ModuleMetadata {
      return {
        moduleName: config.name,
        dependencies: config.dependencies ?? [],
        softDependencies: config.softDependencies ?? [],
      };
    }
    
    /** Cleanup function for hotswap */
    cleanup(): void | Promise<void> {
      return lifecycle.cleanup(this.ctx);
    }
    
    /** Init before session store */
    initBeforeSessionStoreInit(): void | Promise<void> {
      if (lifecycle.initBeforeSessionStoreInit) {
        return lifecycle.initBeforeSessionStoreInit(this.ctx);
      }
    }
    
    /** Event methods for other modules */
    eventMethods(): Record<string, (...args: any[]) => any> {
      if (lifecycle.eventMethods) {
        return lifecycle.eventMethods(this.ctx);
      }
      return {};
    }
  };
}

// ============================================================================
// Public API - Module Utilities
// ============================================================================

/**
 * Get a module's context (for testing/debugging)
 */
export function getModuleContext(moduleName: string): ModuleContext | undefined {
  return _moduleContexts.get(moduleName);
}

/**
 * Run cleanup on all modules
 */
export async function cleanupAllModules(): Promise<void> {
  console.log("[noraneko] Running cleanup on all modules...");
  
  // Dispose all HMR roots
  for (const [moduleName, disposer] of _moduleDisposers) {
    try {
      console.debug(`[noraneko] Disposing root for module: ${moduleName}`);
      disposer();
    } catch (e) {
      console.error(`[noraneko] Error disposing root for ${moduleName}:`, e);
    }
  }
  
  // Clear state
  _moduleContexts.clear();
  _moduleDisposers.clear();
  
  console.log("[noraneko] All modules cleaned up");
}

/**
 * Run cleanup on a specific module
 */
export async function cleanupModule(moduleName: string): Promise<void> {
  // Dispose HMR root
  const disposer = _moduleDisposers.get(moduleName);
  if (disposer) {
    try {
      disposer();
    } catch (e) {
      console.error(`[noraneko] Error disposing root for ${moduleName}:`, e);
    }
  }
  
  // Clear from state
  _moduleContexts.delete(moduleName);
  _moduleDisposers.delete(moduleName);
  _hotContexts.delete(moduleName);
}

/**
 * Check if a module has cleanup
 */
export function hasCleanup(moduleName: string): boolean {
  return _moduleContexts.has(moduleName);
}

