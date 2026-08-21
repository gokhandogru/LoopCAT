const RESERVED_WINDOWS_FILENAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function createApplicationDownloadController({ redaction, blobs, urls, dom, scheduler }) {
  if (!redaction?.sanitize) {
    throw new TypeError("ApplicationDownloadController requires a checked redaction boundary.");
  }
  if (!blobs?.create) {
    throw new TypeError("ApplicationDownloadController requires a checked Blob boundary.");
  }
  if (!urls?.create || !urls.revoke) {
    throw new TypeError("ApplicationDownloadController requires checked object-URL boundaries.");
  }
  if (!dom?.createLink || !dom.append) {
    throw new TypeError("ApplicationDownloadController requires checked download-link boundaries.");
  }
  if (!scheduler?.timer) {
    throw new TypeError("ApplicationDownloadController requires a checked timer boundary.");
  }

  function safeFilename(filename, fallback = "loopcat-export") {
    const fallbackName =
      redaction
        .sanitize(fallback || "loopcat-export")
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
        .replace(/[. ]+$/g, "")
        .trim() || "loopcat-export";
    const raw = redaction
      .sanitize(filename || "")
      .trim()
      .replaceAll("\\", "/");
    const lastPathPart = raw.split("/").filter(Boolean).pop() || fallbackName;
    let clean = lastPathPart
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
      .replace(/\s+/g, " ")
      .replace(/_+/g, "_")
      .replace(/^[. ]+|[. ]+$/g, "")
      .trim();
    if (!clean || clean === "." || clean === "..") clean = fallbackName;
    if (RESERVED_WINDOWS_FILENAME_PATTERN.test(clean)) clean = `loopcat_${clean}`;
    if (clean.length > 180) {
      const extension = clean.match(/\.[^.]{1,16}$/)?.[0] || "";
      const stemLength = Math.max(1, 180 - extension.length);
      clean = `${clean.slice(0, stemLength).replace(/[. ]+$/g, "")}${extension}`;
    }
    return clean || fallbackName;
  }

  function download(filename, content, type = "application/octet-stream") {
    const blob = blobs.create([content], { type });
    const url = urls.create(blob);
    const link = dom.createLink();
    link.href = url;
    link.download = safeFilename(filename);
    link.hidden = true;
    dom.append(link);
    let clickAccepted = false;
    const revokeDownloadUrl = () => {
      try {
        urls.revoke(url);
      } catch {
        // Best-effort cleanup; the original download failure is more useful to report.
      }
    };
    try {
      link.click();
      clickAccepted = true;
    } finally {
      link.remove();
      clickAccepted ? scheduler.timer(revokeDownloadUrl, 1000) : revokeDownloadUrl();
    }
  }

  return Object.freeze({ safeFilename, download });
}
