// SPDX-License-Identifier: MPL-2.0

import { ViteHotContext } from "vite/types/hot";
import { kebabCase } from "es-toolkit/string";
import { createRootHMR } from "@nora/solid-xul";
import { onCleanup } from "solid-js";
import { createDependencyEventDispatchers } from "#bridge-loader-features/loader/modules-hooks.ts";

const _hotContexts = new Map<string, ViteHotContext | undefined>();
const _metadata = new Map<string, ComponentMetadata>();
const _eventMethods = new Map<string, Set<string | symbol>>();
const _moduleInstances = new Map<string, any>();
const _moduleCleanupFns = new Map<string, () => void | Promise<void>>();
const _rootDisposers = new Map<string, () => void>();

interface ComponentMetadata {
  moduleName: string;
  dependencies: string[];
  softDependencies: string[];
}

/**
 * Interface that all components must implement for hotswapping support
 */
export interface HotswappableComponent {
  /**
   * Initialize the component. Called when the component is first loaded.
   */
  init?(): void | Promise<void>;
  
  /**
   * Cleanup the component. Called before the component is unloaded during hotswap.
   * This method MUST clean up all resources:
   * - Remove event listeners
   * - Clear intervals/timeouts
   * - Remove DOM elements
   * - Unregister from any registries
   */
  cleanup(): void | Promise<void>;
}

/**
 * Get all registered module instances
 */
export function getModuleInstances(): Map<string, any> {
  return new Map(_moduleInstances);
}

/**
 * Get a specific module instance by name
 */
export function getModuleInstance(moduleName: string): any | undefined {
  return _moduleInstances.get(moduleName);
}

/**
 * Run cleanup on all modules and clear registries
 * This is used during hotswapping to safely unload all modules
 */
export async function cleanupAllModules(): Promise<void> {
  console.log("[noraneko] Running cleanup on all modules...");
  
  const cleanupPromises: Promise<void>[] = [];
  
  for (const [moduleName, instance] of _moduleInstances) {
    try {
      if (instance && typeof instance.cleanup === "function") {
        console.debug(`[noraneko] Cleaning up module: ${moduleName}`);
        const result = instance.cleanup();
        if (result instanceof Promise) {
          cleanupPromises.push(result.catch((e) => {
            console.error(`[noraneko] Error during cleanup of ${moduleName}:`, e);
          }));
        }
      }
    } catch (e) {
      console.error(`[noraneko] Error during cleanup of ${moduleName}:`, e);
    }
  }
  
  // Wait for all cleanup promises to resolve
  await Promise.all(cleanupPromises);
  
  // Dispose all root contexts
  for (const [moduleName, disposer] of _rootDisposers) {
    try {
      console.debug(`[noraneko] Disposing root for module: ${moduleName}`);
      disposer();
    } catch (e) {
      console.error(`[noraneko] Error disposing root for ${moduleName}:`, e);
    }
  }
  
  // Clear all registries
  _moduleInstances.clear();
  _moduleCleanupFns.clear();
  _rootDisposers.clear();
  
  console.log("[noraneko] All modules cleaned up");
}

/**
 * Run cleanup on a specific module
 */
export async function cleanupModule(moduleName: string): Promise<void> {
  const instance = _moduleInstances.get(moduleName);
  
  if (instance && typeof instance.cleanup === "function") {
    console.debug(`[noraneko] Cleaning up module: ${moduleName}`);
    try {
      await instance.cleanup();
    } catch (e) {
      console.error(`[noraneko] Error during cleanup of ${moduleName}:`, e);
    }
  }
  
  // Dispose root context if exists
  const disposer = _rootDisposers.get(moduleName);
  if (disposer) {
    try {
      disposer();
    } catch (e) {
      console.error(`[noraneko] Error disposing root for ${moduleName}:`, e);
    }
  }
  
  _moduleInstances.delete(moduleName);
  _moduleCleanupFns.delete(moduleName);
  _rootDisposers.delete(moduleName);
}

/**
 * Check if a module has a cleanup function
 */
export function hasCleanup(moduleName: string): boolean {
  const instance = _moduleInstances.get(moduleName);
  return instance && typeof instance.cleanup === "function";
}

