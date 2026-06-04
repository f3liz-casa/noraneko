// SPDX-License-Identifier: MPL-2.0
import { useState } from "preact/hooks";

// Served as chrome UI (system principal) via about:nora:settings, so we can
// touch Services.prefs directly (about:config / about:preferences do the same).
declare const Services: any;
const prefsApi =
  typeof Services !== "undefined" ? Services?.prefs ?? null : null;

const readBool = (k: string): boolean =>
  prefsApi ? prefsApi.getBoolPref(k, false) : false;

type Row = { key: string; label: string; desc: string };

const ROWS: Row[] = [
  {
    key: "noraneko.webext-actors.settings-bridge.enabled",
    label: "Settings bridge (WebExtension)",
    desc: "Pref access for settings pages via the built-in WebExtension actor.",
  },
  {
    key: "noraneko.webext-actors.about-preferences.enabled",
    label: "about:preferences integration",
    desc: "Add the Noraneko entry to about:preferences via the WebExtension actor.",
  },
  {
    key: "noraneko.webext-actors.newtab.enabled",
    label: "New tab data feed",
    desc: "Feed Activity Stream data to the new tab page via the WebExtension actor.",
  },
];

const s = {
  main: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: "44rem",
    margin: "0 auto",
    padding: "2.5rem 1.5rem 4rem",
    color: "#1a1d24",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
    marginBottom: "1.5rem",
  },
  h1: { color: "#5b8def", margin: 0, fontSize: "1.7rem" },
  badge: (ok: boolean) => ({
    fontSize: "0.75rem",
    padding: "0.2rem 0.55rem",
    borderRadius: "999px",
    fontWeight: 600,
    background: ok ? "#e3f4e9" : "#fdeede",
    color: ok ? "#1c7a43" : "#9a5b13",
  }),
  section: {
    background: "#fff",
    border: "1px solid #e6e9f0",
    borderRadius: "0.75rem",
    padding: "1.25rem 1.4rem",
    marginTop: "1.25rem",
  },
  h2: { margin: "0 0 0.25rem", fontSize: "1.05rem" },
  hint: { margin: "0 0 1rem", color: "#6a7180", fontSize: "0.85rem" },
  row: {
    display: "flex",
    gap: "0.8rem",
    padding: "0.7rem 0",
    borderTop: "1px solid #eef0f5",
    cursor: "pointer",
  },
  rowText: { display: "flex", flexDirection: "column" as const, gap: "0.2rem" },
  label: { fontWeight: 600 },
  desc: { color: "#6a7180", fontSize: "0.85rem" },
  code: {
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.78rem",
    color: "#45506a",
    background: "#f0f3fa",
    padding: "0.1rem 0.35rem",
    borderRadius: "0.3rem",
    alignSelf: "flex-start" as const,
  },
};

function Toggle({ row }: { row: Row }) {
  const [value, setValue] = useState(readBool(row.key));
  const onChange = (e: Event) => {
    const next = (e.currentTarget as HTMLInputElement).checked;
    if (prefsApi) prefsApi.setBoolPref(row.key, next);
    setValue(prefsApi ? readBool(row.key) : next);
  };
  return (
    <label style={s.row}>
      <input
        type="checkbox"
        checked={value}
        disabled={!prefsApi}
        onChange={onChange}
        style={{ marginTop: "0.2rem", accentColor: "#5b8def" }}
      />
      <span style={s.rowText}>
        <span style={s.label}>{row.label}</span>
        <span style={s.desc}>{row.desc}</span>
        <code style={s.code}>{row.key} = {String(value)}</code>
      </span>
    </label>
  );
}

export function Settings() {
  const newtabPageEnabled = prefsApi
    ? String(prefsApi.getBoolPref("browser.newtabpage.enabled", false))
    : "n/a";

  return (
    <main style={s.main}>
      <header style={s.header}>
        <h1 style={s.h1}>Noraneko Settings</h1>
        <span style={s.badge(!!prefsApi)}>
          {prefsApi ? "privileged - Services available" : "unprivileged - read-only"}
        </span>
      </header>

      <section style={s.section}>
        <h2 style={s.h2}>WebExtension actors</h2>
        <p style={s.hint}>
          Parallel mechanism to the JSActors. Changes apply after a restart.
        </p>
        {ROWS.map((row) => <Toggle key={row.key} row={row} />)}
      </section>

      <section style={s.section}>
        <h2 style={s.h2}>Read check</h2>
        <p style={s.hint}>
          A direct read of a built-in Firefox pref, proving arbitrary reads work.
        </p>
        <code style={s.code}>browser.newtabpage.enabled = {newtabPageEnabled}</code>
      </section>
    </main>
  );
}
