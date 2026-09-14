// SPDX-License-Identifier: MPL-2.0
// about:nora:drops。settings の中の一節だったものを、自分の頁に分けた。
//
// 形は GNOME Software と同じ絵: 左に**レール**(どの棚を見るか)、右に**パネル**が
// 一枚だけ。棚は面(二次元)に並び、一つ選ぶとそれ自身のパネルに変わる ── 前は
// 一列の行の下に、見た drop の紙が生えていた。数が増えると、どこを読んでいるのか
// 分からなくなる。
//
//   棚         registry が配れるもの(library は連れてこられる側なので並べない)
//   入っている  この profile に入っているもの。棚から消えたものも、戻せるように
//   registry   どこから配ってもらうか(+ uuid で直に見る)
//
// 押すと、まず **見る**(inspectDrop: 落として sha256 を確かめ、xpi を zip として
// 読む。JS は動かさない)。それから本人が「入れる」。

import { useEffect, useState } from "preact/hooks";
import { dropsApi } from "./lib/privileged.ts";
import type { CatalogItem, DropInspection, DropStartupReport, InstalledDrop } from "./lib/privileged.ts";
import { useTask } from "./lib/useTask.ts";
import { Registries } from "./components/Registries.tsx";
import { DropSheet } from "./components/DropSheet.tsx";
import { Store } from "./components/Store.tsx";
import { Icon, Shelf, newer } from "./components/Shelf.tsx";

type Panel = "shelf" | "installed" | "registries";

