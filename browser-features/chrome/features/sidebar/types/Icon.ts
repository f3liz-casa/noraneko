// SPDX-License-Identifier: MPL-2.0
// Icon registration type definitions

/**
 * Registration info for sidebar icons
 */
export interface IconRegistration {
  name: string;
  i18nName: string;
  iconUrl: string;
  callback: () => void | Promise<void>;
}

/**
 * Event dispatcher interface exposed to other modules
 */
export interface EventDispatcher {
  notifyDataChanged(data: unknown): void;
  notifyConfigChanged(config: unknown): void;
  selectPanel(panelId: string): void;
  registerSidebarIcon(options: IconRegistration): void;
  onClicked(iconName: string): Promise<void>;
  registerDataUpdateCallback(callback: (data: unknown) => void): void;
  registerSelectionChangeCallback(callback: (panelId: string) => void): void;
  unregisterDataUpdateCallback(callback: (data: unknown) => void): void;
  unregisterSelectionChangeCallback(callback: (panelId: string) => void): void;
  getRegisteredIcons(): IconRegistration[];
}
