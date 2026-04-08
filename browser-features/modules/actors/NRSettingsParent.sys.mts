// SPDX-License-Identifier: MPL-2.0

const ALLOWED_PREF_PREFIXES = ["noraneko.", "floorp."];

export class NRSettingsParent extends JSWindowActorParent {
  constructor() {
    super();
  }

  private isAllowedPrefName(name: unknown): name is string {
    if (typeof name !== "string" || name.length === 0) return false;
    return ALLOWED_PREF_PREFIXES.some((prefix) => name.startsWith(prefix));
  }

  receiveMessage(message) {
    if (!this.isAllowedPrefName(message.data?.name)) {
      console.warn(
        `[NRSettingsParent] Rejected access to disallowed preference: ${message.data?.name}`,
      );
      return null;
    }

    switch (message.name) {
      case "getBoolPref": {
        if (
          Services.prefs.getPrefType(message.data.name) !=
          Services.prefs.PREF_BOOL
        ) {
          return null;
        }
        return Services.prefs.getBoolPref(message.data.name);
      }
      case "getIntPref": {
        if (
          Services.prefs.getPrefType(message.data.name) !=
          Services.prefs.PREF_INT
        ) {
          return null;
        }
        return Services.prefs.getIntPref(message.data.name);
      }
      case "getStringPref": {
        if (
          Services.prefs.getPrefType(message.data.name) !=
          Services.prefs.PREF_STRING
        ) {
          return null;
        }
        return Services.prefs.getStringPref(message.data.name);
      }
      case "setBoolPref": {
        Services.prefs.setBoolPref(message.data.name, message.data.prefValue);
        break;
      }
      case "setIntPref": {
        Services.prefs.setIntPref(message.data.name, message.data.prefValue);
        break;
      }
      case "setStringPref": {
        Services.prefs.setStringPref(message.data.name, message.data.prefValue);
        break;
      }
    }
  }
}
