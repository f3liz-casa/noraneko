// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Rename State
 *
 * Reactive state for renamed tabs.
 */

import { signal } from "@preact/signals";
import type { TabRenameMap } from "../types/mod.ts";

// ============================================================================
// Signals
// ============================================================================

export const renamedTabs = signal<TabRenameMap>(new Map());

// ============================================================================
// Actions
// ============================================================================

export function setRenamedTabs(map: TabRenameMap): void {
  renamedTabs.value = map;
}

export function updateRenamedTabs(
  updater: (prev: TabRenameMap) => TabRenameMap,
): void {
  renamedTabs.value = updater(renamedTabs.value);
}
