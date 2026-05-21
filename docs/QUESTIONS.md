# Questions for Project Maintainers

This document contains questions that would help future AI agents (or developers) better understand the Noraneko project. These questions arose during the documentation effort and represent areas where additional context would be valuable.

## Build System Questions

### 1. Version Management
- **Q1.1:** What is the relationship between `VERSION` in `defines.ts` (currently "002" for Windows/Linux, "000" for macOS) and the actual Noraneko version in `package.json`? Why are they different?
  It is for force-update in dev environment if the binary handling changed in build system.
- **Q1.2:** How should `buildid2` (UUID v7) be used? Is it for cache busting, update detection, or something else?
  It is used for update in release without build. Mozilla checks buildid for update, and it doesn't changes because it's constant in build time, and we don't rebuild in release.
  So, for lightweight release without changing version, the buildid2 was needed.
- **Q1.3:** What is the versioning strategy for Noraneko vs the underlying Firefox version?
  No strategy. just semver without following Firefox.

### 2. Patch System
- **Q2.1:** Some patch files are marked with `.temp` suffix (e.g., `CustomizableUI.sys.patch.temp`, `AppProvidedSearchEngine.sys.patch.temp`). What does this suffix indicate? Are these patches that should not be applied?
  It's just lazy that is broken patch by Firefox update, and stashed temporary (but I'm lazy to update it). Just let it be :3
- **Q2.2:** What is the process for updating patches when the noraneko-runtime is updated?
  No process. just by human.
- **Q2.3:** Are there automated tests to verify patches apply cleanly to new runtime versions?
  No, if the build fails, I check.

### 3. Runtime Binary
- **Q3.1:** What triggers a new noraneko-runtime release? Is it tied to Firefox upstream updates?
  Yes, basically. when I pull update from upstream, noraneko-runtime will have new binary.
