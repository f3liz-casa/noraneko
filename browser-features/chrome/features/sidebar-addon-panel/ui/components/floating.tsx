/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { effect } from "@preact/signals";
import {
  isFloating,
  config as panelSidebarConfig,
  selectedPanelId,
  setIsFloatingDragging,
  setConfig as setPanelSidebarConfig,
  setSelectedPanelId,
} from "../../../sidebar/state/mod.ts";
import { STATIC_PANELS as STATIC_PANEL_DATA } from "../../../sidebar/data/mod.ts";
import { isResizeCooldown } from "./floating-splitter.tsx";
import type {
  Panel,
  Config as PanelSidebarConfig,
} from "../../../sidebar/types/mod.ts";

declare global {
  interface Window {
    gFloorpPanelSidebar?: {
      getPanelData: (id: string) => Panel | undefined;
      showPanel: (panel: Panel) => void;
    };
  }
}

const { AppConstants } = (window as any).ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs",
);

export class PanelSidebarFloating {
  private static instance: PanelSidebarFloating;
  public static getInstance() {
    if (!PanelSidebarFloating.instance) {
      PanelSidebarFloating.instance = new PanelSidebarFloating();
    }
    return PanelSidebarFloating.instance;
  }

  private resizeObserver: ResizeObserver | null = null;
  private parentHeightTargetId = "browser";
  private userResizedHeight = false;
  private isDraggingHeader = false;

  constructor() {
    effect(() => {
      if (isFloating()) {
        if (!this.userResizedHeight) {
          this.applyHeightToSidebarBox();
        }
        this.initResizeObserver();
        this.initDragHeader();
        this.applyStoredPositionToSidebarBox();
        document?.addEventListener("mousedown", this.handleOutsideClick, true);
      } else {
        this.removeFloatingStyles();
        this.resizeObserver?.disconnect();
        document?.removeEventListener(
          "mousedown",
          this.handleOutsideClick,
          true,
        );
        this.userResizedHeight = false;
        this.restoreActivePanel();
      }
    });

    effect(() => {
      const position = panelSidebarConfig().position_start;
      if (position) {
        document
          ?.getElementById("panel-sidebar-box")
          ?.setAttribute("data-floating-splitter-side", "start");
      } else {
        document
          ?.getElementById("panel-sidebar-box")
          ?.setAttribute("data-floating-splitter-side", "end");
      }
    });
  }

