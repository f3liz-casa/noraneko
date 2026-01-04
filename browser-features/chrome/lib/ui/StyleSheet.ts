// SPDX-License-Identifier: MPL-2.0
// StyleSheet service utilities

const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
  Ci.nsIStyleSheetService,
);
const ios = Services.io;

/**
 * Load and register a stylesheet with nsIStyleSheetService
 */
export function loadStyleSheet(styleSheetURL: string): void {
  const uri = ios.newURI(styleSheetURL);
  sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
}

/**
 * Check if a stylesheet is registered with nsIStyleSheetService
 */
export function isStyleSheetLoaded(styleSheetURL: string): boolean {
  const uri = ios.newURI(styleSheetURL);
  return sss.sheetRegistered(uri, sss.USER_SHEET);
}

/**
 * Unregister a stylesheet from nsIStyleSheetService
 */
export function unloadStyleSheet(styleSheetURL: string): void {
  const uri = ios.newURI(styleSheetURL);
  sss.unregisterSheet(uri, sss.USER_SHEET);
}
