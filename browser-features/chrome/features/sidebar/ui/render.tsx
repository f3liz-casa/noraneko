// SPDX-License-Identifier: MPL-2.0
// Sidebar render utilities

import { DockBar } from "./DockBar.tsx";
import dockBarStyle from "./styles/dock-bar.css?inline";
import { render } from "@nora/preact-xul";
import type { Signal } from "@preact/signals";
import type { IconRegistration } from "../types/mod.ts";

/**
 * Render the dock bar into the browser chrome
 */
export function renderDockBar(
  parentElem: Element,
  beforeElem: Element,
  icons: Signal<IconRegistration[]>,
  onClicked: (iconName: string) => void,
): void {
  const container = (
    document as { createXULElement?: (name: string) => Element }
  ).createXULElement
    ? (
        document as { createXULElement: (name: string) => Element }
      ).createXULElement("hbox")
    : document.createElement("div");

  container.id = "sidebar-dock-bar-container";
  parentElem.insertBefore(container, beforeElem);

  render(
    <DockBar icons={icons} onIconClick={(iconName) => onClicked(iconName)} />,
    container,
  );
}

/**
 * Inject dock bar styles into the document
 */
export function injectStyles(): void {
  const style = document.createElement("style");
  style.id = "sidebar-dock-bar-styles";
  style.textContent = dockBarStyle;
  document.head.appendChild(style);
}

/**
 * Remove dock bar elements from the DOM
 */
export function cleanup(): void {
  document?.getElementById("sidebar-dock-bar-container")?.remove();
  document?.getElementById("sidebar-dock-bar-styles")?.remove();
}
