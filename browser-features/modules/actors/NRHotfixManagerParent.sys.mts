// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix Manager Parent Actor
 *
 * This actor handles hotfix-related operations from the privileged parent process.
 * It provides the backend for the hotfix settings UI.
 */

import { hotfixLoader } from "../modules/HotfixLoader.sys.mts";
import type {
  HotfixManifest,
  InstalledHotfix,
} from "../common/hotfix-types.ts";

export class NRHotfixManagerParent extends JSWindowActorParent {
  constructor() {
    super();
  }

  async receiveMessage(
    message: ReceiveMessageArgument,
  ): Promise<unknown> {
    switch (message.name) {
      case "hotfix:validateCode": {
        return await this.validateUnlockCode(message.data.code);
      }

      case "hotfix:downloadAndInstall": {
        return await this.downloadAndInstallHotfix(message.data.manifestId);
      }

      case "hotfix:revert": {
        return await this.revertHotfix(message.data.hotfixId);
      }

      case "hotfix:getInstalled": {
        return this.getInstalledHotfixes();
      }

      case "hotfix:getAvailable": {
        return await this.getAvailableHotfixes();
      }

      case "hotfix:initialize": {
        await hotfixLoader.initialize();
        return { success: true };
      }

      default:
        console.warn(
          `[NRHotfixManagerParent] Unknown message: ${message.name}`,
        );
        return null;
    }
  }

  /**
   * Validate an unlock code and return the associated manifest if valid
   */
  private async validateUnlockCode(
    code: string,
  ): Promise<{ success: boolean; manifest?: HotfixManifest; error?: string }> {
    try {
      const manifest = await hotfixLoader.validateUnlockCode(code);
      if (manifest) {
        return { success: true, manifest };
      }
      return { success: false, error: "Invalid unlock code" };
    } catch (error) {
      console.error("[NRHotfixManagerParent] Code validation error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }

  /**
   * Download and install a hotfix
   */
  private async downloadAndInstallHotfix(
    manifestId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Fetch the manifest first
      const manifests = await hotfixLoader.fetchAvailableHotfixes();
      const manifest = manifests.find((m) => m.id === manifestId);

      if (!manifest) {
        return { success: false, error: "Hotfix not found" };
      }

      // Download the hotfix
      const downloadSuccess = await hotfixLoader.downloadHotfix(manifest);
      if (!downloadSuccess) {
        return { success: false, error: "Download failed" };
      }

      // Install the hotfix (includes verification and consent)
      const installSuccess = await hotfixLoader.installHotfix(manifest);
      if (!installSuccess) {
        return { success: false, error: "Installation failed or declined" };
      }

      return { success: true };
    } catch (error) {
      console.error("[NRHotfixManagerParent] Install error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Installation failed",
      };
    }
  }

  /**
   * Revert an installed hotfix
   */
  private async revertHotfix(
    hotfixId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const success = await hotfixLoader.revertHotfix(hotfixId);
      return { success };
    } catch (error) {
      console.error("[NRHotfixManagerParent] Revert error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Revert failed",
      };
    }
  }

  /**
   * Get list of installed hotfixes
   */
  private getInstalledHotfixes(): InstalledHotfix[] {
    return hotfixLoader.getInstalledHotfixes();
  }

  /**
   * Get available hotfixes
   */
  private async getAvailableHotfixes(): Promise<HotfixManifest[]> {
    return await hotfixLoader.fetchAvailableHotfixes();
  }
}
