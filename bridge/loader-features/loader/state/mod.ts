// SPDX-License-Identifier: MPL-2.0

/**
 * State Module - Data-Oriented Programming Style
 *
 * Re-exports all state management functions.
 */

export { getModulesMap, getListenersSet } from "./registry.ts";

export {
  getModuleLoadStatesMap,
  isInitCompleted,
  setInitCompleted,
} from "./hooks.ts";
