// SPDX-License-Identifier: MPL-2.0
/** Shared by the TabbrowserCompat modules. */

/** Fire a bubbling CustomEvent on `target`. */
export function dispatch(target: EventTarget | null, name: string, detail?: any): void {
  if (!target) return;
  target.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
}
