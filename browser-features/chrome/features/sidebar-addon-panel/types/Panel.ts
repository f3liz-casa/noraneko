// SPDX-License-Identifier: MPL-2.0

/**
 * Panel Types - Type definitions for panel data and migration
 */

/** Old sidebar data structure (for migration) */
export interface OldSidebarData {
  url: string;
  width?: number;
  usercontext?: number;
  zoomLevel?: number;
}

/** Old sidebar format (for migration) */
export interface OldSidebar {
  data: { [key: string]: OldSidebarData };
  index: string[];
}

/** New sidebar item format */
export interface NewSidebarItem {
  id: string;
  type: "extension" | "static" | "web";
  width: number;
  url: string;
  userContextId: number | null;
  zoomLevel: number | null;
}

/** New sidebar data format */
export interface NewSidebar {
  data: NewSidebarItem[];
}

/** Navigation action types */
export type NavAction = "back" | "forward" | "reload" | "home";

/** Zoom action types */
export type ZoomAction = "in" | "out" | "reset";
