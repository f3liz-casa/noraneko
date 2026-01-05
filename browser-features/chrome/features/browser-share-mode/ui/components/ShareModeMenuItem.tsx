// SPDX-License-Identifier: MPL-2.0

import { h, Fragment } from "preact";
import { shareModeEnabled, toggleShareMode } from "../../state/mod.ts";
import shareModeStyle from "../styles/share-mode.css?inline";

/**
 * ShareModeMenuItem Component
 *
 * A menu item that toggles share mode and conditionally injects styles.
 */
export function ShareModeMenuItem() {
  return (
    <>
      <xul:menuitem
        data-l10n-id="sharemode-menuitem"
        label="Toggle Share Mode"
        type="checkbox"
        id="toggle_sharemode"
        checked={shareModeEnabled.value}
        onCommand={toggleShareMode}
        accesskey="S"
      />

      {shareModeEnabled.value && <style>{shareModeStyle}</style>}
    </>
  );
}
