// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix Loader Module
 *
 * Implements the "Disable & Inject" pattern for non-destructive module patching.
 * This module manages the loading, verification, and activation of hotfix modules
 * stored in the user's profile directory.
 *
 * Architecture:
 * 1. Hotfixes are downloaded to profile/noraneko-hotfixes/
 * 2. Original modules are disabled via preferences
 * 3. Patched modules are loaded from the hotfix directory
 * 4. Hotfixes can be reverted by clearing preferences
 */

import type {
  HotfixConsentResult,
  HotfixManifest,
  HotfixPatch,
  InstalledHotfix,
  SignerIdentity,
} from "../common/hotfix-types.ts";
import { HotfixStatus, VerificationStatus } from "../common/hotfix-types.ts";
import {
  HotfixSignatureVerifier,
  hotfixSignatureVerifier,
} from "./HotfixSignatureVerifier.sys.mts";

// Preference keys for hotfix system
const PREF_HOTFIX_INSTALLED = "noraneko.hotfix.installed";
const PREF_HOTFIX_DISABLED_MODULES = "noraneko.hotfix.disabled_modules";
const PREF_HOTFIX_UNLOCK_CODES = "noraneko.hotfix.unlock_codes";
const PREF_HOTFIX_TRUSTED_DECISIONS = "noraneko.hotfix.trusted_decisions";

// Hotfix distribution URL (can be overridden via pref for testing)
const PREF_HOTFIX_MANIFEST_URL = "noraneko.hotfix.manifest_url";
const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/noraneko-browser/noraneko/main/hotfixes/manifest.json";

/**
 * HotfixLoader manages the lifecycle of hotfix modules
 */
export class HotfixLoader {
  private profileDir: string;
  private hotfixDir: string;
  private verifier: HotfixSignatureVerifier;

  constructor() {
    this.profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
    this.hotfixDir = PathUtils.join(this.profileDir, "noraneko-hotfixes");
    this.verifier = hotfixSignatureVerifier;
  }

  /**
   * Initialize the hotfix system
   */
  async initialize(): Promise<void> {
    console.log("[HotfixLoader] Initializing hotfix system...");

    // Ensure hotfix directory exists
    await this.ensureHotfixDirectory();

    // Load and apply any installed hotfixes
    const installedHotfixes = this.getInstalledHotfixes();
    for (const hotfix of installedHotfixes) {
      if (hotfix.status === HotfixStatus.INSTALLED) {
        await this.applyHotfix(hotfix.id);
      }
    }

    console.log("[HotfixLoader] Hotfix system initialized");
  }

  /**
   * Fetch available hotfixes from the distribution server
   */
  async fetchAvailableHotfixes(): Promise<HotfixManifest[]> {
    try {
      const manifestUrl = Services.prefs.getStringPref(
        PREF_HOTFIX_MANIFEST_URL,
        DEFAULT_MANIFEST_URL,
      );

      const response = await fetch(manifestUrl);
      if (!response.ok) {
        console.error(
          `[HotfixLoader] Failed to fetch manifest: ${response.status}`,
        );
        return [];
      }

      const manifests = (await response.json()) as HotfixManifest[];
      return this.filterApplicableHotfixes(manifests);
    } catch (error) {
      console.error("[HotfixLoader] Error fetching hotfixes:", error);
      return [];
    }
  }

  /**
   * Validate an unlock code and retrieve the associated hotfix
   */
  async validateUnlockCode(code: string): Promise<HotfixManifest | null> {
    const normalizedCode = code.toUpperCase().trim();

    // Check if code is already unlocked
    const unlockedCodes = this.getUnlockedCodes();
    if (unlockedCodes.includes(normalizedCode)) {
      // Code already used, find the manifest
      const manifests = await this.fetchAvailableHotfixes();
      return (
        manifests.find((m) => m.unlockCode === normalizedCode) ?? null
      );
    }

    // Fetch manifests and check for matching code
    const manifests = await this.fetchAvailableHotfixes();
    const manifest = manifests.find((m) => m.unlockCode === normalizedCode);

    if (manifest) {
      // Store the unlocked code
      this.addUnlockedCode(normalizedCode);
      return manifest;
    }

    return null;
  }

