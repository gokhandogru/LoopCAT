import {
  CATALOG_LIMIT,
  OFFICIAL_CATALOG,
  fetchCatalogFile,
  readCatalogKey,
  verifyCatalog,
  verifyCatalogArtifact
} from "./catalog.js";
import { checkpointKey } from "./catalog-policy.js";

/** File selection and online downloads converge on the ordinary host-owned pack preview. */
export function mountExchangeCatalog({
  root,
  onInstall,
  t = (s) => s,
  config = OFFICIAL_CATALOG,
  onSnapshot = async (_) => {}
}) {
  const doc = root.ownerDocument;
  const lifetime = new AbortController();
  function node(tag, text = "") {
    const element = doc.createElement(tag);
    element.textContent = text;
    return element;
  }
  const section = node("section"),
    heading = node("h3", t("Pack catalog")),
    status = node("p");
  status.setAttribute("role", "status");
  section.append(heading, node("p", t("Browse reviewed packs. Opening a catalog does not run or enable a pack.")));
  let key = null,
    candidate = null,
    snapshot = null,
    generation = 0,
    busy = false;
  function fileControl(label, accept) {
    const l = node("label", t(label));
    const input = node("input");
    input.type = "file";
    input.accept = accept;
    l.append(input);
    section.append(l);
    return input;
  }
  function button(label, fn, container = section) {
    const b = node("button", t(label));
    b.type = "button";
    b.addEventListener("click", () => void run(fn));
    container.append(b);
    return b;
  }
  const list = node("ul");
  const trustInput = fileControl("Choose a separate catalog trust file", ".json"),
    trustLabel = node("p");
  section.append(trustLabel);
  const trustButton = button("Trust this fingerprint for this session", () => {
    if (!candidate) return;
    key = candidate;
    candidate = null;
    generation++;
    snapshot = null;
    list.replaceChildren();
    trustButton.hidden = true;
    trustLabel.textContent = `${key.catalogId}: ${key.fingerprint}`;
    status.textContent = t("Select a signed snapshot using this key.");
  });
  trustButton.hidden = true;
  const indexInput = fileControl("Open signed catalog snapshot", ".json");
  const searchLabel = node("label", t("Search task, language, region, domain, edition or offline support"));
  const search = node("input");
  search.type = "search";
  searchLabel.append(search);
  section.append(searchLabel);
  section.append(list, status);
  root.append(section);
  async function run(fn) {
    if (busy || lifetime.signal.aborted) return;
    busy = true;
    try {
      await fn();
    } catch (error) {
      status.textContent = t(error?.message || "Catalog action failed.");
    } finally {
      busy = false;
    }
  }
  function textFile(input, limit) {
    const f = input.files?.[0];
    input.value = "";
    if (!f || f.size > limit) throw new Error("Choose a file within the size limit.");
    return f.text();
  }
  const readLocal = (k) => {
    const text = localStorage.getItem(k);
    return text ? JSON.parse(text) : null;
  };
  async function open(text, anchor) {
    const trusted = await readCatalogKey(anchor),
      k = checkpointKey(trusted.catalogId),
      gen = generation;
    const commit = async () => {
      const verified = await verifyCatalog(text, trusted, readLocal(k));
      if (gen !== generation || lifetime.signal.aborted) return;
      localStorage.setItem(k, JSON.stringify(verified.checkpoint));
      key = trusted;
      snapshot = verified;
      await onSnapshot(verified);
      render();
      status.textContent = `${t("Verified catalog revision")}: ${verified.checkpoint.sequence}. ${t("Valid until")}: ${new Date(verified.expires).toLocaleDateString()}.`;
    };
    if (navigator.locks) await navigator.locks.request(k, commit);
    else await commit();
  }
  trustInput.addEventListener(
    "change",
    () =>
      void run(async () => {
        candidate = null;
        trustButton.hidden = true;
        candidate = await readCatalogKey(JSON.parse(await textFile(trustInput, 8192)));
        if (
          candidate.catalogId === config.key?.catalogId &&
          candidate.fingerprint !== (await readCatalogKey(config.key)).fingerprint
        )
          throw new Error("The official catalog key cannot be replaced here.");
        const previous = readLocal(checkpointKey(candidate.catalogId));
        if (previous && previous.fingerprint !== candidate.fingerprint)
          throw new Error("Catalog key does not match its previously trusted fingerprint.");
        trustLabel.textContent = `${t("Check this fingerprint with the publisher through another channel")}: ${candidate.catalogId} · ${candidate.fingerprint}`;
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
  const online = Boolean(config.key && config.source);
  if (online)
    button("Refresh official catalog", async () => {
      const f = await fetchCatalogFile(
        config.source,
        null,
        fetch,
        AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)])
      );
      await open(await f.text(), config.key);
    });
  function render() {
    list.replaceChildren();
    if (!snapshot) return;
    const query = search.value.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    for (const entry of snapshot.releases) {
      const tags = [
        entry.title,
        entry.id,
        entry.task,
        ...entry.languages,
        entry.region,
        entry.domain,
        entry.edition,
        entry.offline ? t("Offline") : t("Network required")
      ]
        .join(" ")
        .toLowerCase();
      if (!query.every((x) => tags.includes(x))) continue;
      const row = node("li");
      const unavailable = snapshot.checkpoint.revoked.includes(entry.sha256);
      row.append(
        node("strong", `${entry.title} · ${entry.version}`),
        node(
          "p",
          `${entry.task} · ${entry.languages.join(", ")} · ${entry.region} · ${entry.domain} · ${entry.edition} · ${entry.offline ? t("Offline") : t("Network required")}`
        ),
        node("p", `${t("Sample")}: ${entry.sample}`),
        node(
          "p",
          `${t("Maintainer")}: ${entry.maintainer} · ${t("Rights")}: ${entry.rights} · ${t("Tested with")}: ${entry.testedApp} · ${t("Reviewed version")}: ${entry.reviewedVersion}`
        )
      );
      if (unavailable) row.append(node("p", t("Withdrawn by the catalog publisher.")));
      else {
        const expectedSnapshot = snapshot;
        async function preview(file) {
          const live = readLocal(checkpointKey(expectedSnapshot.catalogId));
          if (!live || live.hash !== expectedSnapshot.checkpoint.hash || live.revoked.includes(entry.sha256))
            throw new Error("Refresh the catalog before selecting this release.");
          const checked = await verifyCatalogArtifact(file, entry, expectedSnapshot);
          if (lifetime.signal.aborted || snapshot !== expectedSnapshot) return;
          await onInstall(checked, {
            id: entry.id,
            version: entry.version,
            digest: entry.sha256,
            catalogId: expectedSnapshot.catalogId,
            fingerprint: live.fingerprint,
            expires: expectedSnapshot.expires
          });
        }
        const l = node("label", t("Verify local pack and preview"));
        const input = node("input");
        input.type = "file";
        input.accept = ".zip";
        l.append(input);
        row.append(l);
        input.addEventListener(
          "change",
          () =>
            void run(async () => {
              const f = input.files?.[0];
              input.value = "";
              if (f) await preview(f);
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
    if (!list.children.length) list.append(node("li", t("No matching packs.")));
  }
  search.addEventListener("input", render);
  function destroy() {
    lifetime.abort();
    generation++;
    snapshot = null;
    section.remove();
  }
  return Object.assign(destroy, { destroy });
}
