// SPDX-License-Identifier: MPL-2.0

import { h } from "preact";
import { showStatusBar } from "../../state/mod.ts";
import statusbarStyle from "../styles/statusbar.css?inline";

/**
 * StatusBar Component
 *
 * The main statusbar toolbar element.
 */
export function StatusBar() {
  return (
    <>
      <xul:toolbar
        id="nora-statusbar"
        toolbarname="Status bar"
        customizable="true"
        style="border-top: 1px solid var(--chrome-content-separator-color)"
        class={`nora-statusbar browser-toolbar ${
          showStatusBar.value ? "" : "collapsed"
        }`}
        mode="icons"
        context="toolbar-context-menu"
        accesskey="A"
      >
        <xul:hbox
          id="status-text"
          align="center"
          flex="1"
          class="statusbar-padding"
        />
      </xul:toolbar>
      <style class="nora-statusbar">{statusbarStyle}</style>
    </>
  );
}
