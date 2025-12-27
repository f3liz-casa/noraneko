# Questions for Project Maintainers

This document contains questions that would help future AI agents (or developers) better understand the Noraneko project. These questions arose during the documentation effort and represent areas where additional context would be valuable.

## Build System Questions

### 1. Version Management
- **Q1.1:** What is the relationship between `VERSION` in `defines.ts` (currently "002" for Windows/Linux, "000" for macOS) and the actual Noraneko version in `package.json`? Why are they different?
- **Q1.2:** How should `buildid2` (UUID v7) be used? Is it for cache busting, update detection, or something else?
- **Q1.3:** What is the versioning strategy for Noraneko vs the underlying Firefox version?

### 2. Patch System
- **Q2.1:** Some patch files are marked with `.temp` suffix (e.g., `CustomizableUI.sys.patch.temp`, `AppProvidedSearchEngine.sys.patch.temp`). What does this suffix indicate? Are these patches that should not be applied?
- **Q2.2:** What is the process for updating patches when the noraneko-runtime is updated?
- **Q2.3:** Are there automated tests to verify patches apply cleanly to new runtime versions?

### 3. Runtime Binary
- **Q3.1:** What triggers a new noraneko-runtime release? Is it tied to Firefox upstream updates?
- **Q3.2:** The code references version "002" for Windows/Linux and "000" for macOS. What do these versions represent?
- **Q3.3:** Are there plans to support ARM64 builds on Windows?

### 4. Build Modes
- **Q4.1:** What is the difference between `dev` and `stage` commands in practice? When should each be used?
- **Q4.2:** Why is minification disabled for production builds (`minify: false` in vite.config.ts)?
- **Q4.3:** The settings UI (`src/ui/settings`) appears to be commented out in several places. What is its status?

## Architecture Questions

### 5. Module System
- **Q5.1:** What determines which modules are in `browser-features/chrome/common/` vs `browser-features/modules/modules/`?
- **Q5.2:** How does the module priority/initialization order work beyond the dependency graph?
- **Q5.3:** Are there plans to make the module enable/disable functionality user-facing?

### 6. RPC System
- **Q6.1:** The RPC system uses a 5-second timeout. Is this configurable per-module, and what happens if a module consistently times out?
- **Q6.2:** How should large data transfers between modules be handled via RPC?
- **Q6.3:** Is there logging/debugging infrastructure for RPC calls in production?

### 7. Chrome Registration
- **Q7.1:** Why are some URLs `chrome://` and others `resource://`? What determines which to use?
- **Q7.2:** The `contentaccessible=yes` flag is used everywhere. Are there security considerations?
- **Q7.3:** How does the `jar.mn` file in `browser-features/skin/` interact with the build system?

### 8. Theming
- **Q8.1:** What is the relationship between Fluerial, Lepton, and Noraneko themes? Can users switch between them?
- **Q8.2:** How are theme updates synchronized with browser updates?
- **Q8.3:** Is Tailwind CSS used throughout the project, or only in specific components?

## Development Questions

### 9. Testing
- **Q9.1:** Where are the main test suites located and how are they run?
- **Q9.2:** Is there integration testing between modules?
- **Q9.3:** How is the RPC system tested in isolation vs with real modules?

### 10. Development Workflow
- **Q10.1:** What is the recommended IDE setup (extensions, settings)?
- **Q10.2:** How do developers debug issues in the browser chrome?
- **Q10.3:** What logging levels are available and how are they configured?

### 11. Continuous Integration
- **Q11.1:** The `copilot-setup-steps.yml` workflow exists - what is Copilot's role in the development process?
- **Q11.2:** How are alpha releases versioned and published?
- **Q11.3:** Is there a staging/testing environment for pre-release builds?

## Technical Debt & Future Plans

### 12. Known Issues
- **Q12.1:** The `libs/user-js-runner` is excluded from Deno checks in `deno.json`, but the directory doesn't exist. Is this exclusion still needed, or should it be removed?
- **Q12.2:** Several `@ts-expect-error` comments exist. Are these tracked for resolution?
- **Q12.3:** What is the status of the `experiment` folder in `browser-features/chrome/`?

### 13. Planned Features
- **Q13.1:** The new tab page (`pages-newtab`) appears to be in development. What features are planned?
- **Q13.2:** Are there plans to migrate away from XUL elements entirely?
- **Q13.3:** What is the roadmap for Floorp 12 integration?

### 14. Dependencies
- **Q14.1:** The project uses both Deno and Node.js (pnpm). Is there a plan to consolidate?
- **Q14.2:** Why is `rolldown-vite` used instead of standard Vite?
- **Q14.3:** Are there concerns about the `linkedom` dependency (version pinned at 0.18.12)?

## Documentation Questions

### 15. Existing Documentation
- **Q15.1:** The RPC documentation is comprehensive, but is it kept up to date with code changes?
- **Q15.2:** Is there user-facing documentation for Noraneko features?
- **Q15.3:** Are there architecture decision records (ADRs) for major decisions?

### 16. Contributing
- **Q16.1:** What is the process for contributing new modules?
- **Q16.2:** Are there coding standards or style guides beyond Prettier/OXLint configs?
- **Q16.3:** How are breaking changes communicated and handled?

---

## Priority Questions

If time is limited, these are the most impactful questions to answer:

1. **Q2.1** - Clarify `.temp` patch suffix meaning
2. **Q4.3** - Status of settings UI
3. **Q5.1** - Module location decision criteria
4. **Q7.1** - chrome:// vs resource:// URL choice
5. **Q13.3** - Floorp 12 integration roadmap

---

*This document was generated during an architecture review. Please update or remove questions as they are answered.*
