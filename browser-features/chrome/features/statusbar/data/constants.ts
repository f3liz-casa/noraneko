// SPDX-License-Identifier: MPL-2.0

/**
 * Statusbar Data
 *
 * Constants and default values for the statusbar feature.
 */

// ============================================================================
// Preference Names
// ============================================================================

export const PREF_STATUSBAR_ENABLE = "noraneko.statusbar.enable";

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_STATUSBAR_ENABLED = false;

// ============================================================================
// CustomizableUI Configuration
// ============================================================================

export const STATUSBAR_AREA_ID = "nora-statusbar";

export const STATUSBAR_AREA_CONFIG = {
  type: "TYPE_TOOLBAR",
  defaultPlacements: ["screenshot-button", "fullscreen-button"],
} as const;

export const DEFAULT_STATUSBAR_WIDGETS = [
  { id: "zoom-controls", position: 1 },
] as const;
