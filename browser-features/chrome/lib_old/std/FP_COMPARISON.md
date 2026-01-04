# Functional Programming Comparison

## Haskell Representation

The logic currently implemented in `logic.ts` using `tryDo` (Generators) corresponds directly to Haskell's **Do Notation** for the **Either** Monad (since `Try` is effectively `Either Error T`).

### TypeScript (Current)

```typescript
const result = tryDo(function* () {
  const parsed = yield Try.runCatching(() => JSON.parse(raw));
  const data = (parsed as any)?.data ?? [];
  return yield decode(zPanels, data);
});
```

### Haskell

In Haskell, `do` notation provides syntax sugar for sequencing monadic actions.

```haskell
-- Assuming helper types/functions:
-- safeParseJson :: String -> Either Error Value
-- decodePanels :: Value -> Either Error Panels

parsePanelSidebarData :: String -> Either Error Panels
parsePanelSidebarData raw = do
  parsed <- safeParseJson raw
  let dataField = extractDataField parsed -- Pure transformation
  decodePanels dataField
```

Under the hood, this compiles to a chain of `>>=` (bind/flatMap) calls:

```haskell
parsePanelSidebarData raw =
  safeParseJson raw >>= (\parsed ->
    let dataField = extractDataField parsed
    in decodePanels dataField
  )
```

## Better Syntax in TypeScript?

The **Generator** approach (`function*` + `yield`) is currently the most idiomatic way to achieve "imperative-style" monadic control flow in synchronous TypeScript, similar to Rust's `?` operator or Haskell's `do`.

### Alternative 1: Method Chaining (.flatMap)

Standard method chaining is the most "native" OO/FP hybrid style in TS. It avoids the generator overhead but can lead to "callback hell" if you need to access variables from previous steps deep in the chain.

```typescript
const result = Try.runCatching(() => JSON.parse(raw))
  .map((parsed) => (parsed as any)?.data ?? [])
  .flatMap((data) => decode(zPanels, data));
```

**Verdict**: Cleanest for simple chains (like the one above). Generators are better when you have complex dependencies between steps.

### Alternative 2: Effect-TS

The popular library [Effect-TS](https://github.com/Effect-TS/effect) uses exactly the same Generator strategy (`Effect.gen`) because JavaScript does not support custom operator overloading or macros.

### Alternative 3: Async/Await (Abuse)

Some developers wrap everything in `Promise` just to use `async/await`.

```typescript
// NOT RECOMMENDED for synchronous logic
const result = await Promise.resolve()
  .then(() => JSON.parse(raw))
  .then((parsed) => decode(zPanels, parsed));
```

**Verdict**: Adds unnecessary event loop overhead for purely synchronous code.

### Conclusion

For synchronous Functional Programming in TypeScript:

1.  **Generators (`tryDo`)**: Best for complex flow with variable dependencies.
2.  **`flatMap` Chains**: Best for simple, linear pipelines.
