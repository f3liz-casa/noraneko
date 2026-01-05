// SPDX-License-Identifier: MPL-2.0

/**
 * Browser Types - Type definitions for sidebar browser components
 */

/** Panel browser types */
export type BrowserType = "web" | "extension" | "static";

/** Browser element with extended methods */
export interface BrowserElement extends Element {
  contentWindow: Window;
  goBack: () => void;
  goForward: () => void;
  goIndex: () => void;
  reload: () => void;
  toggleMute: () => void;
  src?: string;
}

/** XUL Browser element with browsing context */
export interface XULBrowserElement extends Element {
  browsingContext: {
    associatedWindow: Window;
  };
}

/** Props for browser site components */
export interface BrowserSiteProps {
  id: string;
  type: BrowserType;
  url: string;
  width?: number;
  userContextId?: number | null;
  zoomLevel?: number | null;
  userAgent?: boolean;
  extensionId?: string | null;
}
