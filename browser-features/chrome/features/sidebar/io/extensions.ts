// SPDX-License-Identifier: MPL-2.0
// Extension panel I/O operations

import type { Sidebar, MapSidebars } from "../types/mod.ts";

const { WebExtensionPolicy } = Cu.getGlobalForObject(Services);

/**
 * Get all Firefox sidebar extension panels
 */
export function getExtensionPanels(): Sidebar[] {
  const controller = (
    window as unknown as { SidebarController?: { sidebars?: MapSidebars } }
  ).SidebarController;
  if (!controller?.sidebars) return [];

  const panels = Array.from(controller.sidebars) as MapSidebars;
  return panels.filter(([, s]) => Boolean(s.extensionId)).map(([, s]) => s);
}

/**
 * Check if an extension exists
 */
export function extensionExists(extensionId: string): boolean {
  return getExtensionPanels().some(
    (panel) => panel.extensionId === extensionId,
  );
}

/**
 * Get sidebar icon from extension
 */
export function getExtensionIcon(extensionId: string): string | undefined {
  return getExtensionPanels().find((panel) => panel.extensionId === extensionId)
    ?.iconUrl;
}

/**
 * Get sidebar action manifest from extension
 */
export function getExtensionSidebarAction(extensionId: string): unknown {
  const policy = WebExtensionPolicy.getByID(extensionId);
  return policy?.extension.manifest.sidebar_action;
}