export function Drops() {
  const [panel, setPanel] = useState<Panel>("shelf");
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [ref, setRef] = useState("");
  const [shelf, setShelf] = useState<CatalogItem[] | null>(null);
  const [failed, setFailed] = useState<{ registry: string; reason: string }[]>([]);
  const [seen, setSeen] = useState<DropInspection | null>(null);
  // 表(ストアの一枚)→ 裏(中身を読む)。棚から押すと、まず表
  const [reading, setReading] = useState(false);
  const [installed, setInstalled] = useState<Record<string, InstalledDrop>>(dropsApi ? dropsApi.listDrops() : {});
  const { busy, msg, run } = useTask(() => setInstalled(dropsApi ? dropsApi.listDrops() : {}));
  // 起動時にどれが起きて、どれが転んだか。console を読まずに済むように行へ出す
  const [startup, setStartup] = useState<DropStartupReport | null>(dropsApi ? dropsApi.getStartupReport() : null);

  // 起動してすぐこの頁を開くと、まだ入れ直している最中のことがある。終わるまで見に行く
  useEffect(() => {
    if (!dropsApi || !startup?.running) return;
    const t = setInterval(() => setStartup(dropsApi!.getStartupReport()), 500);
    return () => clearInterval(t);
  }, [startup?.running]);

  // 棚を引く(registry ごとの /index.json)。一つ転んでも、残りは並べる
  useEffect(() => {
    if (!dropsApi) return;
    let alive = true;
    dropsApi.listCatalog().then(
      (r) => { if (alive) { setShelf(r.items); setFailed(r.failed); } },
      (e) => { if (alive) { setShelf([]); setFailed([{ registry: "?", reason: String(e?.message ?? e) }]); } },
    );
    return () => { alive = false; };
  }, [tick]);

  const inspect = (u: string, registry?: string) =>
    run(async () => { setSeen(null); setReading(false); setSeen(await dropsApi!.inspectDrop(u, registry)); }, `見た: ${u}(まだ入れていない)`);
  // 入れたあとも、その一枚のまま。棚に飛ばされると「入ったのか」が見えない ──
  // 表がそのまま「入っている」に変わって、戻すボタンが出る
  const install = (d: DropInspection) =>
    run(async () => { await dropsApi!.installDrop(d); }, `ねこに入った: ${d.name}`);
  // 戻したら、同じ一枚を **見直す**。戻すと落としてあった bytes も一緒に消えるので、
  // 前に見たときの inspection はもう指す先が無い ── そのまま入れると、その file を
  // 探しに行って転ぶ(「見てから入れて」)。見直しておけば、そのまま入れ直せる
  const remove = (u: string) =>
    run(async () => {
      await dropsApi!.removeDrop(u);
      if (seen && dropsApi!.parseUuid(seen.uuid) === dropsApi!.parseUuid(u)) {
        setSeen(await dropsApi!.inspectDrop(u, seen.registry.name));
      }
    }, `戻した: ${u}`);

  // xpi へのリンクから来たとき(DropLinks.sys.mts): #drop=<uuid>&registry=<name>。
  // about:nora:settings の古い形も同じ字なので、そのまま受ける
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    const u = p.get("drop")?.trim().toLowerCase();
    if (u && dropsApi) { setRef(u); inspect(u, p.get("registry") || undefined); }
  }, []);

  const all = shelf ?? [];
  const shown = all.filter((i) => !i.lib);
  const libs = all.length - shown.length;
  const needle = q.trim().toLowerCase();
  const hit = shown.filter((i) => !needle || i.name.includes(needle) || i.note.toLowerCase().includes(needle) || i.uuid.startsWith(needle));
  const orphans = Object.entries(installed).filter(([u]) => !all.some((i) => i.uuid === u));
  const haveList = all.filter((i) => installed[i.uuid]);
  const updates = haveList.filter((i) => newer(i.version, installed[i.uuid]?.versions?.[0])).length;

  // 一枚を開いているあいだは、そのパネルだけ。表(ストア)と裏(中身)があって、
  // 戻ると棚に返る
  if (seen) {
    const v = installed[seen.uuid]?.versions?.[0];
    return (
      <Frame panel={panel} setPanel={(p) => { setSeen(null); setPanel(p); }} counts={{ shelf: shown.length, installed: haveList.length + orphans.length, updates }}>
        <p class="crumb">
          <button class="link" onClick={() => setSeen(null)}>← 棚へ</button>
          {reading && <> · <button class="link" onClick={() => setReading(false)}>表へ</button></>}
        </p>
        {msg && <p class="msg">{msg}</p>}
        {reading
          ? <DropSheet seen={seen} busy={busy} onInstall={() => install(seen)} />
          : (
            <Store
              seen={seen}
              installedVersion={v}
              busy={busy}
              onInstall={() => install(seen)}
              onRead={() => setReading(true)}
              onRemove={v !== undefined ? () => remove(seen.uuid) : undefined}
            />
          )}
      </Frame>
    );
  }

  return (
    <Frame panel={panel} setPanel={setPanel} counts={{ shelf: shown.length, installed: haveList.length + orphans.length, updates }}>
      {msg && <p class="msg">{msg}</p>}

      {panel === "shelf" && (
        <>
          <p class="hint">機能が一つずつ降ってくる。押すとまず<b>中身を見る</b>(何も実行しない) — source、実際に動く file、誰が判を押したか、連絡先。それから「入れる」で built-in と入れ替わる。戻せば built-in に戻る。再起動は要らない。</p>
          <div class="drop-input">
            <input value={q} placeholder="棚をさがす(名前・一言)" disabled={!dropsApi}
              onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
          </div>
          {shelf === null && <p class="msg">棚を読んでいる…</p>}
          {failed.map((f) => <p class="msg" key={f.registry}>{f.registry} の棚が読めない: {f.reason}</p>)}
          {shelf !== null && hit.length === 0 && <p class="msg">{q ? "見つからない" : "棚は空(registry が index.json を返さないか、まだ何も無い)"}</p>}
          {hit.length > 0 && <Shelf items={hit} installed={installed} onOpen={(i) => inspect(i.uuid, i.registry)} />}
          {libs > 0 && <p class="msg">ほかに library が {libs} 件(使う drop が連れてくるので、棚には並べない)</p>}
        </>
      )}

      {panel === "installed" && (
        <>
          <p class="hint">この profile に入っているもの。戻すと built-in に返る。再起動は要らない。</p>
          <Startup report={startup} />
          {haveList.length === 0 && orphans.length === 0 && <p class="msg">まだ何も入っていない</p>}
          {haveList.length > 0 && <Shelf items={haveList} installed={installed} onOpen={(i) => inspect(i.uuid, i.registry)} />}
          {orphans.length > 0 && (
            <div class="installed">
              <div class="k">棚に無いのに入っているもの</div>
              {orphans.map(([u, d]) => (
                <div class="row" key={u}>
                  <span class="text">
                    <span class="label">{d.name ?? u}</span>
                    <span class="desc">{d.note ?? ""}</span>
                    <code class="code">{u}</code>
                    <code class="code">{d.ids.join(", ")} @ {(d.versions ?? []).join(", ")} · {d.registry ?? "?"}</code>
                    <Woke report={startup} uuid={u} />
                  </span>
                  <button class="quiet" disabled={busy} onClick={() => remove(u)}>戻す</button>
                </div>
              ))}
            </div>
          )}
          {haveList.length > 0 && (
            <div class="installed">
              <div class="k">戻す</div>
              {haveList.map((i) => (
                <div class="row" key={i.uuid}>
                  <Icon item={i} />
                  <span class="text">
                    <span class="label">{i.name}</span>
                    <code class="code">{(installed[i.uuid]?.versions ?? []).join(", ")} · {i.registry}</code>
                    <Woke report={startup} uuid={i.uuid} />
                  </span>
                  <button class="quiet" disabled={busy} onClick={() => remove(i.uuid)}>戻す</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {panel === "registries" && (
        <>
          <p class="hint">どこから配ってもらうか。既定のほかに足せるし、外せる(iOS の代替ストアと同じ絵)。信用の根は、その registry の main を誰がレビューするか。</p>
          <Registries onChange={() => setTick(tick + 1)} />
          <div class="k" style="margin-top:1.4rem">棚に無いものを uuid で</div>
          <div class="drop-input">
            <input key={tick} value={ref} placeholder="uuid(例: ec4dfa7c-9e5a-4c1d-8d0d-771e3ee81030)"
              disabled={!dropsApi || busy}
              onInput={(e) => setRef((e.currentTarget as HTMLInputElement).value.trim())}
              onKeyDown={(e) => { if (e.key === "Enter" && ref && !busy) inspect(ref); }} />
            <button class="primary" disabled={!dropsApi || busy || !ref} onClick={() => inspect(ref)}>見る</button>
          </div>
        </>
      )}
    </Frame>
  );
}

/** 起動時の入れ直しを、ひとこと。ここを見れば console を開かなくていい */
function Startup({ report }: { report: DropStartupReport | null }) {
  if (!report) return null;
  if (report.running) return <p class="msg">起動時の入れ直し: いま入れている…</p>;

  const all = Object.values(report.entries);
  if (all.length === 0) return null;
  const bad = all.filter((e) => !e.ok);
  return (
    <p class="msg">
      起動時の入れ直し: {all.length - bad.length} 個 起きた
      {bad.length > 0 && <>・{bad.length} 個 転んだ</>}({secs(report.ms)})
    </p>
  );
}

/** その drop が、この起動でちゃんと起きたか */
function Woke({ report, uuid }: { report: DropStartupReport | null; uuid: string }) {
  if (!report) return null;
  const e = report.entries[uuid];
  if (!e) return <code class="code">{report.running ? "起動時: 入れ直している…" : "この回に入れた"}</code>;
  if (e.ok) return <code class="code">起動時: 起きた({secs(e.ms)})</code>;
  return <code class="code" title={e.error}>起動時: 転んだ — {e.error}</code>;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`;

/** 左のレールと、右の一枚。GNOME Software と同じ絵 */
function Frame({ panel, setPanel, counts, children }: {
  panel: Panel;
  setPanel: (p: Panel) => void;
  counts: { shelf: number; installed: number; updates: number };
  children: preact.ComponentChildren;
}) {
  const tab = (id: Panel, label: string, n?: number, badge?: number) => (
    <button class={`rail-item${panel === id ? " on" : ""}`} onClick={() => setPanel(id)}>
      <span>{label}</span>
      {badge ? <span class="pill">{badge}</span> : n !== undefined ? <span class="n">{n}</span> : null}
    </button>
  );
  return (
    <main class="page wide">
      <header class="head">
        <span class="eyebrow">Noraneko</span>
        <h1>Drops</h1>
        <a class="link" href="about:nora:settings">Settings へ</a>
      </header>
      <div class="withrail">
        <nav class="rail">
          {tab("shelf", "棚", counts.shelf)}
          {tab("installed", "入っている", counts.installed, counts.updates || undefined)}
          {tab("registries", "registry")}
        </nav>
        <section class="panel">{children}</section>
      </div>
    </main>
  );
}
