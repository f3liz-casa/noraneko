// SPDX-License-Identifier: MPL-2.0

// settings-bridge: birpc bridge between noraneko settings pages and privileged
// pref access. Replaces the NRSettings JSActor (parent + child).

import {
  defineContent,
  defineParent,
  type ActorMeta,
} from "../_shared/defineActor.ts";
import { createBirpc } from "birpc";

export const meta: ActorMeta = {
  id: "settings-bridge@noraneko.app",
  version: "1.0.0",
  namespace: "noraSettings",
  matches: ["*://localhost/*", "chrome://noraneko-settings/*"],
  runAt: "document_start",
};

const ALLOWED_PREF_PREFIXES = ["noraneko.", "floorp."];

function isAllowedPrefName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    ALLOWED_PREF_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

export const parent = defineParent({
  getBoolPref(prefName: string): boolean | null {
    if (!isAllowedPrefName(prefName)) return null;
    if (Services.prefs.getPrefType(prefName) != Services.prefs.PREF_BOOL) {
      return null;
    }
    return Services.prefs.getBoolPref(prefName);
  },
  getIntPref(prefName: string): number | null {
    if (!isAllowedPrefName(prefName)) return null;
    if (Services.prefs.getPrefType(prefName) != Services.prefs.PREF_INT) {
      return null;
    }
    return Services.prefs.getIntPref(prefName);
  },
  getStringPref(prefName: string): string | null {
    if (!isAllowedPrefName(prefName)) return null;
    if (Services.prefs.getPrefType(prefName) != Services.prefs.PREF_STRING) {
      return null;
    }
    return Services.prefs.getStringPref(prefName);
  },
  setBoolPref(prefName: string, prefValue: boolean): void {
    if (!isAllowedPrefName(prefName)) return;
    Services.prefs.setBoolPref(prefName, prefValue);
  },
  setIntPref(prefName: string, prefValue: number): void {
    if (!isAllowedPrefName(prefName)) return;
    Services.prefs.setIntPref(prefName, prefValue);
  },
  setStringPref(prefName: string, prefValue: string): void {
    if (!isAllowedPrefName(prefName)) return;
    Services.prefs.setStringPref(prefName, prefValue);
  },
});

export const content = defineContent<typeof parent>((parent, ctx) => {
  let sendToPage: ((data: string) => void) | null = null;

  ctx.expose({
    NRSPing: () => true,
    NRSettingsSend: (data: string) => sendToPage?.(data),
    NRSettingsRegisterReceiveCallback: (callback: (data: string) => void) => {
      createBirpc(parent, {
        post: (data) => callback(data),
        on: (cb) => {
          sendToPage = cb;
        },
        serialize: (v) => JSON.stringify(v),
        deserialize: (v) => JSON.parse(v),
      });
    },
  });
});
