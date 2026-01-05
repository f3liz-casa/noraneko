// SPDX-License-Identifier: MPL-2.0
// Backward compatibility - re-exports from new lib/core location

export {
  defineModule,
  getModuleContext,
  cleanupAllModules,
  cleanupModule,
  hasCleanup,
  type ModuleConfig,
  type ModuleMetadata,
  type ModuleContext,
  type ModuleLifecycle,
} from "../lib/core/mod.ts";

// Legacy exports (these were in original base.ts but are now deprecated)
// TODO: migrate consumers to use @lib/core directly

/**
 * @deprecated Use `defineModule` from `@lib/core` instead
 */
export function noraComponent<T extends abstract new (...args: any) => any>(
  _target: T,
): T {
  console.warn(
    "noraComponent decorator is deprecated. Use defineModule from @lib/core instead.",
  );
  return _target;
}

/**
 * @deprecated Use `defineModule` from `@lib/core` instead
 */
export abstract class NoraComponentBase {
  constructor() {
    console.warn(
      "NoraComponentBase is deprecated. Use defineModule from @lib/core instead.",
    );
  }
}
