import {
  CATALOG_LIMIT,
  OFFICIAL_CATALOG,
  fetchCatalogFile,
  readCatalogKey,
  verifyCatalog,
  verifyCatalogArtifact
} from "./catalog.js";
import { checkpointKey } from "./catalog-policy.js";

/** Local files and downloads converge on the host-owned pack preview. */
export function mountExchangeCatalog({
  root,
  onInstall,
  t = (s, values = {}) => s.replace(/\{(\w+)\}/g, (m, k) => String(values[k] ?? m)),
  config = OFFICIAL_CATALOG,
  onSnapshot = (_) => Promise.resolve(0)
}) {
  const doc = root.ownerDocument,
    browser = doc.defaultView || globalThis;
  const lifetime = new AbortController();
  let key = null,
    candidate = null,
    snapshot = null,
    generation = 0,
    busy = false,
    expiryTimer;
  const online = Boolean(config.key && config.source);
  function node(tag, text = "", cls = "") {
    const element = doc.createElement(tag);
    element.textContent = text;
    if (cls) element.className = cls;
    return element;
  }
  function authored(element) {
    element.setAttribute("data-i18n-skip", "");
    element.dir = "auto";
    return element;
  }
  const section = node("section", "", "exchange-catalog");
  const status = node("p", "", "exchange-catalog-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const intro = node("div", "", "exchange-catalog-intro");
  intro.append(
    node("h3", t("Pack catalog")),
    node("p", t("Find resources by task, language and domain. Inspect a verified file before installing it."))
  );
  section.append(intro);
  const sourcePanel = node("div", "", "exchange-catalog-source");
  if (online) {
    sourcePanel.append(
      node("h4", t("Official catalog")),
      authored(node("p", config.source, "exchange-catalog-fingerprint"))
    );
    button(
      "Refresh official catalog",
      async () => {
        const file = await fetchCatalogFile(
          config.source,
          null,
          fetch,
          AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)])
        );
        await open(await file.text(), config.key);
      },
      sourcePanel,
      "primary"
    );
  } else {
    sourcePanel.append(
      node("h4", t("Open a private catalog")),
      node(
        "p",
        t(
          "An official catalog has not been configured for this build. Open a signed catalog from your team or institution."
        )
      )
    );
  }
  const privatePanel = node("details", "", "exchange-catalog-private");
  privatePanel.open = !online;
  privatePanel.append(node("summary", t("Private catalog files")));
  privatePanel.append(
    node(
      "p",
      t(
        "Obtain the trust file and confirm its fingerprint with the publisher through a separate channel. Then open the signed snapshot and select a pack file."
      )
    )
  );
  const trustInput = fileControl("Choose a separate catalog trust file", privatePanel, ".json");
  const trustLabel = authored(node("p", "", "exchange-catalog-fingerprint"));
  privatePanel.append(trustLabel);
  const trustButton = button(
    "Trust this fingerprint for this session",
    () => {
      if (!candidate) return;
      key = candidate;
      candidate = null;
      generation++;
      snapshot = null;
      trustButton.hidden = true;
      trustLabel.textContent = key.catalogId + " · " + key.fingerprint;
      notice("Select a signed snapshot using this key.");
      render();
    },
    privatePanel
  );
  trustButton.hidden = true;
  const indexInput = fileControl("Open signed catalog snapshot", privatePanel, ".json");
  indexInput.disabled = !config.key;
  sourcePanel.append(privatePanel);
  section.append(sourcePanel, status);
  const summary = node("div", "", "exchange-catalog-summary");
  summary.hidden = true;
  section.append(summary);
  const filters = node("div", "", "exchange-catalog-filters");
  filters.hidden = true;
  const search = control("Search catalog", "input", filters);
  search.type = "search";
  search.placeholder = t("Name, publisher, language or keyword");
  const refine = node("details", "", "exchange-catalog-refine");
  refine.append(node("summary", t("Filter by compatibility")));
  const facets = node("div", "", "exchange-catalog-facets");
  refine.append(facets);
  const facetDefinitions = [
    ["task", "Task"],
    ["language", "Language"],
    ["region", "Region"],
    ["domain", "Domain"],
    ["edition", "Edition"]
  ];
  const selectors = new Map(facetDefinitions.map(([name, label]) => [name, control(label, "select", facets)]));
  const availability = control("Availability", "select", facets);
  for (const [value, label] of [
    ["", "All releases"],
    ["available", "Available"],
    ["withdrawn", "Withdrawn"]
  ]) {
    const item = node("option", t(label));
    item.value = value;
    availability.append(item);
  }
  const offlineLabel = node("label", "", "exchange-catalog-check");
  const offline = node("input");
  offline.type = "checkbox";
  offlineLabel.append(offline, node("span", t("Works offline")));
  filters.append(refine, offlineLabel);
  button(
    "Clear filters",
    () => {
      search.value = "";
      offline.checked = false;
      availability.value = "";
      for (const select of selectors.values()) select.value = "";
      render();
    },
    filters
  );
  const count = node("p", "", "exchange-catalog-count");
  count.setAttribute("role", "status");
  count.setAttribute("aria-live", "polite");
  const list = node("ul", "", "exchange-catalog-results");
  list.setAttribute("aria-label", t("Catalog releases"));
  const empty = node(
    "p",
    t("Choose a publisher and open its signed catalog to browse resources."),
    "exchange-catalog-empty"
  );
  section.append(filters, count, list, empty);
  root.append(section);

  function control(label, tag, container) {
    const wrap = node("label", "", "exchange-field exchange-catalog-field"),
      input = node(tag);
    wrap.append(node("span", t(label)), input);
    container.append(wrap);
    return input;
  }
  function fileControl(label, container, accept) {
    const input = control(label, "input", container);
    input.type = "file";
    input.accept = accept;
    input.disabled = busy;
    return input;
  }
  function button(label, fn, container, cls = "") {
    const b = node("button", t(label), cls);
    b.type = "button";
    b.disabled = busy;
    b.addEventListener("click", () => void run(fn));
    container.append(b);
    return b;
  }
  function notice(message, error = false, values = {}) {
    status.textContent = t(message, values) + (error ? " " + t(recovery(message)) : "");
    status.classList.toggle("is-error", error);
  }
  function recovery(message) {
    if (/expired|validity period/.test(message))
      return "Ask the publisher for a current signed snapshot, then open it here.";
    if (/checksum|size did not match|reviewed artifact/.test(message))
      return "Choose the exact pack file supplied with this catalog revision.";
    if (/signature|fingerprint|key change|rollback|conflicting|republished/.test(message))
      return "Confirm the fingerprint and the latest revision with the publisher before trying again.";
    if (/download|fetch|network|timeout/i.test(message))
      return "Retry when connected, or open the signed snapshot and pack files supplied by the publisher.";
    if (/storage|checkpoint/i.test(message)) return "Allow local storage for LoopCAT and reopen the signed snapshot.";
    return "Check the selected file and try again.";
  }
  async function run(fn) {
    if (busy || lifetime.signal.aborted) return;
    busy = true;
    section.setAttribute("aria-busy", "true");
    const controls = new Map([...section.querySelectorAll("button,input,select")].map((el) => [el, el.disabled]));
    for (const [el] of controls) el.disabled = true;
    try {
      await fn();
    } catch (error) {
      if (!lifetime.signal.aborted) {
        const message = error?.message || "Catalog action failed.";
        notice(message, true);
      }
    } finally {
      busy = false;
      for (const el of section.querySelectorAll("button,input,select")) el.disabled = controls.get(el) === true;
      indexInput.disabled = !key && !config.key;
      section.setAttribute("aria-busy", "false");
    }
  }
  function textFile(input, limit) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return null;
    if (file.size > limit) throw new Error("Choose a file within the size limit.");
    return file.text();
  }
  function readLocal(name) {
    try {
      const value = browser.localStorage.getItem(name);
      return value ? JSON.parse(value) : null;
    } catch {
      throw new Error("Catalog trust history could not be read from local storage.");
    }
  }
  function checkpointFor(expected) {
    const live = readLocal(checkpointKey(expected.catalogId));
    if (!live || live.fingerprint !== expected.checkpoint.fingerprint || live.hash !== expected.checkpoint.hash)
      throw new Error("Refresh the catalog before selecting this release.");
    return live;
  }
  function watchExpiry() {
    clearTimeout(expiryTimer);
    if (!snapshot || lifetime.signal.aborted) return;
    const remaining = snapshot.expires - Date.now();
    if (remaining > 0) expiryTimer = setTimeout(watchExpiry, Math.min(remaining + 1, 2147483647));
    else render();
  }
  async function open(text, anchor) {
    if (text === null) return;
    const trusted = await readCatalogKey(anchor),
      name = checkpointKey(trusted.catalogId),
      gen = generation;
    const commit = async () => {
      const prior = readLocal(name);
      const verified = await verifyCatalog(text, trusted, prior);
      if (gen !== generation || lifetime.signal.aborted) return;
      if (JSON.stringify(readLocal(name)) !== JSON.stringify(prior))
        throw new Error("Catalog trust history changed. Open its current signed snapshot.");
      try {
        browser.localStorage.setItem(name, JSON.stringify(verified.checkpoint));
      } catch {
        throw new Error("Catalog trust history could not be saved to local storage.");
      }
      key = trusted;
      candidate = null;
      snapshot = verified;
      watchExpiry();
      trustButton.hidden = true;
      trustLabel.textContent = key.catalogId + " · " + key.fingerprint;
      populateFacets();
      // The checkpoint protects installed copies even if notification fails.
      render();
      const affected = await onSnapshot(verified);
      if (gen !== generation || lifetime.signal.aborted) return;
      if (typeof affected === "number" && affected > 0)
        notice("Catalog verified. {count} installed releases were withdrawn.", false, { count: affected });
      else notice("Catalog verified. Select a release to inspect its exact file.");
    };
    if (browser.navigator?.locks) await browser.navigator.locks.request(name, commit);
    else await commit();
  }
  trustInput.addEventListener(
    "change",
    () =>
      void run(async () => {
        candidate = null;
        trustButton.hidden = true;
        const text = await textFile(trustInput, 8192);
        if (text === null) return;
        const proposed = await readCatalogKey(JSON.parse(text));
        if (
          proposed.catalogId === config.key?.catalogId &&
          proposed.fingerprint !== (await readCatalogKey(config.key)).fingerprint
        )
          throw new Error("The official catalog key cannot be replaced here.");
        const previous = readLocal(checkpointKey(proposed.catalogId));
        if (previous && previous.fingerprint !== proposed.fingerprint)
          throw new Error("Catalog key does not match its previously trusted fingerprint.");
        if (lifetime.signal.aborted) return;
        candidate = proposed;
        trustLabel.textContent = proposed.catalogId + " · " + proposed.fingerprint;
        notice("Check this fingerprint with the publisher through another channel");
        trustButton.hidden = false;
      })
  );
  indexInput.addEventListener(
    "change",
    () =>
      void run(async () => {
        if (!key && !config.key) {
          indexInput.value = "";
          throw new Error("Trust a separate catalog key first.");
        }
        await open(await textFile(indexInput, CATALOG_LIMIT), key || config.key);
      })
  );
  function populateFacets() {
    for (const [field, select] of selectors) {
      const old = select.value;
      const values = [
        ...new Set(snapshot.releases.flatMap((e) => (field === "language" ? e.languages : [e[field]])))
      ].sort();
      select.replaceChildren();
      const any = node("option", t("Any"));
      any.value = "";
      select.append(any);
      for (const value of values) {
        const opt = authored(node("option", value));
        opt.value = value;
        select.append(opt);
      }
      select.value = values.includes(old) ? old : "";
    }
  }
  function metadata(container, label, value) {
    container.append(node("dt", t(label)), authored(node("dd", value)));
  }
  function render() {
    list.replaceChildren();
    summary.replaceChildren();
    filters.hidden = summary.hidden = !snapshot;
    count.textContent = "";
    if (!snapshot) {
      empty.hidden = false;
      empty.textContent = t("Choose a publisher and open its signed catalog to browse resources.");
      return;
    }
    let stale = snapshot.expires <= Date.now();
    try {
      checkpointFor(snapshot);
    } catch {
      stale = true;
    }
    summary.append(
      authored(node("strong", snapshot.catalogId)),
      node("span", t("Verified catalog revision") + " " + snapshot.checkpoint.sequence),
      node(
        "span",
        t("Valid until") + " " + new Date(snapshot.expires).toLocaleString(doc.documentElement?.lang || undefined)
      )
    );
    if (stale) summary.append(node("p", t("Open a current signed snapshot to verify more pack files.")));
    const query = search.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    let matches = 0;
    for (const entry of snapshot.releases) {
      const withdrawn = snapshot.checkpoint.revoked.includes(entry.sha256);
      const tags = [
        entry.title,
        entry.id,
        entry.task,
        ...entry.languages,
        entry.region,
        entry.domain,
        entry.edition,
        entry.maintainer,
        entry.sample,
        entry.rights,
        entry.offline ? t("Offline") : t("Network required")
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (
        !query.every((word) => tags.includes(word)) ||
        (offline.checked && !entry.offline) ||
        (availability.value === "available" && withdrawn) ||
        (availability.value === "withdrawn" && !withdrawn) ||
        [...selectors].some(
          ([field, select]) =>
            select.value && !(field === "language" ? entry.languages : [entry[field]]).includes(select.value)
        )
      )
        continue;
      matches++;
      const row = node("li", "", "exchange-catalog-card");
      const title = node("div", "", "exchange-catalog-card-title");
      title.append(
        authored(node("h4", entry.title)),
        authored(node("span", entry.version, "exchange-catalog-version"))
      );
      row.append(title, authored(node("p", entry.task)), authored(node("p", entry.sample, "exchange-catalog-sample")));
      const brief = node("p", "", "exchange-catalog-compatibility");
      brief.append(
        authored(node("span", entry.languages.join(", "))),
        node("span", t(entry.offline ? "Works offline" : "Network required")),
        authored(node("span", entry.edition))
      );
      row.append(brief);
      const details = node("details");
      details.append(node("summary", t("Publisher and review details")));
      const info = node("dl", "", "exchange-catalog-metadata");
      for (const [label, value] of [
        ["Pack ID", entry.id],
        ["Maintainer", entry.maintainer],
        ["Rights", entry.rights],
        ["Region", entry.region],
        ["Domain", entry.domain],
        ["Tested with", entry.testedApp],
        ["Reviewed version", entry.reviewedVersion],
        ["SHA-256", entry.sha256]
      ])
        metadata(info, label, value);
      details.append(
        info,
        node("p", t("The publisher signed this listing. Assess whether its examples and review suit your project."))
      );
      row.append(details);
      if (withdrawn) row.append(node("p", t("Withdrawn by the catalog publisher."), "exchange-catalog-withdrawn"));
      else if (stale) row.append(node("p", t("A current signed snapshot is required.")));
      else {
        const expected = snapshot;
        async function preview(file) {
          const live = checkpointFor(expected);
          if (live.revoked.includes(entry.sha256))
            throw new Error("This exact pack was withdrawn by its catalog signer.");
          const checked = await verifyCatalogArtifact(file, entry, expected);
          if (lifetime.signal.aborted || snapshot !== expected) return;
          const latest = checkpointFor(expected);
          if (latest.revoked.includes(entry.sha256))
            throw new Error("This exact pack was withdrawn by its catalog signer.");
          await onInstall(checked, {
            id: entry.id,
            version: entry.version,
            digest: entry.sha256,
            catalogId: expected.catalogId,
            fingerprint: latest.fingerprint,
            expires: expected.expires
          });
        }
        const input = fileControl("Verify local pack and preview", row, ".loopcat-pack.zip,.zip");
        input.addEventListener(
          "change",
          () =>
            void run(async () => {
              const file = input.files?.[0];
              input.value = "";
              if (file) await preview(file);
            })
        );
        if (online && snapshot.catalogId === config.key.catalogId)
          button(
            "Download and preview",
            async () =>
              preview(
                await fetchCatalogFile(
                  config.source,
                  entry.sha256,
                  fetch,
                  AbortSignal.any([lifetime.signal, AbortSignal.timeout(30000)])
                )
              ),
            row
          );
      }
      list.append(row);
    }
    count.textContent = t("{count} of {total} releases", { count: matches, total: snapshot.releases.length });
    empty.hidden = matches > 0;
    empty.textContent = t(
      snapshot.releases.length
        ? "No matching packs. Clear a filter or try another search."
        : "This signed catalog currently lists no releases."
    );
  }
  function changed(event) {
    if (snapshot && (!event.key || event.key === checkpointKey(snapshot.catalogId))) {
      render();
      notice("Catalog trust history changed. Open its current signed snapshot.");
    }
  }
  browser.addEventListener?.("storage", changed);
  section.addEventListener("input", (event) => {
    if (event.target.type !== "file") render();
  });
  section.addEventListener("change", (event) => {
    if (event.target.type !== "file") render();
  });
  function destroy() {
    lifetime.abort();
    clearTimeout(expiryTimer);
    generation++;
    snapshot = null;
    browser.removeEventListener?.("storage", changed);
    section.remove();
  }
  return Object.assign(destroy, { destroy });
}
