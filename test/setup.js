import "@testing-library/jest-dom/vitest";

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class PointerEvent extends MouseEvent {}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserver;
}

if (!globalThis.PointerEvent) {
  globalThis.PointerEvent = PointerEvent;
}

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = () => {};
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}
