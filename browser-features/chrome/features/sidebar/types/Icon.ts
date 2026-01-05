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
