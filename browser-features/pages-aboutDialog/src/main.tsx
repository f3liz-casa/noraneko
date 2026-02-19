import { render } from "preact";
import { AboutDialog } from "./AboutDialog.tsx";

const root = document.getElementById("root");
if (root) {
  render(<AboutDialog />, root);
}
