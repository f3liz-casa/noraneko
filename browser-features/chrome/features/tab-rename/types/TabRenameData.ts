// SPDX-License-Identifier: MPL-2.0

/**
 * Tab Rename Types
 *
 * Type definitions for tab rename data.
 */

// ============================================================================
// Core Types
// ============================================================================

export interface TabRenameData {
  tabId: string;
  customName: string;
  originalTitle: string;
}

export type TabRenameMap = Map<string, TabRenameData>;
