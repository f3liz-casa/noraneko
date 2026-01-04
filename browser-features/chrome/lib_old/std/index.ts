export * as Option from "./option.ts";
export * as Either from "./either.ts";
export * as Try from "./try.ts";
export * from "./monad.ts";
export * from "./codec.ts";

export function pipe<A, B>(val: A, fn1: (a: A) => B): B;
export function pipe<A, B, C>(val: A, fn1: (a: A) => B, fn2: (b: B) => C): C;
export function pipe<A, B, C, D>(
  val: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
): D;
export function pipe(val: any, ...fns: Function[]): any {
  return fns.reduce((acc, fn) => fn(acc), val);
}
