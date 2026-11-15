import { decodePack, packRequirement, validateRequirement } from "./pack-format.js";
import { assertRecordAllowed } from "./catalog-policy.js";

const NAME = "loopcat-exchange-v1";
const MAX_ACTIVE = 128;
let localWrites = Promise.resolve();
// Serialize the short interval between staging a new local binding and the
// version-checked write to the separate project database. Web Locks cover tabs.
async function withBindingWrite(action) {
  if (globalThis.navigator?.locks?.request) {
    let entered = false;
    try {
      return await navigator.locks.request(NAME + ":bindings", () => {
        entered = true;
        return action();
      });
    } catch (error) {
      // Some direct-file origins deny lock acquisition as well as IndexedDB.
      // Never retry a mutation that actually entered the lock.
      if (entered || !["SecurityError", "NotAllowedError"].includes(error.name)) throw error;
    }
  }
  const run = localWrites.then(action);
  localWrites = run.then(
    () => {},
    () => {}
  );
  return run;
}
function descriptor(record) {
  const { entries, ...pack } = record.pack;
  return {
    id: record.id,
    version: record.version,
    digest: record.digest,
    pack,
    entryCount: entries.length,
    size: record.blob.size,
    ...(record.catalogOrigin ? { catalogOrigin: record.catalogOrigin } : {})
  };
}
function request(r) {
  if (r instanceof Promise) return r;
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
// This adapter is reachable only when a direct-file browser refuses a real
// IndexedDB write. It shares the normal transaction code and cannot resurrect
// durable grants or publish a misleading "saved to device" claim.
function volatileTransactions() {
  const data = new Map(["packs", "projects", "drafts", "descriptors"].map((k) => [k, new Map()]));
  let tail = Promise.resolve();
  const rowKey = (s, v) => (s === "projects" ? v.projectId : s === "drafts" ? v.key : [v.id, v.version]);
  return (names, mode, fn) => {
    const run = tail.then(async () => {
      const next = new Map(names.map((n) => [n, new Map(data.get(n))]));
      const store = (name) => {
        const rows = next.get(name);
        const write = (v, addOnly) => {
          if (mode === "readonly") throw Error("Read-only pack transaction.");
          const k = rowKey(name, v),
            encoded = JSON.stringify(k);
          if (addOnly && rows.has(encoded)) throw Error("Duplicate pack record.");
          rows.set(encoded, structuredClone(v));
          return Promise.resolve(k);
        };
        return {
          get: (k) => Promise.resolve(structuredClone(rows.get(JSON.stringify(k)))),
          getKey: (k) => Promise.resolve(rows.has(JSON.stringify(k)) ? k : undefined),
          getAll: () => Promise.resolve(structuredClone([...rows.values()])),
          getAllKeys: () => Promise.resolve([...rows.keys()].map((s) => JSON.parse(s))),
          count: () => Promise.resolve(rows.size),
          add: (v) => write(v, true),
          put: (v) => write(v, false),
          delete: (k) => {
            if (mode === "readonly") throw Error("Read-only pack transaction.");
            rows.delete(JSON.stringify(k));
            return Promise.resolve();
          }
        };
      };
      const result = await fn(store);
      if (mode !== "readonly") for (const [n, v] of next) data.set(n, v);
      return result;
    });
    tail = run.catch(() => {});
    return run;
  };
}
function boundedKey(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 192) throw new Error("Invalid Exchange key.");
  return value;
}
function empty(projectId) {
  return { projectId, generation: 0, bindings: [] };
}
function samePin(a, b) {
  return a.id === b.id && a.version === b.version && a.digest === b.digest;
}
function next(state) {
  return { ...state, generation: state.generation + 1 };
}
function bind(state, record, required = undefined, source = "", priority = undefined) {
  const previous = state.bindings.find((b) => b.pin.id === record.id)?.pin;
  const pin = validateRequirement({
    ...packRequirement(record.pack, record.digest, required ?? previous?.required ?? false),
    priority: priority ?? previous?.priority ?? 0
  });
  state.bindings = [...state.bindings.filter((e) => e.pin.id !== pin.id), { pin, enabled: true, source }];
  if (state.bindings.length > MAX_ACTIVE) throw new Error("A project may reference at most 128 packs.");
}
export function createPackRepository(options = {}) {
  const fileMode = (options.protocol ?? globalThis.location?.protocol) === "file:";
  let volatile;
  let connection, opening;
  const listeners = new Set();
  const signals = new Map();
  let channel;
  function notify(event, local = true) {
    if (["enable", "disable", "uninstall", "clear", "kit", "forget", "requirements"].includes(event.type)) {
      for (const [projectId, controller] of signals) {
        if (event.projectId && event.projectId !== projectId) continue;
        controller.abort();
        signals.delete(projectId);
      }
    }
    if (local) channel?.postMessage(event);
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        /* Committed data is independent of UI subscriber errors. */
      }
    }
  }
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(NAME);
      channel.onmessage = ({ data }) => {
        if (data && typeof data.type === "string") notify(data, false);
      };
    } catch {
      /* Durable snapshot generations remain authoritative. */
    }
  }
  function signal(projectId) {
    boundedKey(projectId);
    if (!signals.has(projectId)) signals.set(projectId, new AbortController());
    return signals.get(projectId).signal;
  }
  function open() {
    if (connection) return Promise.resolve(connection);
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const factory = Object.hasOwn(options, "indexedDB") ? options.indexedDB : globalThis.indexedDB;
        if (!factory) {
          reject(new Error("Local Exchange storage is unavailable."));
          return;
        }
        const r = factory.open(NAME, 2);
        r.onupgradeneeded = (ev) => {
          if (ev.oldVersion < 1) {
            r.result.createObjectStore("packs", { keyPath: ["id", "version"] });
            r.result.createObjectStore("projects", { keyPath: "projectId" });
            r.result.createObjectStore("drafts", { keyPath: "key" });
          }
          const descriptors = r.result.createObjectStore("descriptors", { keyPath: ["id", "version"] });
          if (ev.oldVersion === 1) {
            const scan = r.transaction.objectStore("packs").openCursor();
            scan.onsuccess = () => {
              const cursor = scan.result;
              if (cursor) {
                descriptors.put(descriptor(cursor.value));
                cursor.continue();
              }
            };
          }
        };
        r.onsuccess = () => {
          const db = r.result;
          db.onversionchange = () => {
            connection?.close();
            connection = null;
            opening = null;
          };
          if (!fileMode) {
            connection = db;
            resolve(db);
            return;
          }
          try {
            const probe = db.transaction("drafts", "readwrite"),
              store = probe.objectStore("drafts");
            const key = "exchange-probe:" + crypto.randomUUID();
            store.add({ key });
            store.delete(key);
            probe.oncomplete = () => {
              connection = db;
              resolve(db);
            };
            probe.onabort = () => {
              db.close();
              reject(probe.error || new Error("Direct-file storage probe failed."));
            };
          } catch (e) {
            db.close();
            reject(e);
          }
        };
        r.onerror = () => reject(r.error);
      }).catch((e) => {
        if (fileMode) {
          channel?.close();
          channel = null;
          volatile = volatileTransactions();
          return null;
        }
        opening = null;
        throw e;
      });
    }
    return opening;
  }
  async function tx(stores, mode, action) {
    const db = await open();
    if (volatile) return volatile(stores, mode, action);
    const transaction = db.transaction(stores, mode);
    const done = new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(undefined);
      transaction.onabort = () => reject(transaction.error || new Error("Exchange transaction aborted."));
      transaction.onerror = () => {};
    });
    done.catch(() => {});
    try {
      const result = await action((name) => transaction.objectStore(name));
      await done;
      return result;
    } catch (e) {
      try {
        transaction.abort();
      } catch {
        /* Already settled. */
      }
      await done.catch(() => {});
      throw e;
    }
  }
  function read(name, key) {
    return tx([name], "readonly", (s) => request(s(name).get(key)));
  }
  function list() {
    return tx(["packs"], "readonly", (s) => request(s("packs").getAll()));
  }
  function describe() {
    return tx(["descriptors"], "readonly", (s) => request(s("descriptors").getAll()));
  }
  function getPack(id, version) {
    return read("packs", [boundedKey(id), boundedKey(version)]);
  }
  async function install(blob, catalogOrigin = undefined) {
    const decoded = await decodePack(blob);
    const { pack, digest } = decoded;
    if (
      catalogOrigin !== undefined &&
      (!catalogOrigin ||
        typeof catalogOrigin.catalogId !== "string" ||
        catalogOrigin.catalogId.length > 96 ||
        !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(catalogOrigin.catalogId) ||
        typeof catalogOrigin.fingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(catalogOrigin.fingerprint) ||
        Object.keys(catalogOrigin).some((k) => !["catalogId", "fingerprint"].includes(k)))
    )
      throw new Error("Invalid catalog provenance.");
    const record = {
      id: pack.id,
      version: pack.version,
      digest,
      pack,
      blob,
      ...(catalogOrigin ? { catalogOrigin: { ...catalogOrigin } } : {})
    };
    assertRecordAllowed(record);
    let adopted = false;
    const result = await tx(["packs", "descriptors"], "readwrite", async (s) => {
      const store = s("packs");
      const existing = await request(store.get([pack.id, pack.version]));
      if (existing && existing.digest !== digest)
        throw new Error("Different bytes already exist for this pack ID and version.");
      if (existing) {
        if (!catalogOrigin) return existing; // File imports never clear an existing trusted origin.
        if (existing.catalogOrigin) {
          if (
            existing.catalogOrigin.catalogId !== catalogOrigin.catalogId ||
            existing.catalogOrigin.fingerprint !== catalogOrigin.fingerprint
          )
            throw new Error("This installed version belongs to another catalog. Its publisher cannot be replaced.");
          return existing;
        }
        // Adopt withdrawal policy only when the user explicitly installs these
        // exact bytes through the verified catalog. Merely browsing a catalog
        // must not let a private signer claim arbitrary independent files.
        await request(store.put(record));
        await request(s("descriptors").put(descriptor(record)));
        adopted = true;
        return record;
      }
      if ((await request(store.count())) >= 80) throw new Error("Installed pack limit reached.");
      await request(store.add(record));
      await request(s("descriptors").add(descriptor(record)));
      return record;
    });
    notify({ type: adopted ? "adopt" : "install", id: pack.id, version: pack.version });
    return result;
  }
  async function resolveRecord(store, id, version) {
    boundedKey(id);
    if (version) {
      const record = await request(store.get([id, boundedKey(version)]));
      if (record) return record;
    } else {
      const all = (await request(store.getAllKeys())).filter((key) => key[0] === id);
      if (all.length === 1) return request(store.get(all[0]));
      if (all.length > 1) throw new Error("Choose an exact installed pack version.");
    }
    throw new Error("Required pack version is not installed.");
  }
  async function change(projectId, type, action) {
    boundedKey(projectId);
    const value = await tx(["packs", "projects"], "readwrite", async (s) => {
      const projects = s("projects");
      const previous = (await request(projects.get(projectId))) || empty(projectId);
      const state = next(previous);
      const result = await action(state, s("packs"));
      await request(projects.put(state));
      return result;
    });
    notify({ type, projectId, ...value });
    return value;
  }
  async function activateKit(state, store, kit, selectedIds) {
    if (kit.pack.kind !== "client") throw new Error("A client kit is required.");
    const available = kit.pack.entries;
    if (selectedIds && (!Array.isArray(selectedIds) || selectedIds.some((id) => !available.some((p) => p.id === id))))
      throw new Error("Unknown client kit selection.");
    const pins = [...available].sort((a, b) => a.priority - b.priority);
    for (const pin of pins) {
      if (selectedIds && !selectedIds.includes(pin.id)) {
        if (pin.required) throw new Error("A required kit component was omitted.");
        continue;
      }
      const record = await resolveRecord(store, pin.id, pin.version);
      if (record.digest !== pin.digest || record.pack.kind === "client")
        throw new Error("Kit pin does not match an installed, non-kit artifact.");
      assertRecordAllowed(record);
      const previous = state.bindings.find((b) => b.pin.id === record.id)?.pin;
      bind(state, record, pin.required || previous?.required || false, kit.id, pin.priority);
    }
    bind(state, kit);
  }
  async function applyKit(projectId, id, version, selectedIds = undefined) {
    await change(projectId, "kit", async (state, store) => {
      const kit = await resolveRecord(store, id, version);
      assertRecordAllowed(kit);
      await activateKit(state, store, kit, selectedIds);
      return { id, version: kit.version };
    });
    return snapshot(projectId);
  }
  function enable(projectId, id, version = undefined, settings = {}) {
    return change(projectId, "enable", async (state, store) => {
      const record = await resolveRecord(store, id, version);
      assertRecordAllowed(record);
      bind(state, record, settings.required, "", settings.priority);
      return { id, version: record.version };
    });
  }
  function disable(projectId, id, expectedDigest = undefined) {
    return change(projectId, "disable", (state) => {
      state.bindings = state.bindings.flatMap((b) =>
        b.pin.id !== id || (expectedDigest && b.pin.digest !== expectedDigest)
          ? [b]
          : b.pin.required
            ? [{ ...b, enabled: false }]
            : []
      );
      return { id };
    });
  }
  // A portable project contains requirements only. Copy an enabled grant solely
  // from the exact previous local epoch, never from another project or installed pack.
  function publishBinding(previousId, targetId, pins, operation, publish) {
    boundedKey(targetId);
    if (previousId === targetId || !Array.isArray(pins) || pins.length > MAX_ACTIVE)
      throw new Error("Invalid project pack change.");
    return withBindingWrite(async () => {
      const staged = await tx(["projects", "packs"], "readwrite", async (s) => {
        const projects = s("projects"),
          packs = s("packs");
        const previous = previousId ? await request(projects.get(boundedKey(previousId))) : null;
        const state = { ...empty(targetId), generation: 1 };
        state.bindings = pins.map((value) => {
          const pin = validateRequirement(value);
          const local = previous?.bindings.find((b) => samePin(b.pin, pin) && b.pin.kind === pin.kind);
          return { pin, enabled: local?.enabled === true, source: local?.source || "" };
        });
        if (new Set(state.bindings.map((b) => b.pin.id)).size !== state.bindings.length)
          throw new Error("Duplicate project pack requirement.");
        if (operation.type === "enable" || operation.type === "kit") {
          const record = await resolveRecord(packs, operation.id, operation.version);
          if (record.digest !== operation.digest) throw new Error("Installed pack changed.");
          assertRecordAllowed(record);
          if (operation.type === "kit") {
            if (!state.bindings.some((b) => b.enabled && samePin(b.pin, record)))
              throw new Error("Enable this kit for the open project first.");
            await activateKit(state, packs, record, operation.selectedIds);
          } else bind(state, record, operation.required, "", operation.priority);
        } else {
          const found = state.bindings.find((b) => samePin(b.pin, operation));
          if (!found) throw new Error("Project pack changed.");
          if (operation.type === "disable") found.enabled = false;
          else if (operation.type === "forget") state.bindings = state.bindings.filter((b) => b !== found);
          else throw new Error("Unknown project pack change.");
        }
        // A collision must abort rather than replacing a grant belonging to another scope.
        await request(projects.add(state));
        return { pins: state.bindings.map((b) => b.pin), previousGeneration: previous?.generation || 0 };
      });
      // Each cleanup is conditional on the same epoch and its exact generation.
      // A crash before publication leaves only an unreachable random local key.
      const retire = async (key, generation) => {
        if (!key) return;
        await tx(["projects"], "readwrite", async (s) => {
          const store = s("projects"),
            state = await request(store.get(key));
          if (state?.generation === generation) await request(store.delete(key));
        });
        notify({ type: "clear", projectId: key });
      };
      let committed;
      try {
        if (previousId && !(await isCurrent(previousId, staged.previousGeneration)))
          throw new Error("Project pack changed.");
        committed = await publish(staged.pins);
      } catch (error) {
        await retire(targetId, 1).catch(() => {});
        throw error;
      }
      // The core project now points to the new epoch. Cleanup failure must never
      // undo a committed switch or make a caller retry an already completed save.
      await retire(previousId, staged.previousGeneration).catch(() => {});
      return committed;
    });
  }
  async function requirements(projectId) {
    const p = await read("projects", boundedKey(projectId));
    return (p?.bindings || []).map((b) => b.pin);
  }
  function snapshot(projectId, kind = undefined) {
    boundedKey(projectId);
    const sig = signal(projectId);
    return tx(["projects", "packs"], "readonly", async (s) => {
      const state = (await request(s("projects").get(projectId))) || empty(projectId);
      const enabled = state.bindings.filter((b) => b.enabled && (!kind || b.pin.kind === kind));
      const matches = await Promise.all(
        enabled.map(async (b) => {
          const { pin } = b;
          const r = await request(s("packs").get([pin.id, pin.version]));
          if (r && !isUsable(r)) return null;
          return r && samePin(r, pin) ? { ...r, required: pin.required } : null;
        })
      );
      return {
        records: matches.filter(Boolean),
        generation: state.generation,
        signal: sig,
        requirements: state.bindings.map((b) => b.pin)
      };
    });
  }
  function isUsable(record) {
    try {
      assertRecordAllowed(record);
      return true;
    } catch {
      return false;
    }
  }
  async function active(projectId) {
    return (await snapshot(projectId)).records;
  }
  async function isCurrent(projectId, generation) {
    return ((await read("projects", boundedKey(projectId)))?.generation || 0) === generation;
  }
  function affectedProjects(id, version = undefined) {
    return tx(["projects"], "readonly", async (s) =>
      (await request(s("projects").getAll()))
        .filter((p) => p.bindings.some((b) => b.pin.id === id && (!version || b.pin.version === version)))
        .map((p) => p.projectId)
    );
  }
  async function uninstall(id, version = undefined) {
    boundedKey(id);
    const affected = await tx(["packs", "projects", "descriptors"], "readwrite", async (s) => {
      const store = s("packs"),
        projects = s("projects");
      for (const key of await request(store.getAllKeys()))
        if (key[0] === id && (!version || key[1] === version)) {
          await request(store.delete(key));
          await request(s("descriptors").delete(key));
        }
      const ids = [];
      for (const state of await request(projects.getAll())) {
        const match = (b) => b.pin.id === id && (!version || b.pin.version === version);
        if (!state.bindings.some(match)) continue;
        state.bindings = state.bindings.flatMap((b) =>
          !match(b) ? [b] : b.pin.required ? [{ ...b, enabled: false }] : []
        );
        await request(projects.put(next(state)));
        ids.push(state.projectId);
      }
      return ids;
    });
    notify({ type: "uninstall", id, version, projects: affected });
    return affected;
  }
  async function clearActivations(projectId = undefined) {
    await tx(["projects"], "readwrite", async (s) => {
      const store = s("projects");
      for (const state of await request(store.getAll()))
        if (!projectId || state.projectId === projectId) await request(store.put({ ...next(state), bindings: [] }));
    });
    notify({ type: "clear", projectId });
  }
  function setRequirements(projectId, pins) {
    if (!Array.isArray(pins) || pins.length > MAX_ACTIVE) throw new Error("Too many project pack requirements.");
    const reqs = pins.map(validateRequirement);
    if (new Set(reqs.map((p) => p.id)).size !== reqs.length) throw new Error("Duplicate project pack requirement.");
    return change(projectId, "requirements", (state) => {
      state.bindings = reqs.map((pin) => ({ pin, enabled: false, source: "" }));
      return {};
    });
  }
  function forgetRequirement(projectId, id) {
    return change(projectId, "forget", (state) => {
      state.bindings = state.bindings.filter((b) => b.pin.id !== id);
      return { id };
    });
  }
  async function saveDraft(key, input) {
    boundedKey(key);
    const encoded = JSON.stringify(input);
    if (!encoded || encoded.length > 1024 * 1024) throw new Error("Draft exceeds its size limit.");
    const record = { key, input: JSON.parse(encoded), updatedAt: new Date().toISOString() };
    await tx(["drafts"], "readwrite", async (s) => {
      const store = s("drafts");
      if (!(await request(store.getKey(key))) && (await request(store.count())) >= 32)
        throw new Error("Draft limit reached.");
      await request(store.put(record));
    });
    return record;
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function exportPack(id, version) {
    return tx(["packs"], "readonly", async (s) => (await resolveRecord(s("packs"), id, version)).blob);
  }
  function close() {
    channel?.close();
    for (const c of signals.values()) c.abort();
    signals.clear();
    listeners.clear();
    connection?.close();
    connection = null;
    opening = null;
    volatile = null;
  }
  return Object.freeze({
    notifyWithdrawal: (r) =>
      notify({ type: "withdrawal", id: r.id, version: r.version, digest: r.digest, catalogOrigin: r.catalogOrigin }),
    install,
    list,
    describe,
    getPack,
    storageMode: async () => {
      await open();
      return volatile ? "session" : "device";
    },
    publishBinding,
    enable: (...args) => withBindingWrite(() => enable(...args)),
    disable: (...args) => withBindingWrite(() => disable(...args)),
    active,
    snapshot,
    signal,
    isCurrent,
    isUsable,
    affectedProjects,
    uninstall: (...args) => withBindingWrite(() => uninstall(...args)),
    exportPack,
    clearActivations: (...args) => withBindingWrite(() => clearActivations(...args)),
    requirements,
    setRequirements: (...args) => withBindingWrite(() => setRequirements(...args)),
    forgetRequirement: (...args) => withBindingWrite(() => forgetRequirement(...args)),
    applyKit: (...args) => withBindingWrite(() => applyKit(...args)),
    onChange: subscribe,
    subscribe,
    saveDraft,
    getDraft: async (key) => {
      const record = await read("drafts", boundedKey(key));
      return record ? { ...record, value: record.input } : undefined;
    },
    listDrafts: () => tx(["drafts"], "readonly", (s) => request(s("drafts").getAll())),
    deleteDraft: (key) => tx(["drafts"], "readwrite", (s) => request(s("drafts").delete(boundedKey(key)))),
    close
  });
}
