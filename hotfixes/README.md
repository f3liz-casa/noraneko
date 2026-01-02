# Noraneko Hotfix System

This directory contains the infrastructure for the Noraneko Hotfix System, which provides non-destructive module patching with Sigstore-based keyless signature verification.

> **Note**: For regular module distribution, consider using the **Noraneko Module Archive (NMA)** format instead. NMA provides installation-directory based module distribution that's verified on every startup. See [docs/NMA_FORMAT.md](../docs/NMA_FORMAT.md) for details.
>
> The hotfix system is designed for **emergency patches** that need to be distributed to specific users without requiring a full update. For regular releases, use NMA.

## Overview

The hotfix system implements a "Disable & Inject" pattern:
1. Buggy modules are disabled via preferences
2. Patched modules are loaded from the user's profile
3. All patches are cryptographically signed using Sigstore/Cosign

## Directory Structure

```
hotfixes/
├── README.md           # This file
├── manifest.json       # Index of all available hotfixes (auto-generated)
└── source/
    └── patches/        # Source patch files for hotfixes
```

## Creating a Hotfix

### Option 1: Using the Vite Plugin (Recommended)

The hotfix system is integrated as a Vite plugin in `browser-features/chrome`. During development, you can create hotfixes via the dev server:

```
http://localhost:5181/__hotfix/create?id=fix-crash&version=1.0.0&modules=sidebar,tabs&description=Fix%20crash
```

Query parameters:
- `id` (required): Hotfix ID (e.g., `fix-sidebar-crash`)
- `modules` (required): Comma-separated module names
- `version`: Semver version (default: `1.0.0`)
- `description`: User-facing description
- `minVersion`: Minimum Noraneko version (default: `0.0.0`)
- `maxVersion`: Maximum Noraneko version (optional)
- `targetChannels`: Comma-separated channels (e.g., `nightly,beta`)

### Option 2: Using the CLI Tool

Use the interactive CLI tool:

```bash
deno task hotfix:create
```

The tool will:
1. Prompt you for hotfix details (ID, version, description, modules)
2. Auto-detect module files from multiple locations:
   - `browser-features/modules/modules/` (system modules)
   - `browser-features/modules/actors/` (actor modules)
   - `browser-features/chrome/` (UI components, utilities, static features)
   - `bridge/loader-features/loader/` (loader features)
3. Copy module files to `hotfixes/source/patches/`
4. Calculate SHA-256 hashes for patch files
5. Generate a template manifest and README with instructions

The tool supports various file types including `.ts`, `.tsx`, `.mts`, and `.sys.mts` files.

Non-interactive mode:

```bash
deno task hotfix:create --non-interactive \
  --id fix-sidebar-crash \
  --version 1.0.0 \
  --description "Fix sidebar crash on tab close" \
  --modules sidebar
```

### Option 3: Manual Setup

If you prefer to set up a hotfix manually:

#### 1. Prepare the Patch

Create your patched module file in `source/patches/`:

```bash
# Copy the original module as a starting point
cp browser-features/modules/modules/YourModule.sys.mts hotfixes/source/patches/YourModule.sys.mjs
# Edit the patch file to fix the bug
```

#### 2. Run the Signing Workflow

Use the GitHub Actions workflow to sign and publish the hotfix:

1. Go to Actions → "🔐 Sign Hotfix"
2. Fill in the required fields:
   - **hotfix_id**: Unique identifier (e.g., `fix-sidebar-crash`)
   - **version**: Semver version (e.g., `1.0.0`)
   - **description**: User-facing description
   - **patch_modules**: Comma-separated module names
   - **min_version**: Minimum Noraneko version

3. The workflow will:
   - Generate a unique unlock code (e.g., `NK-7F2A`)
   - Sign the manifest using Sigstore (keyless)
   - Record the signature in Rekor transparency log
   - Upload the hotfix artifacts

#### 3. Distribute the Unlock Code

Share the generated unlock code with testers or affected users. They can enter this code in **Settings → Advanced → Hotfix** to download and install the patch.

## Security Model

### Keyless Signing (Sigstore)

The system uses Sigstore's keyless signing infrastructure via the [@freedomofpress/sigstore-browser](https://github.com/freedomofpress/sigstore-browser) library:
- No private keys to manage or leak
- Signatures are tied to GitHub Actions OIDC identity
- All signatures are recorded in Rekor transparency log
- Full verification including certificate chains, transparency logs, and timestamps
- TUF-based trusted root management for secure updates

