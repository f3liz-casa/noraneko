// SPDX-License-Identifier: MPL-2.0

import { commands } from "./commands";
import type { CSKData } from "./defines";

export function getFluentLocalization(actionName: keyof CSKData): string | null {
  if (!commands[actionName]) {
    console.error(`actionName(${actionName}) do not exists.`);
    return null;
  }
  return `floorp-custom-actions-${actionName}`;
}
