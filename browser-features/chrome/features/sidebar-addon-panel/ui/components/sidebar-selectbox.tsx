/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { panels as panelSidebarData } from "../../../sidebar/state/mod.ts";
import { PanelSidebarButton } from "./sidebar-panel-button.tsx";
import { showPanelSidebarAddModal } from "./panel-sidebar-modal.tsx";
import type { CPanelSidebar } from "./panel-sidebar.tsx";

export function SidebarSelectbox(props: { ctx: CPanelSidebar }) {
  const panels = panelSidebarData();

  return (
    <xul:vbox
      id="panel-sidebar-select-box"
      class="webpanel-box chromeclass-extrachrome chromeclass-directories instant customization-target"
    >
      {panels.map((panel) => (
        <PanelSidebarButton key={panel.id} panel={panel} ctx={props.ctx} />
      ))}
      <xul:toolbarbutton
        id="panel-sidebar-add"
        class="panel-sidebar-panel"
        onCommand={() => {
          showPanelSidebarAddModal();
        }}
      />
      <xul:spacer flex="1" />
      <xul:vbox id="panel-sidebar-bottomButtonBox">
        <xul:toolbarbutton
          class="panel-sidebar-panel"
          data-l10n-id="sidebar-addons-button"
          onCommand={() =>
            (window as any).BrowserAddonUI.openAddonsMgr(
              "addons://list/extension",
            )
          }
          id="panel-sidebar-addons-icon"
        />
        <xul:toolbarbutton
          class="panel-sidebar-panel"
          data-l10n-id="sidebar-passwords-button"
          onCommand={() =>
            (window as any).LoginHelper.openPasswordManager(window, {
              entryPoint: "mainmenu",
            })
          }
          id="panel-sidebar-passwords-icon"
        />
        <xul:toolbarbutton
          class="panel-sidebar-panel"
          data-l10n-id="sidebar-preferences-button"
          onCommand={() => (window as any).openPreferences()}
          id="panel-sidebar-preferences-icon"
        />
      </xul:vbox>
    </xul:vbox>
  );
}
