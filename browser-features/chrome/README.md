<!--
SPDX-License-Identifier: MPL-2.0
-->

# @nora/browser-features

Browser features and core logic for Noraneko, organized using Data-Oriented Programming (DOP) and Functional Programming (FP) principles.

When built, this code is placed in `noraneko/content`.

## 📁 Directory Structure

```
chrome/
├── features/       # Browser features (DOP/FP architecture)
├── lib/            # Core libraries and shared utilities
├── utils/          # General purpose utilities
├── static/         # Static assets and non-hot-reloadable code
├── _example/       # Example code and templates
├── _experiment/    # Experimental prototypes
├── __tests__/      # Tests
└── main.ts         # Main entry point
```

## 🏗️ Architecture

This module follows a **Data-Oriented Programming (DOP)** and **Functional Programming (FP)** approach.

- **features/**: Contains individual browser features, each structured with `types/`, `data/`, `ops/`, `io/`, `state/`, and `ui/`. See [features/README.md](./features/README.md) for details.
- **lib/**: Shared core libraries used across features.
- **static/**: Code that cannot be hot-reloaded or requires early initialization.

## 🛠️ Build System

- Built with **Vite**.
- Supports hot reloading for features.
- Uses `vite-plugin-module-manifest` for module tracking.

## 🤝 Contributing

Please refer to [features/README.md](./features/README.md) for detailed instructions on creating and refactoring features using the DOP/FP style.
