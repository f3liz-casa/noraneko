// SPDX-License-Identifier: MPL-2.0
// Delegate `pipe` to @mobily/ts-belt and provide a small `compose`
// implementation. Using ts-belt's pipe reduces maintenance and
// relies on a well-tested implementation.

import { pipe as tsbPipe } from "@mobily/ts-belt";

export const pipe = tsbPipe;

export function compose(...fns: ((arg: unknown) => unknown)[]) {
  return (val: unknown) => fns.reduceRight((acc, fn) => fn(acc), val);
}
