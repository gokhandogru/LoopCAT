# Resources workspaces

The Resources library uses a compact table with one language pair, entry count, linked-project count, and update date per resource. Search names, combine language/project/archive filters, sort columns, and choose compact or comfortable rows. **New** and **Import** open dialogs. The linked-project count opens the project roles; **Actions** retains rename, duplicate, export, archive/restore, and Trash.

## Open and return

**Open** launches a separate native window in desktop editions and a browser tab on the Web. Reopening the same resource focuses its existing editor. Browser settings can block a new tab; in that case, and for a direct `file://` distribution, the editor opens in the current tab. **Back to Resources** returns to the library with filters, sorting, density, selected resource, tab, and scroll restored. Desktop resource windows continue working after the library closes. Application Quit checks the open editors.

Use a TM match's context menu (or Shift+F10) to open its stored entry. The term suggestion's edit action opens the corresponding resource entry.

## Search and edit

Search source, target, or both with contains/exact matching and optional case sensitivity. Filters and sorting cover the entire resource before its 100-row pages are calculated. Clear individual filter chips or all filters. The table displays safe tag tokens; **Raw markup** shows their original text. Markup is never executed. Literal replacement protects tags and numbered placeholders.

Choose an entry's source to open its form. The result pane can be resized with its edge; below 900 CSS pixels the form fills the workspace and provides **Back to results**. TM entry details show provenance and dates and allow domain editing. Termbases expose preferred/admitted/forbidden status, definition, notes, example, subject/domain, part of speech, matching mode, fuzzy threshold, and case behavior. Definition/domain changes to a shared concept also update its related bilingual records. Existing multilingual metadata stays intact; this remains a bilingual authoring workflow.

Edits become local recoverable drafts immediately. They do not enter active TM lookup or terminology QA until saved. Search, paging, and selecting another entry retain drafts. **Save** commits the active entry, **Save and next** advances, and **Save all** commits this editor's drafts. **Discard** removes the active draft. Changed rows and the draft count remain visible.

Desktop close and **Back to Resources** offer Save all, Discard changes, or Cancel. Browser tab closure uses the browser's own warning. After a crash or reload, **Review recovered drafts** lets you choose drafts from editors that are no longer open. “Draft recovered” does not mean “Changes saved.” A save or quota failure retains text and reports the failure. If another editor changed the entry, compare stored text with your draft; explicitly rebase and review before saving again.

## Maintenance and duplicates

The header checkbox selects only the current page. **Select all matching results** expands selection across pages and reports its count. Changing a query clears selection. Find/replace, term status changes, and removal show a paged preview before committing. Save or discard drafts first. Cancel stops further writes and the status reports how many entries committed. **Undo last operation** uses saved receipts and refuses to overwrite newer changes. Removed records also use the existing Trash infrastructure.

Duplicate filters distinguish identical pairs from same-source alternatives. Select the versions to retain, then choose **Keep selected versions**. Only groups with an explicit keeper become removal candidates; separate terminology concepts remain distinct. Review the removal list before committing. A same-source alternative can be a legitimate translation; nothing is merged or removed automatically.

## Import and export

Import into a new or existing resource. Review detected languages and set the intended source/target pair. For CSV, TSV, and XLSX terminology, map source/target and optional metadata columns; expanded terminology details expose additional mappings. The preview shows the first ten valid entries, duplicate/invalid counts, and validation messages. Download the validation report for rejected rows. Existing records are preserved, exact duplicates are skipped, and alternatives are retained. The completion report records actual added/skipped/problem counts, including cancelled imports.

Export **All**, **Filtered**, or **Selected** saved entries explicitly, then choose TMX/TBX, CSV, or TSV. If drafts exist, choose Save and export or Export saved version. TMX/TBX preserve their supported metadata and unchanged tag content.

## Local storage and verification

The editor is local-first and works offline after the application assets are available. It adds no cloud or AI service. Database version 10 adds draft and operation-receipt stores without changing existing resource IDs or portable package/backup versions. Record changes, resource metadata, and TM index changes commit atomically with stale-version checks. Committed changes notify other windows, invalidate relevant queries and project lookup/QA state, and mark linked projects as needing package saves. Background folder-backup ownership remains with the library; independent editors do not start competing backup timers.

Run `pnpm verify:resources` for the isolated Electron workflow, accessibility, and 100,000-entry probe. Add `--million` to `node scripts/verify-resource-workspace.cjs` after building for the million-entry stress probe. Run `pnpm verify:resource-browsers` for Firefox/WebKit workflows. These commands use temporary test profiles, not a translator's working database. The desktop release workflow runs shared checks across Windows/macOS/Linux and browser checks before release artifacts. Real Safari and packaged native-platform sign-off remain separate release qualification tasks; automated WebKit does not substitute for Safari testing.
