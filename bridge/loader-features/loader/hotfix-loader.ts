// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix Loader - Data-Oriented Programming Style
 * 
 * Julia/Kotlin-like functional patterns:
 * - Module-level state (data) + pure functions
 * - Result type: [value, error] tuple (Julia style)
 * - No classes, just data and functions
 * 
 * Implements the "Disable & Inject" pattern for non-destructive module patching.
 */

import {
  type HotfixAutoUpdateConfig,
  type HotfixConsentResult,
  type HotfixManifest,
  type HotfixPatch,
  type InstalledHotfix,
  type SignerIdentity,
  type VerificationResult,
  DEFAULT_AUTO_UPDATE_CONFIG,
  HotfixStatus,
  UpdateChannel,
} from "./hotfix-types.ts";
import {
  verifyManifest,
  computeHash as computeSignatureHash,
} from "./hotfix-verifier.ts";

// ============================================================================
// Constants - Preference Keys
// ============================================================================

const PREF_HOTFIX_INSTALLED = "noraneko.hotfix.installed";
const PREF_HOTFIX_DISABLED_MODULES = "noraneko.hotfix.disabled_modules";
const PREF_HOTFIX_UNLOCK_CODES = "noraneko.hotfix.unlock_codes";
const PREF_HOTFIX_TRUSTED_DECISIONS = "noraneko.hotfix.trusted_decisions";
const PREF_HOTFIX_AUTO_UPDATE_CONFIG = "noraneko.hotfix.auto_update_config";
const PREF_HOTFIX_MANIFEST_URL = "noraneko.hotfix.manifest_url";
const DEFAULT_MANIFEST_URL = "https://raw.githubusercontent.com/noraneko-browser/noraneko/main/hotfixes/manifest.json";

// ============================================================================
// Module State - Data (Julia-like module-level state)
// ============================================================================

/** Hotfix directory path */
let _hotfixDir: string | null = null;

/** Profile directory path */
let _profileDir: string | null = null;

/** Current update channel */
let _currentChannel: UpdateChannel = UpdateChannel.DEFAULT;

/** Auto-update timer handle */
let _autoUpdateTimer: number | null = null;

// ============================================================================
// Pure Functions - Path & Directory Helpers
// ============================================================================

/** Get profile directory path (lazy init) */
const getProfileDir = (): string => {
  if (!_profileDir) {
    _profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
  }
  return _profileDir;
};

/** Get hotfix directory path (lazy init) */
const getHotfixDir = (): string => {
  if (!_hotfixDir) {
    _hotfixDir = PathUtils.join(getProfileDir(), "noraneko-hotfixes");
  }
  return _hotfixDir;
};

/** Get hotfix-specific directory path */
const getHotfixPath = (hotfixId: string): string =>
  PathUtils.join(getHotfixDir(), hotfixId);

/** Get manifest path for a hotfix */
const getManifestPath = (hotfixId: string): string =>
  PathUtils.join(getHotfixPath(hotfixId), "manifest.json");

/** Ensure hotfix directory exists */
const ensureHotfixDirectory = async (): Promise<void> => {
  await IOUtils.makeDirectory(getHotfixDir(), { ignoreExisting: true });
};

// ============================================================================
// Pure Functions - Channel Detection
// ============================================================================

/** Detect current update channel */
const detectUpdateChannel = (): UpdateChannel => {
  try {
    const { AppConstants } = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs",
    ) as { AppConstants: { MOZ_UPDATE_CHANNEL?: string } };

    const channel = AppConstants.MOZ_UPDATE_CHANNEL || "default";
    const channelLower = String(channel).toLowerCase();

    if (channelLower.includes("nightly")) return UpdateChannel.NIGHTLY;
    if (channelLower.includes("beta")) return UpdateChannel.BETA;
    if (channelLower.includes("release")) return UpdateChannel.RELEASE;

    return UpdateChannel.DEFAULT;
  } catch {
    return UpdateChannel.DEFAULT;
  }
};

