export function createDashboardController({ root }) {
  if (!root?.classList) throw new TypeError("DashboardController requires a root element.");
  return Object.freeze({
    mount() {},
    unmount() {
      root.classList.add("hidden");
    },
    setVisible(visible) {
      root.classList.toggle("hidden", !visible);
      root.setAttribute("aria-hidden", String(!visible));
    }
  });
}
