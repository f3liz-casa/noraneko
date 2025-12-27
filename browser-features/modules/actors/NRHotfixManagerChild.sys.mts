// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix Manager Child Actor
 *
 * This actor provides the client-side interface for hotfix management
 * in the settings UI. It communicates with the parent actor to perform
 * hotfix operations.
 */

import type {
  HotfixManifest,
  InstalledHotfix,
} from "../common/hotfix-types.ts";

export class NRHotfixManagerChild extends JSWindowActorChild {
  constructor() {
    super();
  }

  actorCreated(): void {
    console.debug("[NRHotfixManagerChild] Actor created");

    const window = this.contentWindow;
    if (!window) return;

    // Check if we're on the settings page
    const isSettingsPage =
      window.location.port === "5183" ||
      window.location.href.includes("noraneko-settings");

    if (isSettingsPage) {
      this.exposeHotfixAPI(window);
    }
  }

  /**
   * Expose hotfix management API to the settings page
   */
  private exposeHotfixAPI(window: Window): void {
    // Create the hotfix API object
    const hotfixAPI = {
      /**
       * Validate an unlock code
       */
      validateCode: async (
        code: string,
      ): Promise<{
        success: boolean;
        manifest?: HotfixManifest;
        error?: string;
      }> => {
        return await this.sendQuery("hotfix:validateCode", { code });
      },

      /**
       * Download and install a hotfix
       */
      installHotfix: async (
        manifestId: string,
      ): Promise<{ success: boolean; error?: string }> => {
        return await this.sendQuery("hotfix:downloadAndInstall", {
          manifestId,
        });
      },

      /**
       * Revert an installed hotfix
       */
      revertHotfix: async (
        hotfixId: string,
      ): Promise<{ success: boolean; error?: string }> => {
        return await this.sendQuery("hotfix:revert", { hotfixId });
      },

      /**
       * Get list of installed hotfixes
       */
      getInstalledHotfixes: async (): Promise<InstalledHotfix[]> => {
        return await this.sendQuery("hotfix:getInstalled", {});
      },

      /**
       * Get available hotfixes (requires unlock codes)
       */
      getAvailableHotfixes: async (): Promise<HotfixManifest[]> => {
        return await this.sendQuery("hotfix:getAvailable", {});
      },

      /**
       * Initialize the hotfix system
       */
      initialize: async (): Promise<{ success: boolean }> => {
        return await this.sendQuery("hotfix:initialize", {});
      },
    };

    // Export the API to the window
    Cu.exportFunction(
      hotfixAPI.validateCode.bind(this),
      window,
      { defineAs: "NRHotfixValidateCode" },
    );
    Cu.exportFunction(
      hotfixAPI.installHotfix.bind(this),
      window,
      { defineAs: "NRHotfixInstall" },
    );
    Cu.exportFunction(
      hotfixAPI.revertHotfix.bind(this),
      window,
      { defineAs: "NRHotfixRevert" },
    );
    Cu.exportFunction(
      hotfixAPI.getInstalledHotfixes.bind(this),
      window,
      { defineAs: "NRHotfixGetInstalled" },
    );
    Cu.exportFunction(
      hotfixAPI.getAvailableHotfixes.bind(this),
      window,
      { defineAs: "NRHotfixGetAvailable" },
    );
    Cu.exportFunction(
      hotfixAPI.initialize.bind(this),
      window,
      { defineAs: "NRHotfixInitialize" },
    );

    console.debug("[NRHotfixManagerChild] Hotfix API exposed to window");
  }
}