// ============================================================================
// Pure Functions - Preference Helpers
// ============================================================================

/** Get installed hotfixes from preferences */
export const getInstalledHotfixes = (): InstalledHotfix[] => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HOTFIX_INSTALLED, "[]");
    return JSON.parse(stored) as InstalledHotfix[];
  } catch {
    return [];
  }
};

/** Save installed hotfix to preferences */
const saveInstalledHotfix = (hotfix: InstalledHotfix): void => {
  const installed = getInstalledHotfixes();
  const existingIndex = installed.findIndex((h) => h.id === hotfix.id);

  if (existingIndex !== -1) {
    installed[existingIndex] = hotfix;
  } else {
    installed.push(hotfix);
  }

  Services.prefs.setStringPref(PREF_HOTFIX_INSTALLED, JSON.stringify(installed));
};

/** Get disabled modules list */
const getDisabledModules = (): string[] => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HOTFIX_DISABLED_MODULES, "[]");
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
};

/** Check if module is disabled by hotfix */
export const isModuleDisabled = (moduleName: string): boolean =>
  getDisabledModules().includes(moduleName);

/** Disable a module */
const disableModule = (moduleName: string): void => {
  const disabled = getDisabledModules();
  if (!disabled.includes(moduleName)) {
    disabled.push(moduleName);
    Services.prefs.setStringPref(PREF_HOTFIX_DISABLED_MODULES, JSON.stringify(disabled));
  }
};

/** Enable a module */
const enableModule = (moduleName: string): void => {
  const disabled = getDisabledModules();
  const index = disabled.indexOf(moduleName);
  if (index !== -1) {
    disabled.splice(index, 1);
    Services.prefs.setStringPref(PREF_HOTFIX_DISABLED_MODULES, JSON.stringify(disabled));
  }
};

/** Get unlocked codes */
const getUnlockedCodes = (): string[] => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HOTFIX_UNLOCK_CODES, "[]");
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
};

/** Add unlocked code */
const addUnlockedCode = (code: string): void => {
  const codes = getUnlockedCodes();
  if (!codes.includes(code)) {
    codes.push(code);
    Services.prefs.setStringPref(PREF_HOTFIX_UNLOCK_CODES, JSON.stringify(codes));
  }
};

/** Get trusted decisions */
const getTrustedDecisions = (): Record<string, boolean> => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HOTFIX_TRUSTED_DECISIONS, "{}");
    return JSON.parse(stored) as Record<string, boolean>;
  } catch {
    return {};
  }
};

/** Get auto-update config */
const getAutoUpdateConfig = (): HotfixAutoUpdateConfig => {
  try {
    const stored = Services.prefs.getStringPref(
      PREF_HOTFIX_AUTO_UPDATE_CONFIG,
      JSON.stringify(DEFAULT_AUTO_UPDATE_CONFIG),
    );
    return JSON.parse(stored) as HotfixAutoUpdateConfig;
  } catch {
    return DEFAULT_AUTO_UPDATE_CONFIG;
  }
};

/** Save auto-update config */
const saveAutoUpdateConfig = (config: HotfixAutoUpdateConfig): void => {
  Services.prefs.setStringPref(PREF_HOTFIX_AUTO_UPDATE_CONFIG, JSON.stringify(config));
};

// ============================================================================
// Pure Functions - Version Comparison
// ============================================================================

/** Compare semantic versions: -1 if a < b, 0 if equal, 1 if a > b */
const compareVersions = (a: string, b: string): number => {
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
};

