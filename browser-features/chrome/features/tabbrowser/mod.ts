// SPDX-License-Identifier: MPL-2.0

/**
 * Tabbrowser Feature Module
 *
 * Re-implementation of the core browser tabs system using Data-Oriented Programming.
 *
 * Structure:
 * - types/:        Immutable data schemas (The "Data")
 * - state/:        Reactive storage (The "Database")
 * - ops/:          Pure business logic (The "Behavior")
 * - ui/:           Preact components (The "View")
 * - gecko-compat/: Bridges the DOP model to the real Gecko gBrowser/DOM
 */

// Export Types
export * from "./types/TabState.ts";

// Export State Accessors
export {
  appState,
  selectedTab,
  orderedTabs,
  allGroups,
  send,
} from "./state/store.ts";

// Export Operations
export * as TabOps from "./ops/tab-ops.ts";
export * as GroupOps from "./ops/group-ops.ts";

// Export UI Components
export { Tab } from "./ui/Tab.tsx";
export { TabStrip } from "./ui/TabStrip.tsx";

// Export gecko-compat layer
export { initCompat } from "./gecko-compat/TabbrowserCompat.ts";
import { initCompat as _initCompat } from "./gecko-compat/TabbrowserCompat.ts";

// ============================================================================
// Module lifecycle hook — called by loader/lifecycle.ts before SessionStore.
// At this point gBrowser already exists (created in onDOMContentLoaded).
// initCompat overrides window.gBrowser with TabbrowserCompat via
// Object.defineProperty, replacing the API layer while keeping the existing
// DOM structure in place.
// ============================================================================
export function initBeforeSessionStoreInit() {
  // Skip if the before-tabbrowser category hook already installed our compat.
  if ((window as any).__noranekoTabbrowserInstalled) return;
  _initCompat(window as any);
  (window as any).__noranekoTabbrowserInstalled = true;
}
