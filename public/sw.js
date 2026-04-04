// Minimal service worker for PWA installability.
// No offline caching — just a fetch handler to satisfy Chrome's install criteria.
self.addEventListener("fetch", () => {});