  /**
   * Download and verify a hotfix
   */
  async downloadHotfix(manifest: HotfixManifest): Promise<boolean> {
    console.log(`[HotfixLoader] Downloading hotfix: ${manifest.id}`);

    try {
      // Create hotfix-specific directory
      const hotfixPath = PathUtils.join(this.hotfixDir, manifest.id);
      await IOUtils.makeDirectory(hotfixPath, { ignoreExisting: true });

      // Download and verify the manifest signature first
      const manifestContent = JSON.stringify(manifest);
      const verificationResult = await this.verifier.verifyManifest(
        manifest,
        manifestContent,
      );

      if (!verificationResult.isValid) {
        console.error(
          `[HotfixLoader] Manifest verification failed: ${verificationResult.errorMessage}`,
        );
        return false;
      }

      // Download each patch file
      for (const patch of manifest.patches) {
        const success = await this.downloadPatchFile(
          manifest.id,
          patch,
          hotfixPath,
        );
        if (!success) {
          // Clean up on failure
          await this.cleanupHotfix(manifest.id);
          return false;
        }
      }

      // Store manifest locally
      await IOUtils.writeUTF8(
        PathUtils.join(hotfixPath, "manifest.json"),
        manifestContent,
      );

      console.log(`[HotfixLoader] Hotfix downloaded successfully: ${manifest.id}`);
      return true;
    } catch (error) {
      console.error("[HotfixLoader] Download error:", error);
      await this.cleanupHotfix(manifest.id);
      return false;
    }
  }

  /**
   * Request user consent for installing a hotfix
   * Returns true if user approves, false otherwise
   */
  async requestUserConsent(
    manifest: HotfixManifest,
    signerIdentity: SignerIdentity,
  ): Promise<HotfixConsentResult> {
    // Check if we have a trusted decision stored
    const trustedDecisions = this.getTrustedDecisions();
    if (trustedDecisions[manifest.id]) {
      return {
        approved: true,
        decidedAt: new Date().toISOString(),
        rememberDecision: true,
      };
    }

    // Show consent dialog to user
    const approved = await this.showConsentDialog(manifest, signerIdentity);

    const result: HotfixConsentResult = {
      approved,
      decidedAt: new Date().toISOString(),
      rememberDecision: false, // User can opt-in to remember
    };

    return result;
  }

  /**
   * Install a hotfix after verification and consent
   */
  async installHotfix(manifest: HotfixManifest): Promise<boolean> {
    console.log(`[HotfixLoader] Installing hotfix: ${manifest.id}`);

    try {
      // Verify signature again before installation
      const manifestPath = PathUtils.join(
        this.hotfixDir,
        manifest.id,
        "manifest.json",
      );
      const manifestContent = await IOUtils.readUTF8(manifestPath);
      const storedManifest = JSON.parse(manifestContent) as HotfixManifest;

      const verificationResult = await this.verifier.verifyManifest(
        storedManifest,
        manifestContent,
      );

      if (!verificationResult.isValid) {
        console.error(
          `[HotfixLoader] Installation verification failed: ${verificationResult.errorMessage}`,
        );
        return false;
      }

      // Request user consent
      const consentResult = await this.requestUserConsent(
        storedManifest,
        verificationResult.verifiedIdentity!,
      );

      if (!consentResult.approved) {
        console.log("[HotfixLoader] User declined hotfix installation");
        return false;
      }

      // Disable original modules
      for (const patch of storedManifest.patches) {
        this.disableModule(patch.moduleName);
      }

      // Register hotfix as installed
      const installedHotfix: InstalledHotfix = {
        id: storedManifest.id,
        version: storedManifest.version,
        status: HotfixStatus.INSTALLED,
        installedAt: new Date().toISOString(),
        signerIdentity: verificationResult.verifiedIdentity!,
        disabledModules: storedManifest.patches.map((p) => p.moduleName),
        injectedModules: storedManifest.patches.map((p) => p.patchedModulePath),
      };

      this.saveInstalledHotfix(installedHotfix);

      console.log(`[HotfixLoader] Hotfix installed successfully: ${manifest.id}`);
      return true;
    } catch (error) {
      console.error("[HotfixLoader] Installation error:", error);
      return false;
    }
  }

  /**
   * Apply an installed hotfix (load patched modules)
   */
  async applyHotfix(hotfixId: string): Promise<boolean> {
    console.log(`[HotfixLoader] Applying hotfix: ${hotfixId}`);

    try {
      const manifestPath = PathUtils.join(
        this.hotfixDir,
        hotfixId,
        "manifest.json",
      );

      if (!(await IOUtils.exists(manifestPath))) {
        console.error(`[HotfixLoader] Hotfix manifest not found: ${hotfixId}`);
        return false;
      }

      const manifestContent = await IOUtils.readUTF8(manifestPath);
      const manifest = JSON.parse(manifestContent) as HotfixManifest;

      // Verify patch file hashes
      for (const patch of manifest.patches) {
        const patchPath = PathUtils.join(
          this.hotfixDir,
          hotfixId,
          patch.patchedModulePath,
        );
        const patchContent = await IOUtils.readUTF8(patchPath);
        const computedHash = await this.verifier.computeHash(patchContent);

        if (computedHash !== patch.patchedModuleHash) {
          console.error(
            `[HotfixLoader] Patch file hash mismatch: ${patch.moduleName}`,
          );
          return false;
        }
      }

      // Modules are loaded dynamically via the module loader
      // The disabled modules preference prevents original modules from loading
      // And the patched modules are loaded from the hotfix directory

      console.log(`[HotfixLoader] Hotfix applied: ${hotfixId}`);
      return true;
    } catch (error) {
      console.error("[HotfixLoader] Apply error:", error);
      return false;
    }
  }

