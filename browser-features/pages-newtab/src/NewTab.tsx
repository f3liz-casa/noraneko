import { h, Fragment } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";

// ─── Types (mirrors NewTabUtils ActivityStream data shapes) ────────────────────

export interface TopSite {
  url: string;
  title?: string;
  favicon?: string; // data: URI
  faviconSize?: number;
  frecency?: number;
  lastVisitDate?: number;
}

export interface Highlight {
  url: string;
  title?: string;
  favicon?: string; // data: URI
  date?: number;
  type?: "bookmark" | "history" | string;
  bookmarkGuid?: string;
}

interface BrowserData {
  topSites: TopSite[];
  highlights: Highlight[];
}

// ─── Storage keys ──────────────────────────────────────────────────────────────

const LS_LINKS_KEY = "np_links_v1";
const LS_NOTE_KEY = "np_note_v1";
const LS_BG_KEY = "np_bg_v1";
const LS_BG_RANDOM_KEY = "np_bg_random_v1";
const LS_SECTIONS_KEY = "np_sections_v1";

interface SectionPrefs {
  topSites: boolean;
  highlights: boolean;
  quickLinks: boolean;
  note: boolean;
}

const DEFAULT_SECTIONS: SectionPrefs = {
  topSites: true,
  highlights: true,
  quickLinks: true,
  note: true,
};

// ─── Storage helpers ───────────────────────────────────────────────────────────

type LinkItem = { title?: string; url: string };

