// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Core
 *
 * File system IO, browser API interactions, crypto/verification,
 * and hash comparison logic.
 */

import { SigstoreVerifier } from "@freedomofpress/sigstore-browser";
import { NMA_PATHS } from "./state.ts";
import { getNMATrustedConfig } from "./state.ts";
import {
  type HashState,
  type HashComparisonResult,
  type HotswapRecommendation,
  type ModuleHashInfo,
  type NMAManifest,
  type NMAVerificationResult,
  type NMATrustedConfig,
  type SignerIdentity,
  type SigstoreBundle,
  NMAVerificationStatus,
  HotswapMode,
  UpdateChannel,
} from "./types.ts";

// Preference Keys
const PREF_HASH_STATE = "noraneko.nma.hash_state";

// ============================================================================
// File System IO
// ============================================================================

export const getInstallDir = (): string =>
  Services.dirsvc.get("GreD", Ci.nsIFile).path;

export const getProfileDir = (): string =>
  Services.dirsvc.get("ProfD", Ci.nsIFile).path;

/**
 * Register NMA directory as resource://noraneko-nma/ so jar: URLs are trusted
 * by ChromeUtils.importESModule.
 */
export const registerNMAResource = (nmaPath: string): void => {
  const resProto = Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler);
  const nmaFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  nmaFile.initWithPath(nmaPath);
  const jarURI = Services.io.newURI("jar:" + Services.io.newFileURI(nmaFile).spec + "!/");
  resProto.setSubstitution("noraneko-nma", jarURI);
};

export const resolveNMAPath = async (): Promise<string | null> => {
  const installDir = getInstallDir();
  const validFiles: { path: string; type: string; version: string; priority: number }[] = [];

  try {
    const children = await IOUtils.getChildren(installDir);
    for (const path of children) {
      const match = PathUtils.filename(path).match(NMA_PATHS.FILE_PATTERN);
      if (match) {
        const [, type, version] = match;
        const priority =
          type === "hotfix" ? 100 :
          type === "stable" ? 50 :
          type === "beta" ? 40 :
          type === "nightly" ? 30 : 10;
        validFiles.push({ path, type, version, priority });
      }
    }
  } catch (e) {
    console.error("[NMA] Failed to scan install dir:", e);
  }

  validFiles.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    try { return Services.vc.compare(b.version, a.version); }
    catch { return b.version.localeCompare(a.version); }
  });

  return validFiles[0]?.path ?? null;
};

export const readTextFile = async (path: string): Promise<string> =>
  IOUtils.readUTF8(path);

export const writeTextFile = async (path: string, content: string): Promise<void> =>
  IOUtils.writeUTF8(path, content);

export const makeDirectory = async (path: string): Promise<void> =>
  IOUtils.makeDirectory(path, { ignoreExisting: true });

export const removeFileOrDir = async (path: string): Promise<void> => {
  if (await IOUtils.exists(path)) await IOUtils.remove(path, { recursive: true });
};

export const readFromZip = async (zipPath: string, internalPath: string): Promise<string> => {
  const url = `jar:file://${PathUtils.normalize(zipPath)}!/${internalPath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to read from zip: ${response.status}`);
  return response.text();
};

export const getNMAModulePath = (nmaDir: string, buildId: string, modulePath: string): string =>
  PathUtils.join(nmaDir, buildId, modulePath);

// ============================================================================
// Network IO
// ============================================================================

export const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return response.json() as unknown as T;
};

export const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return response.text();
};

// ============================================================================
// Preferences IO
// ============================================================================

export const getStoredHashState = (): HashState | null => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HASH_STATE, "");
    return stored ? JSON.parse(stored) as HashState : null;
  } catch { return null; }
};

export const saveHashState = (state: HashState): void =>
  Services.prefs.setStringPref(PREF_HASH_STATE, JSON.stringify(state));

export const clearHashState = (): void =>
  Services.prefs.clearUserPref(PREF_HASH_STATE);

// ============================================================================
// Browser API IO
// ============================================================================

export const detectUpdateChannel = (): UpdateChannel => {
  try {
    const { AppConstants } = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs",
    ) as { AppConstants: { MOZ_UPDATE_CHANNEL?: string } };
    const channel = String(AppConstants.MOZ_UPDATE_CHANNEL || "").toLowerCase();
    if (channel.includes("nightly")) return UpdateChannel.NIGHTLY;
    if (channel.includes("beta")) return UpdateChannel.BETA;
    if (channel.includes("release")) return UpdateChannel.RELEASE;
    return UpdateChannel.DEFAULT;
  } catch { return UpdateChannel.DEFAULT; }
};

