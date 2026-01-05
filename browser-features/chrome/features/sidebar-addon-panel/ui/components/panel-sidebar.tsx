/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@nora/preact-xul";
import { ChromeSiteBrowser } from "../browsers/chrome-site-browser.tsx";
import { ExtensionSiteBrowser } from "../browsers/extension-site-browser.tsx";
import { WebSiteBrowser } from "../browsers/web-site-browser.tsx";
import {
  config as panelSidebarConfig,
  panels as panelSidebarData,
  selectedPanelId,
  setPanels as setPanelSidebarData,
  setSelectedPanelId,
} from "../../../sidebar/state/mod.ts";
import type { Panel, Panels } from "../../../sidebar/types/mod.ts";
import { effect } from "@preact/signals";
import { getExtensionSidebarAction } from "../../../sidebar/io/mod.ts";
import * as panelWindowIO from "../../io/panel-window.ts";
import "../../../sidebar/io/web-request.ts";

export class CPanelSidebar {
  private panelDisposers: Map<string, () => void> = new Map();
  private get parentElement() {
    return document?.getElementById("panel-sidebar-browser-box") as
      | Element
      | undefined;
  }

  private get sidebarElement() {
    return document?.getElementById("panel-sidebar-box") as Element | undefined;
  }

  private get browsers() {
    return document?.querySelectorAll(".sidebar-panel-browser") as
      | NodeListOf<Element>
      | undefined;
  }

  constructor() {
    // Keep a minimal reactive root that syncs the selected panel's "data-checked"
    effect(() => {
      const currentCheckedPanels = Array.from(
        this.sidebarElement?.querySelectorAll(
          ".panel-sidebar-panel[data-checked]",
        ) ?? [],
      ) as Element[];
      currentCheckedPanels.forEach((panel) =>
        panel.removeAttribute("data-checked"),
      );
      const currentPanel = this.getPanelData(selectedPanelId() ?? "");
      if (currentPanel) {
        this.sidebarElement
          ?.querySelector(`.panel-sidebar-panel[id="${currentPanel.id}"]`)
          ?.setAttribute("data-checked", "true");
      }
    });
  }

  public getBrowserElement(id: string) {
    return document?.getElementById(`sidebar-panel-${id}`) as
      | (Element & {
          contentWindow: Window;
          goBack: () => void;
          goForward: () => void;
          goIndex: () => void;
          reload: () => void;
          toggleMute: () => void;
        })
      | undefined;
  }

  public getPanelData(id: string): Panel | undefined {
    return panelSidebarData().find((panel: Panel) => panel.id === id);
  }

  private createBrowserComponent(panel: Panel) {
    const components = {
      web: WebSiteBrowser,
      extension: ExtensionSiteBrowser,
      static: ChromeSiteBrowser,
    };

    const BrowserComponent = components[panel.type];
    if (!BrowserComponent) {
      throw new Error(`Unsupported panel type: ${panel.type}`);
    }

    return <BrowserComponent {...panel} />;
  }

  private resetBrowsersFlex(): void {
    if (this.browsers) {
      for (const browser of this.browsers as any) {
        (browser as Element).removeAttribute("flex");
      }
    }
  }

  private renderBrowserComponent(panel: Panel): void {
    if (!this.parentElement) {
      throw new Error("Parent element not found");
    }

    // Dispose previous root for this panel if it exists (safety for re-renders)
    const prevDispose = this.panelDisposers.get(panel.id);
    if (prevDispose) {
      try {
        prevDispose();
      } catch (e) {
        console.warn("panel dispose failed", e);
      }
      this.panelDisposers.delete(panel.id);
    }

    // Independent render
    const wrapper = document.createElement("box");
    // wrapper.style.display = "contents"; // Not sure if supported in XUL/HTML mix, but box is transparent usually
    this.parentElement.appendChild(wrapper);

    render(this.createBrowserComponent(panel), wrapper);

    const dispose = () => {
      render(null, wrapper);
      wrapper.remove();
    };

    this.panelDisposers.set(panel.id, dispose);

    this.initBrowser(panel);
  }

