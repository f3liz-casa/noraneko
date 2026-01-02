# Noraneko Package Format

This document describes the Noraneko package format (`.nora.zip`), a distributable archive format for Noraneko browser features that can be verified and hotswapped without full browser rebuilds.

## Overview

The Noraneko package format is designed to:

1. **Be transferable through network** - Standard ZIP format that can be downloaded via HTTP
2. **Integrate with Firefox** - Contains built code that can be loaded as chrome/resource content
3. **Be secure** - Uses Sigstore for transparent, verifiable signatures
4. **Use built code** - Contains output from tsdown/vite builds
5. **Support fast verification** - Hash-based verification on every startup, with optional full signature verification

## Package Structure

```
package.nora.zip
├── manifest.json          # Package metadata and file hashes
├── content/               # Built loader-features code
│   ├── core.js
│   ├── assets/
│   └── ...
├── startup/               # Built startup scripts
│   ├── chrome_root.js
│   └── ...
├── skin/                  # CSS and theme files
│   └── ...
└── resource/              # Built loader-modules code
    ├── modules/
    └── ...
```

## Manifest Format

The `manifest.json` file contains package metadata and integrity information:

```json
{
  "formatVersion": "1.0",
  "name": "noraneko",
  "version": "0.2.0",
  "buildId": "01234567-89ab-cdef-0123-456789abcdef",
  "buildTime": "2024-01-01T00:00:00.000Z",
  "repository": {
    "owner": "f3liz-dev",
    "name": "noraneko",
    "ref": "refs/heads/main",
    "sha": "abc123..."
  },
  "files": {
    "content/core.js": {
      "sha256": "abc123...",
      "size": 12345
    }
  },
  "integrity": {
    "packageHash": "def456..."
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `formatVersion` | string | Package format version (currently "1.0") |
| `name` | string | Package name identifier |
| `version` | string | Semantic version from package.json |
| `buildId` | string | UUIDv7 build identifier |
| `buildTime` | string | ISO 8601 timestamp of build |
| `repository` | object | Source repository information |
| `files` | object | Map of file paths to integrity info |
| `integrity.packageHash` | string | SHA-256 hash of all file hashes |

## Signature Format

Packages are signed using Sigstore's keyless signing. The signature bundle is stored in a separate file:

```json
{
  "formatVersion": "1.0",
  "signatureType": "sigstore",
  "signature": "<base64-encoded signature>",
  "certificate": "<base64-encoded certificate>",
  "rekorEntry": {
    "logIndex": 12345678,
    "logId": "rekor.sigstore.dev",
    "integratedTime": 1704067200
  },
  "identity": {
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "https://github.com/f3liz-dev/noraneko",
    "repository": "f3liz-dev/noraneko"
  },
  "signedAt": "2024-01-01T00:00:00.000Z"
}
```

## Verification

### Startup Verification (Fast)

On every browser startup, the package loader performs quick hash verification:

1. Read `manifest.json`
2. Compute package hash from file hashes
3. Compare with `integrity.packageHash`

This is fast and doesn't require network access.

### Full Verification

For full cryptographic verification:

1. Verify manifest hash (as above)
2. Verify signature against manifest content
3. Verify certificate chain to Sigstore root
4. Query Rekor transparency log for signature entry
5. Verify identity matches expected (`f3liz-dev/noraneko`)

### Command-Line Verification

Using cosign:

```bash
cosign verify-blob manifest.json \
  --signature manifest.json.sig \
  --certificate manifest.json.cert \
  --certificate-identity-regexp "^https://github.com/f3liz-dev/noraneko" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

## Creating Packages

### Using feles-build

```bash
# Build production assets first
deno task feles-build build --phase before-mach

# Create package
deno task feles-build package

# Create and sign package
deno task feles-build package --sign
```

### Output

Packages are created in `_dist/package/`:

```
_dist/package/
├── noraneko-0.2.0-01234567.nora.zip
├── noraneko-0.2.0-01234567.nora.zip.manifest.json
└── noraneko-0.2.0-01234567.nora.zip.signature.json
```

## Installation

### Profile Directory

Packages are installed in the Firefox profile:

```
<profile>/noraneko-packages/
├── current/              # Currently loaded package
│   ├── manifest.json
│   ├── signature.json
│   ├── content/
│   ├── startup/
│   ├── skin/
│   └── resource/
└── pending/              # Downloaded updates awaiting restart
    └── ...
```

### Manual Installation

1. Download the package and signature files
2. Extract to `<profile>/noraneko-packages/current/`
3. Restart the browser

### Automatic Updates

The package loader can check for updates:

```javascript
const { checkForUpdate } = ChromeUtils.importESModule(
  "resource://noraneko/modules/NoraPackageLoader.sys.mjs"
);

const update = await checkForUpdate(
  "https://example.com/noraneko/latest.manifest.json"
);

if (update.available) {
  console.log(`Update available: ${update.remoteVersion}`);
}
```

## Security Considerations

### Why Sigstore?

Sigstore provides:

- **Keyless signing**: No need to manage signing keys
- **Transparency**: All signatures are recorded in a public log
- **Identity binding**: Signatures are tied to the CI workflow identity
- **Non-repudiation**: Cannot claim a signature wasn't made

### Verification Requirements

Packages MUST:

1. Have a valid manifest with correct package hash
2. Be signed by the `f3liz-dev/noraneko` GitHub Actions workflow
3. Have a Rekor entry for the signature (when online)

### Fallback Behavior

When offline or Rekor is unavailable:

1. Hash verification is always performed
2. Full signature verification is skipped with a warning
3. Users can enable "strict mode" to require full verification

## Migration from Hotfix Source

This package format replaces the previous custom hotfix mechanism. Benefits:

1. **Transparent**: All packages are verifiable via Sigstore
2. **Efficient**: No need for full browser rebuilds
3. **Secure**: Cryptographic verification on every startup
4. **Simple**: Standard ZIP format with JSON metadata
