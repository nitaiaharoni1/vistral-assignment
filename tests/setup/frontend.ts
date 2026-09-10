import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

class ImageDataPolyfill {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = "srgb" as const;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

if (typeof ImageData === "undefined") {
  Object.assign(globalThis, { ImageData: ImageDataPolyfill });
}

function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
}

function closeDialog(this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
}

const dialog = HTMLDialogElement.prototype;
if (!dialog.showModal) dialog.showModal = showModal;
if (!dialog.close) dialog.close = closeDialog;
