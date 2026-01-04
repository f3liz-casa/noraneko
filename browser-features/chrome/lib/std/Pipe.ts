// SPDX-License-Identifier: MPL-2.0
// Julia/Elixir-style pipe operator

/**
 * Pipe operator - chains function calls left to right.
 * Similar to Julia's |> or Elixir's |>
 *
 * @example
 * ```typescript
 * const result = pipe(
 *   rawData,
 *   JSON.parse,
 *   (data) => decode(schema, data),
 *   Try.getOrElse(defaultValue)
 * );
 * ```
 */
export function pipe<A, B>(val: A, fn1: (a: A) => B): B;
export function pipe<A, B, C>(val: A, fn1: (a: A) => B, fn2: (b: B) => C): C;
export function pipe<A, B, C, D>(
  val: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  val: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
): E;
export function pipe<A, B, C, D, E, F>(
  val: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E,
  fn5: (e: E) => F,
): F;
export function pipe(
  val: unknown,
  ...fns: ((arg: unknown) => unknown)[]
): unknown {
  return fns.reduce((acc, fn) => fn(acc), val);
}

/**
 * Compose functions right to left.
 * compose(f, g, h)(x) = f(g(h(x)))
 */
export function compose<A, B, C>(
  fn2: (b: B) => C,
  fn1: (a: A) => B,
): (a: A) => C;
export function compose<A, B, C, D>(
  fn3: (c: C) => D,
  fn2: (b: B) => C,
  fn1: (a: A) => B,
): (a: A) => D;
export function compose(
  ...fns: ((arg: unknown) => unknown)[]
): (arg: unknown) => unknown {
  return (val) => fns.reduceRight((acc, fn) => fn(acc), val);
}
