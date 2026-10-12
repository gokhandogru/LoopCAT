# Workspace UI refinement — local verification

Version: 0.0.4-dev.20261012.1. Local Windows preview; no publication or database migration.

Implemented compact context/translation rows with stable composition-owned slots, shared dynamic overlay menus, scoped Statistics, contextual segment/file selection, and compact file rows. Resources use Open/Actions, with shared controls on Trash and dialog footers. New command labels are in English, Turkish, Catalan, and Arabic catalogs.

## Verified

- 1,543 unit tests passed.
- ESLint, TypeScript, Stylelint, formatting, import boundaries, and catalog validation passed.
- Statistics UI regression: 20 mixed files, 80 source words, report roundtrip, corrupt-file isolation, immutable baseline, narrow RTL.
- File lifecycle regression: rename, source update, historical translation inspection/restoration, Trash restoration, and backup roundtrip passed.
- Full automated accessibility regression passed across light/dark surfaces, including populated editor, projects, Resources, Trash, dialogs, and command palette.
- Dedicated toolbar UI regression: 1920×1080, 1366×768, narrow panes, 200% zoom, inspector closed, Turkish/Catalan/Arabic catalogs, dark RTL, keyboard arrow navigation, Escape focus return, nested menus, header selection, and overlay row-height stability passed.
- Wide editor header measured 139.8 CSS pixels above the grid. Desktop list rows fit the 72–88-pixel target. No horizontal page overflow in tested layouts.

Screenshots: `output/toolbar-verification/`. Repeat using `node scripts/build-renderer.cjs` then `node scripts/verify-toolbar-workflow.cjs`.

## Practical limits

Automated checks and screenshot inspection do not replace extended translator use, assistive-technology testing with a screen reader, or clean-machine installation qualification. Packaged launch checks use isolated profiles, not the user's translation data. Existing Cards/List preferences and translation/file lifecycle handlers remain in place.
