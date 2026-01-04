// SPDX-License-Identifier: MPL-2.0
// Valibot-based codec utilities

import * as v from "valibot";
import { type Try, Success, Failure } from "./Try.ts";

/**
 * Decodes a value using a valibot schema, returning a Try.
 */
export function decode<
  T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: T, value: unknown): Try<v.InferOutput<T>, Error> {
  const result = v.safeParse(schema, value);
  if (result.success) {
    return Success(result.output);
  }

  // Create a readable error message from issues
  const issues = v.flatten(result.issues);
  const nested = issues.nested;
  const errorMessages: string[] = [];

  if (nested) {
    for (const key in nested) {
      errorMessages.push(`${key}: ${nested[key]?.join(", ")}`);
    }
  }
  if (issues.root) {
    errorMessages.push(`root: ${issues.root.join(", ")}`);
  }

  const msg =
    errorMessages.length > 0
      ? errorMessages.join("; ")
      : result.issues[0]?.message || "Validation failed";

  return Failure(new Error(msg));
}

/**
 * Decodes or throws an error (for when you're confident in the data)
 */
export function decodeOrThrow<
  T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: T, value: unknown): v.InferOutput<T> {
  const result = decode(schema, value);
  if (result.isSuccess) return result.value;
  throw result.error;
}

// Re-export valibot as 'v' for defining schemas
export { v };
