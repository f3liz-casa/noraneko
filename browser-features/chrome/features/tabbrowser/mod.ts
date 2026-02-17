// SPDX-License-Identifier: MPL-2.0

/**
 * Tabbrowser Feature Module
 *
 * Re-implementation of the core browser tabs system using Data-Oriented Programming.
 *
 * Structure:
 * - types/:  Immutable data schemas (The "Data")
 * - state/:  Reactive storage (The "Database")
 * - ops/:    Pure business logic (The "Behavior")
 * - ui/:     SolidJS components (The "View" - To Be Implemented)
 */

// Export Types
export * from "./types/TabState.ts";

// Export State Accessors
export {
  appState,
  selectedTab,
  orderedTabs,
  allGroups,
  setSelectedTab,
  updateConfig,
} from "./state/store.ts";

// Export Operations
export * as TabOps from "./ops/tab-ops.ts";
export * as GroupOps from "./ops/group-ops.ts";

// Export UI Components
export { Tab } from "./ui/Tab.tsx";
export { TabStrip } from "./ui/TabStrip.tsx";

// Export Bridge
export { initCompat } from "./bridge/TabbrowserCompat.ts";
