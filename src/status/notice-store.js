export function createNoticeStore() {
  let notices = [];
  const listeners = new Set();

  function publish() {
    listeners.forEach((listener) => listener(notices));
    return notices;
  }

  return Object.freeze({
    notify(message, options = {}) {
      const notice = Object.freeze({
        id: options.id || globalThis.crypto?.randomUUID?.() || `notice-${Date.now()}`,
        message: String(message || ""),
        tone: options.tone || "neutral",
        actionLabel: String(options.actionLabel || ""),
        createdAt: new Date().toISOString()
      });
      notices = [...notices, notice].slice(-5);
      publish();
      return notice;
    },
    dismiss(id) {
      notices = notices.filter((notice) => notice.id !== id);
      return publish();
    },
    list: () => notices,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
