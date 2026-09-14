// SPDX-License-Identifier: MPL-2.0
// about:nora:settings は system principal で開くので、Services と noraneko の module に直接触れる
// (about:config / about:preferences と同じ)。無い環境(vite で単体表示など)では null。

declare const Services: any;
declare const ChromeUtils: any;

export interface PrefsApi {
  getBoolPref(key: string, fallback?: boolean): boolean;
  setBoolPref(key: string, value: boolean): void;
}

export const prefsApi: PrefsApi | null =
  typeof Services !== "undefined" ? (Services?.prefs ?? null) : null;

export const readBool = (key: string): boolean => (prefsApi ? prefsApi.getBoolPref(key, false) : false);

// ---- modules/Drops.sys.mts の型(こちらで写しを持つ。向こうが正) ----
export interface Registry {
  name: string;
  base: string; // その registry の URL(裏は registry ごとの Worker と bucket。npm と jsr が別なのと同じ)
  identity: string;
  issuer: string;
}
export interface AttestationCheck {
  who: string;
  identity: string;
  issuer: string;
  ok: boolean;
  reason?: string;
  logIndex?: number;
  rekorUrl?: string;
}
export interface DropManifest {
  uuid: string;
  name: string; // 札
  note?: string;
  contact?: string | string[];
  source?: { repo?: string; commit?: string; commit_time?: string; path?: string };
  lib?: boolean;
  deps?: DepRef[];
}
export interface InspectedEntry {
  id: string;
  name: string;
  version: string;
  file: string;
  sha256: string;
  matches: string[];
  chrome: boolean;
  /** view に <browser> を置ける = ページを読み込む窓(drop.toml の [actor] web_frame) */
  webFrame: boolean;
  permissions: string[];
  functions: string[];
  sources: { path: string; text: string }[];
  files: { path: string; text: string }[];
}
export interface DepRef {
  name: string;
  uuid: string;
  version: string;
  lib: boolean;
  wasm: boolean;
}
export interface InspectedDep extends DepRef {
  attestations: AttestationCheck[];
  manifest: DropManifest;
  entries: { file: string; version: string; sha256: string; files: { path: string; text: string }[] }[];
}
export interface DropInspection {
  uuid: string;
  name: string; // 札
  shots?: { file: string; dataUri: string }[];
  registry: Registry;
  attestations: AttestationCheck[];
  manifest: DropManifest;
  deps: InspectedDep[];
  entries: InspectedEntry[];
}
export interface CatalogItem {
  uuid: string;
  name: string;
  note: string;
  contact: string[];
  lib: boolean;
  icon: string | null;
  shots: number;
  version: string | null;
  entries: { name?: string; version?: string; file?: string; size?: number }[];
  deps: { name?: string; version?: string }[];
  source?: { repo?: string; commit?: string; commit_time?: string; path?: string } | null;
  rekor: number | null;
  registry: string;
}
export interface InstalledDrop {
  name?: string;
  ids: string[];
  files: string[];
  versions: string[];
  note?: string;
  registry?: string;
}
/** 起動時に一つ入れ直した結果(Drops.sys.mts と同じ形) */
export interface DropStartupEntry {
  name: string;
  ok: boolean;
  ms: number;
  error: string;
}
export interface DropStartupReport {
  running: boolean;
  ms: number;
  entries: Record<string, DropStartupEntry>;
}
export interface DropsApi {
  listRegistries(): Registry[];
  addRegistry(r: Registry): void;
  removeRegistry(name: string): void;
  inspectDrop(ref: string, registry?: string): Promise<DropInspection>; // ref = uuid
  parseUuid(ref: string): string;
  /** 入れる前に、落としてある bytes をもう一度照らす(入れない) */
  verifyDrop(inspected: DropInspection): Promise<{ ok: boolean; checked: number; bad: string[] }>;
  installDrop(inspected: DropInspection): Promise<string[]>;
  removeDrop(ref: string): Promise<void>;
  listDrops(): Record<string, InstalledDrop>;
  listCatalog(): Promise<{ items: CatalogItem[]; failed: { registry: string; reason: string }[] }>;
  /** 起動時にどれが起きて、どれが転んだか。console を読まずに済むように */
  getStartupReport(): DropStartupReport;
}

export const dropsApi: DropsApi | null = (() => {
  try {
    return typeof ChromeUtils !== "undefined"
      ? (ChromeUtils.importESModule("resource://noraneko/modules/Drops.sys.mjs") as DropsApi)
      : null;
  } catch {
    return null;
  }
})();

/** 判が全部通っているか(無いときは「通っていない」扱い) */
export const allAttested = (d: DropInspection): boolean =>
  d.attestations.length > 0 && d.attestations.every((a) => a.ok);