  private initBrowser(panel: Panel) {
    if (panel.type === "extension") {
      const browser = this.getBrowserElement(panel.id) as Element & {
        contentWindow: Window;
      };

      if (!browser) {
        throw new Error("Browser element not found");
      }

      if (!panel.extensionId) {
        throw new Error("Extension ID not found");
      }

      const sidebarAction = getExtensionSidebarAction(panel.extensionId);

      browser.addEventListener("DOMContentLoaded", () => {
        const oa = (globalThis as any).E10SUtils.predictOriginAttributes({
          browser,
        });
        browser.setAttribute(
          "remoteType",
          (globalThis as any).E10SUtils.getRemoteTypeForURI(
            panel.url ?? "",
            true,
            false,
            (globalThis as any).E10SUtils.EXTENSION_REMOTE_TYPE,
            null,
            oa,
          ),
        );

        browser.contentWindow.loadPanel(
          panel.extensionId,
          sidebarAction.default_panel,
          "sidebar",
        );
      });
    }
  }

  public changePanel(panelId: string): void {
    if (panelId === selectedPanelId()) {
      setSelectedPanelId(null);
      if (panelSidebarConfig().autoUnload) {
        this.unloadPanel(panelId);
      }
      return;
    }

    const panel = this.getPanelData(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }

    setSelectedPanelId(panelId);
    this.setSidebarWidth(panel);
    this.resetBrowsersFlex();
    this.showPanel(panel);
  }

  public showPanel(panel: Panel): void {
    const browser = this.getBrowserElement(panel.id);
    if (browser) {
      browser.setAttribute("flex", "1");
      return;
    }
    this.renderBrowserComponent(panel);
  }

  public saveCurrentSidebarWidth() {
    const currentWidth = this.sidebarElement?.getAttribute("width");
    if (currentWidth) {
      setPanelSidebarData((prev: Panels) =>
        prev.map((panel: Panel) =>
          panel.id === selectedPanelId()
            ? { ...panel, width: Number(currentWidth) }
            : panel,
        ),
      );
    }
  }

  private setSidebarWidth(panel: Panel) {
    (this.sidebarElement as HTMLElement)?.style.setProperty(
      "width",
      `${panel.width !== 0 ? panel.width : panelSidebarConfig().globalWidth}px`,
    );
  }

  public openInMainWindow(panelId: string) {
    const url = this.getPanelData(panelId)?.url;
    const userContextId = this.getPanelData(panelId)?.userContextId;
    (globalThis as any).gBrowser.addTab(url, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      inBackground: false,
      userContextId: userContextId,
    });
  }

  public deletePanel(panelId: string) {
    this.unloadPanel(panelId);
    setPanelSidebarData((prev: Panels) =>
      prev.filter((p: Panel) => p.id !== panelId),
    );
  }

  public unloadPanel(panelId: string) {
    // Cleanup Solid root for this panel if present
    const dispose = this.panelDisposers.get(panelId);
    if (dispose) {
      try {
        dispose();
      } catch (e) {
        console.warn("panel dispose failed", e);
      }
      this.panelDisposers.delete(panelId);
    }

    const browser = this.getBrowserElement(panelId);
    if (browser) {
      browser.remove();
    }

    setSelectedPanelId(null);
  }

  public mutePanel(panelId: string) {
    panelWindowIO.toggleMutePanel(panelId);
  }

  public changeZoomLevel(panelId: string, type: "in" | "out" | "reset") {
    switch (type) {
      case "in":
        panelWindowIO.zoomInPanel(panelId);
        break;
      case "out":
        panelWindowIO.zoomOutPanel(panelId);
        break;
      case "reset":
        panelWindowIO.resetZoomLevelPanel(panelId);
        break;
    }
  }

  public changeUserAgent(panelId: string) {
    const panel = this.getPanelData(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }

    // Toggle the userAgent property for the specified panel
    setPanelSidebarData((prev: Panels) =>
      prev.map((p: Panel) =>
        p.id === panelId ? { ...p, userAgent: !p.userAgent } : p,
      ),
    );

    // Unload and reload the panel to apply the new user agent
    this.unloadPanel(panelId);
    this.changePanel(panelId);
  }
}
