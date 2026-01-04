// SPDX-License-Identifier: MPL-2.0

import type { JSX } from "preact";
import { createPortal } from "preact/compat";
import modalStyle from "./styles.css?inline";

const targetParent = document?.getElementById("appcontent") as HTMLElement;

// Inject styles
const style = document.createElement("style");
style.textContent = modalStyle;
if (document.head) {
  document.head.appendChild(style);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    style.remove();
  });
}

export function ShareModal(props: {
  onClose: () => void;
  onSave: (formControls: { id: string; value: string }[]) => void;
  ContentElement: () => JSX.Element;
  StyleElement?: () => JSX.Element;
  name?: string;
}) {
  return createPortal(
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">{props.name}</div>
        <div class="modal-content">{props.ContentElement()}</div>
        <div class="modal-actions">
          <button
            class="modal-button"
            type="button"
            id="close-modal"
            onClick={props.onClose}
          >
            キャンセル
          </button>
          <button
            class="modal-button primary"
            type="button"
            id="save-modal"
            onClick={() => {
              const forms =
                document?.getElementsByClassName("form-control") || [];
              const result = Array.from(forms).map((e) => {
                const element = e as HTMLInputElement;
                if (!element.id || !element.value) {
                  throw new Error(
                    `Invalid Modal Form Control: "Id" and "Value" are required for all form elements! Occured element: ${element.id}, ${element.value}`,
                  );
                }
                return {
                  id: element.id as string,
                  value: element.value as string,
                };
              });
              props.onSave(result);
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    targetParent,
  );
}
