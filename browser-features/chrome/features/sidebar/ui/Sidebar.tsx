import { DockBar } from "./dock-bar.tsx";
import dockBarStyle from "./dock-bar.css?inline";
import { render } from "@nora/preact-xul";
import type { Signal } from "@preact/signals";
import type { SidebarIconRegistration } from "../index.ts";

export function _renderDockbar(
  parentElem: Element,
  beforeElem: Element,
  icons: Signal<SidebarIconRegistration[]>,
  onClicked: (iconName: string) => void,
) {
  const container = (document as any).createXULElement
    ? (document as any).createXULElement("hbox") // or box/vbox depending on layout, DockBar is flex-col so v-box? DockBar css has flex-direction: column.
    : // But DockBar returns a div.
      // If we use XUL "box", it might behave differently.
      // preact-xul is likely handling XUL elements.
      // Let's use a "box" or just a div if that works.
      // Given "sidebar-dock-bar" class, maybe just let Preact create the root element?
      // But we need to insert it *before* something.
      // So we create a wrapper.
      // Actually, if DockBar returns a div, and we render into a XUL box, it might be fine.
      // Let's use a generic container.
      document.createElement("div");

  // Setup container
  container.id = "sidebar-dock-bar-container";
  parentElem.insertBefore(container, beforeElem);

  render(
    <DockBar icons={icons} onIconClick={(iconName) => onClicked(iconName)} />,
    container,
  );
}

export function _renderStyle() {
  const style = document.createElement("style");
  style.id = "sidebar-dock-bar-styles";
  style.textContent = dockBarStyle;
  document.head.appendChild(style);
}
