# Keyboard Shortcuts

LoopCAT's shortcut system is optimized for the translator's main loop: edit, insert a suggestion, confirm, and advance without leaving the target editor. `Ctrl/Cmd` means `Ctrl` on Windows and Linux and `Command` on macOS. `Alt` maps to `Option` on macOS.

## Design strategy

- The most frequent actions stay under the left hand or use large, easy-to-reach keys: `Tab`, `Enter`, and the arrow keys.
- A shortcut performs the same action everywhere it appears. The command palette and button tooltips use the same central shortcut definitions as the keyboard handlers.
- Text editing remains safe. Application shortcuts do not replace ordinary typing, browser text editing, or shortcuts inside unrelated inputs. Target-editor commands are enabled only in the target editor or in a non-editable editor context.
- International keyboards are first-class. LoopCAT ignores shortcut routing during IME composition and when `AltGraph` is active, so accented characters and input methods are not mistaken for commands.
- Advanced commands use function keys or mnemonic letters, while destructive or structural actions require a modifier.
- Browser-safe function keys are provided for core discovery and lookup actions. Chrome-reserved chords remain compatibility aliases only, because a browser or extension can consume them before a web page receives an event.
- One contextual picker handles TM, terminology, and saved AI results. This avoids allocating a different hard-to-remember shortcut to every suggestion rank.

## Translation and navigation

| Action                            | Windows / Linux   | macOS                | Behavior                                                                                                                 |
| --------------------------------- | ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Confirm current segment           | `Ctrl+Enter`      | `Cmd+Enter`          | Confirms the active segment. In the comment field, the same shortcut saves the comment form.                             |
| Quick Insert                      | `Tab`             | `Tab`                | Opens ranked suggestions when the active segment has results. Ordinary Tab behavior is retained when none are available. |
| Insert next protected tag         | `F8`              | `F8`                 | Inserts the next missing protected tag at the target caret.                                                              |
| Insert all missing protected tags | `Ctrl+Shift+F8`   | `Cmd+Shift+F8`       | Inserts every missing tag as one undoable action.                                                                        |
| Copy source to target             | `Ctrl+Shift+S`    | `Cmd+Shift+S`        | Replaces the active target with its source text.                                                                         |
| Next visible segment              | `Alt+Down`        | `Option+Down`        | Moves within the currently filtered segment list.                                                                        |
| Previous visible segment          | `Alt+Up`          | `Option+Up`          | Moves within the currently filtered segment list.                                                                        |
| Next open segment                 | `Alt+Enter`       | `Option+Enter`       | Jumps to the next unconfirmed segment, wrapping when needed.                                                             |
| Previous open segment             | `Alt+Shift+Enter` | `Option+Shift+Enter` | Jumps backward through unconfirmed segments.                                                                             |
| Undo                              | `Ctrl+Z`          | `Cmd+Z`              | Undoes the last reversible LoopCAT action.                                                                               |
| Redo                              | `Ctrl+Shift+Z`    | `Cmd+Shift+Z`        | Redoes the last reverted LoopCAT action.                                                                                 |

## Search, review, and structure

| Action              | Windows / Linux              | macOS                       | Behavior                                                                                                                      |
| ------------------- | ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Command palette     | `F2` or `Ctrl+Shift+P`       | `F2` or `Cmd+Shift+P`       | Searches available commands and shows their shortcuts. `Ctrl/Cmd+K` remains a compatibility alias, but Chrome may reserve it. |
| Concordance         | `F4` or `Ctrl+Shift+K`       | `F4` or `Cmd+Shift+K`       | Searches the TM using selected source or target text. `Ctrl/Cmd+Alt+K` remains a compatibility alias.                         |
| Find segments       | `Ctrl+F`                     | `Cmd+F`                     | Focuses and selects the editor's source/target search field.                                                                  |
| Replace target text | `Ctrl+Shift+H`               | `Cmd+Shift+H`               | Opens target find-and-replace. `Ctrl/Cmd+H` remains a desktop compatibility alias.                                            |
| Add review comment  | `Shift+F4` or `Ctrl+Shift+Y` | `Shift+F4` or `Cmd+Shift+Y` | Opens the Review inspector and focuses the comment field. `Ctrl/Cmd+Shift+M` remains a compatibility alias.                   |
| Next quality risk   | `F9`                         | `F9`                        | Moves to the next item in the Quality Workbench risk queue.                                                                   |
| Run QA              | `Shift+F9`                   | `Shift+F9`                  | Runs project QA checks.                                                                                                       |
| Split segment       | `Ctrl+Shift+E`               | `Cmd+Shift+E`               | Splits the active segment when its format and caret position allow it. `Ctrl/Cmd+E` remains a desktop compatibility alias.    |
| Merge with next     | `Ctrl+Shift+L`               | `Cmd+Shift+L`               | Merges the active segment with the next compatible segment. `Ctrl/Cmd+J` remains a desktop compatibility alias.               |
| Toggle Focus mode   | `Ctrl+Shift+F`               | `Cmd+Shift+F`               | Enters or exits the translation-only Focus view.                                                                              |

`Escape` closes Quick Insert, concordance, the command palette, or Focus mode, starting with the topmost active surface.

## Quick Insert

Quick Insert provides up to nine numbered results without making a network request:

1. Up to four current TM matches.
2. Up to three approved termbase suggestions. Forbidden terms are never offered for insertion.
3. Up to two already-saved AI suggestions, newest first.

Use `Up`/`Down` or `Tab`/`Shift+Tab` to move, `1`–`9` to choose directly, `Enter` to apply the highlighted result, and `Escape` to cancel. TM matches and saved AI suggestions replace the target. Approved terms insert at the current caret or replace the current target selection. Every insertion uses LoopCAT's reversible command history.

## Discoverability and accessibility

Open the command palette with `F2` or `Ctrl/Cmd+Shift+P` to find commands by name and see their current bindings. Frequently used buttons and target editors also expose shortcut hints through titles and `aria-keyshortcuts`. The pickers use normal keyboard focus, selected-state announcements, and focus restoration when they close.

If an installed Chrome extension owns a global shortcut, Chrome may never deliver that key event to LoopCAT. Use `F2` to reach every command, or change the extension binding in Chrome's extension-shortcut settings. After installing an updated hosted/PWA build, accept the LoopCAT update prompt or reload once so the new offline shell activates.

Shortcut customization is not yet exposed in Settings. The bindings live in one declarative registry at `src/app/keyboard-shortcuts.js`, so a future configurable shortcut profile can replace labels and matching rules without duplicating command logic.
