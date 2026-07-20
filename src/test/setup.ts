import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Runs only for the jsdom ("dom") project — see vite.config.ts test.projects.
afterEach(() => cleanup());

// Fail loud if a test triggers a real network call: everything network-shaped
// (pdf.js) is mocked at the module boundary, so a live fetch means a missing mock.
globalThis.fetch = (() => Promise.reject(new Error('fetch is not mocked in this test'))) as typeof fetch;

// jsdom lacks the pointer/scroll/observer APIs Radix reads when opening a Select.
// Stub them so the dropdown can mount; without these Radix throws in jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom implements <dialog> open/close but older builds throw "Not implemented" on
// showModal()/close(). Polyfill just enough (toggle `open`, emit the close event) so
// the Modal's imperative open/close works. Note: jsdom models neither the top layer
// nor `inert`, so this cannot reproduce the inert-background symptom — the modal test
// asserts the portal-container mechanism instead.
// Patch each method independently so we only polyfill what's actually missing — if a
// jsdom build implements one but not the other, we leave the real one intact.
const dialogProto = globalThis.HTMLDialogElement?.prototype;
if (dialogProto && !isImplemented(dialogProto, 'showModal')) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
}
if (dialogProto && !isImplemented(dialogProto, 'close')) {
  dialogProto.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

function isImplemented(proto: object, method: string): boolean {
  const fn = (proto as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return false;
  // jsdom's not-implemented stubs throw when called; treat a thrown "Not implemented"
  // as unimplemented. We can't call it here safely, so detect by source instead.
  return !/not implemented/i.test(Function.prototype.toString.call(fn));
}
