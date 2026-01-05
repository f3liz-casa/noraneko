// SPDX-License-Identifier: MPL-2.0

/**
 * Navigation Operations - Pure functions for building navigation commands
 *
 * This module contains pure operations that create navigation commands
 * without executing side effects. The actual I/O is performed by io/panel-window.ts.
 */

import type { NavAction, ZoomAction } from "../types/mod.ts";

/** Navigation command descriptor */
export interface NavCommand {
  readonly panelId: string;
  readonly action: NavAction;
}

/** Zoom command descriptor */
export interface ZoomCommand {
  readonly panelId: string;
  readonly action: ZoomAction;
}

/** Create a navigation command (pure) */
export function createNavCommand(
  panelId: string,
  action: NavAction,
): NavCommand {
  return { panelId, action };
}

/** Create a zoom command (pure) */
export function createZoomCommand(
  panelId: string,
  action: ZoomAction,
): ZoomCommand {
  return { panelId, action };
}

/** Check if navigation action is valid */
export function isValidNavAction(action: string): action is NavAction {
  return ["back", "forward", "reload", "home"].includes(action);
}

/** Check if zoom action is valid */
export function isValidZoomAction(action: string): action is ZoomAction {
  return ["in", "out", "reset"].includes(action);
}

/** Build sidebar panel browser ID from panel ID */
export function buildBrowserId(panelId: string): string {
  return `sidebar-panel-${panelId}`;
}
