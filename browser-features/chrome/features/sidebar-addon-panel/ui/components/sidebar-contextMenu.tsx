/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { CPanelSidebar } from "./panel-sidebar.tsx";
import { signal } from "@preact/signals";
import type { Panel } from "../../../sidebar/types/mod.ts";
import { ContextMenuUtils } from "#features-chrome/utils/context-menu.tsx";
import i18next from "i18next";

const tr = (k: string) => (i18next as any).t(k);

export const contextPanel = signal<Panel | null>(null);
// Helper to match previous API
export const setContextPanel = (p: Panel | null) => {
  contextPanel.value = p;
};

export class SidebarContextMenuElem {
  ctx: CPanelSidebar;
  constructor(ctx: CPanelSidebar) {
    this.ctx = ctx;
    ContextMenuUtils.addToolbarContentMenuPopupSet(() =>
      this.sidebarContextMenu(),
    );
  }

  public contextPanelId: string | null = null;

  private getPanelByOriginalTarget(target: Element | null) {
    if (!target) {
      return;
    }

    let currentElement: Element | null = target;
    let panelId: string | undefined;

    for (let i = 0; i < 10 && currentElement && !panelId; i++) {
      panelId = currentElement.getAttribute("data-panel-id") || undefined;

      if (!panelId && currentElement.parentElement) {
        currentElement = currentElement.parentElement;
      }
    }

    if (!panelId) {
      return;
    }

    const gPanelSidebar = this.ctx;
    return gPanelSidebar.getPanelData(panelId);
  }

  private handlePopupShowing(e: Event) {
    if (!(e as any).explicitOriginalTarget) {
      return;
    }

    const panel = this.getPanelByOriginalTarget(
      (e as any).explicitOriginalTarget as Element,
    );

    if (!panel) {
      return;
    }

    setContextPanel(panel);
  }

  private handlePopupHiding() {
    setTimeout(() => {
      setContextPanel(null);
    }, 0);
  }

  private safeExecuteCommand(callback: () => void) {
    try {
      callback();
    } catch (error) {
      console.error("Command execution error:", error);
    } finally {
      if (typeof document !== "undefined" && document) {
        const contextMenu = document.getElementById("webpanel-context");
        if (contextMenu) {
          // @ts-ignore - Fix type error
          contextMenu.hidePopup();
        }
      }
    }
  }

  private handleUnloadCommand() {
    const gPanelSidebar = this.ctx;
    const panelId = contextPanel.value?.id;
    if (panelId) {
      this.safeExecuteCommand(() => {
        gPanelSidebar.unloadPanel(panelId);
      });
    }
  }

  private handleDeleteCommand() {
    const gPanelSidebar = this.ctx;
    const panelId = contextPanel.value?.id;
    if (panelId) {
      this.safeExecuteCommand(() => {
        gPanelSidebar.deletePanel(panelId);
      });
    }
  }

  private handleMuteCommand() {
    const gPanelSidebar = this.ctx;
    const panelId = contextPanel.value?.id;
    if (panelId) {
      this.safeExecuteCommand(() => {
        gPanelSidebar.mutePanel(panelId);
      });
    }
  }

  private handleChangeZoomLevelCommand(type: "in" | "out" | "reset") {
    const gPanelSidebar = this.ctx;
    const panelId = contextPanel.value?.id;
    if (panelId) {
      this.safeExecuteCommand(() => {
        gPanelSidebar.changeZoomLevel(panelId, type);
      });
    }
  }

  private handleChangeUserAgentCommand() {
    const gPanelSidebar = this.ctx;
    const panelId = contextPanel.value?.id;
    if (panelId) {
      this.safeExecuteCommand(() => {
        gPanelSidebar.changeUserAgent(panelId);
      });
    }
  }

  private sidebarContextMenu() {
    const isWeb = contextPanel.value?.type === "web";

    return (
      <xul:popupset>
        <xul:menupopup
          id="webpanel-context"
          onpopupshowing={(e: any) => this.handlePopupShowing(e)}
          // onpopuphiding={() => this.handlePopupHiding()}
        >
          <xul:menuitem
            id="unloadWebpanelMenu"
            class="needLoadedWebpanel"
            label={tr("panelSidebar.contextMenu.unload")}
            accesskey="U"
            oncommand={() => this.handleUnloadCommand()}
          />
          {isWeb && (
            <>
              <xul:menuseparator class="context-webpanel-separator" />
              <xul:menuitem
                id="muteMenu"
                class="needLoadedWebpanel"
                label={tr("panelSidebar.contextMenu.mute")}
                accesskey="M"
                oncommand={() => this.handleMuteCommand()}
              />
              <xul:menu
                id="changeZoomLevelMenu"
                class="needLoadedWebpanel needRunningExtensionsPanel"
                label={tr("panelSidebar.contextMenu.changeZoom")}
                accesskey="Z"
              >
                <xul:menupopup id="changeZoomLevelPopup">
                  <xul:menuitem
                    id="zoomInMenu"
                    label={tr("panelSidebar.contextMenu.zoomIn")}
                    accesskey="I"
                    oncommand={() => this.handleChangeZoomLevelCommand("in")}
                  />
                  <xul:menuitem
                    id="zoomOutMenu"
                    label={tr("panelSidebar.contextMenu.zoomOut")}
                    accesskey="O"
                    oncommand={() => this.handleChangeZoomLevelCommand("out")}
                  />
                  <xul:menuitem
                    id="resetZoomMenu"
                    label={tr("panelSidebar.contextMenu.resetZoom")}
                    accesskey="R"
                    oncommand={() => this.handleChangeZoomLevelCommand("reset")}
                  />
                </xul:menupopup>
              </xul:menu>
              <xul:menuitem
                id="changeUAWebpanelMenu"
                label={tr("panelSidebar.contextMenu.changeUA")}
                accesskey="R"
                oncommand={() => this.handleChangeUserAgentCommand()}
              />
            </>
          )}
          <xul:menuseparator class="context-webpanel-separator" />
          <xul:menuitem
            id="deleteWebpanelMenu"
            label={tr("panelSidebar.contextMenu.delete")}
            accesskey="D"
            oncommand={() => this.handleDeleteCommand()}
          />
        </xul:menupopup>
      </xul:popupset>
    );
  }
}
