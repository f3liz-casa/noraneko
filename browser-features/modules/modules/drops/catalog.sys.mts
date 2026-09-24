// SPDX-License-Identifier: MPL-2.0
/**
 * 棚(catalog): registry の `<base>/index.json` を並べて読み、並べられるものを返す。
 */
import { DROP_NAME_RE, listRegistries, UUID_RE, type Registry } from "./registry.sys.mjs";

/** 棚の一件(registry の /index.json が返す形に、どの registry のものかを足したもの) */
export interface CatalogItem {
  uuid: string;
  name: string;
  note: string;
  contact: string[];
  /** library(ほかの drop が使うもの)。棚には並べない */
  lib: boolean;
  /** 絵の URL(`<registry>/<uuid>/<file>`)。配る側が sha256 を照らしてから返す。無ければ null */
  icon: string | null;
  /** 絵の枚数(中身は「見る」で開いたときに xpi から読む) */
  shots: number;
  version: string | null;
  entries: { name?: string; version?: string; file?: string; size?: number }[];
  deps: { name?: string; version?: string }[];
  source: { repo?: string; commit?: string; commit_time?: string; path?: string } | null;
  /** registry の判が Rekor に載っている番号(registry が判を押していれば) */
  rekor: number | null;
  /** どの registry の棚か */
  registry: string;
}

/** index.json の icon(`{ file, sha256 }`)から、棚が <img> に渡せる URL を組む */
function iconUrlOf(reg: Registry, uuid: string, icon: unknown): string | null {
  const i = icon as { file?: unknown; sha256?: unknown } | null | undefined;
  if (!i || typeof i.file !== "string" || typeof i.sha256 !== "string") return null;
  if (!/^[A-Za-z0-9._-]+\.png$/.test(i.file) || !/^[0-9a-f]{64}$/.test(i.sha256)) return null;
  return `${reg.base}/${uuid}/${i.file}`;
}

/**
 * 店の棚: registry の一覧に順に `<base>/index.json` を訊いて、並べられるものを集める。
 *
 * 一つの registry が転んでも棚は出す(理由を添えて返す)。同じ uuid を二つの registry が
 * 持っていたら、先に並んでいる registry のものを採る(findDrop と同じ順)。
 * ここで返す字は **registry から来た字** なので、描くときは必ずテキストとして描く。
 */
export async function listCatalog(): Promise<{ items: CatalogItem[]; failed: { registry: string; reason: string }[] }> {
  // registry 同士は関係ないので、/index.json は並べて訊く。前は一つずつ待っていて、
  // 三つあれば三往復ぶん待たされた。**並べても順は listRegistries のまま** ──
  // 同じ uuid を二つが持っていたら、先に並んでいるほうを採る(findDrop と同じ順)
  const shelves = await Promise.all(listRegistries().map(async (reg) => {
    try {
      const resp = await fetch(`${reg.base}/index.json`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return { reg, body: (await resp.json()) as { drops?: unknown[] }, error: "" };
    } catch (e) {
      console.warn(`[noraneko-drops] ${reg.name} の棚が読めない:`, e);
      return { reg, body: null, error: String((e as Error)?.message ?? e) };
    }
  }));

  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  const failed: { registry: string; reason: string }[] = [];
  for (const { reg, body, error } of shelves) {
    if (!body) {
      failed.push({ registry: reg.name, reason: error });
      continue;
    }
    for (const raw of body.drops ?? []) {
      const d = raw as Partial<CatalogItem>;
      const uuid = typeof d.uuid === "string" ? d.uuid.toLowerCase() : "";
      if (!UUID_RE.test(uuid) || seen.has(uuid)) continue;
      if (!DROP_NAME_RE.test(d.name ?? "")) continue;
      seen.add(uuid);
      items.push({
        uuid,
        name: d.name as string,
        note: typeof d.note === "string" ? d.note : "",
        lib: d.lib === true,
        // 棚は xpi を落とす前なので、絵は manifest の隣の一枚を指す。file の名前だけ見てから
        // 組み立てる(sha256 を照らすのは配る側。ここは URL を作るだけ)
        icon: iconUrlOf(reg, uuid, d.icon),
        shots: typeof d.shots === "number" ? d.shots : 0,
        contact: Array.isArray(d.contact) ? d.contact.filter((c) => typeof c === "string") : [],
        version: typeof d.version === "string" ? d.version : null,
        entries: Array.isArray(d.entries) ? d.entries : [],
        deps: Array.isArray(d.deps) ? d.deps : [],
        source: (d.source as CatalogItem["source"]) ?? null,
        rekor: typeof d.rekor === "number" ? d.rekor : null,
        registry: reg.name,
      });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`[noraneko-drops] catalog: ${items.length} 件` + (failed.length ? `(${failed.length} の registry は読めなかった)` : ""));
  return { items, failed };
}
