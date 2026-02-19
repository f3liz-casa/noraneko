import { render } from "preact";
import { NewTab } from "./NewTab.tsx";

const root = document.getElementById("root");
if (root) {
  render(<NewTab />, root);
}
