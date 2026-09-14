# Running Noraneko in development

Two commands, on macOS (Apple Silicon) or Linux. Everything else — the Firefox
runtime, the profile, the build output — is downloaded or generated under
`_dist/`, and nothing is installed system-wide.

## What you need

- **git**
- **[mise](https://mise.jdx.dev)** — pins the toolchain in `mise.toml`
  (deno 2.9.6, ruby 3.4). If you would rather not use mise, install those two
  yourself; nothing else is required.
- **~3 GB** of free disk (runtime archive + extracted runtime + build output)
- `tar` with xz support (standard on both platforms)
- macOS only: the Xcode Command Line Tools, for `codesign` and `xattr`
  (`xcode-select --install`). The runtime is cross-built and unsigned, so it is
  ad-hoc signed on extraction — without it, macOS refuses to load XPCOM.

No Node, no pnpm: the npm packages are resolved by Deno.

## Start it

```sh
mise install
mise exec -- deno task feles-build dev
```

If you would rather not keep commands in your head, `deno task launcher` opens a
page that does all of this from two buttons — see [Launcher](LAUNCHER.md).

`mise install` only *installs* the tools — it does not put them on your `PATH`.
Either keep the `mise exec --` prefix, or activate mise in your shell once
(`eval "$(mise activate bash)"`, `zsh`, …) and then just
`deno task feles-build dev`.

### What the first run does

1. **Downloads the runtime** (~66 MB): a Firefox build for your platform, from
   `dl.f3liz.casa` (the noraneko-runtime CI), falling back to GitHub releases.
   It is cached as `noraneko-<platform>-<arch>-moz-artifact.tar.xz` in the repo
   root, so the next run does not download again.
2. **Extracts** it into `_dist/bin/` (and ad-hoc signs the `.app` on macOS).
3. **Patches, builds and injects** the browser features into that runtime.
4. **Starts the Vite dev servers** (HMR) and **launches the browser** with a dev
   profile at `_dist/profile/test` and remote debugging (BiDi) on **5180**.

Closing the browser window stops the dev servers and ends the task.

## Platforms

| Platform | State |
|---|---|
| macOS arm64 (Apple Silicon) | **Works.** Verified from a clean clone, 2026-09-12. |
| Linux aarch64 | **Should work.** A current runtime is published and its layout is the one the tooling expects; we have not yet run it end to end on a Linux machine. Please tell us how it goes. |
| Linux x86_64 | **No current runtime.** The CI builder is aarch64, so the newest x86_64 artifact is from 2025-09 (`passed-20250917142938`) and will drift from the code here. You can still try it by pinning that tag (below). |
| Windows x86_64 | **Should work.** A current runtime (155.0.1) is published on `dl.f3liz.casa`, built by the x86_64 CI box; we have not yet run the dev loop on a Windows machine. Please tell us how it goes. |

If your platform has no runtime, the download step stops and says so, rather
than leaving you with a broken extract.

### Pinning a particular runtime

```sh
NORANEKO_RUNTIME_TAG=passed-20260902074154 mise exec -- deno task feles-build dev
```

Tags are the releases of
[f3liz-casa/noraneko-runtime](https://github.com/f3liz-casa/noraneko-runtime).
Delete the cached `noraneko-*-moz-artifact.tar.xz` (and `_dist/bin`) when you
switch.

## Where things are

| Path | What |
|---|---|
| `_dist/bin/` | the runtime (`Noraneko.app` on macOS, `noraneko/` on Linux) |
| `_dist/profile/test/` | the dev profile |
| `_dist/buildid2` | build id of the current dev build |
| `logs/vite-*.log` | dev server logs |
| 5180 | BiDi / remote debugging |

## When something goes wrong

- **`deno: command not found`** — `mise install` installed it, but your shell
  does not see it. Use `mise exec -- …` or activate mise.
- **The browser closes right after launching** (`[launcher] Browser Closed`
  immediately) — another Noraneko is already running on the same profile, so
  your new process handed over to it and exited. Close that one, or launch by
  hand with a different profile and port:

  ```sh
  # macOS
  _dist/bin/noraneko/Noraneko.app/Contents/MacOS/noraneko \
    --profile /tmp/nora-profile --remote-debugging-port 5190 \
    --remote-allow-system-access --no-remote
  # Linux
  _dist/bin/noraneko/noraneko \
    --profile /tmp/nora-profile --remote-debugging-port 5190 \
    --remote-allow-system-access --no-remote
  ```

  (That runs the already-built runtime; it does not rebuild.)
- **`HTTP 404` while downloading the runtime** — your platform has no build
  published yet. See the table above.
- **macOS: "Couldn't load XPCOM"** — the bundle lost its ad-hoc signature
  (usually after being copied or modified by hand). Remove `_dist/bin` and run
  dev again.
- **Stale Vite servers** — the launcher kills leftovers from a previous run and
  says so in the log; that line is expected, not an error.

## Next

- [Launcher](LAUNCHER.md) — the same thing from a page, with no commands to remember
- [Build System](BUILD_SYSTEM.md) — what each step above actually does
- [Architecture](ARCHITECTURE.md) — how the pieces fit together