  /**
   * Revert a hotfix (re-enable original modules)
   */
  async revertHotfix(hotfixId: string): Promise<boolean> {
    console.log(`[HotfixLoader] Reverting hotfix: ${hotfixId}`);

    try {
      const installedHotfixes = this.getInstalledHotfixes();
      const hotfix = installedHotfixes.find((h) => h.id === hotfixId);

      if (!hotfix) {
        console.error(`[HotfixLoader] Hotfix not found: ${hotfixId}`);
        return false;
      }

      // Re-enable original modules
      for (const moduleName of hotfix.disabledModules) {
        this.enableModule(moduleName);
      }

      // Update hotfix status
      hotfix.status = HotfixStatus.REVERTED;
      this.saveInstalledHotfix(hotfix);

      // Clean up hotfix files
      await this.cleanupHotfix(hotfixId);

      console.log(`[HotfixLoader] Hotfix reverted: ${hotfixId}`);
      return true;
    } catch (error) {
      console.error("[HotfixLoader] Revert error:", error);
      return false;
    }
  }

  /**
   * Get list of installed hotfixes
   */
  getInstalledHotfixes(): InstalledHotfix[] {
    try {
      const stored = Services.prefs.getStringPref(PREF_HOTFIX_INSTALLED, "[]");
      return JSON.parse(stored) as InstalledHotfix[];
    } catch {
      return [];
    }
  }

  /**
   * Check if a module is disabled by a hotfix
   */
  isModuleDisabled(moduleName: string): boolean {
    try {
      const disabled = Services.prefs.getStringPref(
        PREF_HOTFIX_DISABLED_MODULES,
        "[]",
      );
      const disabledModules = JSON.parse(disabled) as string[];
      return disabledModules.includes(moduleName);
    } catch {
      return false;
    }
  }

  /**
   * Get the path to a patched module (if any)
   */
  getPatchedModulePath(moduleName: string): string | null {
    const installedHotfixes = this.getInstalledHotfixes();

    for (const hotfix of installedHotfixes) {
      if (
        hotfix.status === HotfixStatus.INSTALLED &&
        hotfix.disabledModules.includes(moduleName)
      ) {
        const patchIndex = hotfix.disabledModules.indexOf(moduleName);
        if (patchIndex !== -1 && hotfix.injectedModules[patchIndex]) {
          return PathUtils.join(
            this.hotfixDir,
            hotfix.id,
            hotfix.injectedModules[patchIndex],
          );
        }
      }
    }

    return null;
  }

  // Private helper methods

  private async ensureHotfixDirectory(): Promise<void> {
    await IOUtils.makeDirectory(this.hotfixDir, { ignoreExisting: true });
  }

