// SPDX-License-Identifier: MPL-2.0
// Preference names and default values

import type { Config, Panels } from "../types/mod.ts";

// ============================================================================
// Preference Names
// ============================================================================

export const PREF_NAMES = {
  data: "floorp.panelSidebar.data",
  config: "floorp.panelSidebar.config",
  enabled: "floorp.panelSidebar.enabled",
} as const;

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_ENABLED = true;

export const DEFAULT_CONFIG: Config = {
  globalWidth: 400,
  autoUnload: false,
  position_start: true,
  displayed: true,
  webExtensionRunningEnabled: false,
};

export const DEFAULT_PANELS: Panels = [
  {
    id: "default-panel-bookmarks",
    url: "floorp//bookmarks",
    width: 0,
    type: "static",
  },
  {
    id: "default-panel-history",
    url: "floorp//history",
    width: 0,
    type: "static",
  },
  {
    id: "default-panel-downloads",
    url: "floorp//downloads",
    width: 0,
    type: "static",
  },
  {
    id: "default-panel-notes",
    url: "floorp//notes",
    width: 0,
    type: "static",
  },
  {
    id: "default-panel-translate-google-com",
    url: "https://translate.google.com",
    width: 0,
    userContextId: null,
    zoomLevel: null,
    type: "web",
  },
  {
    id: "default-panel-docs-floorp-app",
    url: "https://docs.floorp.app/docs/features/",
    width: 0,
    userContextId: null,
    zoomLevel: null,
    type: "web",
  },
];

// ============================================================================
// Serialized Defaults (for pref defaults)
// ============================================================================

export const DEFAULT_CONFIG_JSON = JSON.stringify(DEFAULT_CONFIG);
export const DEFAULT_DATA_JSON = JSON.stringify({ data: DEFAULT_PANELS });
