# Noraneko Module Archive (NMA) Format

## Overview

The Noraneko Module Archive (NMA) is an omni.ja-like format for distributing Noraneko modules. It provides a secure, verifiable way to distribute built JavaScript modules that can be hot-swapped without requiring a full browser rebuild.

## Key Features

1. **Network Transferable**: ZIP-based archive format that can be distributed over HTTP/HTTPS
2. **Sigstore Verification**: All archives are signed using Sigstore keyless signing and verified on startup
3. **Hot-Swappable**: Modules can be loaded and swapped at runtime without browser restart
4. **Installation-Directory Based**: NMA files are placed alongside `omni.ja` in the Firefox installation directory, not in the user profile
5. **Built with Vite/tsdown**: Uses the same build toolchain as the rest of Noraneko

## Security Model

### Sigstore Keyless Signing

NMA uses Sigstore's keyless signing infrastructure:
- No private keys to manage or leak
- Signatures are tied to GitHub Actions OIDC identity
- All signatures are recorded in the Rekor transparency log
- Verification is performed on every browser startup

### Trusted Sources

By default, NMA only accepts archives signed by:
- **Issuers**: `https://token.actions.githubusercontent.com`
- **Repositories**: `f3liz-dev/noraneko`, `noraneko-browser/noraneko`
- **Workflows**: `package*.yml`, `build*.yml`, `nma*.yml`

### Development Mode

In debug builds or nightly channel, unsigned NMA files are allowed for development purposes. This can be controlled via the `allowUnsignedInDev` configuration option.

## File Structure

```
noraneko.nma (ZIP archive)
├── manifest.json           # Archive manifest with metadata and signatures
├── modules/                # Built JavaScript modules
│   ├── core.js
│   ├── sidebar.js
│   └── ...
├── assets/                 # Static assets (CSS, images, etc.)
│   ├── css/
│   └── js/
└── signature-bundle.json   # Sigstore signature bundle
```

## Manifest Format

The `manifest.json` file contains:

```json
{
  "formatVersion": "1.0",
  "buildId": "018d12345678-abcd1234",
  "noranekoVersion": "0.3.0",
  "commitSha": "abc123def456...",
  "builtAt": "2024-01-15T12:00:00Z",
  "channel": "nightly",
  "modules": [
    {
      "name": "core",
      "path": "modules/core.js",
      "hash": "sha256:...",
      "size": 12345,
      "dependencies": [],
      "essential": true
    }
  ],
  "assets": [
    {
      "name": "styles.css",
      "path": "assets/css/styles.css",
      "hash": "sha256:...",
      "size": 5678,
      "mimeType": "text/css"
    }
  ],
  "sigstoreBundle": {
    "bundle": "base64-encoded-bundle...",
    "signerIdentity": {
      "issuer": "https://token.actions.githubusercontent.com",
      "subject": "...",
      "repository": "f3liz-dev/noraneko",
      "workflowRef": ".github/workflows/package.yml@refs/heads/main"
    },
    "rekorLogId": "...",
    "signedAt": "2024-01-15T12:00:00Z"
  },
  "archiveHash": "sha256:...",
  "isDelta": false,
  "minVersion": "0.0.0"
}
```

## Installation

NMA files should be placed in the Firefox installation directory alongside `omni.ja`:

**Linux**: `/usr/lib/noraneko/noraneko.nma`
**macOS**: `/Applications/Noraneko.app/Contents/Resources/noraneko.nma`
**Windows**: `C:\Program Files\Noraneko\noraneko.nma`

The NMA loader automatically detects and loads the archive on browser startup.

## Building NMA

### Using Deno Task

```bash
# Build with default settings
deno task nma:build

# Build with custom paths
deno task nma:build --source ./dist --output ./release/noraneko.nma

# Build and sign for release
deno task nma:build --channel release --sign
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output, -o` | Output NMA file path | `noraneko.nma` |
| `--source, -s` | Source directory with built modules | `browser-features/chrome/_dist` |
| `--version, -v` | Noraneko version | `0.0.0` |
| `--channel, -c` | Update channel (nightly, beta, release) | `nightly` |
| `--commit` | Git commit SHA | Auto-detected |
| `--sign` | Sign with Sigstore (requires cosign) | `false` |

## Integration with noraneko-winupdater

For Windows updates, the NMA format integrates with [noraneko-winupdater](https://github.com/f3liz-dev/noraneko-winupdater):

1. The updater downloads the new NMA file
2. Sigstore verification is performed by the updater
3. The NMA is placed in the installation directory
4. On next browser startup, the new modules are loaded

This allows for lightweight updates without requiring a full installer rebuild.

## Module Loading Priority

When loading modules, the loader follows this priority:

1. **Hotfix modules** (profile-based patches, highest priority)
2. **NMA modules** (installation-directory archive)
3. **Built-in modules** (default, bundled with the browser)

## API Reference

### NMA Loader Functions

```typescript
// Initialize NMA loader (called on startup)
initializeNMALoader(): Promise<boolean>

// Check if NMA is currently active
isNMAActive(): boolean

// Check if a module exists in NMA
hasNMAModule(moduleName: string): boolean

// Load a module from NMA
loadNMAModule(moduleName: string): Promise<Record<string, unknown> | null>

// Get current NMA manifest
getCurrentNMAManifest(): NMAManifest | null
```

### NMA Verification Functions

```typescript
// Verify NMA archive
verifyNMA(nmaPath: string): Promise<NMAVerificationResult>

// Verify NMA manifest signature
verifyNMAManifest(manifest: NMAManifest, content: string): Promise<NMAVerificationResult>

// Check if development mode allows unsigned NMA
isDevModeNMAAllowed(): boolean
```

## Comparison with Hotfix System

| Feature | NMA | Hotfix |
|---------|-----|--------|
| Location | Installation directory | User profile |
| Scope | Full module distribution | Individual patches |
| Persistence | Survives browser updates | Profile-specific |
| Use Case | Release distributions | Emergency fixes |
| Verification | Required on startup | Required on install |

## Troubleshooting

### NMA Not Loading

1. Check that `noraneko.nma` is in the correct installation directory
2. Verify the archive is not corrupted (check ZIP integrity)
3. Check browser console for verification errors

### Verification Failed

1. Ensure the NMA was signed by a trusted workflow
2. Check network connectivity for Rekor verification
3. In development, ensure `allowUnsignedInDev` is enabled

### Module Not Found

1. Check that the module is listed in the manifest
2. Verify the module path in the archive is correct
3. Check for case sensitivity issues in module names
