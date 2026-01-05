# Update Refresh Cache

Handles version-based cache invalidation to prevent stale data issues after updates.

## 🎯 Overview

This utility module checks the currently running version against a stored preference. If they differ (indicating an update occurred), it invalidates the browser's startup cache and updates the stored version.

## 📂 Structure

```
update-refresh-cache/
├── mod.ts              # Module entry point
├── README.md           # This file
├── data/               # Constants
│   ├── constants.ts    # Version keys
│   └── mod.ts          # Re-exports
└── io/                 # Side effects
    ├── system.ts       # Cache & pref operations
    └── mod.ts          # Re-exports
```

## 🚀 Features

- **Version Check**: Compares stored version with target version
- **Cache Invalidation**: Triggers `invalidateCachesOnRestart` if mismatch found
- **Automatic**: Runs on initialization

## 🔧 Usage

This module runs automatically via `init()`. No manual intervention is needed.

To configure the target version, update `data/constants.ts` or inject it via build system.

## 📊 Data Flow

```
init()
  ↓
performUpdateCheck()
  ↓
Read Pref (noraneko.version2) VS Target Version
  ↓
If Mismatch:
  1. Invalidates Caches
  2. Updates Pref
  3. (Optional) Restarts
```

## Happy Coding! :3
