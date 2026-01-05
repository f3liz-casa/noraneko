// SPDX-License-Identifier: MPL-2.0

/**
 * Panel Child Window I/O - Side-effectful operations for child panel windows
 *
 * This module handles the initialization and management of webpanel child windows.
 * Used when a panel is opened in its own window context.
 */

import type { Panel, Panels } from "../../sidebar/types/mod.ts";

// ============================================================================
// Constants
// ============================================================================

const PANEL_SIDEBAR_DATA_PREF_NAME = "floorp.panelSidebar.data";

// ============================================================================
// Singleton State
// ============================================================================

let instance: WebsitePanelWindowChild | null = null;

// ============================================================================
// Panel Data Accessors
// ============================================================================

/**
 * Get panel sidebar data from preferences
 */
export function getPanelSidebarDataFromPrefs(): Panels {
  return JSON.parse(
    Services.prefs.getStringPref(PANEL_SIDEBAR_DATA_PREF_NAME, "{}"),
  ).data as Panels;
}

/**
 * Get webpanel ID from current URL
 */
export function getWebpanelIdFromUrl(url: URL): string | null {
  const webpanelId = url.searchParams.get("floorpWebPanelId");
  if (!webpanelId) {
    console.error("No webpanelId found");
    return null;
  }
  return webpanelId;
}

/**
 * Find panel data by ID
 */
export function findPanelById(panels: Panels, id: string | null): Panel | null {
  if (!id) return null;
  return panels.find((panel: Panel) => panel.id === id) ?? null;
}

// ============================================================================
// Zoom Operations
// ============================================================================

/**
 * Set zoom level for current window
 */
export function setZoomLevel(zoomLevel: number | null | undefined): void {
  if (zoomLevel) {
    (globalThis as any).ZoomManager.zoom = zoomLevel;
  }
}

// ============================================================================
// User Context Operations
// ============================================================================

/**
 * Handle user context for tab
 */
export function handleUserContext(
  userContextId: number | null | undefined,
): void {
  const gBrowser = (globalThis as any).gBrowser;
  const tab = gBrowser.selectedTab;

  if (
    !userContextId ||
    tab.getAttribute("usercontextid") === String(userContextId)
  ) {
    return;
  }

  let triggeringPrincipal: any = null;

  if (tab.linkedPanel) {
    triggeringPrincipal = tab.linkedBrowser.contentPrincipal;
  } else {
    const tabState = JSON.parse(
      (globalThis as any).SessionStore.getTabState(tab),
    );
    try {
      triggeringPrincipal = (globalThis as any).E10SUtils.deserializePrincipal(
        tabState.triggeringPrincipal_base64,
      );
    } catch (ex) {
      console.error(
        "Failed to deserialize triggeringPrincipal for lazy tab browser",
        ex,
      );
    }
  }

  if (!triggeringPrincipal || triggeringPrincipal.isNullPrincipal) {
    triggeringPrincipal = Services.scriptSecurityManager.createNullPrincipal({
      userContextId: userContextId,
    });
  } else if (triggeringPrincipal.isContentPrincipal) {
    triggeringPrincipal = Services.scriptSecurityManager.principalWithOA(
      triggeringPrincipal,
      { userContextId: userContextId },
    );
  }

  const newTab = gBrowser.addTab((globalThis as any).bmsLoadedURI, {
    userContextId: userContextId,
    triggeringPrincipal,
  });

  if (gBrowser.selectedTab === tab) {
    gBrowser.selectedTab = newTab;
  }

  gBrowser.removeTab(tab);
}

// ============================================================================
// Window Creation
// ============================================================================

/**
 * Create and initialize a webpanel window
 */
export function createWebpanelWindow(
  loadURL: string,
  userAgent: boolean | undefined,
  userContextId: number | null | undefined,
): void {
  const mainWindow = document?.getElementById("main-window") as HTMLDivElement;
  const gBrowser = (globalThis as any).gBrowser;

  // Set flags
  (globalThis as any).floorpWebPanelWindow = true;
  (globalThis as any).floorpBmsUserAgent = userAgent;
  (globalThis as any).bmsLoadedURI = loadURL;

  // Hide navigator toolbox
  document?.getElementById("navigator-toolbox")?.setAttribute("hidden", "true");
  document?.getElementById("browser")?.setAttribute("data-is-child", "true");

  // Set window type
  mainWindow.setAttribute("windowtype", "navigator:webpanel");

  // Load URL
  gBrowser.loadURI(Services.io.newURI(loadURL), {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });

  // Set tab attribute
  gBrowser.selectedTab.setAttribute("BMS-webpanel-tab", "true");

  // Handle opening URL workaround
  (globalThis as any).setTimeout(() => {
    const tab = gBrowser.addTrustedTab("about:blank");
    gBrowser.removeTab(tab);
  }, 0);

  // Handle user context
  handleUserContext(userContextId);

  // Set chrome hidden
  mainWindow.setAttribute(
    "chromehidden",
    "toolbar menubar directories extrachrome",
  );

  // Remove titlebar button box
  document
    ?.querySelector(".titlebar-buttonbox-container[skipintoolbarset]")
    ?.remove();
}

// ============================================================================
// WebsitePanelWindowChild Class (Singleton)
// ============================================================================

/**
 * WebsitePanelWindowChild - Manages child window initialization
 *
 * This class is instantiated once per panel child window.
 */
export class WebsitePanelWindowChild {
  private currentURL = new URL(globalThis.location.href);

  static getInstance(): WebsitePanelWindowChild {
    if (!instance) {
      instance = new WebsitePanelWindowChild();
    }
    return instance;
  }

  get panelSidebarData() {
    return getPanelSidebarDataFromPrefs();
  }

  get webpanelId() {
    return getWebpanelIdFromUrl(this.currentURL);
  }

  get webpanelData() {
    return findPanelById(this.panelSidebarData, this.webpanelId);
  }

  get loadURL() {
    return this.webpanelData?.url ?? "";
  }

  get userContextId() {
    return this.webpanelData?.userContextId ?? 0;
  }

  get userAgent() {
    return this.webpanelData?.userAgent;
  }

  get isBmsWindow() {
    return Boolean(this.webpanelId);
  }

  constructor() {
    if (!this.webpanelId) {
      return;
    }

    (globalThis as any).SessionStore.promiseInitialized.then(() => {
      createWebpanelWindow(
        this.loadURL,
        this.userAgent,
        this.webpanelData?.userContextId,
      );

      // Set up zoom level observer
      Services.prefs.addObserver(PANEL_SIDEBAR_DATA_PREF_NAME, () => {
        setZoomLevel(this.webpanelData?.zoomLevel);
      });
    });
  }
}