  private initResizeObserver() {
    const tabbrowserTabboxElem = document?.getElementById(
      this.parentHeightTargetId,
    );
    const sidebarBox = document?.getElementById("panel-sidebar-box");

    if (!tabbrowserTabboxElem || !sidebarBox) {
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (
          entry.target.id === this.parentHeightTargetId &&
          isFloating() &&
          !this.userResizedHeight
        ) {
          this.applyHeightToSidebarBox();
        }
      }
    });

    this.resizeObserver.observe(tabbrowserTabboxElem);

    sidebarBox.addEventListener("mousedown", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isResizer =
        target.classList.contains("floating-splitter-side") ||
        target.classList.contains("floating-splitter-vertical") ||
        target.classList.contains("floating-splitter-corner");

      if (isResizer) {
        this.userResizedHeight = true;

        const onMouseUp = () => {
          this.saveCurrentSidebarSize();
          document?.removeEventListener("mouseup", onMouseUp);
        };

        document?.addEventListener("mouseup", onMouseUp);
      }
    });
  }

  private initDragHeader() {
    const header = document?.getElementById("panel-sidebar-header") as Element; // XULElement
    const sidebarBox = document?.getElementById("panel-sidebar-box") as Element; // XULElement

    if (!header || !sidebarBox) {
      return;
    }

    (header as HTMLElement).style.setProperty("cursor", "move");

    header.addEventListener("mousedown", (e: Event) => {
      const me = e as MouseEvent;
      if (this.isDraggingHeader) {
        return;
      }

      if (
        (me.target as HTMLElement).tagName === "button" ||
        (me.target as HTMLElement).tagName === "BUTTON" ||
        (me.target as HTMLElement).closest(".panel-sidebar-actions")
      ) {
        return;
      }

      me.preventDefault();
      this.isDraggingHeader = true;
      setIsFloatingDragging(true);
      const docEl = document?.documentElement as Element | null;
      (docEl as HTMLElement)?.style.setProperty("user-select", "none");

      const startX = me.clientX;
      const startY = me.clientY;
      const startLeft =
        Number.parseInt(
          (sidebarBox as HTMLElement).style.getPropertyValue("left") || "0",
          10,
        ) || sidebarBox.getBoundingClientRect().left;
      const startTop =
        Number.parseInt(
          (sidebarBox as HTMLElement).style.getPropertyValue("top") || "0",
          10,
        ) || sidebarBox.getBoundingClientRect().top;

      (sidebarBox as HTMLElement).style.setProperty("margin", "0");
      (sidebarBox as HTMLElement).style.setProperty("position", "absolute");
      (sidebarBox as HTMLElement).style.setProperty("right", "auto");
      (sidebarBox as HTMLElement).style.setProperty("left", `${startLeft}px`);
      (sidebarBox as HTMLElement).style.setProperty("top", `${startTop}px`);

      let frameRequested = false;
      let pendingLeft = startLeft;
      let pendingTop = startTop;

      const applyFrame = () => {
        frameRequested = false;
        (sidebarBox as HTMLElement).style.setProperty(
          "left",
          `${pendingLeft}px`,
        );
        (sidebarBox as HTMLElement).style.setProperty("top", `${pendingTop}px`);
      };

      const onMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        const browserW =
          document?.getElementById("browser")?.clientWidth ?? window.innerWidth;
        const browserH =
          document?.getElementById("browser")?.clientHeight ??
          window.innerHeight;
        pendingLeft = Math.max(
          0,
          Math.min(browserW - sidebarBox.clientWidth, startLeft + deltaX),
        );
        pendingTop = Math.max(
          0,
          Math.min(browserH - sidebarBox.clientHeight, startTop + deltaY),
        );

        if (!frameRequested) {
          frameRequested = true;
          document?.defaultView?.requestAnimationFrame(applyFrame);
        }
      };

      const onMouseUp = () => {
        this.isDraggingHeader = false;
        setIsFloatingDragging(false);
        document?.removeEventListener("mousemove", onMouseMove);
        document?.removeEventListener("mouseup", onMouseUp);
        const docEl = document?.documentElement as Element | null;
        (docEl as HTMLElement)?.style.removeProperty("user-select");

        this.savePosition();
      };

      document?.addEventListener("mousemove", onMouseMove);
      document?.addEventListener("mouseup", onMouseUp);
    });
  }

  private savePosition() {
    const sidebarBox = document?.getElementById(
      "panel-sidebar-box",
    ) as HTMLElement;
    if (!sidebarBox) {
      return;
    }

    const left = Number.parseInt(
      sidebarBox.style.getPropertyValue("left") || "0",
      10,
    );
    const top = Number.parseInt(
      sidebarBox.style.getPropertyValue("top") || "0",
      10,
    );

    const config = panelSidebarConfig() as unknown as PanelSidebarConfig;
    setPanelSidebarConfig({
      ...config,
      floatingPositionLeft: left,
      floatingPositionTop: top,
    });
  }

  private applyHeightToSidebarBox() {
    const el = document?.getElementById(
      "panel-sidebar-box",
    ) as HTMLElement | null;
    if (el) {
      el.style.setProperty("height", `${this.getBrowserHeight() - 20}px`);
    }
  }

  private removeFloatingStyles() {
    const sidebarBox = document?.getElementById(
      "panel-sidebar-box",
    ) as HTMLElement;
    if (!sidebarBox) {
      return;
    }

    sidebarBox.style.removeProperty("height");
    sidebarBox.style.removeProperty("width");
    sidebarBox.style.removeProperty("position");
    sidebarBox.style.removeProperty("left");
    sidebarBox.style.removeProperty("right");
    sidebarBox.style.removeProperty("top");
    sidebarBox.style.removeProperty("margin");

    sidebarBox.style.setProperty("min-width", "225px");
  }

  private removeHeightToSidebarBox() {
    const el = document?.getElementById(
      "panel-sidebar-box",
    ) as HTMLElement | null;
    if (el) {
      el.style.removeProperty("height");
    }
  }

  private getBrowserHeight() {
    return (
      document?.getElementById(this.parentHeightTargetId)?.clientHeight ?? 0
    );
  }

  private saveCurrentSidebarSize() {
    const sidebarBox = document?.getElementById(
      "panel-sidebar-box",
    ) as HTMLElement;
    if (!sidebarBox) return;

    const config = panelSidebarConfig() as unknown as PanelSidebarConfig;

    const width = sidebarBox.getBoundingClientRect().width;
    const height = sidebarBox.getBoundingClientRect().height;

    setPanelSidebarConfig({
      ...config,
      floatingWidth: width,
      floatingHeight: height,
    });
  }

  private applyStoredPositionToSidebarBox() {
    const config = panelSidebarConfig() as unknown as PanelSidebarConfig;
    const sidebarBox = document?.getElementById(
      "panel-sidebar-box",
    ) as HTMLElement;

    if (!sidebarBox) {
      return;
    }

    if (
      config.floatingPositionLeft !== undefined &&
      config.floatingPositionTop !== undefined
    ) {
      sidebarBox.style.setProperty("margin", "0");
      sidebarBox.style.setProperty("position", "absolute");
      sidebarBox.style.setProperty("right", "auto");

      const width =
        config.floatingWidth || sidebarBox.getBoundingClientRect().width;
      const height =
        config.floatingHeight || sidebarBox.getBoundingClientRect().height;
      const browserW =
        document?.getElementById("browser")?.clientWidth ?? window.innerWidth;
      const browserH =
        document?.getElementById("browser")?.clientHeight ?? window.innerHeight;
      const left = Math.max(
        0,
        Math.min(browserW - width, config.floatingPositionLeft),
      );
      const top = Math.max(
        0,
        Math.min(browserH - height, config.floatingPositionTop),
      );

      sidebarBox.style.setProperty("left", `${left}px`);
      sidebarBox.style.setProperty("top", `${top}px`);
    } else {
      // position_start に応じてデフォルトの左右を調整
      const isStart = (panelSidebarConfig() as unknown as PanelSidebarConfig)
        .position_start;
      const currentWidth = sidebarBox.getBoundingClientRect().width || 400;
      const browserW =
        document?.getElementById("browser")?.clientWidth ?? window.innerWidth;
      const margin = 20;
      const defaultLeft = isStart
        ? margin
        : Math.max(margin, browserW - currentWidth - margin);
      const defaultTop = 100;
      sidebarBox.style.setProperty("margin", "0");
      sidebarBox.style.setProperty("position", "absolute");
      sidebarBox.style.setProperty("right", "auto");
      sidebarBox.style.setProperty("left", `${defaultLeft}px`);
      sidebarBox.style.setProperty("top", `${defaultTop}px`);
    }

    if (
      config.floatingWidth !== undefined &&
      config.floatingHeight !== undefined
    ) {
      sidebarBox.style.setProperty("width", `${config.floatingWidth}px`);
      sidebarBox.style.setProperty("height", `${config.floatingHeight}px`);
      this.userResizedHeight = true;
    }
  }

  private handleOutsideClick = (event: MouseEvent) => {
    if (!isFloating()) {
      return;
    }

    // isResizeCooldown is now a signal object, access .value
    if (isResizeCooldown.value || this.isDraggingHeader) {
      return;
    }

    const sidebarBox = document?.getElementById("panel-sidebar-box");
    const selectBox = document?.getElementById("panel-sidebar-select-box");
    const splitter = document?.getElementById("panel-sidebar-splitter");
    const browsers = sidebarBox?.querySelectorAll(".sidebar-panel-browser");

    const clickedBrowser = (event.target as Element).ownerDocument
      ?.activeElement;
    const clickedBrowserIsSidebarBrowser = Array.from(browsers ?? []).some(
      (browser) => browser === clickedBrowser,
    );
    const clickedElementIsChromeSidebar = Object.values(STATIC_PANEL_DATA).some(
      (panel) =>
        panel.url === (clickedBrowser as Element).ownerDocument?.documentURI,
    );
    const clickedElementIsWebTypeBrowser = clickedBrowser?.baseURI?.startsWith(
      `${AppConstants.BROWSER_CHROME_URL}?floorpWebPanelId`,
    );
    const insideSidebar =
      sidebarBox?.contains(event.target as Node) ||
      clickedBrowserIsSidebarBrowser;
    const insideSelectBox = selectBox?.contains(event.target as Node);
    const insideSplitter = splitter?.contains(event.target as Node);

    if (
      !insideSidebar &&
      !insideSelectBox &&
      !insideSplitter &&
      !clickedElementIsChromeSidebar &&
      !clickedElementIsWebTypeBrowser
    ) {
      setSelectedPanelId(null);
    }
  };

  private restoreActivePanel() {
    const currentPanelId = selectedPanelId();

    if (currentPanelId) {
      try {
        const panelSidebarInstance = window.gFloorpPanelSidebar;
        if (panelSidebarInstance) {
          setSelectedPanelId(null);

          setTimeout(() => {
            setSelectedPanelId(currentPanelId);
            if (panelSidebarInstance.showPanel) {
              const panel = panelSidebarInstance.getPanelData(currentPanelId);
              if (panel) {
                panelSidebarInstance.showPanel(panel);
              }
            }
          }, 50);
        }
      } catch (e) {
        console.error("Failed to restore panel:", e);
      }
    }
  }
}
