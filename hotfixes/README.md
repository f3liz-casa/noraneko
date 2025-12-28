# Noraneko Hotfix System

This directory contains the infrastructure for the Noraneko Hotfix System, which provides non-destructive module patching with Sigstore-based keyless signature verification.

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

### Option 1: Using the Hotfix Creator Tool (Recommended)

Use the interactive CLI tool to quickly set up a hotfix:

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

You can also use non-interactive mode:

```bash
deno task hotfix:create --non-interactive \
  --id fix-sidebar-crash \
  --version 1.0.0 \
  --description "Fix sidebar crash on tab close" \
  --modules sidebar
```

### Option 2: Manual Setup

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
