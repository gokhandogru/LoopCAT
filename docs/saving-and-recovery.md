# Saving and recovering translation output

This guide describes the reliability changes in the working source tree. Previously published download packages do not contain these changes until a new build is made and qualified.

## Local saving

LoopCAT keeps its authoritative records in IndexedDB, including in the desktop app. Typing requests a save after 450 ms of inactivity. Continuous typing requests a checkpoint of the pending edit at least every two seconds. A save remains pending until its database transaction commits; a failed request stays queued for retry.

The protection indicator distinguishes **local saving** from **external backup**. A successful local save does not mean that a copy exists outside the browser profile. Save failures and conflicts remain visible until addressed. Unrelated activity or export notices do not clear those failures. **Retry local save** retries pending changes. **Emergency export** downloads current in-memory source and target text without requiring QA, indexes, or activity logging.

Keep the profile and its storage. Clearing browser site data, deleting the desktop profile, disk failure, or losing the device can remove local records and local checkpoints together. Configure an external folder or keep verified portable backups to recover independently of that profile.

## One editing window per project

One tab or window owns editing access to a project. A second context opens it read-only. Use **Request editing access** to ask the owner to finish saving and hand over control. Failed saving prevents the handoff. Web Locks coordinate supported browsers; the fallback uses a timed database lease and a fencing token checked during each write.

If storage reports a conflicting write, the current stored version is preserved and the rejected record is retained separately. **Export preserved conflicts** includes conflicting targets and other affected records. Review that output before deciding which version to apply. Retrying does not silently replace a newer record with a stale one.

The desktop app also prevents a second application instance. Closing it waits for local saving. If that fails, the dialog offers Retry, Emergency Export, explicit exit, or Cancel. Emergency export keeps the editor open. A renderer restart can reconstruct committed state from the journal and verified checkpoint base.

## Checkpoints and external backups

LoopCAT creates local recovery checkpoints after 60 seconds of dirty activity and around completed bulk/import and replacement operations. Checkpoint jobs run serially, and newer requests coalesce. Original source assets are split into bounded parts and shared between checkpoints when their hashes match.

Choose a workspace folder to enable automatic external generations. Without a folder, editing and local recovery remain available; the indicator says **External backup not configured**.

The new folder layout is `loopcat-v2/`. Existing JSON packages remain legacy sources. New archive generations take precedence; an older JSON file must not overwrite newer archive work during folder synchronization.

Retained recovery generations include the newest ten plus a daily generation for the preceding seven days. The last two verified generations and unresolved pre-restore rollback copies remain protected. A replacement is written, reopened, and verified before obsolete backups are removed. Journal compaction requires a verified recovery base.

Automatic external `.loopcat-workspace-state.zip` generations refer to shared files under `loopcat-v2/assets/`. **Keep the whole folder** when moving these generations. For an independent file to transfer or keep elsewhere, export a portable `.loopcat-backup.zip` workspace backup or `.loopcat.zip` project package.

If folder histories diverge, LoopCAT stops advancing that folder. Use the recovery controls to inspect retained backups, import the chosen version as copies, and connect a fresh folder. A damaged latest generation does not authorize overwriting its predecessors.

## Export and verification

- **Project package:** `.loopcat.zip`, containing the project, segments, history, comments, resource links, and original reconstruction assets.
- **Portable workspace backup:** `.loopcat-backup.zip`, containing a committed workspace snapshot and its required assets.
- **JSON compatibility export:** the existing JSON format, limited to 50 MiB so that LoopCAT's legacy reader can reopen it.
- **Emergency bilingual text:** UTF-8 source/target output from the current editor, intended to rescue text when normal persistence or export is unavailable.

For a native desktop save or File System Access destination, completion waits for the write to close and for readback verification. Only verified delivery advances successful backup/export history. Native replacement retains the previous destination in a `.previous` file.

An ordinary browser anchor download cannot prove that the browser wrote the destination successfully. Its status says **Download requested**, and it does not count as a verified backup. Check the downloaded file before relying on it. Archive hashes and CRCs detect damaged bytes; they do not authenticate who created a package.

Archive work runs in a local worker. **Cancel archive operation** stops active archive jobs; completed, verified generations remain available.

## Restore

1. Choose a portable backup file, a local checkpoint, or a retained folder backup.
2. LoopCAT checks its format, integrity, record relationships, and staging capacity before replacement.
3. Review the affected project names. **Import as copies** is the default, preserving existing work.
4. Full replacement requires a separate explicit choice and a verified local rollback checkpoint.
5. Authoritative records are replaced in one database transaction. The visible session refreshes after commit, and resource indexes rebuild afterward.

If index rebuilding fails, the message distinguishes a completed restore from indexes needing repair. The restored targets remain committed. Use the retained rollback checkpoint to recover from choosing the wrong backup. Future unsupported schemas fail before changing live data; never downgrade a migrated profile in place.

## OPUS-CAT and AI credentials

The browser OPUS-CAT bridge accepts only configured HTTP/HTTPS origins and loopback hosts. Its default permitted app origins are `http://127.0.0.1:4173` and `http://localhost:4173`. Serve the built web app from the selected origin, then run `pnpm opuscat:web-bridge`. File-based browser pages with `Origin: null` cannot use the bridge; use the desktop connection or a local web server.

The bridge creates a random session capability. LoopCAT keeps it in session storage and sends translation requests using authenticated POST requests. Capabilities do not belong in URLs or logs. Requests and replies have size limits, deadlines, disconnect handling, and bounded concurrency.

Desktop remembered AI credentials use Electron's OS-protected storage in the main process. The renderer receives credential references and provider responses, not a method for retrieving saved secrets. Plaintext legacy desktop keys are removed only after protected storage and readback succeed. When protected storage is unavailable, new credentials remain session-only. Browser credentials are session-only by default. Project packages and backups exclude credentials and operational ownership metadata.

## Limits and qualification

Source ZIP/DOCX import retains a 150 MiB actual expanded-data limit. Workspace archives have a separate 32 GiB expanded-data ceiling, a 100,000-entry ceiling, a 16 MiB manifest limit, and a 4 MiB chunk target. A structural record after asset separation is limited to 64 MiB. Individual reconstructed source assets retain the 150 MiB document limit. Available storage must also accommodate incoming staging and rollback protection.

These limits bound processing; they are not a promise that every device can import an archive at the maximum size. See [implementation and qualification status](reliability-implementation-status.md) for measured evidence and checks still required before release. No software can guarantee recovery after every possible hardware failure or deletion of all independent copies.
