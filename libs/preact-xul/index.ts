// SPDX-License-Identifier: MPL-2.0
/// <reference path="./jsx-runtime.d.ts" />
import { options } from "preact";

// Preact creates each element in the namespace of what it renders into
// (`render(vnode, parent)` starts from parent.namespaceURI), so a tree
// rendered into a XUL element is XUL all the way down. The `xul:` prefix is
// for the reader and for the types; the renderer only needs it taken off.
//
// (Making the element as HTML and swapping in a XUL one from the ref left
// Preact holding the swapped-out node, so nothing after the first render
// reached the DOM.)
const prev = options.vnode;
options.vnode = (vnode) => {
  if (typeof vnode.type === "string" && vnode.type.startsWith("xul:")) {
    vnode.type = vnode.type.slice(4);
  }
  prev?.(vnode);
};

export * from "preact";