/** Filter hotfixes applicable to current version and channel */
const filterApplicableHotfixes = (manifests: HotfixManifest[]): HotfixManifest[] => {
  const { NoranekoConstants } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NoranekoConstants.sys.mjs",
  );
  const currentVersion = (NoranekoConstants?.version2 != null && NoranekoConstants.version2 !== "")
    ? String(NoranekoConstants.version2)
    : "0.0.0";

  return manifests.filter((manifest) => {
    // Check channel compatibility
    if (manifest.targetChannels && manifest.targetChannels.length > 0) {
      if (!manifest.targetChannels.includes(_currentChannel)) {
        console.log(`[HotfixLoader] Hotfix ${manifest.id} not applicable to channel ${_currentChannel}`);
        return false;
      }
    }

    // Check version compatibility
    if (manifest.minVersion && compareVersions(currentVersion, manifest.minVersion) < 0) {
      return false;
    }
    if (manifest.maxVersion && compareVersions(currentVersion, manifest.maxVersion) > 0) {
      return false;
    }
    return true;
  });
};

// ============================================================================
// Pure Functions - Fetching & Downloading
// ============================================================================

/** Fetch available hotfixes from server */
export const fetchAvailableHotfixes = async (): Promise<HotfixManifest[]> => {
  try {
    const manifestUrl = Services.prefs.getStringPref(PREF_HOTFIX_MANIFEST_URL, DEFAULT_MANIFEST_URL);
    const response = await fetch(manifestUrl);
    
    if (!response.ok) {
      console.error(`[HotfixLoader] Failed to fetch manifest: ${response.status}`);
      return [];
    }

    const manifests = (await response.json()) as HotfixManifest[];
    return filterApplicableHotfixes(manifests);
  } catch (error) {
    console.error("[HotfixLoader] Error fetching hotfixes:", error);
    return [];
  }
};

