// SPDX-License-Identifier: MPL-2.0
/**
 * Drops: コード一つで機能(webext-actor の xpi)が降ってくる。
 *
 * Git が使えない人にも試してもらえるように、機能の束を dl.f3liz.casa/drop/<uuid>/ に置く。
 * about:nora:settings で uuid を入れると、まず **見る**(inspectDrop)、それから本人が
 * 「入れる」を押して **入れる**(installDrop)。入れかたは Firefox 自身の
 * about:newtab(newtab@mozilla.org)と同じ形(temporary add-on + JSWindowActor)。
 *
 * ここは受付(barrel)だけ。仕事は drops/ の下に役割ごとに分かれている:
 *   drops/registry … 配布元(registry)と、そこに置かれた drop の在りか
 *   drops/storage  … 手元の置き場(profile/noraneko-drops)と resource:// の別名
 *   drops/inspect  … 見る(落として確かめ、中を読む。実行はしない)
 *   drops/install  … 入れる・外す(ここで初めてコードが動く)
 *   drops/catalog  … 棚(registry の index.json の一覧)
 *   drops/startup  … 起動時の入れ直し
 *   drops/devwatch… 手元の棚の見張り(開発用)
 *
 * ことば(この repo だけの言い回し):
 *   drop    … コード一つで降ってくる機能の束。正体は xpi
 *   registry… drop を配る元(dl.f3liz.casa/drop など)。既定の一つ + 本人が足したもの
 *   xpi     … drop の入れ物(zip。中に manifest.json / actor.json / JS / source)
 *   actor   … ページと親プロセスをつなぐ JSWindowActor
 *   dep     … drop が使う library。共有置き場 deps/<uuid>/<version> に一つだけ
 *   札      … name。人が読む名前で、正体は uuid(別の registry で同名でも uuid が違えば別物)
 *   判      … attestation。registry の CI が押した署名。sha256 と一緒に確かめる
 *   棚      … catalog。registry の index.json を並べた一覧
 *   見る    … inspect。落として中を読むだけ。実行はしない
 *   入れる  … install。temporary add-on として動かす
 */
export type { DropEntry, DropManifest, DepRef, Registry, Shot } from "./drops/registry.sys.mjs";
export { addRegistry, DEFAULT_REGISTRY, listRegistries, parseUuid, removeRegistry } from "./drops/registry.sys.mjs";

export type { InstalledDrop } from "./drops/storage.sys.mjs";
export { listDrops } from "./drops/storage.sys.mjs";

export type { DropInspection, InspectedDep } from "./drops/inspect.sys.mjs";
export { inspectDrop } from "./drops/inspect.sys.mjs";

export { installDrop, reinstallDrop, removeDrop, verifyDrop } from "./drops/install.sys.mjs";

export type { CatalogItem } from "./drops/catalog.sys.mjs";
export { listCatalog } from "./drops/catalog.sys.mjs";

export type { DropStartupEntry, DropStartupReport } from "./drops/startup.sys.mjs";
export { getStartupReport, restoreDropsAtStartup } from "./drops/startup.sys.mjs";
