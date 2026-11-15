import { encodeAuthorDraft } from "./author-draft.js";
// Forms use DOM text nodes throughout: labels, examples and imported data are untrusted.
export function createAuthorForm(ctx, root, initial, onPreview) {
  const { el, action, field, repo, parseTermList, note } = ctx;
  const { exchangeAuthorSelection = [], ...pack } = structuredClone(initial);
  const maxRows = pack.kind === "qa" ? 100 : 500;
  if (pack.entries.length > maxRows) throw Error("This collection exceeds the no-code editor limit. Use the pack CLI.");
  const fields = el("div", null, "exchange-grid");
  const meta = {};
  for (const [key, label, value] of [
    ["id", "Pack ID", pack.id],
    ["name", "Name", pack.name],
    ["version", "Version", pack.version],
    ["publisher", "Publisher", pack.publisher],
    ["license", "Content license", pack.license],
    ["attribution", "Attribution", pack.attribution || ""],
    ["source", "Source language", pack.languages?.source || "en"],
    ["target", "Target language", pack.languages?.target || "tr"]
  ])
    meta[key] = field(fields, label, value);
  const allowCopy =
    pack.kind === "terminology"
      ? field(fields, "Allow copying individual terms", pack.allowTermCopy === true, "checkbox")
      : null;
  const entries = el("div"),
    controls = el("div", null, "exchange-actions");
  root.append(fields, entries, controls);
  const rows = [];
  function row(item = {}, selected = true) {
    if (rows.length >= maxRows) throw Error("This collection exceeds the no-code editor limit. Use the pack CLI.");
    const group = el("fieldset"),
      include = field(group, "Include in shared pack", selected, "checkbox");
    group.prepend(el("legend", pack.kind === "qa" ? "QA rule" : "Terminology entry"));
    const values = {};
    if (pack.kind === "terminology") {
      for (const [key, label] of [
        ["sourceTerm", "Source term"],
        ["targetTerm", "Target term"],
        ["conceptId", "Concept ID"],
        ["domain", "Domain"],
        ["attribution", "Source attribution"]
      ])
        values[key] = field(group, label, item[key] || "");
      values.status = field(group, "Term status", item.status || "preferred", ["preferred", "admitted", "forbidden"]);
    } else {
      values.id = field(group, "Rule ID", item.id || "rule-" + (rows.length + 1));
      values.op = field(group, "Rule type", item.op || "target-missing-if-source", [
        "target-missing-if-source",
        "target-contains"
      ]);
      values.source = field(group, "Source trigger", item.source || "");
      values.targets = field(group, "Target forms (one per line)", (item.targets || []).join("\n"), "textarea");
      values.message = field(group, "Explanation", item.message || "");
      values.severity = field(group, "Severity", item.severity || "warning", ["warning"]);
      for (const outcome of ["fail", "pass"]) {
        const ex = item.examples?.find((e) => e.expect === outcome);
        values[outcome + "Source"] = field(
          group,
          outcome === "fail" ? "Example that should flag: source" : "Counterexample that should pass: source",
          ex?.source || ""
        );
        values[outcome + "Target"] = field(
          group,
          outcome === "fail" ? "Example that should flag: target" : "Counterexample that should pass: target",
          ex?.target || ""
        );
      }
    }
    entries.append(group);
    const caseSensitive = field(group, "Case-sensitive matching", item.caseSensitive === true, "checkbox");
    const firstFail = item.examples?.find((e) => e.expect === "fail"),
      firstPass = item.examples?.find((e) => e.expect === "pass");
    rows.push({
      include,
      values,
      caseSensitive,
      extraExamples: (item.examples || []).filter((e) => e !== firstFail && e !== firstPass)
    });
  }
  function read(privateDraft = false) {
    const f = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v.value.trim()]));
    const result = {
      ...pack,
      ...(allowCopy ? { allowTermCopy: allowCopy.checked } : {}),
      id: f.id,
      name: f.name,
      version: f.version,
      publisher: f.publisher,
      license: f.license,
      languages: { source: f.source, target: f.target },
      entries: [],
      ...(f.attribution ? { attribution: f.attribution } : {})
    };
    if (!f.attribution) delete result.attribution;
    if (privateDraft) result.exchangeAuthorSelection = rows.map((r) => r.include.checked);
    for (const { include, values, caseSensitive, extraExamples } of rows) {
      if (!privateDraft && !include.checked) continue;
      const v = Object.fromEntries(Object.entries(values).map(([k, node]) => [k, node.value.trim()]));
      if (pack.kind === "terminology")
        result.entries.push({
          ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)),
          ...(caseSensitive.checked ? { caseSensitive: true } : {})
        });
      else
        result.entries.push({
          id: v.id,
          op: v.op,
          ...(v.op === "target-missing-if-source" ? { source: v.source } : {}),
          targets: v.targets.split(/\r?\n/).filter(Boolean),
          message: v.message,
          ...(caseSensitive.checked ? { caseSensitive: true } : {}),
          severity: v.severity,
          examples: [
            ...["fail", "pass"].map((expect) => ({
              expect,
              source: v[expect + "Source"],
              target: v[expect + "Target"]
            })),
            ...extraExamples
          ]
        });
    }
    return result;
  }
  for (const [i, item] of pack.entries.entries()) row(item, exchangeAuthorSelection[i] !== false);
  if (!pack.entries.length) row();
  controls.append(action("Add entry", () => row()));
  if (pack.kind === "terminology") {
    const file = field(controls, "Import CSV or TSV", "", "file");
    file.accept = ".csv,.tsv,.txt";
    file.onchange = async () => {
      try {
        const f = file.files?.[0];
        if (!f) return;
        if (f.size > 1024 * 1024) throw Error("Authoring import is limited to 1 MiB.");
        const terms = parseTermList(await f.text(), {
          fileName: f.name,
          sourceLang: meta.source.value,
          targetLang: meta.target.value
        });
        const placeholder =
          rows.length === 1 &&
          !rows[0].caseSensitive.checked &&
          Object.entries(rows[0].values).every(([key, control]) =>
            key === "status" ? control.value === "preferred" : !control.value
          );
        if (terms.length + rows.length - (placeholder ? 1 : 0) > maxRows)
          throw Error("Select at most 500 entries for a single authoring import.");
        if (terms.length && placeholder) rows.pop().include.closest("fieldset").remove();
        for (const t of terms)
          row({
            sourceTerm: t.sourceTerm,
            targetTerm: t.targetTerm,
            status: t.isForbidden ? "forbidden" : t.status || "preferred"
          });
        for (const blank of rows)
          if (!blank.values.sourceTerm.value && !blank.values.targetTerm.value) blank.include.checked = false;
        note("Choose the entries to include before sharing.");
      } catch (e) {
        note(e.message);
      } finally {
        file.value = "";
      }
    };
  }
  controls.append(
    el("p", "Private drafts include excluded entries. Share an exported pack with translators."),
    action("Export private author draft", () => {
      const draft = read(true);
      ctx.save("loopcat-private-author-draft.loopcat-draft.json", encodeAuthorDraft(draft));
    }),
    action("Save author draft", async () => {
      const draft = read(true);
      await repo.saveDraft(draft.id, draft);
      note("Draft saved on this device. Export a file for a separate copy.");
    }),
    action("Validate and preview", () => onPreview(read()))
  );
}
