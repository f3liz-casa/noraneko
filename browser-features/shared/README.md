# Shared Code Library

This directory contains shared code that is used across multiple parts of the Noraneko browser features:
- `browser-features/chrome` (UI/chrome features)
- `browser-features/modules` (system modules)

## Location

The shared code is located at `browser-features/shared/` to keep it close to the features that use it. This makes it:
- Easier to find and modify alongside chrome and modules code
- Accessible even when actively being developed
- Logically grouped with related browser feature code

## Structure

```
browser-features/shared/
├── custom-shortcut-key/    # Custom shortcut key functionality
│   ├── commands.ts          # Command definitions and implementations
│   ├── defines.ts           # Type definitions and data codecs
│   ├── utils.ts             # Utility functions
│   ├── i18n.ts              # Internationalization support
│   └── index.ts             # Public exports
├── package.json             # Package metadata
├── deno.json                # Deno configuration
└── tsconfig.json            # TypeScript configuration
```

## Usage

### Importing from Chrome Features

In `browser-features/chrome`, import shared code using the `@nora/shared` alias:

```typescript
import { commands } from "@nora/shared/custom-shortcut-key/commands";
import { CSKData, CSKCommands } from "@nora/shared/custom-shortcut-key/defines";
import { checkIsSystemShortcut } from "@nora/shared/custom-shortcut-key/utils";
```

### Importing from Modules

In `browser-features/modules`, you can also use the `@nora/shared` alias once properly configured:

```typescript
import { commands } from "@nora/shared/custom-shortcut-key/commands";
```

## Path Resolution

The `@nora/shared` alias is configured in multiple locations for maximum compatibility:

1. **Vite** (`browser-features/chrome/vite.config.ts`):
   ```javascript
   { find: "@nora/shared", replacement: r("../shared") }
   ```

2. **Deno** (`deno.json` and `browser-features/chrome/deno.json`):
   ```json
   "@nora/shared/": "./browser-features/shared/"
   ```

## Adding New Shared Code

1. Create a new directory under `browser-features/shared/` for your shared module
2. Add an `index.ts` to export the public API
3. Import using `@nora/shared/your-module-name/...`
4. Ensure your code works in both chrome and modules contexts

## Type Safety

The shared code uses:
- **io-ts** for runtime type validation
- **@mobily/ts-belt** for functional programming utilities
- TypeScript for static type checking

Dependencies are managed in `browser-features/shared/package.json`.

## Best Practices

1. **Keep it minimal**: Only put code here that is truly shared between chrome and modules
2. **No side effects**: Shared code should be pure functions or data definitions
3. **Document exports**: Use JSDoc comments for public APIs
4. **Type safety**: Always provide TypeScript types and runtime validation where appropriate
5. **Test thoroughly**: Shared code affects multiple parts of the application

## Editor Support

Modern code editors (VS Code, WebStorm, Zed, etc.) should automatically resolve the `@nora/shared` alias thanks to:
- Deno LSP configuration in `deno.json`
- TypeScript path mapping (can be added to `tsconfig.json` if needed)
- Vite's module resolution during development

The workspace structure ensures that "Go to Definition" and other IDE features work correctly.
