import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";

// A deploy installs a new service worker in the background, but an open page
// keeps running the code it loaded from the old cache until it is reloaded:
// users then kept hitting bugs that were already fixed. In autoUpdate mode,
// registerSW reloads the page as soon as the new version takes over. New
// versions are looked for at start-up, whenever the user comes back to the
// tab, and every hour while the tab is in the background.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const checkForUpdate = () => {
      if (navigator.onLine) registration.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
    setInterval(
      () => {
        if (document.visibilityState === "hidden") checkForUpdate();
      },
      60 * 60 * 1000,
    );
  },
});

// After a new deploy, the service worker may replace its pre-cache while
// the page still holds old chunk references. A reload picks up the new
// HTML + new SW cache. A sessionStorage guard prevents infinite loops.
// See https://vite.dev/guide/build.html#load-error-handling
window.addEventListener("vite:preloadError", () => {
  const key = "chunk-reload";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