export const loadModule = async (url: string): Promise<Record<string, unknown>> =>
  await import(url);

export const restartBrowser = (): void =>
  Services.startup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);

// ============================================================================
// Crypto Helpers
// ============================================================================

export const computeSha256 = async (content: string | Uint8Array): Promise<string> => {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const computeFileHash = async (filePath: string): Promise<string | null> => {
  try {
    return await computeSha256(await readTextFile(filePath));
  } catch (error) {
    console.warn(`[NMA] Failed to read file for hashing: ${filePath}`, error);
    return null;
  }
};

const matchGlobPattern = (pattern: string, value: string): boolean =>
  new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  ).test(value);

const isValidBase64 = (str: string): boolean => {
  if (!str || typeof str !== "string") return false;
  return /^[A-Za-z0-9+/=]+$|^[A-Za-z0-9_-]+=*$/.test(str) &&
    str.replace(/=+$/, "").length % 4 !== 1;
};

const parseSigstoreBundle = (bundle: SigstoreBundle): Record<string, unknown> | null => {
  try {
    if (!bundle.bundle || !isValidBase64(bundle.bundle)) return null;
    const parsed = JSON.parse(atob(bundle.bundle));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
};

// ============================================================================
// Verification
// ============================================================================

let _verifierInstance: SigstoreVerifier | null = null;

const getVerifier = async (): Promise<SigstoreVerifier> => {
  if (_verifierInstance) return _verifierInstance;
  try {
    _verifierInstance = new SigstoreVerifier({ tlogThreshold: 1, ctlogThreshold: 1, tsaThreshold: 0 });
    await _verifierInstance.loadSigstoreRootWithTUF();
    return _verifierInstance;
  } catch (error) {
    console.error("[NMA] Failed to initialize verifier:", error);
    throw new Error("Failed to initialize Sigstore verifier");
  }
};

const checkIdentity = (
  identity: SignerIdentity,
  config: NMATrustedConfig,
): { isValid: boolean; error?: string } => {
  if (!config.allowedIssuers.includes(identity.issuer))
    return { isValid: false, error: `Untrusted OIDC issuer: ${identity.issuer}` };
  if (!config.allowedRepositories.some((p) => matchGlobPattern(p, identity.repository)))
    return { isValid: false, error: `Untrusted repository: ${identity.repository}` };
  if (!config.allowedWorkflows.some((p) => matchGlobPattern(p, identity.workflowRef)))
    return { isValid: false, error: `Untrusted workflow: ${identity.workflowRef}` };
  return { isValid: true };
};

export const verifyNMAIdentity = (
  identity: SignerIdentity,
  config: NMATrustedConfig,
): NMAVerificationResult => {
  const result = checkIdentity(identity, config);
  if (!result.isValid)
    return { isValid: false, status: NMAVerificationStatus.UNTRUSTED_SIGNER, errorMessage: result.error };
  return { isValid: true, status: NMAVerificationStatus.VALID, verifiedIdentity: identity };
};

export const verifyNMAManifest = async (
  manifest: NMAManifest,
  manifestContent: string,
): Promise<NMAVerificationResult> => {
  try {
    const bundle = parseSigstoreBundle(manifest.sigstoreBundle);
    if (!bundle)
      return { isValid: false, status: NMAVerificationStatus.INVALID_MANIFEST, errorMessage: "Failed to parse Sigstore bundle" };

    const config = getNMATrustedConfig();
    const identityResult = verifyNMAIdentity(manifest.sigstoreBundle.signerIdentity, config);
    if (!identityResult.isValid) return identityResult;

    const verifier = await getVerifier();
    const manifestBytes = new TextEncoder().encode(manifestContent);

    try {
      await verifier.verifyArtifact(
        manifest.sigstoreBundle.signerIdentity.subject,
        manifest.sigstoreBundle.signerIdentity.issuer,
        // @ts-expect-error: Bundle type mismatch in lib
        bundle,
        manifestBytes,
      );
      return { isValid: true, status: NMAVerificationStatus.VALID, verifiedIdentity: manifest.sigstoreBundle.signerIdentity, manifest };
    } catch (e: unknown) {
      const error = e as Error;
      return {
        isValid: false,
        status: NMAVerificationStatus.SIGNATURE_INVALID,
        errorMessage: error.message?.includes("certificate") ? "Certificate error" : error.message,
      };
    }
  } catch (error) {
    return { isValid: false, status: NMAVerificationStatus.UNKNOWN_ERROR, errorMessage: String(error) };
  }
};

// ============================================================================
// Hashing & Hotswap Analysis
// ============================================================================

export const extractModuleName = (filePath: string): string => {
  const fileName = filePath.split("/").pop() || filePath;
  return fileName.replace(/\.(sys\.)?(m?[jt]sx?)$/, "");
};

export const computeNMAHashState = async (
  nmaDir: string,
  buildId: string,
  modulePaths: string[],
): Promise<HashState> => {
  const moduleHashes: Record<string, ModuleHashInfo> = {};
  const now = Date.now();

  for (const modulePath of modulePaths) {
    const fullPath = getNMAModulePath(nmaDir, buildId, modulePath);
    const hash = await computeFileHash(fullPath);
    if (hash) {
      const moduleName = extractModuleName(modulePath);
      moduleHashes[moduleName] = { moduleName, hash, lastComputed: now };
    }
  }

  return { denoLockHash: "", moduleHashes, computedAt: now };
};

/** @deprecated Use computeNMAHashState */
export const computeHotfixHashState = computeNMAHashState;

export const compareHashStates = (
  oldState: HashState | null,
  newState: HashState,
): HashComparisonResult => {
  if (!oldState) {
    return {
      denoLockChanged: true,
      changedModules: [],
      newModules: Object.keys(newState.moduleHashes),
      removedModules: [],
      hasChanges: true,
    };
  }

  const oldNames = new Set(Object.keys(oldState.moduleHashes));
  const newNames = new Set(Object.keys(newState.moduleHashes));
  const changedModules: string[] = [];
  const newModules: string[] = [];
  const removedModules: string[] = [];

  for (const name of newNames) {
    if (!oldNames.has(name)) newModules.push(name);
    else if (oldState.moduleHashes[name].hash !== newState.moduleHashes[name].hash)
      changedModules.push(name);
  }
  for (const name of oldNames) {
    if (!newNames.has(name)) removedModules.push(name);
  }

  const denoLockChanged = oldState.denoLockHash !== newState.denoLockHash;
  return {
    denoLockChanged,
    changedModules,
    newModules,
    removedModules,
    hasChanges: denoLockChanged || changedModules.length > 0 || newModules.length > 0 || removedModules.length > 0,
  };
};

export const getHotswapRecommendation = (
  comparison: HashComparisonResult,
): HotswapRecommendation => {
  if (!comparison.hasChanges)
    return { mode: HotswapMode.NONE, modulesToReload: [], reason: "No changes detected" };
  if (comparison.denoLockChanged)
    return { mode: HotswapMode.FULL, modulesToReload: [], reason: "deno.lock changed - dependency updates require full module reload" };
  const modulesToReload = [...comparison.changedModules, ...comparison.newModules];
  return { mode: HotswapMode.SELECTIVE, modulesToReload, reason: `${modulesToReload.length} module(s) changed` };
};

export const analyzeNMAChanges = async (
  nmaDir: string,
  buildId: string,
  modulePaths: string[],
): Promise<{ newState: HashState; comparison: HashComparisonResult; recommendation: HotswapRecommendation }> => {
  const oldState = getStoredHashState();
  const newState = await computeNMAHashState(nmaDir, buildId, modulePaths);
  const comparison = compareHashStates(oldState, newState);
  const recommendation = getHotswapRecommendation(comparison);
  return { newState, comparison, recommendation };
};

/** @deprecated Use analyzeNMAChanges */
export const analyzeHotfixChanges = analyzeNMAChanges;

export const logHashComparison = (comparison: HashComparisonResult): void => {
  console.debug("[Hash] Comparison results:");
  console.debug(`  - deno.lock changed: ${comparison.denoLockChanged}`);
  console.debug(`  - Changed: ${comparison.changedModules.join(", ") || "none"}`);
  console.debug(`  - New: ${comparison.newModules.join(", ") || "none"}`);
  console.debug(`  - Removed: ${comparison.removedModules.join(", ") || "none"}`);
};
