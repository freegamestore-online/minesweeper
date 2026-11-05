import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver. The board only needs it to size cells.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