### Identity Verification

The browser verifies that hotfixes are signed by:
- **Issuer**: `https://token.actions.githubusercontent.com`
- **Repository**: Official Noraneko repository
- **Workflow**: `hotfix_sign.yml` workflow

### Two-Factor Trust

1. **Automated**: Cryptographic signature and identity verification
2. **Manual**: User consent dialog showing signer identity

## User Experience

1. User receives unlock code from developer/support
2. User enters code in Settings → Advanced → Hotfix
3. Browser fetches and verifies the hotfix manifest
4. User sees consent dialog with:
   - Hotfix description
   - Signer identity (GitHub Actions workflow)
   - List of modules to be patched
5. User clicks "Trust & Install" to proceed
6. Hotfix is applied on next browser restart

## Reverting a Hotfix

Users can revert hotfixes from Settings → Advanced → Hotfix:
1. Select the installed hotfix
2. Click "Revert"
3. Original modules are restored on restart

Alternatively, clear the preference:
```
noraneko.hotfix.disabled_modules = "[]"
noraneko.hotfix.installed = "[]"
```

## Hot-Swapping Modules

The hotfix system supports runtime hot-swapping of modules without requiring a browser restart. This is particularly useful during development and for quick fixes.

### Hash-Based Change Detection

The hotfix system uses SHA-256 hash-based detection to determine what changed and optimize the reload process:

1. **deno.lock Hash**: If the `deno.lock` file hash changes (indicating dependency updates), a **full reload** of all modules is triggered
2. **Module File Hashes**: If only specific module files changed, a **selective reload** of those modules and their dependents is triggered
3. **No Changes**: If hashes match, no reload is needed

This optimization minimizes disruption by only reloading what actually changed.

### How Hot-Swapping Works

**Full Reload** (deno.lock changed):
1. **Cleanup Phase**: All currently loaded modules have their `cleanup()` method called
2. **Unregistration**: Modules are unregistered from the EventDispatcher registry
3. **Reload**: All module versions are loaded fresh
4. **Re-initialization**: All modules are re-initialized

**Selective Reload** (only specific modules changed):
1. **Dependency Analysis**: Identify modules that depend on changed modules
2. **Selective Cleanup**: Cleanup only affected modules (changed + dependents)
3. **Selective Reload**: Load only the affected modules
4. **Re-initialization**: Re-initialize only the affected modules

### Component Cleanup Requirements

All components using the `@component` decorator **must** implement a `cleanup()` method:

```typescript
import { component, HotswappableComponent } from "#features-chrome/utils/base.ts";

@component({
  moduleName: "my-feature",
  hot: import.meta.hot,
})
export default class MyFeature implements HotswappableComponent {
  private intervalId: number | null = null;
  
  init() {
    this.intervalId = setInterval(() => {}, 1000);
  }
  
  cleanup() {
    // Required for hot-swapping support
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Remove any DOM elements
    document.getElementById("my-element")?.remove();
  }
}
```

The cleanup method should:
- Remove all event listeners
- Clear all intervals/timeouts
- Remove any DOM elements created by the component
- Unregister from any external registries

### Programmatic Hot-Swap

You can trigger a hot-swap programmatically:

```typescript
import { 
  hotswapModules,
  hotswapSelectiveModules,
  hotswapWithHashDetection 
} from "chrome://noraneko-startup/content/features-chrome/core.js";

// Full hot-swap of all modules
await hotswapModules(hotfixId);

// Selective hot-swap of specific modules only
await hotswapSelectiveModules(["sidebar", "tabs"]);

// Hash-based detection (recommended) - automatically determines full vs selective
await hotswapWithHashDetection(hotfixId, modulePaths);
```

## Technical Details

### Preferences

| Preference | Description |
|------------|-------------|
| `noraneko.hotfix.installed` | JSON array of installed hotfixes |
| `noraneko.hotfix.disabled_modules` | JSON array of disabled module names |
| `noraneko.hotfix.unlock_codes` | JSON array of unlocked codes |
| `noraneko.hotfix.manifest_url` | Override URL for manifest (testing) |

### File Locations

- Hotfixes stored in: `<profile>/noraneko-hotfixes/<hotfix-id>/`
- Each hotfix contains:
  - `manifest.json`: Signed manifest with metadata
  - `signature-bundle.json`: Sigstore bundle for verification
  - `patches/`: Directory containing patched modules
