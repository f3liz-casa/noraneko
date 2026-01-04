// SPDX-License-Identifier: MPL-2.0
// Core framework module

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
} from "./Module.ts";
