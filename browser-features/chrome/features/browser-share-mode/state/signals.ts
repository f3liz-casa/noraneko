// SPDX-License-Identifier: MPL-2.0

/**
 * Share Mode State
 *
 * Reactive state for browser share mode toggle.
 */

import { signal } from "@preact/signals";

// ============================================================================
// Signals
// ============================================================================

export const shareModeEnabled = signal<boolean>(false);

// ============================================================================
// Actions
// ============================================================================

export function toggleShareMode(): void {
  shareModeEnabled.value = !shareModeEnabled.value;
}

export function setShareMode(enabled: boolean): void {
  shareModeEnabled.value = enabled;
}
