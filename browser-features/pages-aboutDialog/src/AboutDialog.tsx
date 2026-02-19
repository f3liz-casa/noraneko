import { h, Fragment } from "preact";
import { useEffect, useState, useRef, useMemo } from "preact/hooks";

declare const ChromeUtils: any;
declare const Services: any;
declare const Ci: any;
declare const Cc: any;
declare const openHelpLink: any;
declare const openFeedbackPage: any;

// ─── Types ────────────────────────────────────────────────────────────────────

type UpdatePanel =
  | "idle"
  | "checking"
  | "checkFailed"
  | "upToDate"
  | "available"
  | "downloading"
  | "applying"
  | "readyToRestart"
  | "restarting"
  | "policyDisabled"
  | "downloadFailed"
  | "noUpdater";

interface UpdateStatus {
  panel: UpdatePanel;
  downloadProgress?: string; // e.g. "4.2 MB of 80 MB"
  availableVersion?: string;
}

// ─── Update status → human-readable text ──────────────────────────────────────

function updateLabel(status: UpdateStatus): { text: string; busy?: boolean } {
  switch (status.panel) {
    case "checking":
      return { text: "Checking for updates…", busy: true };
    case "checkFailed":
      return { text: "Couldn't check for updates. Try again later." };
    case "upToDate":
      return { text: "You're up to date." };
    case "downloading":
      return {
        text: `Downloading update… ${status.downloadProgress ?? ""}`,
        busy: true,
      };
    case "applying":
      return { text: "Installing update…", busy: true };
    case "readyToRestart":
      return { text: "Update ready — restart to apply." };
    case "restarting":
      return { text: "Restarting…", busy: true };
    case "policyDisabled":
      return { text: "Updates are managed by your organisation." };
    case "downloadFailed":
      return { text: "Download failed. Please try again." };
    case "noUpdater":
      return { text: "Updates are managed externally." };
    default:
      return { text: "" };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AboutDialog() {
  const [distroAbout, setDistroAbout] = useState("");
  const [distroId, setDistroId] = useState("");
  const [version, setVersion] = useState("");
  const [isNightly, setIsNightly] = useState(false);
  const [isEsr, setIsEsr] = useState(false);
  const [releaseNotesUrl, setReleaseNotesUrl] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    panel: "noUpdater",
  });

  const appUpdaterRef = useRef<any>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);

  const AppConstants = useMemo(() => {
    try {
      const { AppConstants } = ChromeUtils.importESModule(
        "resource://gre/modules/AppConstants.sys.mjs",
      );
      return AppConstants;
    } catch {
      return {
        MOZ_UPDATER: false,
        IS_ESR: false,
        MOZ_APP_VERSION_DISPLAY: "unknown",
      };
    }
  }, []);

  // ── Initialise ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.close();
    };
    window.addEventListener("keydown", onKeydown);

    try {
      // Distribution info
      const defaults = Services.prefs.getDefaultBranch(null);
      const dId = defaults.getCharPref("distribution.id", "");
      if (dId) {
        const dAbout = defaults.getStringPref("distribution.about", "");
        const dVersion = defaults.getCharPref("distribution.version", "");
        if (dAbout) setDistroAbout(dAbout);
        if (!dId.startsWith("mozilla-") || dAbout)
          setDistroId(dVersion ? `${dId} — ${dVersion}` : dId);
      }

      // Version string
      const rawVersion = Services.appinfo.version;
      setVersion(AppConstants.MOZ_APP_VERSION_DISPLAY);
      if (/a\d+$/.test(rawVersion)) setIsNightly(true);
      if (AppConstants.IS_ESR) setIsEsr(true);

      // Release notes
      if (
        Services.prefs.getPrefType("app.releaseNotesURL.aboutDialog") !==
        Services.prefs.PREF_INVALID
      ) {
        const url = Services.urlFormatter.formatURLPref(
          "app.releaseNotesURL.aboutDialog",
        );
        if (url !== "about:blank") setReleaseNotesUrl(url);
      }

      // Updater
      if (!AppConstants.MOZ_UPDATER) return;

      const { AppUpdater } = ChromeUtils.importESModule(
        "resource://gre/modules/AppUpdater.sys.mjs",
      );
      const { DownloadUtils } = ChromeUtils.importESModule(
        "resource://gre/modules/DownloadUtils.sys.mjs",
      );
      const updater = new AppUpdater();
      appUpdaterRef.current = updater;

      const onUpdate = (status: any, ...args: any[]) => {
        switch (status) {
          case AppUpdater.STATUS.UPDATE_DISABLED_BY_POLICY:
            setUpdateStatus({ panel: "policyDisabled" });
            break;
          case AppUpdater.STATUS.READY_FOR_RESTART:
            setUpdateStatus({ panel: "readyToRestart" });
            break;
          case AppUpdater.STATUS.DOWNLOADING: {
            const [progress = 0] = args;
            const max = updater.update?.selectedPatch?.size ?? -1;
            setUpdateStatus({
              panel: "downloading",
              downloadProgress: DownloadUtils.getTransferTotal(progress, max),
            });
            break;
          }
          case AppUpdater.STATUS.STAGING:
            setUpdateStatus({ panel: "applying" });
            break;
          case AppUpdater.STATUS.CHECKING:
            setUpdateStatus({ panel: "checking" });
            break;
          case AppUpdater.STATUS.CHECKING_FAILED:
            setUpdateStatus({ panel: "checkFailed" });
            break;
          case AppUpdater.STATUS.NO_UPDATES_FOUND:
            setUpdateStatus({ panel: "upToDate" });
            break;
          case AppUpdater.STATUS.DOWNLOAD_AND_INSTALL:
            setUpdateStatus({
              panel: "available",
              availableVersion: updater.update?.displayVersion,
            });
            break;
          case AppUpdater.STATUS.DOWNLOAD_FAILED:
            setUpdateStatus({ panel: "downloadFailed" });
            break;
          case AppUpdater.STATUS.NEVER_CHECKED:
            setUpdateStatus({ panel: "idle" });
            break;
          default:
            setUpdateStatus({ panel: "noUpdater" });
        }
      };

      updater.addListener(onUpdate);
      updater.check();
      return () => {
        updater.removeListener(onUpdate);
        updater.stop();
        window.removeEventListener("keydown", onKeydown);
      };
    } catch {}
    return () => window.removeEventListener("keydown", onKeydown);
  }, [AppConstants]);

  // Focus the action button whenever the update panel changes
  useEffect(() => {
    actionButtonRef.current?.focus();
  }, [updateStatus.panel]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const checkForUpdates = () => appUpdaterRef.current?.check();
  const downloadUpdate = () => appUpdaterRef.current?.allowUpdateDownload();

  const restartToUpdate = () => {
    const aus = Cc["@mozilla.org/updates/update-service;1"].getService(
      Ci.nsIApplicationUpdateService,
    );
    if (aus.currentState !== Ci.nsIApplicationUpdateService.STATE_PENDING)
      return;

    setUpdateStatus({ panel: "restarting" });

    const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool,
    );
    Services.obs.notifyObservers(
      cancelQuit,
      "quit-application-requested",
      "restart",
    );
    if (cancelQuit.data) {
      setUpdateStatus({ panel: "readyToRestart" });
      return;
    }

    if (Services.appinfo.inSafeMode) {
      Services.startup.restartInSafeMode(Ci.nsIAppStartup.eAttemptQuit);
      return;
    }
    if (
      !Services.startup.quit(
        Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart,
      )
    )
      setUpdateStatus({ panel: "readyToRestart" });
  };

  // ── Update UI ───────────────────────────────────────────────────────────────

  const renderUpdateSection = () => {
    if (updateStatus.panel === "idle")
      return (
        <button ref={actionButtonRef} onClick={checkForUpdates}>
          Check for updates
        </button>
      );

    if (updateStatus.panel === "available")
      return (
        <button ref={actionButtonRef} onClick={downloadUpdate}>
          Download update
          {updateStatus.availableVersion
            ? ` (${updateStatus.availableVersion})`
            : ""}
        </button>
      );

    if (updateStatus.panel === "readyToRestart")
      return (
        <button ref={actionButtonRef} onClick={restartToUpdate}>
          Restart to apply update
        </button>
      );

    if (
      updateStatus.panel === "checkFailed" ||
      updateStatus.panel === "downloadFailed"
    )
      return (
        <span
          style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          {/* role="alert" announces error messages immediately, without waiting */}
          <span
            role="alert"
            style={{ color: "var(--color-red, #c0392b)", fontSize: "1rem" }}
          >
            {updateLabel(updateStatus).text}
          </span>
          <button
            class="outline"
            onClick={checkForUpdates}
            style={{ width: "fit-content" }}
          >
            Try again
          </button>
        </span>
      );

    const { text, busy } = updateLabel(updateStatus);
    if (!text) return null;
    return (
      <span
        aria-busy={busy}
        style={{ color: "var(--muted-color)", fontSize: "1rem" }}
      >
        {text}
      </span>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const channelBadge = isNightly
    ? "Nightly"
    : isEsr
      ? "Extended Support"
      : null;

  return (
    // role="dialog" + aria-label tells screen readers what this window is
    <main
      role="dialog"
      aria-label="About Noraneko"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <article
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "860px",
          margin: "0 auto",
          padding: "2.5rem",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Top: branding + info ── */}
        <div
          class="grid"
          style={{ alignItems: "center", gap: "2.5rem", flex: 1 }}
        >
          {/* Logo + name */}
          <section
            aria-label="Application branding"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "1.25rem",
              borderRight: "1px solid var(--muted-border-color)",
            }}
          >
            {/*
              alt="" because the "Noraneko" h1 already names the app.
              aria-hidden removes the image from the accessibility tree entirely,
              preventing screen readers from announcing a redundant "image".
            */}
            <img
              src="chrome://branding/content/about-logo@2x.png"
              width={140}
              height={140}
              alt=""
              aria-hidden="true"
              style={{ objectFit: "contain" }}
            />
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "2.4rem",
                  fontWeight: 800,
                  lineHeight: 1.1,
                }}
              >
                Noraneko
              </h1>
              {channelBadge && (
                // role="note" keeps it audible but outside the heading hierarchy
                <p
                  role="note"
                  style={{
                    margin: "0.4rem 0 0",
                    fontSize: "1.05rem",
                    opacity: 0.75,
                  }}
                >
                  {channelBadge}
                </p>
              )}
            </div>
          </section>

          {/* Version + updates */}
          <section
            aria-label="Version and updates"
            style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}
          >
            {/* Version block */}
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.9rem",
                  opacity: 0.6,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Version
              </p>
              {/*
                aria-label reads as "Version 147.0.3" as one unit,
                so screen readers don't just read the bare number.
              */}
              <p
                aria-label={`Version ${version || "unknown"}`}
                style={{
                  margin: "0.3rem 0 0",
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {version || "—"}
              </p>
              {releaseNotesUrl && (
                <a
                  href={releaseNotesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "1rem",
                    display: "inline-block",
                    marginTop: "0.4rem",
                  }}
                  data-l10n-id="releaseNotes-link"
                >
                  What's new in this version
                </a>
              )}
            </div>

            {/*
              aria-live="polite" announces status changes after the user
              finishes what they're currently doing — not mid-sentence.
              aria-atomic="true" reads the whole message, not just the diff.
            */}
            <div
              aria-live="polite"
              aria-atomic="true"
              style={{
                minHeight: "3.5rem",
                display: "flex",
                alignItems: "center",
              }}
            >
              {renderUpdateSection()}
            </div>

            {/* nav landmark lets keyboard users jump directly here */}
            <nav
              aria-label="Support links"
              style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}
            >
              <a
                href="#"
                class="secondary"
                style={{ fontSize: "1.05rem" }}
                onClick={(e) => {
                  e.preventDefault();
                  typeof openHelpLink === "function" &&
                    openHelpLink("firefox-help");
                }}
                data-l10n-id="aboutdialog-help-user"
              >
                Noraneko Help
              </a>
              <a
                href="#"
                class="secondary"
                style={{ fontSize: "1.05rem" }}
                onClick={(e) => {
                  e.preventDefault();
                  typeof openFeedbackPage === "function" && openFeedbackPage();
                }}
                data-l10n-id="aboutdialog-submit-feedback"
              >
                Submit Feedback
              </a>
            </nav>
          </section>
        </div>

        {/* ── Footer: legal + distro ── */}
        <footer
          aria-label="Legal information"
          style={{
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid var(--muted-border-color)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: "0.95rem", opacity: 0.75 }}>
              {distroAbout && (
                <p style={{ margin: 0, fontWeight: 600 }}>{distroAbout}</p>
              )}
              {distroId && <p style={{ margin: 0 }}>{distroId}</p>}
            </div>
            <nav aria-label="Legal links">
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  gap: "1.25rem",
                  margin: 0,
                  padding: 0,
                  flexWrap: "wrap",
                }}
              >
                <li>
                  <a
                    href="about:license"
                    data-l10n-id="bottomLinks-license"
                    class="secondary"
                    style={{ fontSize: "0.95rem" }}
                  >
                    Licensing Information
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.mozilla.org/about/legal/terms/firefox/"
                    data-l10n-id="bottom-links-terms"
                    class="secondary"
                    style={{ fontSize: "0.95rem" }}
                  >
                    Terms of Use
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.mozilla.org/privacy/firefox/"
                    data-l10n-id="bottom-links-privacy"
                    class="secondary"
                    style={{ fontSize: "0.95rem" }}
                  >
                    Privacy Notice
                  </a>
                </li>
              </ul>
            </nav>
          </div>
          <p
            style={{
              margin: "1rem 0 0",
              textAlign: "center",
              fontSize: "0.85rem",
              opacity: 0.6,
            }}
            data-l10n-id="trademarkInfo"
          />
        </footer>
      </article>
    </main>
  );
}
