// SPDX-License-Identifier: MPL-2.0
// Sidebar extension type definitions

/**
 * Firefox sidebar extension panel information
 */
export type Sidebar = {
  title: string;
  extensionId: string;
  url: string;
  menuId: string;
  keyId: string;
  menuL10nId: string;
  revampL10nId: string;
  iconUrl: string;
  disabled: boolean;
};

export type MapSidebars = [string, Sidebar][];
