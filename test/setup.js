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

const fallbackStorageState = new Map();
const fallbackLocalStorage = {
  getItem(key) {
    return fallbackStorageState.has(key) ? fallbackStorageState.get(key) : null;
  },
  setItem(key, value) {
    fallbackStorageState.set(String(key), String(value));
  },
  removeItem(key) {
    fallbackStorageState.delete(String(key));
  },
  clear() {
    fallbackStorageState.clear();
  },
  key(index) {
    return Array.from(fallbackStorageState.keys())[index] || null;
  },
  get length() {
    return fallbackStorageState.size;
  },
};

const localStorageCandidate = window.localStorage;
if (
  !localStorageCandidate
  || typeof localStorageCandidate.getItem !== "function"
  || typeof localStorageCandidate.setItem !== "function"
  || typeof localStorageCandidate.removeItem !== "function"
) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: fallbackLocalStorage,
  });
}
