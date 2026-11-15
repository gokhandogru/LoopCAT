/** @typedef {{ type: "tm" | "tb", resourceId: string, entryId?: string }} ResourceEditorRoute */

function identifier(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError("A valid resource identifier is required.");
  }
  return value;
}

/** @param {ResourceEditorRoute} route */
export function formatResourceEditorRoute(route) {
  if (!route || !["tm", "tb"].includes(route.type)) throw new TypeError("Choose a translation memory or termbase.");
  const hash = `#resource/${route.type}/${encodeURIComponent(identifier(route.resourceId))}`;
  return route.entryId === undefined ? hash : `${hash}?entry=${encodeURIComponent(identifier(route.entryId))}`;
}

/** @returns {ResourceEditorRoute | null} */
export function parseResourceEditorRoute(hash) {
  if (typeof hash !== "string") return null;
  const match = /^#resource\/(tm|tb)\/([^/?#]+)(?:\?entry=([^&#]+))?$/.exec(hash);
  if (!match) return null;
  try {
    return {
      type: /** @type {"tm" | "tb"} */ (match[1]),
      resourceId: identifier(decodeURIComponent(match[2])),
      ...(match[3] === undefined ? {} : { entryId: identifier(decodeURIComponent(match[3])) })
    };
  } catch {
    return null;
  }
}
