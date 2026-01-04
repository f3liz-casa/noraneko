/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@nora/preact-xul";
import style from "../styles/style.css?inline";
import { SidebarHeader } from "./sidebar-header.tsx";
import { SidebarSelectbox } from "./sidebar-selectbox.tsx";
import { SidebarSplitter } from "./sidebar-splitter.tsx";
import { effect } from "@preact/signals";
import {
  isFloating,
  isPanelSidebarEnabled,
  selectedPanelId,
} from "../../../sidebar/core/data.ts";
import { FloatingSplitter } from "./floating-splitter.tsx";
import { BrowserBox } from "./browser-box.tsx";
import type { CPanelSidebar } from "./panel-sidebar.tsx";

export class PanelSidebarElem {
  ctx: CPanelSidebar;

  private get documentElement() {
    return document?.documentElement as Element;
  }

  constructor(ctx: CPanelSidebar) {
    this.ctx = ctx;
    if (!isPanelSidebarEnabled()) {
      return;
    }
    const parentElem = document?.getElementById("browser");
    const beforeElem = document?.getElementById("tabbrowser-tabbox");

    // Wait for the sidebar controller to be initialized
    // This is a workaround to avoid Extension Sidebar Panels not being loaded
    const SidebarController = (
      globalThis as unknown as {
        SidebarController: { promiseInitialized: Promise<void> };
      }
    ).SidebarController;
    SidebarController.promiseInitialized.then(() => {
      // Create wrapper or render directly?
      // Preact 'render' appends. To insert before, we need a container.
      // Or we can create the element and insert it manually, then render into it?
      // this.sidebar() returns <xul:vbox ...>.
      // If we render() it into a container, the container is parent.
      // parentElem is 'browser'.
      // We want to insert 'panel-sidebar-box' before 'tabbrowser-tabbox'.
      // Preact can't do insertBefore via render().
      // workaround: Create a container div/box effectively acting as a placeholder?
      // Or create the root element manually and render children?
      // <xul:vbox> is the root of sidebar.

      // I'll create the root element manually?
      // But props are dynamic (data-floating etc).
      // If I create a wrapper box, say <box id="panel-sidebar-wrapper" display="contents">
      // and insert THAT before beforeElem.
      // Then render into that wrapper.
      if (parentElem && beforeElem) {
        const container = document.createElement("box");
        // container.style.display = "contents"; // if supported
        parentElem.insertBefore(container, beforeElem);
        render(this.sidebar(), container);
      }
    });

    const styleEl = document.createElement("style");
    styleEl.textContent = style;
    document.head?.appendChild(styleEl);

    effect(() => {
      if (selectedPanelId() === null) {
        (this.documentElement as HTMLElement)?.style.setProperty(
          "--panel-sidebar-display",
          "none",
        );
      } else {
        (this.documentElement as HTMLElement)?.style.setProperty(
          "--panel-sidebar-display",
          "flex",
        );
      }
    });

    this.setVerticalTabBgColor();
    Services.prefs.addObserver("sidebar.verticalTabs", () => {
      this.setVerticalTabBgColor();
    });
  }

  private setVerticalTabBgColor() {
    const newValue = Services.prefs.getBoolPref("sidebar.verticalTabs");
    (this.documentElement as HTMLElement)?.style.setProperty(
      "--panel-sidebar-background-color",
      newValue ? "var(--toolbox-bgcolor)" : "var(--toolbar-bgcolor)",
    );
  }

  private sidebar() {
    if (!isPanelSidebarEnabled()) return null;

    return (
      <>
        <xul:vbox
          id="panel-sidebar-box"
          class="chromeclass-extrachrome chromeclass-directories instant customization-target"
          data-floating={isFloating().toString()}
          popover="manual"
        >
          <SidebarHeader ctx={this.ctx} />
          <BrowserBox />
          {isFloating() && <FloatingSplitter />}
        </xul:vbox>
        {!isFloating() && <SidebarSplitter />}
        <SidebarSelectbox ctx={this.ctx} />
      </>
    );
  }
}
