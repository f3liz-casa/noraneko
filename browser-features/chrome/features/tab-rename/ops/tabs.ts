// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Rename Operations
 *
 * Pure operations for tab ID generation and name management.
 */

import type { TabRenameData, TabRenameMap } from "../types/mod.ts";

// ============================================================================
// Tab ID Operations
// ============================================================================

/**
 * Gets or generates a unique ID for a tab
 */
export function getTabId(tab: XULElement): string {
  const linkedPanel = (tab as any).linkedPanel;
  if (!linkedPanel) {
    (tab as any).linkedPanel =
      `panel-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
  return (tab as any).linkedPanel;
}

// ============================================================================
// Name Operations
// ============================================================================

/**
 * Sets or removes a tab name in the map
 */
export function setTabNameInMap(
  map: TabRenameMap,
  tabId: string,
  customName: string,
  originalTitle: string,
): TabRenameMap {
  const newMap = new Map(map);

  if (customName.trim() === "") {
    newMap.delete(tabId);
  } else {
    newMap.set(tabId, { tabId, customName, originalTitle });
  }

  return newMap;
}

/**
 * Gets a custom tab name from the map
 */
export function getTabNameFromMap(
  map: TabRenameMap,
  tabId: string,
): string | undefined {
  return map.get(tabId)?.customName;
}

/**
 * Gets the original title from the map
 */
export function getOriginalTitleFromMap(
  map: TabRenameMap,
  tabId: string,
): string | undefined {
  return map.get(tabId)?.originalTitle;
}

/**
 * Removes a tab name from the map
 */
export function clearTabNameInMap(
  map: TabRenameMap,
  tabId: string,
): TabRenameMap {
  const newMap = new Map(map);
  newMap.delete(tabId);
  return newMap;
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serializes the tab rename map to JSON
 */
export function serializeTabRenameMap(map: TabRenameMap): string {
  const obj = Object.fromEntries(map);
  return JSON.stringify(obj);
}

/**
 * Deserializes JSON to a tab rename map
 */
export function deserializeTabRenameMap(data: string): TabRenameMap {
  try {
    const parsed = JSON.parse(data);
    const map = new Map<string, TabRenameData>();
    for (const [key, value] of Object.entries(parsed)) {
      map.set(key, value as TabRenameData);
    }
    return map;
  } catch (error) {
    console.error("[tab-rename] Failed to deserialize:", error);
    return new Map();
  }
}
