# Browser Features

Browser features for Noraneko, organised in a Data-Oriented Programming (DOP)
style: each feature keeps its data, pure logic, side effects, state, and UI in
separate, predictable places.

## Layout

```
features/
├── mod.ts         # Feature loader entry point
├── events.ts      # Cross-feature event wiring
└── tabbrowser/    # Core tab system (a DOP re-implementation of gBrowser)
```

## Feature structure

A feature is a directory with a `mod.ts` entry point. As it grows, split it
into DOP layers — but only the layers it actually needs:

```
my-feature/
├── mod.ts          # entry point (registerModule)
├── types/          # type definitions & valibot schemas
├── data/           # constants, defaults, pref names
├── ops/            # pure functions (no side effects)
├── io/             # side effects (DOM, prefs, network)
├── state/          # @preact/signals reactive state
└── ui/             # Preact components
```

**Progressive disclosure — start small.** A trivial feature is a single
`mod.ts`. Add `types/`, `ops/`, `io/`, … only once the feature is large enough
that the separation earns its keep. Do not split a 30-line feature into six
directories — the structure is a tool, not a tax.

## Entry point

`mod.ts` registers the feature with `registerModule` from `@lib/core`:

```typescript
import { registerModule } from "@lib/core";

export default registerModule({
  name: "my-feature",
  init(ctx) { /* setup */ },
  cleanup(ctx) { /* teardown — required for hotswap */ },
}, import.meta);
```

## Conventions

- **types/ first** — data shapes drive the design.
- **ops/ is pure; io/ holds every side effect.** Keep that line sharp — it is
  what makes the feature easy to reason about and test.
- Reactive state uses `@preact/signals`.
- UI renders through `#libs/preact-xul` (Preact retargeted to XUL elements).

Happy coding :3
