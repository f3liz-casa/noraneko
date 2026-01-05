// SPDX-License-Identifier: MPL-2.0

/**
 * Update Refresh Cache Module
 * Checks for version changes and invalidates caches if necessary.
 */

import { registerModule } from "@lib/core";

const PREF_VERSION = "noraneko.version2";
const TARGET_VERSION = "version2";

export default registerModule(
  {
    name: "update-refresh-cache",
    init(ctx) {
      const current = Services.prefs.getStringPref(PREF_VERSION, "");

      if (current === TARGET_VERSION) return;

      ctx.log.debug(
        `[updater] Updating from '${current}' to '${TARGET_VERSION}'`,
      );

      // Update pref
      if (Services.prefs.prefHasDefaultValue(PREF_VERSION)) {
        Services.prefs.unlockPref(PREF_VERSION);
      }
      Services.prefs
        .getDefaultBranch("")
        .setStringPref(PREF_VERSION, TARGET_VERSION);
      Services.prefs.lockPref(PREF_VERSION);
      Services.prefs.savePrefFile(null as any);

      // Invalidate cache
      Services.appinfo.invalidateCachesOnRestart();
    },
  },
  import.meta,
);