/**
 * Mark method as event-exposed for EventDispatcher
 */
export function eventMethod(_: Function, context: ClassMethodDecoratorContext) {
  context.addInitializer(function () {
    const className = context.static ? this.name : this.constructor.name;

    if (!className) {
      console.error(
        "EventMethod: Could not determine class name for decorator on method:",
        context.name,
      );
      return;
    }
    console.log(className);

    if (!_eventMethods.has(className)) _eventMethods.set(className, new Set());
    _eventMethods.get(className)!.add(context.name);
  });
}

/**
 * Define component with auto-injection
 * 
 * IMPORTANT: Components MUST implement a `cleanup()` method for hotswapping support.
 * The cleanup method should:
 * - Remove all event listeners
 * - Clear all intervals/timeouts
 * - Remove any DOM elements created by the component
 * - Unregister from any external registries
 * 
 * @example
 * ```typescript
 * @component({
 *   moduleName: "my-feature",
 *   hot: import.meta.hot,
 * })
 * export default class MyFeature implements HotswappableComponent {
 *   private intervalId: number | null = null;
 *   
 *   init() {
 *     this.intervalId = setInterval(() => {}, 1000);
 *   }
 *   
 *   cleanup() {
 *     if (this.intervalId) {
 *       clearInterval(this.intervalId);
 *       this.intervalId = null;
 *     }
 *   }
 * }
 * ```
 */
export function component(config: {
  moduleName: string;
  dependencies?: string[];
  softDependencies?: string[];
  hot?: ViteHotContext;
}) {
  return <T extends { new (...args: any[]): {} }>(
    target: T,
    context: ClassDecoratorContext,
  ) => {
    const name = context.name as string;
    if (_hotContexts.has(name)) throw new Error(`Duplicate component: ${name}`);

    _hotContexts.set(name, config.hot);
    _metadata.set(name, {
      moduleName: config.moduleName,
      dependencies: config.dependencies || [],
      softDependencies: config.softDependencies || [],
    });

    // Validate that target has cleanup method at class level
    const proto = target.prototype;
    if (typeof proto.cleanup !== "function") {
      console.warn(
        `[noraneko] Component "${config.moduleName}" does not implement cleanup() method. ` +
        `This is required for hotswapping support. Add a cleanup() method to the class.`
      );
    }

    return class extends target {
      protected logger = console.createInstance({
        prefix: `nora@${kebabCase(name)}`,
      });
      protected events = createDependencyEventDispatchers([
        ..._metadata.get(name)!.dependencies,
        ..._metadata.get(name)!.softDependencies,
      ]);

      constructor(...args: any[]) {
        super(...args);
        console.log("construct on decorator");
        
        // Register this instance for hotswapping
        _moduleInstances.set(config.moduleName, this);
        
        createRootHMR((disposer) => {
          // Store the disposer for manual cleanup during hotswap
          _rootDisposers.set(config.moduleName, disposer);
          
          if ("init" in this && typeof this.init === "function") this.init();
          
          onCleanup(() => {
            _hotContexts.delete(name);
            _moduleInstances.delete(config.moduleName);
            _rootDisposers.delete(config.moduleName);
          });
        }, _hotContexts.get(name));
      }

      static _metadata() {
        return _metadata.get(name)!;
      }

      eventMethods() {
        const methods = _eventMethods.get(name);
        if (!methods) return {};
        return Object.fromEntries(
          Array.from(methods).map((m) => [m, (this as any)[m].bind(this)]),
        );
      }
      
      /**
       * Default cleanup implementation if not provided by the class.
       * Override this method in your component class to provide proper cleanup.
       */
      cleanup(): void | Promise<void> {
        // Check if parent class has cleanup
        const parentCleanup = Object.getPrototypeOf(Object.getPrototypeOf(this))?.cleanup;
        if (typeof parentCleanup === "function" && parentCleanup !== this.cleanup) {
          return parentCleanup.call(this);
        }
        // Default: log warning that cleanup is not implemented
        console.warn(
          `[noraneko] Component "${config.moduleName}" cleanup() called but not implemented. ` +
          `Override cleanup() in your component class for proper resource cleanup.`
        );
      }
    } as T;
  };
}
