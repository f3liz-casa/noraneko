// SPDX-License-Identifier: MPL-2.0

import { h } from "preact";
import { showStatusBar, toggleStatusBar } from "../../state/mod.ts";

/**
 * ContextMenuItem Component
 *
 * Menu item for toggling statusbar visibility in toolbar context menu.
 */
export function ContextMenuItem() {
  return (
    <xul:menuitem
      data-l10n-id="status-bar"
      label="Status Bar"
      type="checkbox"
      id="toggle_statusBar"
      toolbarId="nora-statusbar"
      checked={showStatusBar.value}
      onCommand={toggleStatusBar}
    />
  );
}
