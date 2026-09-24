// SPDX-License-Identifier: MPL-2.0
/**
 * 開発用の見張り: 手元の棚(127.0.0.1 / localhost の registry)だけを見て、
 * 版が動いていたら入れ直す(`noraneko.drops.dev.watch` が秒数のとき)。
 *
 * 書いているあいだの輪の、ブラウザ側の半分: registry の `scripts/dev.rb` が組んで
 * 棚に置き、こちらが気づいて入れ替える。ブラウザを建て直さなくてよくなる。
 * 配られたものは黙って入れ替えない(isLocalRegistry で local だけに絞る)。
 */
import { fetchDropManifest, isLocalRegistry, listRegistries } from "./registry.sys.mjs";
import { readInstalled } from "./storage.sys.mjs";
import { reinstallDrop } from "./install.sys.mjs";

// 手元の棚を見に行く間隔(秒)。0 なら見ない(既定)。書いている人のための pref
const PREF_DEV_WATCH = "noraneko.drops.dev.watch";

const { setInterval, clearInterval } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs",
);

let devTimer: number | null = null;
let devBusy = false;
const devQuiet = new Set<string>(); // もう言った転びかた(直ったら忘れる)。同じ行を秒ごとに出さないため

async function devWatchTick(): Promise<void> {
  if (devBusy) return;
  devBusy = true;
  try {
    const local = new Map(listRegistries().filter(isLocalRegistry).map((r) => [r.name, r]));
    if (local.size === 0) return;
    for (const [uuid, d] of Object.entries(readInstalled())) {
      const reg = d.registry ? local.get(d.registry) : undefined;
      if (!reg) continue;
      try {
        const { manifest } = await fetchDropManifest(reg, uuid);
        const there = manifest.entries?.[0]?.version;
        const here = d.versions?.[0];
        if (!there || there === here) {
          devQuiet.delete(uuid);
          continue;
        }
        await reinstallDrop(uuid, reg.name);
        devQuiet.delete(uuid);
        console.log(`[noraneko-drops] ${d.name ?? uuid} ${here} → ${there} に入れ直した(手元の棚 ${reg.name})`);
      } catch (e) {
        // 棚が立っていない・組んでいる最中、はよくあること。一度だけ言って、あとは黙る
        if (devQuiet.has(uuid)) continue;
        devQuiet.add(uuid);
        console.warn(`[noraneko-drops] ${d.name ?? uuid}: 手元の棚が見られない:`, e);
      }
    }
  } finally {
    devBusy = false;
  }
}

/** pref のとおりに、見張りを立て直す(0 で止まる。立てたり止めたりは、その場で効く) */
function applyDevWatch(): void {
  if (devTimer !== null) {
    clearInterval(devTimer);
    devTimer = null;
  }
  const seconds = Services.prefs.getIntPref(PREF_DEV_WATCH, 0);
  if (seconds <= 0) return;
  devTimer = setInterval(() => void devWatchTick(), Math.max(1, seconds) * 1000);
  console.log(`[noraneko-drops] 手元の棚を ${seconds} 秒ごとに見ます(${PREF_DEV_WATCH})`);
}

/** pref が動いたら、その場で立て直す(裸の関数でなく observe を持つもので渡す) */
export const devWatchObserver = { observe: () => applyDevWatch() };
