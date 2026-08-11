window.addEventListener("error", (event) => {
  window.__loopcatStartupError = event.error?.stack || event.message || "Unknown renderer error";
});

window.addEventListener("unhandledrejection", (event) => {
  window.__loopcatStartupError = event.reason?.stack || event.reason?.message || String(event.reason);
});