  private filterApplicableHotfixes(
    manifests: HotfixManifest[],
  ): HotfixManifest[] {
    const { NoranekoConstants } = ChromeUtils.importESModule(
      "resource://noraneko/modules/NoranekoConstants.sys.mjs",
    );
    const currentVersion = NoranekoConstants.version2 || "0.0.0";

    return manifests.filter((manifest) => {
      // Check version compatibility
      if (
        manifest.minVersion &&
        this.compareVersions(currentVersion, manifest.minVersion) < 0
      ) {
        return false;
      }
      if (
        manifest.maxVersion &&
        this.compareVersions(currentVersion, manifest.maxVersion) > 0
      ) {
        return false;
      }
      return true;
    });
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);
    const maxLen = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLen; i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  }

  private async downloadPatchFile(
    hotfixId: string,
    patch: HotfixPatch,
    hotfixPath: string,
  ): Promise<boolean> {
    try {
      const baseUrl = Services.prefs.getStringPref(
        PREF_HOTFIX_MANIFEST_URL,
        DEFAULT_MANIFEST_URL,
      );
      const patchUrl = new URL(patch.patchedModulePath, baseUrl).toString();

      const response = await fetch(patchUrl);
      if (!response.ok) {
        console.error(
          `[HotfixLoader] Failed to download patch: ${response.status}`,
        );
        return false;
      }

      const patchContent = await response.text();

      // Verify hash
      const computedHash = await this.verifier.computeHash(patchContent);
      if (computedHash !== patch.patchedModuleHash) {
        console.error(
          `[HotfixLoader] Hash mismatch for patch: ${patch.moduleName}`,
        );
        return false;
      }

      // Save patch file
      const patchFilePath = PathUtils.join(hotfixPath, patch.patchedModulePath);
      const patchDir = PathUtils.parent(patchFilePath);
      if (patchDir) {
        await IOUtils.makeDirectory(patchDir, { ignoreExisting: true });
      }
      await IOUtils.writeUTF8(patchFilePath, patchContent);

      return true;
    } catch (error) {
      console.error("[HotfixLoader] Patch download error:", error);
      return false;
    }
  }

  private async cleanupHotfix(hotfixId: string): Promise<void> {
    try {
      const hotfixPath = PathUtils.join(this.hotfixDir, hotfixId);
      if (await IOUtils.exists(hotfixPath)) {
        await IOUtils.remove(hotfixPath, { recursive: true });
      }
    } catch (error) {
      console.error("[HotfixLoader] Cleanup error:", error);
    }
  }

  private async showConsentDialog(
    manifest: HotfixManifest,
    signerIdentity: SignerIdentity,
  ): Promise<boolean> {
    // Use Services.prompt for the consent dialog
    const promptService = Services.prompt;

    const title = "Install Hotfix?";
    const message = `A verified hotfix is available for installation.

Hotfix: ${manifest.id} v${manifest.version}
Description: ${manifest.description}

Signed by: ${signerIdentity.repository}
Workflow: ${signerIdentity.workflowRef}
Issuer: ${signerIdentity.issuer}

This hotfix will:
${manifest.patches.map((p) => `• Replace module: ${p.moduleName}`).join("\n")}

Do you want to install this hotfix?`;

    const buttonFlags =
      Ci.nsIPromptService.BUTTON_POS_0 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
      Ci.nsIPromptService.BUTTON_POS_1 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
      Ci.nsIPromptService.BUTTON_POS_0_DEFAULT;

    const result = promptService.confirmEx(
      null, // parent window
      title,
      message,
      buttonFlags,
      "Trust & Install",
      "Cancel",
      "",
      null,
      {},
    );

    return result === 0; // User clicked "Trust & Install"
  }

  private disableModule(moduleName: string): void {
    const disabled = this.getDisabledModules();
    if (!disabled.includes(moduleName)) {
      disabled.push(moduleName);
      Services.prefs.setStringPref(
        PREF_HOTFIX_DISABLED_MODULES,
        JSON.stringify(disabled),
      );
    }
  }

  private enableModule(moduleName: string): void {
    const disabled = this.getDisabledModules();
    const index = disabled.indexOf(moduleName);
    if (index !== -1) {
      disabled.splice(index, 1);
      Services.prefs.setStringPref(
        PREF_HOTFIX_DISABLED_MODULES,
        JSON.stringify(disabled),
      );
    }
  }

  private getDisabledModules(): string[] {
    try {
      const stored = Services.prefs.getStringPref(
        PREF_HOTFIX_DISABLED_MODULES,
        "[]",
      );
      return JSON.parse(stored) as string[];
    } catch {
      return [];
    }
  }

  private getUnlockedCodes(): string[] {
    try {
      const stored = Services.prefs.getStringPref(
        PREF_HOTFIX_UNLOCK_CODES,
        "[]",
      );
      return JSON.parse(stored) as string[];
    } catch {
      return [];
    }
  }

  private addUnlockedCode(code: string): void {
    const codes = this.getUnlockedCodes();
    if (!codes.includes(code)) {
      codes.push(code);
      Services.prefs.setStringPref(
        PREF_HOTFIX_UNLOCK_CODES,
        JSON.stringify(codes),
      );
    }
  }

  private getTrustedDecisions(): Record<string, boolean> {
    try {
      const stored = Services.prefs.getStringPref(
        PREF_HOTFIX_TRUSTED_DECISIONS,
        "{}",
      );
      return JSON.parse(stored) as Record<string, boolean>;
    } catch {
      return {};
    }
  }

  private saveInstalledHotfix(hotfix: InstalledHotfix): void {
    const installed = this.getInstalledHotfixes();
    const existingIndex = installed.findIndex((h) => h.id === hotfix.id);

    if (existingIndex !== -1) {
      installed[existingIndex] = hotfix;
    } else {
      installed.push(hotfix);
    }

    Services.prefs.setStringPref(
      PREF_HOTFIX_INSTALLED,
      JSON.stringify(installed),
    );
  }
}

// Export singleton instance
export const hotfixLoader = new HotfixLoader();
