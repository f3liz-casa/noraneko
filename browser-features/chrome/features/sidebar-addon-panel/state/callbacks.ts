// SPDX-License-Identifier: MPL-2.0

/**
 * Callbacks State - Manages callback registrations for the sidebar addon panel
 *
 * This module provides state management for callbacks that other modules
 * can register to be notified of panel data changes and selection changes.
 */

// ============================================================================
// Types
// ============================================================================

/** Logger interface for module context */
interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Module context interface (subset of @lib/core ModuleContext) */
interface ModuleContextLike {
  log: Logger;
}
// ============================================================================

/** Callback for data updates */
export type DataUpdateCallback = (data: unknown) => void;

/** Callback for selection changes */
export type SelectionChangeCallback = (panelId: string) => void;

/** Module state structure */
export interface ModuleState {
  ctx: unknown | null;
  panelSidebarElem: unknown | null;
  sidebarContextMenuElem: unknown | null;
  dataUpdateCallback: DataUpdateCallback | null;
  selectionChangeCallback: SelectionChangeCallback | null;
}

// ============================================================================
// State
// ============================================================================

/**
 * Module-level state
 * This is mutable state that tracks the current module configuration.
 */
export const state: ModuleState = {
  ctx: null,
  panelSidebarElem: null,
  sidebarContextMenuElem: null,
  dataUpdateCallback: null,
  selectionChangeCallback: null,
};

// ============================================================================
// State Operations
// ============================================================================

/**
 * Reset all module state to initial values
 */
export function resetState(): void {
  state.ctx = null;
  state.panelSidebarElem = null;
  state.sidebarContextMenuElem = null;
  state.dataUpdateCallback = null;
  state.selectionChangeCallback = null;
}

/**
 * Set the context reference
 */
export function setContext(ctx: unknown): void {
  state.ctx = ctx;
}

/**
 * Set the panel sidebar element reference
 */
export function setPanelSidebarElem(elem: unknown): void {
  state.panelSidebarElem = elem;
}

/**
 * Set the sidebar context menu element reference
 */
export function setSidebarContextMenuElem(elem: unknown): void {
  state.sidebarContextMenuElem = elem;
}

/**
 * Set the data update callback
 */
export function setDataUpdateCallback(
  callback: DataUpdateCallback | null,
): void {
  state.dataUpdateCallback = callback;
}

/**
 * Set the selection change callback
 */
export function setSelectionChangeCallback(
  callback: SelectionChangeCallback | null,
): void {
  state.selectionChangeCallback = callback;
}

// ============================================================================
// Handler Factories
// ============================================================================

/**
 * Create a panel data update handler bound to context
 */
export function createDataUpdateHandler(
  ctx: ModuleContextLike,
): DataUpdateCallback {
  return (data: unknown) => {
    ctx.log.debug("Received panel data update", data);
    // UI update logic can be added here
  };
}

/**
 * Create a selection change handler bound to context
 */
export function createSelectionChangeHandler(
  ctx: ModuleContextLike,
): SelectionChangeCallback {
  return (panelId: string) => {
    ctx.log.debug("Panel selection changed to", panelId);
    // UI update logic can be added here
  };
}
