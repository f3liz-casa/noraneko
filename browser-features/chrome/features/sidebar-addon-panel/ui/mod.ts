// SPDX-License-Identifier: MPL-2.0
// UI module - Julia-style re-export

// Core components
export { CPanelSidebar } from "./components/panel-sidebar.tsx";
export {
  PanelSidebarElem,
  PanelSidebarElem as Sidebar,
} from "./components/sidebar.tsx";
export { SidebarContextMenuElem } from "./components/sidebar-contextMenu.tsx";
export { PanelSidebarAddModal } from "./components/panel-sidebar-modal.tsx";
export { PanelSidebarFloating } from "./components/floating.tsx";

// Visual building blocks
export { BrowserBox } from "./components/browser-box.tsx";
export { FloatingSplitter } from "./components/floating-splitter.tsx";
export { SidebarHeader } from "./components/sidebar-header.tsx";
export {
  PanelSidebarButton,
  PanelSidebarButton as SidebarPanelButton,
} from "./components/sidebar-panel-button.tsx";
export { SidebarSelectbox } from "./components/sidebar-selectbox.tsx";
export { SidebarSplitter } from "./components/sidebar-splitter.tsx";

// Styles
export { default as style } from "./styles/style.css?inline";
export { default as modalStyle } from "./styles/modal-style.css?inline";

// Browser components
export { ChromeSiteBrowser } from "./browsers/chrome-site-browser.tsx";
export { WebSiteBrowser } from "./browsers/web-site-browser.tsx";
export { ExtensionSiteBrowser } from "./browsers/extension-site-browser.tsx";
