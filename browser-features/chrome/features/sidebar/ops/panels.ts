// SPDX-License-Identifier: MPL-2.0
// Pure operations on panels

import type { Panel, Panels } from "../types/mod.ts";

/**
 * Find a panel by ID
 */
export function findById(panels: Panels, id: string): Panel | undefined {
  return panels.find((p) => p.id === id);
}

/**
 * Filter panels by type
 */
export function filterByType(panels: Panels, type: Panel["type"]): Panels {
  return panels.filter((p) => p.type === type);
}

/**
 * Update a single panel in the list
 */
export function updatePanel(panels: Panels, updated: Panel): Panels {
  return panels.map((p) => (p.id === updated.id ? updated : p));
}

/**
 * Remove a panel by ID
 */
export function removeById(panels: Panels, id: string): Panels {
  return panels.filter((p) => p.id !== id);
}

/**
 * Add a new panel to the list
 */
export function addPanel(panels: Panels, panel: Panel): Panels {
  return [...panels, panel];
}

/**
 * Move a panel to a new index
 */
export function movePanel(
  panels: Panels,
  fromIndex: number,
  toIndex: number,
): Panels {
  if (fromIndex === toIndex) return panels;
  if (fromIndex < 0 || fromIndex >= panels.length) return panels;
  if (toIndex < 0 || toIndex >= panels.length) return panels;

  const result = [...panels];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Get the index of a panel by ID
 */
export function indexById(panels: Panels, id: string): number {
  return panels.findIndex((p) => p.id === id);
}