/** Download a patch file */
const downloadPatchFile = async (
  hotfixId: string,
  patch: HotfixPatch,
  hotfixPath: string,
): Promise<boolean> => {
  try {
    const baseUrl = Services.prefs.getStringPref(PREF_HOTFIX_MANIFEST_URL, DEFAULT_MANIFEST_URL);
    const patchUrl = new URL(patch.patchedModulePath, baseUrl).toString();

    const response = await fetch(patchUrl);
    if (!response.ok) {
      console.error(`[HotfixLoader] Failed to download patch: ${response.status}`);
      return false;
    }

    const patchContent = await response.text();

    // Verify hash
    const computedHash = await computeSignatureHash(patchContent);
    if (computedHash !== patch.patchedModuleHash) {
      console.error(`[HotfixLoader] Hash mismatch for patch: ${patch.moduleName}`);
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
};

/** Download a hotfix */
export const downloadHotfix = async (manifest: HotfixManifest): Promise<boolean> => {
  console.log(`[HotfixLoader] Downloading hotfix: ${manifest.id}`);

  try {
    const hotfixPath = getHotfixPath(manifest.id);
    await IOUtils.makeDirectory(hotfixPath, { ignoreExisting: true });

    // Verify manifest signature
    const manifestContent = JSON.stringify(manifest);
    const verificationResult = await verifyManifest(manifest, manifestContent);

    if (!verificationResult.isValid) {
      console.error(`[HotfixLoader] Manifest verification failed: ${verificationResult.errorMessage}`);
      return false;
    }

    // Download each patch file
    for (const patch of manifest.patches) {
      const success = await downloadPatchFile(manifest.id, patch, hotfixPath);
      if (!success) {
        await cleanupHotfix(manifest.id);
        return false;
      }
    }

    // Store manifest locally
    await IOUtils.writeUTF8(PathUtils.join(hotfixPath, "manifest.json"), manifestContent);

    console.log(`[HotfixLoader] Hotfix downloaded successfully: ${manifest.id}`);
    return true;
  } catch (error) {
    console.error("[HotfixLoader] Download error:", error);
    await cleanupHotfix(manifest.id);
    return false;
  }
};

/** Cleanup hotfix files */
const cleanupHotfix = async (hotfixId: string): Promise<void> => {
  try {
    const hotfixPath = getHotfixPath(hotfixId);
    if (await IOUtils.exists(hotfixPath)) {
      await IOUtils.remove(hotfixPath, { recursive: true });
    }
  } catch (error) {
    console.error("[HotfixLoader] Cleanup error:", error);
  }
};

// ============================================================================
// Pure Functions - User Consent & Dialogs
// ============================================================================

/** Show consent dialog for hotfix installation */
const showConsentDialog = async (
  manifest: HotfixManifest,
  signerIdentity: SignerIdentity,
  isVerified: boolean = true,
): Promise<boolean> => {
  const promptService = Services.prompt;

  const verificationStatus = isVerified
    ? "✓ Signature verified and trusted"
    : "⚠️ WARNING: Signature verification failed";

  const title = isVerified ? "Install Hotfix?" : "⚠️ Install Unverified Hotfix?";
  const message = `${isVerified ? "A verified" : "An UNVERIFIED"} hotfix is available for installation.

${verificationStatus}

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
    null,
    title,
    message,
    buttonFlags,
    "Trust & Install",
    "Cancel",
    "",
    null,
    {},
  );

  return result === 0;
};

/** Ask user about failed verification */
const askUserAboutFailedVerification = async (
  manifest: HotfixManifest,
  errorMessage: string,
): Promise<boolean> => {
  const promptService = Services.prompt;

  const title = "⚠️ Hotfix Verification Failed";
  const message = `WARNING: The signature verification for hotfix "${manifest.id}" has failed.

Error: ${errorMessage}

This hotfix may not be from a trusted source and could be potentially dangerous.

Do you want to apply this hotfix anyway?

IMPORTANT: It is strongly recommended to choose "Don't Apply" unless you trust this hotfix from a verified source.`;

  const buttonFlags =
    Ci.nsIPromptService.BUTTON_POS_0 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
    Ci.nsIPromptService.BUTTON_POS_1 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
    Ci.nsIPromptService.BUTTON_POS_1_DEFAULT;

  const result = promptService.confirmEx(
    null,
    title,
    message,
    buttonFlags,
    "Apply Anyway (Not Recommended)",
    "Don't Apply (Recommended)",
    "",
    null,
    {},
  );

  return result === 0;
};

/** Request user consent for hotfix */
export const requestUserConsent = async (
  manifest: HotfixManifest,
  signerIdentity: SignerIdentity,
  isVerified: boolean = true,
): Promise<HotfixConsentResult> => {
  if (isVerified) {
    const trustedDecisions = getTrustedDecisions();
    if (trustedDecisions[manifest.id]) {
      return {
        approved: true,
        decidedAt: new Date().toISOString(),
        rememberDecision: true,
      };
    }
  }

  const approved = await showConsentDialog(manifest, signerIdentity, isVerified);

  return {
    approved,
    decidedAt: new Date().toISOString(),
    rememberDecision: false,
  };
};

/** Notify user that restart is required */
const notifyRestartRequired = (manifest: HotfixManifest): void => {
  const promptService = Services.prompt;
  const title = "Restart Required";
  const message = `Hotfix "${manifest.id}" has been installed successfully.\n\nA browser restart is required to apply the changes.\n\nWould you like to restart now?`;

  const buttonFlags =
    Ci.nsIPromptService.BUTTON_POS_0 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
    Ci.nsIPromptService.BUTTON_POS_1 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING;

  const result = promptService.confirmEx(
    null,
    title,
    message,
    buttonFlags,
    "Restart Now",
    "Restart Later",
    "",
    null,
    {},
  );

  if (result === 0) {
    Services.startup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
  }
};

// ============================================================================
// Pure Functions - Installation & Application
// ============================================================================

/** Install a hotfix after verification and consent */
export const installHotfix = async (manifest: HotfixManifest): Promise<boolean> => {
  console.log(`[HotfixLoader] Installing hotfix: ${manifest.id}`);

  try {
    const manifestPath = getManifestPath(manifest.id);
    const manifestContent = await IOUtils.readUTF8(manifestPath);
    const storedManifest = JSON.parse(manifestContent) as HotfixManifest;

    const verificationResult = await verifyManifest(storedManifest, manifestContent);

    if (!verificationResult.isValid) {
      console.error(`[HotfixLoader] Installation verification failed: ${verificationResult.errorMessage}`);
      
      const applyAnyway = await askUserAboutFailedVerification(
        storedManifest,
        verificationResult.errorMessage || "Unknown verification error",
      );
      
      if (!applyAnyway) {
        console.log("[HotfixLoader] User declined to apply unverified hotfix");
        return false;
      }
      
      console.warn("[HotfixLoader] User chose to apply unverified hotfix (not recommended)");
    }

    const consentResult = await requestUserConsent(
      storedManifest,
      verificationResult.verifiedIdentity || {
        issuer: "Unknown",
        subject: "Unknown",
        repository: "Unknown",
        workflowRef: "Unknown",
      },
      verificationResult.isValid,
    );

    if (!consentResult.approved) {
      console.log("[HotfixLoader] User declined hotfix installation");
      return false;
    }

    // Disable original modules
    for (const patch of storedManifest.patches) {
      disableModule(patch.moduleName);
    }

    // Register hotfix as installed
    const installedHotfix: InstalledHotfix = {
      id: storedManifest.id,
      version: storedManifest.version,
      status: HotfixStatus.INSTALLED,
      installedAt: new Date().toISOString(),
      signerIdentity: verificationResult.verifiedIdentity || {
        issuer: "Unknown",
        subject: "Unknown",
        repository: "Unknown",
        workflowRef: "Unknown",
      },
      disabledModules: storedManifest.patches.map((p) => p.moduleName),
      injectedModules: storedManifest.patches.map((p) => p.patchedModulePath),
    };

    saveInstalledHotfix(installedHotfix);

    console.log(`[HotfixLoader] Hotfix installed successfully: ${manifest.id}`);
    return true;
  } catch (error) {
    console.error("[HotfixLoader] Installation error:", error);
    return false;
  }
};

/** Apply an installed hotfix */
export const applyHotfix = async (hotfixId: string): Promise<boolean> => {
  console.log(`[HotfixLoader] Applying hotfix: ${hotfixId}`);

  try {
    const manifestPath = getManifestPath(hotfixId);

    if (!(await IOUtils.exists(manifestPath))) {
      console.error(`[HotfixLoader] Hotfix manifest not found: ${hotfixId}`);
      return false;
    }

    const manifestContent = await IOUtils.readUTF8(manifestPath);
    const manifest = JSON.parse(manifestContent) as HotfixManifest;

    // Verify patch file hashes
    for (const patch of manifest.patches) {
      const patchPath = PathUtils.join(getHotfixPath(hotfixId), patch.patchedModulePath);
      const patchContent = await IOUtils.readUTF8(patchPath);
      const computedHash = await computeSignatureHash(patchContent);

      if (computedHash !== patch.patchedModuleHash) {
        console.error(`[HotfixLoader] Patch file hash mismatch: ${patch.moduleName}`);
        return false;
      }
    }

    console.log(`[HotfixLoader] Hotfix applied: ${hotfixId}`);
    return true;
  } catch (error) {
    console.error("[HotfixLoader] Apply error:", error);
    return false;
  }
};

/** Revert a hotfix */
export const revertHotfix = async (hotfixId: string): Promise<boolean> => {
  console.log(`[HotfixLoader] Reverting hotfix: ${hotfixId}`);

  try {
    const installedHotfixes = getInstalledHotfixes();
    const hotfix = installedHotfixes.find((h) => h.id === hotfixId);

    if (!hotfix) {
      console.error(`[HotfixLoader] Hotfix not found: ${hotfixId}`);
      return false;
    }

    // Re-enable original modules
    for (const moduleName of hotfix.disabledModules) {
      enableModule(moduleName);
    }

    // Update hotfix status
    hotfix.status = HotfixStatus.REVERTED;
    saveInstalledHotfix(hotfix);

    // Clean up hotfix files
    await cleanupHotfix(hotfixId);

    console.log(`[HotfixLoader] Hotfix reverted: ${hotfixId}`);
    return true;
  } catch (error) {
    console.error("[HotfixLoader] Revert error:", error);
    return false;
  }
};

/** Get patched module path */
export const getPatchedModulePath = (moduleName: string): string | null => {
  const installedHotfixes = getInstalledHotfixes();

  for (const hotfix of installedHotfixes) {
    if (hotfix.status === HotfixStatus.INSTALLED && hotfix.disabledModules.includes(moduleName)) {
      const patchIndex = hotfix.disabledModules.indexOf(moduleName);
      if (patchIndex !== -1 && hotfix.injectedModules[patchIndex]) {
        return PathUtils.join(getHotfixDir(), hotfix.id, hotfix.injectedModules[patchIndex]);
      }
    }
  }

  return null;
};

// ============================================================================
// Pure Functions - Unlock Code Validation
// ============================================================================

/** Validate unlock code and get associated hotfix */
export const validateUnlockCode = async (code: string): Promise<HotfixManifest | null> => {
  const normalizedCode = code.toUpperCase().trim();

  const unlockedCodes = getUnlockedCodes();
  if (unlockedCodes.includes(normalizedCode)) {
    const manifests = await fetchAvailableHotfixes();
    return manifests.find((m) => m.unlockCode === normalizedCode) ?? null;
  }

  const manifests = await fetchAvailableHotfixes();
  const manifest = manifests.find((m) => m.unlockCode === normalizedCode);

  if (manifest) {
    addUnlockedCode(normalizedCode);
    return manifest;
  }

  return null;
};

// ============================================================================
// Pure Functions - Auto-Update
// ============================================================================

/** Check for updates */
const checkForUpdates = async (): Promise<void> => {
  console.log("[HotfixLoader] Checking for hotfix updates...");

  try {
    const config = getAutoUpdateConfig();
    config.lastCheckTime = new Date().toISOString();
    saveAutoUpdateConfig(config);

    const manifests = await fetchAvailableHotfixes();

    if (manifests.length === 0) {
      console.log("[HotfixLoader] No hotfixes available");
      return;
    }

    const installedHotfixes = getInstalledHotfixes();
    const installedIds = new Set(
      installedHotfixes
        .filter((h) => h.status === HotfixStatus.INSTALLED)
        .map((h) => h.id),
    );

    const newHotfixes = manifests.filter((m) => !installedIds.has(m.id));

    if (newHotfixes.length === 0) {
      console.log("[HotfixLoader] No new hotfixes available");
      return;
    }

    console.log(`[HotfixLoader] Found ${newHotfixes.length} new hotfix(es)`);

    for (const manifest of newHotfixes) {
      await promptAndInstallHotfix(manifest);
    }
  } catch (error) {
    console.error("[HotfixLoader] Error checking for updates:", error);
  }
};

/** Prompt and install a hotfix */
const promptAndInstallHotfix = async (manifest: HotfixManifest): Promise<void> => {
  try {
    const downloaded = await downloadHotfix(manifest);
    if (!downloaded) {
      console.error(`[HotfixLoader] Failed to download hotfix: ${manifest.id}`);
      return;
    }

    const installed = await installHotfix(manifest);
    if (installed) {
      console.log(`[HotfixLoader] Successfully installed hotfix: ${manifest.id}`);
      notifyRestartRequired(manifest);
    } else {
      console.log(`[HotfixLoader] Hotfix installation declined or failed: ${manifest.id}`);
      await cleanupHotfix(manifest.id);
    }
  } catch (error) {
    console.error(`[HotfixLoader] Error installing hotfix ${manifest.id}:`, error);
  }
};

/** Start auto-update checking */
const startAutoUpdateChecking = async (): Promise<void> => {
  const config = getAutoUpdateConfig();

  if (!config.enabled) {
    console.log("[HotfixLoader] Automatic update checking is disabled");
    return;
  }

  console.log("[HotfixLoader] Starting automatic update checking for nightly channel");

  const now = Date.now();
  const lastCheck = new Date(config.lastCheckTime).getTime();
  const timeSinceLastCheck = now - lastCheck;

  if (timeSinceLastCheck >= config.checkInterval) {
    await checkForUpdates();
  }

  _autoUpdateTimer = setInterval(async () => {
    await checkForUpdates();
  }, config.checkInterval);
};

/** Stop auto-update checking */
export const stopAutoUpdateChecking = (): void => {
  if (_autoUpdateTimer !== null) {
    clearInterval(_autoUpdateTimer);
    _autoUpdateTimer = null;
    console.log("[HotfixLoader] Stopped automatic update checking");
  }
};

// ============================================================================
// Pure Functions - Hotswap Integration
// ============================================================================

/** Hotswap modules with hash-based detection */
export const hotswapModules = async (hotfixId: string): Promise<boolean> => {
  console.log(`[HotfixLoader] Starting hotswap for hotfix: ${hotfixId}`);

  try {
    const applied = await applyHotfix(hotfixId);
    if (!applied) {
      console.error(`[HotfixLoader] Failed to apply hotfix before hotswap: ${hotfixId}`);
      return false;
    }

    const manifestPath = getManifestPath(hotfixId);
    const manifestContent = await IOUtils.readUTF8(manifestPath);
    const manifest = JSON.parse(manifestContent) as HotfixManifest;
    const modulePaths = manifest.patches.map((p) => p.patchedModulePath);

    // Import hotswap functions via ChromeUtils to avoid circular imports
    const loader = ChromeUtils.importESModule(
      "chrome://noraneko-startup/content/features-chrome/core.js",
    );

    if (loader.hotswapWithHashDetection && typeof loader.hotswapWithHashDetection === "function") {
      console.log("[HotfixLoader] Using hash-based hotswap detection");
      const success = await loader.hotswapWithHashDetection(hotfixId, modulePaths);
      if (success) {
        console.log(`[HotfixLoader] Hash-based hotswap successful for hotfix: ${hotfixId}`);
        return true;
      } else {
        console.error(`[HotfixLoader] Hash-based hotswap failed for hotfix: ${hotfixId}`);
        return false;
      }
    }

    if (loader.hotswapModules && typeof loader.hotswapModules === "function") {
      console.log("[HotfixLoader] Falling back to regular hotswap");
      const success = await loader.hotswapModules(hotfixId);
      if (success) {
        console.log(`[HotfixLoader] Hotswap successful for hotfix: ${hotfixId}`);
        return true;
      } else {
        console.error(`[HotfixLoader] Hotswap failed for hotfix: ${hotfixId}`);
        return false;
      }
    }

    console.warn("[HotfixLoader] Loader does not support hotswap, restart required");
    notifyRestartRequired({ id: hotfixId } as HotfixManifest);
    return false;
  } catch (error) {
    console.error("[HotfixLoader] Hotswap error:", error);
    return false;
  }
};

// ============================================================================
// Public API - Initialization
// ============================================================================

/** Initialize the hotfix system */
export const initializeHotfixSystem = async (): Promise<void> => {
  console.log("[HotfixLoader] Initializing hotfix system...");

  _currentChannel = detectUpdateChannel();
  console.log(`[HotfixLoader] Detected update channel: ${_currentChannel}`);

  await ensureHotfixDirectory();

  // Load and apply any installed hotfixes
  const installedHotfixes = getInstalledHotfixes();
  for (const hotfix of installedHotfixes) {
    if (hotfix.status === HotfixStatus.INSTALLED) {
      await applyHotfix(hotfix.id);
    }
  }

  // Start automatic update checking for nightly channel
  if (_currentChannel === UpdateChannel.NIGHTLY) {
    await startAutoUpdateChecking();
  }

  console.log("[HotfixLoader] Hotfix system initialized");
};

/** Get current update channel */
export const getCurrentChannel = (): UpdateChannel => _currentChannel;