- **Q3.2:** The code references version "002" for Windows/Linux and "000" for macOS. What do these versions represent?
  Same as Q1.1; also, macOS is not supported by noraneko (it's supported by Floorp 12) so just reservation.
- **Q3.3:** Are there plans to support ARM64 builds on Windows?
  Not now. it's heavy burden for hobby.

### 4. Build Modes
- **Q4.1:** What is the difference between `dev` and `stage` commands in practice? When should each be used?
  `dev` is for realtime HMR, and `stage` is for testing production environment. sometimes `dev` broken by upstream change, so I'm prefering `stage` for now. (the HMR was important point in noraneko dev but who care :3)
- **Q4.2:** Why is minification disabled for production builds (`minify: false` in vite.config.ts)?
  It's for debug.
- **Q4.3:** The settings UI (`src/ui/settings`) appears to be commented out in several places. What is its status?
  Deprecated. I'm lazy to update it.

## Architecture Questions

### 5. Module System
- **Q5.1:** What determines which modules are in `browser-features/chrome/common/` vs `browser-features/modules/modules/`?
  `chrome/common` is for basic features like modifying UI/UX (it's browser's `chrome`), and `modules` are for mainly JSActor in Firefox, sometimes for patch base codes.
  Shared codes are no need to place in modules, because vite is there.
- **Q5.2:** How does the module priority/initialization order work beyond the dependency graph?
  I think it's just alphabetical. I'm not sure.
- **Q5.3:** Are there plans to make the module enable/disable functionality user-facing?
  Yes, kind of? currently the internal feature is for emergency disable if the module causes significant bug for experience and announce to use the pref.

### 6. ModuleEventBus
- **Q6.1:** The RPC system uses a 5-second timeout. Is this configurable per-module, and what happens if a module consistently times out?
  I have no idea for it. It's not important. you can change it.
- **Q6.2:** How should large data transfers between modules be handled via RPC?
  The RPC is not networking, so it will have no problem. pls suggest better naming than RPC if you have idea :3
- **Q6.3:** Is there logging/debugging infrastructure for RPC calls in production?
  No, but it will be required.

### 7. Chrome Registration
- **Q7.1:** Why are some URLs `chrome://` and others `resource://`? What determines which to use?
  Basically chrome:// for JS, and resource:// for skin and modules.
  Because of vite, images can be mixed to chrome://
- **Q7.2:** The `contentaccessible=yes` flag is used everywhere. Are there security considerations?
  No.
- **Q7.3:** How does the `jar.mn` file in `browser-features/skin/` interact with the build system?
  I don't know. it is working.

### 8. Theming
- **Q8.1:** What is the relationship between Fluerial, Lepton, and Noraneko themes? Can users switch between them?
  Yes, users can switch between them in realtime.
- **Q8.2:** How are theme updates synchronized with browser updates?
  Sometimes. if there is update, I will try to update local files.
- **Q8.3:** Is Tailwind CSS used throughout the project, or only in specific components?
  I think it is for throughout.

## Development Questions

### 9. Testing
- **Q9.1:** Where are the main test suites located and how are they run?
  No test for now. if tests happens, `<root>/tests` would be good.
- **Q9.2:** Is there integration testing between modules?
  No.
- **Q9.3:** How is the RPC system tested in isolation vs with real modules?
  Not tested.

### 10. Development Workflow
- **Q10.1:** What is the recommended IDE setup (extensions, settings)?
  VSCode with Deno extension.
- **Q10.2:** How do developers debug issues in the browser chrome?
  Just retrying w/ browser console.
- **Q10.3:** What logging levels are available and how are they configured?
  I'm not sure.

### 11. Continuous Integration
- **Q11.1:** The `copilot-setup-steps.yml` workflow exists - what is Copilot's role in the development process?
  Develop supporter. :3
- **Q11.2:** How are alpha releases versioned and published?
  It's not published for now. I want to do it.
- **Q11.3:** Is there a staging/testing environment for pre-release builds?
  No. by human.

## Technical Debt & Future Plans

### 12. Known Issues
- **Q12.1:** ~~The `libs/user-js-runner` is excluded from Deno checks in `deno.json`, but the directory doesn't exist. Is this exclusion still needed, or should it be removed?~~ **RESOLVED**: This exclusion has been removed.
- **Q12.2:** Several `@ts-expect-error` comments exist. Are these tracked for resolution?
  No, but there was invalid error, so I added it.
- **Q12.3:** What is the status of the `experiment` folder in `browser-features/chrome/`?
  Temp folder. I'm lazy :3

### 13. Planned Features
- **Q13.1:** The new tab page (`pages-newtab`) appears to be in development. What features are planned?
  It is used in Floorp 12. in noraneko, you don't need to care it. it is for custom newtab page.
- **Q13.2:** Are there plans to migrate away from XUL elements entirely?
  Not now.
- **Q13.3:** What is the roadmap for Floorp 12 integration?
  Already noraneko 0.2.0 is integrated in Floorp 12.

### 14. Dependencies
- **Q14.1:** The project uses both Deno and Node.js (pnpm). Is there a plan to consolidate?
  pnpm is not used now. only deno will enough.
- **Q14.2:** Why is `rolldown-vite` used instead of standard Vite?
  it is fast, isn't it? :3
- **Q14.3:** Are there concerns about the `linkedom` dependency (version pinned at 0.18.12)?
  No. when I tried latest version, it had bug for XHTML processing. for now, I'm not sure I should update or not.

## Documentation Questions

### 15. Existing Documentation
- **Q15.1:** The RPC documentation is comprehensive, but is it kept up to date with code changes?
  No, concise documentation is enough.
- **Q15.2:** Is there user-facing documentation for Noraneko features?
  No, it is required but there is no user of noraneko so not critical for now. sometime, I want to do it.
- **Q15.3:** Are there architecture decision records (ADRs) for major decisions?
  No, I've heard it first time. Thank you for idea :)

### 16. Contributing
- **Q16.1:** What is the process for contributing new modules?
  No. contact me in issues :3
- **Q16.2:** Are there coding standards or style guides beyond Prettier/OXLint configs?
  No.
- **Q16.3:** How are breaking changes communicated and handled?
  No. currently solo.


*This document was generated during an architecture review. Please update or remove questions as they are answered.*
