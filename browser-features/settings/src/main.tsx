// SPDX-License-Identifier: MPL-2.0
import { render } from "preact";
import { Settings } from "./Settings.tsx";

const root = document.getElementById("app");
if (root) {
  render(<Settings />, root);
}