function ls<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isProbablyUrl(s: string) {
  if (/\s/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  return /\.[a-z]{2,}/i.test(s);
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function relativeTime(ts?: number): string {
  if (!ts) return "";
  // Places timestamps are in microseconds
  const ms = ts > 1e12 ? ts / 1000 : ts;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function pickBackground(list: string[], random: boolean): string | null {
  if (!list.length) return null;
  return list[random ? Math.floor(Math.random() * list.length) : 0];
}

// ─── Favicon component (with letter fallback) ──────────────────────────────────

function Favicon({
  url,
  favicon,
  size = 32,
}: {
  url: string;
  favicon?: string;
  size?: number;
}) {
  const letter = hostname(url)[0]?.toUpperCase() ?? "?";
  if (favicon) {
    return (
      <img
        src={favicon}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          borderRadius: 4,
          display: "block",
          flexShrink: 0,
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: stringToColor(hostname(url)),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.45,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function stringToColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360},50%,45%)`;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function NewTab() {
  // ── Clock ──
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Browser data (from actor) ──
  const [browserData, setBrowserData] = useState<BrowserData | null>(null);
  useEffect(() => {
    function onData(e: Event) {
      setBrowserData((e as CustomEvent<BrowserData>).detail);
    }
    window.addEventListener("noranekoNewtabData", onData);
    return () => window.removeEventListener("noranekoNewtabData", onData);
  }, []);

  // ── Section visibility ──
  const [sections, setSections] = useState<SectionPrefs>(() =>
    ls(LS_SECTIONS_KEY, DEFAULT_SECTIONS)
  );
  function toggleSection(key: keyof SectionPrefs) {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      lsSet(LS_SECTIONS_KEY, next);
      return next;
    });
  }

  // ── Search ──
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  function handleSearch(e: Event) {
    e.preventDefault();
    const v = query.trim();
    if (!v) return;
    window.location.href = isProbablyUrl(v)
      ? /^https?:\/\//i.test(v)
        ? v
        : "https://" + v
      : "https://www.google.com/search?q=" + encodeURIComponent(v);
  }

  // ── Quick links (user-managed) ──
  const [links, setLinks] = useState<LinkItem[]>(() => ls(LS_LINKS_KEY, []));
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const newTitleRef = useRef<HTMLInputElement>(null);

  function openAdd() {
    setNewTitle("");
    setNewUrl("");
    setAddOpen(true);
    setTimeout(() => newTitleRef.current?.focus(), 0);
  }
  function saveLink() {
    let url = newUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const next = [...links, { title: newTitle.trim() || undefined, url }];
    lsSet(LS_LINKS_KEY, next);
    setLinks(next);
    setAddOpen(false);
  }
  function removeLink(idx: number) {
    if (!confirm("Remove this link?")) return;
    const next = links.filter((_, i) => i !== idx);
    lsSet(LS_LINKS_KEY, next);
    setLinks(next);
  }

  // ── Note ──
  const [note, setNote] = useState(() => ls<string>(LS_NOTE_KEY, ""));
  const noteTimer = useRef<number | undefined>(undefined);
  function handleNote(v: string) {
    setNote(v);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(
      () => lsSet(LS_NOTE_KEY, v.trim()),
      500
    );
  }

  // ── Backgrounds ──
  const [backgrounds, setBackgrounds] = useState<string[]>(() =>
    ls(LS_BG_KEY, [])
  );
  const [bgRandom, setBgRandom] = useState(() => ls<boolean>(LS_BG_RANDOM_KEY, false));
  const [bgUrlsText, setBgUrlsText] = useState("");
  const bgFilesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const bg = pickBackground(backgrounds, bgRandom);
    if (bg) {
      document.body.style.backgroundImage = `url("${bg}")`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundRepeat = "no-repeat";
      document.body.classList.add("has-bg");
    } else {
      document.body.style.backgroundImage = "";
      document.body.style.backgroundSize = "";
      document.body.classList.remove("has-bg");
    }
  }, [backgrounds, bgRandom]);

  function clearBg() {
    lsSet(LS_BG_KEY, []);
    lsSet(LS_BG_RANDOM_KEY, false);
    setBackgrounds([]);
    setBgRandom(false);
    setBgUrlsText("");
  }
  function saveBg() {
    const urls = bgUrlsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const dataUrls = backgrounds.filter((s) => s.startsWith("data:"));
    const final = [...dataUrls, ...urls];
    lsSet(LS_BG_KEY, final);
    lsSet(LS_BG_RANDOM_KEY, bgRandom);
    setBackgrounds(final);
    setSettingsTab("customize");
  }
  function removeBgItem(src: string) {
    const next = backgrounds.filter((s) => s !== src);
    lsSet(LS_BG_KEY, next);
    setBackgrounds(next);
  }
  function handleBgFiles() {
    const files = Array.from(bgFilesRef.current?.files ?? []);
    if (!files.length) return;
    Promise.all(
      files.map(
        (f) =>
          new Promise<string | null>((res) => {
            const r = new FileReader();
            r.onload = () =>
              res(typeof r.result === "string" ? r.result : null);
            r.onerror = () => res(null);
            r.readAsDataURL(f);
          })
      )
    ).then((results) => {
      const images = results.filter(Boolean) as string[];
      const merged = [...backgrounds, ...images];
      lsSet(LS_BG_KEY, merged);
      setBackgrounds(merged);
      setBgUrlsText(merged.filter((s) => !s.startsWith("data:")).join("\n"));
      if (bgFilesRef.current) bgFilesRef.current.value = "";
    });
  }

  // ── Settings panel ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"customize" | "wallpaper">(
    "customize"
  );

  function openSettings() {
    setBgUrlsText(
      backgrounds.filter((s) => !s.startsWith("data:")).join("\n")
    );
    setSettingsOpen(true);
  }

  // ── Keyboard ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "Escape") {
        if (addOpen) { setAddOpen(false); return; }
        if (settingsOpen) setSettingsOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen, settingsOpen]);

  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; }
  })();

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <main style={mainStyle}>

        {/* ── Header ── */}
        <header style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>New tab</h1>
              <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: V.muted, margin: "0.25rem 0 0" }}>
                {formatDate(now)}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div role="status" aria-live="polite" style={{ fontSize: "0.875rem", color: V.muted }}>
                {now.toLocaleTimeString()}
              </div>
              <button onClick={openSettings} aria-label="Settings" title="Settings"
                aria-expanded={settingsOpen} style={btnIconStyle}>⚙</button>
            </div>
          </div>
        </header>

        {/* ── Search ── */}
        <section style={{ marginBottom: "1.5rem" }}>
          <form onSubmit={handleSearch} autoComplete="off" style={{ width: "100%" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input
                ref={searchRef}
                type="search" inputMode="search"
                placeholder="Search or paste URL"
                aria-label="Search or URL" autoFocus spellcheck={false}
                value={query}
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="submit" style={btnPrimaryStyle}>Open</button>
            </div>
          </form>
        </section>

        {/* ── Top Sites (from Firefox history) ── */}
        {sections.topSites && (
          <section style={{ marginBottom: "1.5rem" }}>
            <SectionHeader label="Top sites" />
            {!browserData ? (
              <TopSitesSkeleton />
            ) : browserData.topSites.length === 0 ? (
              <EmptyState text="No top sites yet. Browse the web to see them here." />
            ) : (
              <div style={sitesGridStyle}>
                {browserData.topSites.slice(0, 12).map((site, i) => (
                  <TopSiteCard key={i} site={site} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Highlights (recent bookmarks + history) ── */}
        {sections.highlights && (
          <section style={{ marginBottom: "1.5rem" }}>
            <SectionHeader label="Recent activity" />
            {!browserData ? (
              <HighlightsSkeleton />
            ) : browserData.highlights.length === 0 ? (
              <EmptyState text="Your recently bookmarked and visited pages will appear here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {browserData.highlights.slice(0, 8).map((h, i) => (
                  <HighlightRow key={i} item={h} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Quick Links (user-managed) ── */}
        {sections.quickLinks && (
          <section style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <SectionHeader label="Quick links" noMargin />
              <button onClick={openAdd} aria-expanded={addOpen} style={addBtnStyle}>Add</button>
            </div>
            {links.length === 0 ? (
              <EmptyState text="No links yet. Add frequently used sites." />
            ) : (
              <div style={sitesGridStyle}>
                {links.map((item, idx) => (
                  <a key={idx} href={item.url} aria-label={item.title || item.url}
                    onContextMenu={(e) => { e.preventDefault(); removeLink(idx); }}
                    onKeyDown={(e) => { if (e.key === "Delete") { e.preventDefault(); removeLink(idx); } }}
                    style={cardStyle}>
                    <Favicon url={item.url} size={20} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                      {item.title || hostname(item.url)}
                    </span>
                  </a>
                ))}
              </div>
            )}
            {addOpen && (
              <form style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <input ref={newTitleRef} placeholder="Title" value={newTitle}
                  onInput={(e) => setNewTitle((e.target as HTMLInputElement).value)}
                  style={{ ...inputStyle, width: "auto", flex: "1 1 120px" }} />
                <input placeholder="https://example.com" value={newUrl}
                  onInput={(e) => setNewUrl((e.target as HTMLInputElement).value)}
                  style={{ ...inputStyle, width: "auto", flex: "2 1 200px" }} />
                <button type="button" onClick={saveLink} style={btnPrimaryStyle}>Save</button>
                <button type="button" onClick={() => setAddOpen(false)} style={mutedBtnStyle}>Cancel</button>
              </form>
            )}
          </section>
        )}

        {/* ── Note ── */}
        {sections.note && (
          <section style={{ marginBottom: "1.5rem" }}>
            <SectionHeader label="Quick note" />
            <textarea rows={3} placeholder="Short note (saved locally)"
              value={note}
              onInput={(e) => handleNote((e.target as HTMLTextAreaElement).value)}
              style={{ ...inputStyle, resize: "vertical" }} />
          </section>
        )}

        {/* ── Footer ── */}
        <footer style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: V.muted, display: "flex", justifyContent: "space-between" }}>
          <span>Local — no remote services</span>
          <span>{tz}</span>
        </footer>
      </main>

      {/* ── Settings Panel ── */}
      <div role="dialog" aria-label="New tab settings" aria-hidden={!settingsOpen}
        style={{ ...panelStyle, transform: settingsOpen ? "translateX(0)" : "translateX(100%)", pointerEvents: settingsOpen ? "auto" : "none" }}>
        <div style={{ padding: "1rem", height: "100%", boxSizing: "border-box", overflowY: "auto" }}>
          {/* Panel header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <strong style={{ fontSize: "0.9rem" }}>Settings</strong>
            <button onClick={() => setSettingsOpen(false)} style={mutedBtnStyle} aria-label="Close settings">✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", borderBottom: "1px solid #e5e7eb", paddingBottom: "0.5rem" }}>
            {(["customize", "wallpaper"] as const).map((tab) => (
              <button key={tab} onClick={() => setSettingsTab(tab)}
                style={{ ...tabBtnStyle, borderBottom: settingsTab === tab ? "2px solid #0b1220" : "2px solid transparent", fontWeight: settingsTab === tab ? 600 : 400 }}>
                {tab === "customize" ? "Sections" : "Wallpaper"}
              </button>
            ))}
          </div>

          {/* Customize tab */}
          {settingsTab === "customize" && (
            <div>
              {(Object.entries(sections) as [keyof SectionPrefs, boolean][]).map(([key, val]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
                  <input type="checkbox" checked={val} onChange={() => toggleSection(key)} />
                  {{ topSites: "Top sites", highlights: "Recent activity", quickLinks: "Quick links", note: "Quick note" }[key]}
                </label>
              ))}
            </div>
          )}

          {/* Wallpaper tab */}
          {settingsTab === "wallpaper" && (
            <div>
              <label style={settingsLabelStyle}>Upload images</label>
              <input ref={bgFilesRef} type="file" accept="image/*" multiple onChange={handleBgFiles}
                style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }} />

              <label style={settingsLabelStyle}>Image URLs (one per line)</label>
              <textarea rows={3} placeholder="https://…" value={bgUrlsText}
                onInput={(e) => setBgUrlsText((e.target as HTMLTextAreaElement).value)}
                style={{ ...inputStyle, marginBottom: "0.5rem" }} />

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.875rem" }}>
                <input type="checkbox" checked={bgRandom} onChange={(e) => setBgRandom((e.target as HTMLInputElement).checked)} />
                Randomize background
              </label>

              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <button onClick={saveBg} style={btnPrimaryStyle}>Save</button>
                <button onClick={clearBg} style={mutedBtnStyle}>Clear</button>
              </div>

              {backgrounds.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
                  {backgrounds.map((src, idx) => (
                    <div key={idx} style={{ position: "relative" }}>
                      <img src={src} alt={`bg ${idx + 1}`}
                        style={{ width: "100%", height: "56px", objectFit: "cover", display: "block", borderRadius: 4, cursor: "pointer" }}
                        onClick={() => { lsSet(LS_BG_RANDOM_KEY, false); lsSet(LS_BG_KEY, [src]); setBgRandom(false); setBackgrounds([src]); }} />
                      <button onClick={() => removeBgItem(src)} aria-label="Remove"
                        style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.55)", color: "#fff", border: 0, borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 11, lineHeight: "18px", padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{globalCss}</style>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, noMargin }: { label: string; noMargin?: boolean }) {
  return (
    <h2 style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: V.muted, margin: noMargin ? 0 : "0 0 0.75rem 0" }}>
      {label}
    </h2>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p style={{ fontSize: "0.875rem", color: V.muted, margin: 0 }}>{text}</p>;
}

function TopSiteCard({ site }: { site: TopSite }) {
  return (
    <a href={site.url} aria-label={site.title || hostname(site.url)} style={cardStyle}>
      <Favicon url={site.url} favicon={site.favicon} size={24} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.78rem" }}>
        {site.title || hostname(site.url)}
      </span>
    </a>
  );
}

function HighlightRow({ item }: { item: Highlight }) {
  const isBookmark = item.type === "bookmark";
  return (
    <a href={item.url} aria-label={item.title || item.url}
      style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem 0.5rem", borderRadius: 6, textDecoration: "none", color: "inherit", transition: "background 100ms" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}>
      <Favicon url={item.url} favicon={item.favicon} size={20} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.875rem" }}>
        {item.title || hostname(item.url)}
      </span>
      <span style={{ fontSize: "0.75rem", color: V.muted, flexShrink: 0 }}>
        {isBookmark ? "🔖" : ""} {relativeTime(item.date)}
      </span>
    </a>
  );
}

function TopSitesSkeleton() {
  return (
    <div style={sitesGridStyle}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ ...cardStyle, background: "rgba(0,0,0,0.06)", border: "none", animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

function HighlightsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: "36px", borderRadius: 6, background: "rgba(0,0,0,0.06)", animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const V = {
  muted: "#6b7280",
  accent: "#111827",
  white: "#ffffff",
  bg: "#f9fafb",
};

// ─── Shared styles ─────────────────────────────────────────────────────────────

const mainStyle: h.JSX.CSSProperties = {
  position: "relative",
  zIndex: 41,
  maxWidth: "760px",
  margin: "0 auto",
  padding: "2.5rem 1rem",
  fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial',
  color: V.accent,
};

const btnPrimaryStyle: h.JSX.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "#0b1220",
  color: "#fff",
  border: 0,
  borderRadius: "0.375rem",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const btnIconStyle: h.JSX.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  padding: 0,
  borderRadius: "0.5rem",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
};

const inputStyle: h.JSX.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  background: "#fff",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: "inherit",
};

const cardStyle: h.JSX.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.4rem",
  padding: "0.75rem 0.5rem",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  textDecoration: "none",
  color: V.accent,
  cursor: "pointer",
  minWidth: 0,
  transition: "box-shadow 100ms, border-color 100ms",
};

const sitesGridStyle: h.JSX.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
  gap: "0.5rem",
};

const addBtnStyle: h.JSX.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "#0f1720",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  padding: "0.25rem 0.5rem",
};

const mutedBtnStyle: h.JSX.CSSProperties = {
  fontSize: "0.875rem",
  color: V.muted,
  background: "transparent",
  border: 0,
  cursor: "pointer",
  padding: "0.25rem 0.5rem",
};

const panelStyle: h.JSX.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  height: "100%",
  width: "320px",
  maxWidth: "100%",
  zIndex: 50,
  background: "#fff",
  borderLeft: "1px solid rgba(15,23,42,0.08)",
  boxSizing: "border-box",
  transition: "transform 220ms ease-in-out",
};

const tabBtnStyle: h.JSX.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "0.25rem 0.5rem",
  fontSize: "0.875rem",
  color: V.accent,
};

const settingsLabelStyle: h.JSX.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: V.muted,
  marginBottom: "0.25rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

// ─── Global CSS ────────────────────────────────────────────────────────────────

const globalCss = `
  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    background: #f9fafb;
    color: #111827;
    -webkit-font-smoothing: antialiased;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    line-height: 1.4;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  body.has-bg::before {
    content: "";
    position: fixed;
    inset: 0;
    background: linear-gradient(rgba(0,0,0,0.46), rgba(0,0,0,0.38));
    pointer-events: none;
    z-index: 40;
  }
  body.has-bg { color: #fff !important; text-shadow: 0 1px 0 rgba(0,0,0,0.36); }
  body.has-bg a { color: #fff; }
  a:focus, button:focus, input:focus, textarea:focus {
    outline: none;
    box-shadow: 0 0 0 4px rgba(59,130,246,0.2);
  }
`;
