function contextSnapshot(value = {}) {
  return Object.freeze({
    projectId: String(value?.projectId || ""),
    segmentId: String(value?.segmentId || "")
  });
}

function sameContext(left, right) {
  return left.projectId === right.projectId && left.segmentId === right.segmentId;
}

export function createEditorContextController({
  getContext,
  renderReview,
  renderHistory,
  renderAi,
  renderQuality,
  refreshMatches,
  refreshTerms
}) {
  if (typeof getContext !== "function") throw new TypeError("EditorContextController requires getContext.");
  const renderers = [renderReview, renderHistory, renderAi, renderQuality].filter(
    (renderer) => typeof renderer === "function"
  );
  const services = [refreshMatches, refreshTerms].filter((service) => typeof service === "function");
  let refreshRevision = 0;

  function currentContext() {
    return contextSnapshot(getContext());
  }

  function render(context = currentContext()) {
    renderers.forEach((renderer) => renderer(context));
    return context;
  }

  async function refresh() {
    const revision = ++refreshRevision;
    const context = currentContext();
    render(context);
    await Promise.all(services.map((service) => service(context)));
    return Object.freeze({
      context,
      current: revision === refreshRevision && sameContext(context, currentContext())
    });
  }

  return Object.freeze({
    currentContext,
    invalidate() {
      refreshRevision += 1;
    },
    refresh,
    render
  });
}
