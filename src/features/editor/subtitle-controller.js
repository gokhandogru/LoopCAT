import {
  SUBTITLE_FORMATS,
  subtitleCues,
  formatSubtitleTime,
  parseSubtitleTime,
  validateSubtitleCues,
  subtitleFindings,
  appendSubtitleText,
  DEFAULT_SUBTITLE_QA
} from "./subtitle-model.js";

export function installSubtitleController({
  session,
  application,
  host,
  bus,
  flush,
  save,
  retry,
  saveStructure,
  render,
  invalidate,
  detectTags,
  saveProject,
  dirty,
  openDocument,
  translate = (text) => text
}) {
  const panel = document.createElement("details");
  panel.className = "subtitle-panel";
  panel.open = true;
  panel.hidden = true;
  const summary = document.createElement("summary");
  summary.textContent = translate("Video & timing");
  const body = document.createElement("div");
  body.className = "subtitle-body";
  panel.append(summary, body);
  host.before(panel);
  const media = document.createElement("div");
  media.className = "subtitle-media";
  const picture = document.createElement("div");
  picture.className = "subtitle-picture";
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "metadata";
  const captionTrack = document.createElement("track");
  captionTrack.kind = "captions";
  captionTrack.label = translate("Target");
  video.append(captionTrack);
  captionTrack.track.mode = "hidden";
  const captions = document.createElement("div");
  captions.className = "subtitle-captions";
  captions.dir = "auto";
  picture.append(video, captions);
  const transport = document.createElement("div");
  transport.className = "subtitle-controls";
  media.append(picture, transport);
  const controls = document.createElement("div");
  controls.className = "subtitle-controls";
  const timing = document.createElement("div");
  timing.className = "subtitle-timing";
  const feedback = document.createElement("p");
  feedback.setAttribute("role", "status");
  const findings = document.createElement("p");
  const qa = document.createElement("div");
  qa.className = "subtitle-qa";
  const inspector = document.getElementById("inspectorQualityPanel");
  inspector?.append(qa);
  body.append(media, timing);
  timing.append(controls, findings, feedback);
  const more = document.createElement("details");
  const moreTitle = document.createElement("summary");
  moreTitle.textContent = translate("Cue editing tools");
  more.append(moreTitle);
  timing.append(more);
  const moreControls = document.createElement("div");
  moreControls.className = "subtitle-controls";
  more.append(moreControls);
  let documentId = "";
  let activeId = "";
  let objectUrl = "";
  let frame = 0;
  let cueIndex = 0;
  let playEnd = null;
  let locked = false;
  let busy = false;
  let lastCaret = 0;
  let drag = null;
  let worker = null;
  let mediaGeneration = 0;
  let peaks = null;
  let peakRate = 100;
  let interval = null;
  let origin = 0;
  let frameRequest = 0;
  const still = document.createElement("canvas");
  still.className = "subtitle-still";
  still.hidden = true;
  picture.insertBefore(still, captions);
  const waveform = document.createElement("canvas");
  waveform.width = 800;
  waveform.height = 140;
  waveform.className = "subtitle-waveform";
  waveform.setAttribute("aria-label", translate("Audio waveform; use timestamp fields to adjust cue boundaries"));
  timing.insertBefore(waveform, findings);
  const report = (error) => {
    feedback.textContent = translate(error?.message || String(error));
  };
  const action = (handler) => () => Promise.resolve().then(handler).catch(report);
  function button(label, handler, parent = /** @type {HTMLElement} */ (controls)) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = translate(label);
    element.dataset.subtitleLabel = label;
    element.addEventListener("click", action(handler));
    const advanced = [
      "Split at playhead",
      "Merge next cue",
      "Set text boundary",
      "Previous frame",
      "Next frame",
      "Keep local timing",
      "Use incoming timing"
    ];
    (parent === controls && advanced.includes(label) ? moreControls : parent).append(element);
    return element;
  }
  function field(label, value, parent = /** @type {HTMLElement} */ (controls)) {
    const wrapper = document.createElement("label");
    const caption = document.createElement("span");
    caption.dataset.subtitleLabel = label;
    caption.textContent = translate(label);
    wrapper.append(caption);
    const input = document.createElement("input");
    input.value = value;
    wrapper.append(input);
    parent.append(wrapper);
    return input;
  }
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "video/mp4,video/webm,.mp4,.webm";
  file.hidden = true;
  media.append(file);
  button("Attach / change video", () => file.click(), transport);
  button("Play / pause", () => (video.paused ? video.play() : video.pause()), transport);
  const loop = field("Loop cue", "", transport);
  loop.type = "checkbox";
  button(
    "Play cue",
    async () => {
      const cue = currentCues()[cueIndex];
      if (!cue || !objectUrl) return;
      video.currentTime = cue.startMs / 1000;
      playEnd = cue.endMs;
      await video.play();
    },
    transport
  );
  const speed = field("Speed", "1", transport);
  speed.type = "number";
  speed.min = "0.25";
  speed.max = "2";
  speed.step = "0.25";
  speed.addEventListener("change", () => {
    video.playbackRate = Math.min(2, Math.max(0.25, Number(speed.value) || 1));
  });
  button("Fullscreen", () => picture.requestFullscreen(), transport);
  const position = field("Position", "00:00:00.000", transport);
  position.addEventListener(
    "change",
    action(() => {
      video.currentTime = parseSubtitleTime(position.value) / 1000;
      preview();
    })
  );
  const start = field("Start", "00:00:00.000");
  const end = field("End", "00:00:00.000");
  const zoom = field("Visible seconds", "20");
  zoom.type = "number";
  zoom.min = "2";
  zoom.max = "300";
  zoom.addEventListener("change", () => drawWaveform());
  const snap = field("Snap to frames", "");
  snap.type = "checkbox";
  snap.disabled = true;
  function snapTime(time) {
    return Math.round(
      snap.checked && interval ? (origin + Math.round((time / 1000 - origin) / interval) * interval) * 1000 : time
    );
  }
  const frameButtons = [-1, 1].map((direction) =>
    button(direction < 0 ? "Previous frame" : "Next frame", () => {
      if (!interval || !worker) return;
      video.pause();
      const time = Math.max(0, origin + (Math.round((video.currentTime - origin) / interval) + direction) * interval);
      video.currentTime = time;
      worker.postMessage({ type: "frame", time: time + interval / 10, request: ++frameRequest });
    })
  );
  frameButtons.forEach((element) => {
    element.disabled = true;
  });
  const lock = field("Lock timing", "");
  lock.type = "checkbox";
  lock.addEventListener(
    "change",
    action(async () => {
      const project = session.getProject();
      const updated = await saveProject({
        ...project,
        subtitleTimingLocks: { ...project.subtitleTimingLocks, [documentId]: lock.checked }
      });
      session.replaceProject(updated);
      dirty();
      refresh();
    })
  );
  function segment() {
    return session.getSegments().find((row) => row.id === activeId);
  }
  function structure() {
    return session.getProject()?.localizationStructures?.[documentId];
  }
  function currentCues() {
    const row = segment();
    return row ? subtitleCues(row, structure()) : [];
  }
  async function change(label, mutation) {
    if (busy || locked) return;
    const row = segment();
    if (!row) return;
    const selectedCueIndex = cueIndex;
    busy = true;
    try {
      await flush(row.projectId);
      if (activeId !== row.id || cueIndex !== selectedCueIndex)
        throw new Error("The selected subtitle changed. Try the edit again.");
      const before = structuredClone(row.subtitle || null);
      const next = structuredClone(
        row.subtitle || { version: 1, originals: [{ source: row.source, structure: row.structure }] }
      );
      next.cues = currentCues().map(({ startMs, endMs, from, to }) => ({ startMs, endMs, from, to }));
      mutation(next, row);
      validateSubtitleCues(next.cues, String(row.target || "").length);
      delete next.timing;
      const id = row.id;
      const projectId = row.projectId;
      async function apply(value) {
        const current = session.getSegments().find((item) => item.id === id && item.projectId === projectId);
        if (!current) throw new Error("Open the subtitle project before changing its timing.");
        await flush(projectId);
        const updated = { ...current, subtitle: structuredClone(value), revision: Number(current.revision || 0) + 1 };
        if (!value) delete updated.subtitle;
        const oldSubtitle = current.subtitle;
        current.subtitle = updated.subtitle;
        if (!value) delete current.subtitle;
        current.revision = updated.revision;
        try {
          await save(updated);
          current.storageVersion = updated.storageVersion;
        } catch (error) {
          current.subtitle = oldSubtitle;
          if (!oldSubtitle) delete current.subtitle;
          retry(current);
          refresh();
          throw error;
        }
        dirty();
        refresh();
        return { activeSegmentId: id };
      }
      await bus.execute({
        id: "subtitle-edit",
        label,
        projectId,
        scope: "segment",
        affectedIds: [id],
        execute: () => apply(next),
        undo: () => apply(before)
      });
      feedback.textContent = translate("Saved");
    } finally {
      busy = false;
    }
  }
  const applyTimes = action(() =>
    change("Adjust subtitle timing", (record) => {
      record.cues[cueIndex].startMs = snapTime(parseSubtitleTime(start.value));
      record.cues[cueIndex].endMs = snapTime(parseSubtitleTime(end.value));
    })
  );
  start.addEventListener("change", applyTimes);
  end.addEventListener("change", applyTimes);
  button("Set start", () =>
    change("Set subtitle start", (record) => {
      record.cues[cueIndex].startMs = snapTime(video.currentTime * 1000);
    })
  );
  button("Set end", () =>
    change("Set subtitle end", (record) => {
      record.cues[cueIndex].endMs = snapTime(video.currentTime * 1000);
    })
  );
  for (const delta of [-100, 100])
    button(`${delta > 0 ? "+" : ""}${delta} ms`, () =>
      change("Move subtitle", (record) => {
        record.cues[cueIndex].startMs += delta;
        record.cues[cueIndex].endMs += delta;
      })
    );
  button("Previous cue", () => {
    cueIndex = Math.max(0, cueIndex - 1);
    if (objectUrl) video.currentTime = currentCues()[cueIndex].startMs / 1000;
    refresh();
  });
  button("Next cue", () => {
    cueIndex = Math.min(currentCues().length - 1, cueIndex + 1);
    if (objectUrl) video.currentTime = currentCues()[cueIndex].startMs / 1000;
    refresh();
  });
  button("Split at playhead", () => {
    const boundary = lastCaret;
    const time = Math.round(video.currentTime * 1000);
    return change("Split subtitle", (record) => {
      const cue = record.cues[cueIndex];
      if (boundary <= cue.from || boundary >= cue.to || time <= cue.startMs || time >= cue.endMs)
        throw new Error("Place the target caret and playhead inside the cue before splitting.");
      record.cues.splice(cueIndex, 1, { ...cue, to: boundary, endMs: time }, { ...cue, from: boundary, startMs: time });
    });
  });
  button("Merge next cue", () => {
    if (cueIndex === currentCues().length - 1) return mergeNextGroup();
    return change("Merge subtitle", (record) => {
      const cue = record.cues[cueIndex];
      const next = record.cues[cueIndex + 1];
      if (!next) throw new Error("Select a cue with a following cue in this source group.");
      record.cues.splice(cueIndex, 2, { ...cue, to: next.to, endMs: next.endMs });
    });
  });
  async function mergeNextGroup() {
    if (locked || busy) return;
    const row = segment();
    const rows = session.getSegments().filter((item) => item.documentId === documentId);
    const next = rows[rows.indexOf(row) + 1];
    if (!next) throw new Error("There is no following subtitle cue.");
    busy = true;
    try {
      await flush(row.projectId);
      const before = [structuredClone(row), structuredClone(next)];
      const joined = structuredClone(row);
      const left = String(row.target || "");
      const right = String(next.target || "");
      const offset = left.length + 1;
      const cues = currentCues().map(({ startMs, endMs, from, to }) => ({ startMs, endMs, from, to }));
      const following = subtitleCues(next, structure()).map(({ startMs, endMs, from, to }) => ({
        startMs,
        endMs,
        from: from + offset,
        to: to + offset
      }));
      cues.at(-1).to = following[0].to;
      cues.at(-1).endMs = following[0].endMs;
      cues.push(...following.slice(1));
      joined.source = `${row.source}\n${next.source}`;
      joined.tags = detectTags(joined.source);
      joined.target = `${left}\n${right}`;
      joined.status = "draft";
      joined.reviewState = "needs-review";
      const originals = (item) => item.subtitle?.originals || [{ source: item.source, structure: item.structure }];
      joined.subtitle = {
        version: 1,
        cues,
        originals: [...originals(row), ...originals(next)],
        removedBlocks: [
          ...(row.subtitle?.removedBlocks || []),
          next.structure?.blockIndex,
          ...(next.subtitle?.removedBlocks || [])
        ].filter(Number.isInteger)
      };
      validateSubtitleCues(cues, joined.target.length);
      async function apply(records, deleted) {
        await flush(row.projectId);
        const current = session.getSegments();
        const writes = records.map((item) => {
          const latest = current.find((candidate) => candidate.id === item.id);
          return {
            ...structuredClone(item),
            storageVersion: latest?.storageVersion,
            revision: Number(latest?.revision || item.revision || 0) + 1
          };
        });
        const saved = await saveStructure(writes, deleted);
        const ids = new Set([...before.map((item) => item.id), ...deleted]);
        invalidate();
        session.replaceSegments(
          [...current.filter((item) => !ids.has(item.id)), ...saved].sort((a, b) => a.index - b.index)
        );
        dirty();
        render();
        refresh();
        return { activeSegmentId: row.id };
      }
      await bus.execute({
        id: "merge-subtitle-groups",
        label: "Merge subtitle groups",
        projectId: row.projectId,
        scope: "document",
        affectedIds: before.map((item) => item.id),
        execute: () => apply([joined], [next.id]),
        undo: () => apply(before, [])
      });
    } finally {
      busy = false;
    }
  }
  button("Set text boundary", () =>
    change("Set subtitle text boundary", (record) => {
      const cue = record.cues[cueIndex];
      const next = record.cues[cueIndex + 1];
      if (!next || lastCaret <= cue.from || lastCaret >= next.to)
        throw new Error("Place the target caret between the two cue texts.");
      cue.to = lastCaret;
      next.from = lastCaret;
      record.needsBoundaries = false;
    })
  );
  const keepTiming = button("Keep local timing", () =>
    change("Resolve subtitle timing", (record) => {
      delete record.sourceTimingConflict;
    })
  );
  const incomingTiming = button("Use incoming timing", () =>
    change("Resolve subtitle timing", (record, row) => {
      if (!record.sourceTimingConflict) return;
      record.cues = [{ ...record.sourceTimingConflict, from: 0, to: row.target.length }];
      delete record.sourceTimingConflict;
      delete record.needsBoundaries;
    })
  );
  const resetBoundaries = button(
    "Reset to one cue",
    () =>
      change("Reset subtitle boundaries", (record, row) => {
        record.cues = [
          { startMs: record.cues[0].startMs, endMs: record.cues.at(-1).endMs, from: 0, to: row.target.length }
        ];
        delete record.needsBoundaries;
      }),
    moreControls
  );
  const settings = document.createElement("details");
  const settingsTitle = document.createElement("summary");
  settingsTitle.textContent = translate("General subtitle QA profile");
  settings.append(settingsTitle);
  timing.append(settings);
  const profileInputs = {};
  const overlapRule = field("Flag overlapping cues", "", settings);
  overlapRule.type = "checkbox";
  overlapRule.checked = true;
  for (const [key, label] of Object.entries({
    cps: "Characters per second",
    lineLength: "Characters per line",
    lines: "Maximum lines",
    minDuration: "Minimum seconds",
    maxDuration: "Maximum seconds",
    gap: "Minimum gap (seconds)"
  })) {
    const input = field(label, String(DEFAULT_SUBTITLE_QA[key]), settings);
    input.type = "number";
    input.min = "0";
    input.step = "any";
    profileInputs[key] = input;
  }
  button(
    "Save subtitle QA rules",
    async () => {
      const profile = { ...DEFAULT_SUBTITLE_QA, overlaps: overlapRule.checked };
      for (const [key, input] of Object.entries(profileInputs)) {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0) throw new Error("Enter valid subtitle QA limits.");
        profile[key] = value;
      }
      if (profile.minDuration > profile.maxDuration)
        throw new Error("Minimum duration must be below maximum duration.");
      const project = await saveProject({ ...session.getProject(), subtitleQa: profile });
      session.replaceProject(project);
      dirty();
      refresh();
    },
    settings
  );
  function release() {
    mediaGeneration++;
    worker?.terminate();
    worker = null;
    peaks = null;
    delete waveform.dataset.loaded;
    interval = null;
    still.hidden = true;
    frameButtons.forEach((element) => {
      element.disabled = true;
    });
    snap.disabled = true;
    snap.checked = false;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    playEnd = null;
    cancelAnimationFrame(frame);
    video.cancelVideoFrameCallback?.(frame);
  }
  file.addEventListener(
    "change",
    action(async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      release();
      const generation = mediaGeneration;
      objectUrl = URL.createObjectURL(selected);
      video.src = objectUrl;
      feedback.textContent = selected.name;
      file.value = "";
      const expectedDocument = documentId;
      const previous = session.getProject()?.subtitleMedia?.[documentId];
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await selected.slice(0, 1024 * 1024).arrayBuffer())),
        (byte) => byte.toString(16).padStart(2, "0")
      ).join("");
      if (documentId !== expectedDocument || generation !== mediaGeneration) return;
      if (previous && (previous.size !== selected.size || previous.digest !== digest))
        report("This video differs from the previously attached file. Check synchronization.");
      const project = session.getProject();
      const updated = await saveProject({
        ...project,
        subtitleMedia: { ...project.subtitleMedia, [documentId]: { name: selected.name, size: selected.size, digest } }
      });
      if (generation !== mediaGeneration || session.getProject()?.id !== project.id) return;
      session.replaceProject(updated);
      dirty();
      const url = "./subtitle-media-worker.js";
      const trusted = window.CatHan?.appRuntime?.safeHtml?.trustedScriptUrl?.(url) || url;
      worker = window.CatHan?.createFileWorker?.(url) || new Worker(trusted);
      worker.onmessage = ({ data }) => {
        if (data.type === "peaks") {
          waveform.dataset.loaded = "true";
          peaks = data.peaks;
          peakRate = data.rate;
          drawWaveform();
        }
        if (data.type === "frames") {
          interval = data.interval;
          origin = data.origin;
          snap.disabled = !interval;
          frameButtons.forEach((element) => {
            element.disabled = !interval;
          });
        }
        if (data.type === "notice") report(data.message);
        if (data.type === "frame") {
          try {
            if (data.request !== frameRequest || !video.paused) return;
            still.width = data.frame.displayWidth;
            still.height = data.frame.displayHeight;
            still.getContext("2d").drawImage(data.frame, 0, 0);
            still.hidden = false;
            position.value = formatSubtitleTime(data.timestamp * 1000);
          } finally {
            data.frame.close();
          }
        }
      };
      worker.onerror = () =>
        report("Waveform processing failed. Video playback and timestamp editing remain available.");
      worker.postMessage({ type: "open", file: selected });
    })
  );
  video.addEventListener("error", () =>
    report("This video cannot be played. Attach an MP4 with H.264/AAC or WebM with VP9/Opus.")
  );
  function preview(presentedSeconds = undefined) {
    if (panel.hidden) return;
    const time = (typeof presentedSeconds === "number" ? presentedSeconds : video.currentTime) * 1000;
    if (document.activeElement !== position) position.value = formatSubtitleTime(time);
    const cues = session
      .getSegments()
      .filter((row) => row.documentId === documentId)
      .flatMap((row) => subtitleCues(row, structure()));
    const visible = cues.filter((cue) => cue.startMs <= time && cue.endMs > time);
    captions.replaceChildren();
    for (const cue of visible) {
      const caption = document.createElement("div");
      caption.dir = "auto";
      appendSubtitleText(caption, cue.text);
      const row = session.getSegments().find((item) => item.id === cue.segmentId);
      const timingLine =
        row?.structure?.timing ||
        structure()?.blocks?.[row?.structure?.blockIndex]?.[row?.structure?.timingIndex || 0] ||
        "";
      const alignment = /\balign:(start|end|left|right|center)\b/.exec(timingLine)?.[1];
      if (alignment) caption.style.textAlign = alignment;
      const line = /\bline:(\d+(?:\.\d+)?)%/.exec(timingLine)?.[1];
      const position = /\bposition:(\d+(?:\.\d+)?)%/.exec(timingLine)?.[1];
      const size = /\bsize:(\d+(?:\.\d+)?)%/.exec(timingLine)?.[1];
      if (line) {
        caption.style.top = `${Math.min(100, Number(line))}%`;
        caption.style.bottom = "auto";
      }
      if (size) {
        caption.style.width = `${Math.min(100, Number(size))}%`;
        caption.style.right = "auto";
      }
      if (position) {
        caption.style.left = `${Math.min(100, Number(position))}%`;
        caption.style.right = "auto";
        caption.style.transform = "translateX(-50%)";
      }
      if (!line) caption.style.bottom = `${7 + visible.indexOf(cue) * 12}%`;
      captions.append(caption);
    }
    for (const row of host.querySelectorAll("[data-index]")) {
      const record = session.getSegments()[Number(row.dataset.index)];
      row.classList.toggle("subtitle-playing", !video.paused && visible.some((cue) => cue.segmentId === record?.id));
    }
    drawWaveform();
    if (playEnd !== null && time >= playEnd) {
      const cue = currentCues()[cueIndex];
      if (loop.checked && cue) video.currentTime = cue.startMs / 1000;
      else {
        video.pause();
        playEnd = null;
      }
    }
  }
  function tick(_now = undefined, metadata = undefined) {
    preview(metadata?.mediaTime);
    if (!video.paused)
      frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }
  video.addEventListener("play", () => {
    still.hidden = true;
    cancelAnimationFrame(frame);
    video.cancelVideoFrameCallback?.(frame);
    tick();
  });
  video.addEventListener("seeked", preview);
  video.addEventListener("timeupdate", preview);
  function waveformWindow() {
    const cue = currentCues()[cueIndex];
    const span = Math.min(300, Math.max(2, Number(zoom.value) || 20)) * 1000;
    return { start: Math.max(0, (cue?.startMs || 0) - span / 4), span };
  }
  function drawWaveform() {
    const context = waveform.getContext("2d");
    const range = waveformWindow();
    context.clearRect(0, 0, waveform.width, waveform.height);
    const cue = currentCues()[cueIndex];
    if (!cue) return;
    const x = (time) => ((time - range.start) / range.span) * waveform.width;
    context.fillStyle = "#d5eee5";
    context.fillRect(x(cue.startMs), 0, x(cue.endMs) - x(cue.startMs), 140);
    context.fillStyle = "#42796b";
    if (peaks)
      for (let pixel = 0; pixel < waveform.width; pixel++) {
        const first = Math.floor(((range.start + (pixel / waveform.width) * range.span) / 1000) * peakRate);
        const last = Math.ceil(((range.start + ((pixel + 1) / waveform.width) * range.span) / 1000) * peakRate);
        let peak = 0;
        for (let index = first; index < last; index++) peak = Math.max(peak, peaks[index] || 0);
        context.fillRect(pixel, 70 - peak * 55, 1, Math.max(1, peak * 110));
      }
    context.fillStyle = "#086959";
    for (const time of [cue.startMs, cue.endMs]) context.fillRect(x(time) - 3, 0, 6, 140);
    context.fillStyle = "#be602d";
    context.fillRect(x(video.currentTime * 1000), 0, 2, 140);
    context.fillStyle = "#183932";
    context.font = "12px sans-serif";
    for (let step = 0; step < 4; step++)
      context.fillText(formatSubtitleTime(range.start + (range.span * step) / 4), (step * waveform.width) / 4 + 5, 14);
  }
  waveform.addEventListener("pointerdown", (event) => {
    if (locked) return;
    const cue = currentCues()[cueIndex];
    if (!cue) return;
    const range = waveformWindow();
    const rect = waveform.getBoundingClientRect();
    const time = range.start + ((event.clientX - rect.left) / rect.width) * range.span;
    const tolerance = (range.span * 10) / rect.width;
    const kind =
      Math.abs(time - cue.startMs) < tolerance
        ? "start"
        : Math.abs(time - cue.endMs) < tolerance
          ? "end"
          : time > cue.startMs && time < cue.endMs
            ? "move"
            : "seek";
    if (kind === "seek") {
      video.currentTime = Math.max(0, time) / 1000;
      return;
    }
    drag = { kind, time, range, cue: { ...cue } };
    waveform.setPointerCapture(event.pointerId);
  });
  waveform.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const rect = waveform.getBoundingClientRect();
    const time = drag.range.start + ((event.clientX - rect.left) / rect.width) * drag.range.span;
    const cue = { ...drag.cue };
    if (drag.kind === "start") cue.startMs = snapTime(time);
    else if (drag.kind === "end") cue.endMs = snapTime(time);
    else {
      const delta = Math.round(time - drag.time);
      cue.startMs += delta;
      cue.endMs += delta;
    }
    start.value = formatSubtitleTime(cue.startMs);
    end.value = formatSubtitleTime(cue.endMs);
    drawWaveform();
    const context = waveform.getContext("2d");
    context.strokeStyle = "#086959";
    context.lineWidth = 3;
    context.strokeRect(
      ((cue.startMs - drag.range.start) / drag.range.span) * waveform.width,
      2,
      ((cue.endMs - cue.startMs) / drag.range.span) * waveform.width,
      waveform.height - 4
    );
  });
  waveform.addEventListener("pointerup", (event) => {
    if (!drag) return;
    const saved = drag;
    drag = null;
    const rect = waveform.getBoundingClientRect();
    const time = saved.range.start + ((event.clientX - rect.left) / rect.width) * saved.range.span;
    void change("Adjust subtitle timing", (record) => {
      const cue = record.cues[cueIndex];
      if (saved.kind === "start") cue.startMs = snapTime(time);
      else if (saved.kind === "end") cue.endMs = snapTime(time);
      else {
        const delta = Math.round(time - saved.time);
        cue.startMs = snapTime(saved.cue.startMs + delta);
        cue.endMs = cue.startMs + saved.cue.endMs - saved.cue.startMs;
      }
    }).catch(report);
  });
  waveform.addEventListener("pointercancel", () => {
    drag = null;
    refresh();
  });
  function refresh() {
    const navigation = application.getState().navigation;
    const row = session.getSegments()[navigation.activeIndex];
    const selectedId = navigation.documentId;
    const isSubtitle = SUBTITLE_FORMATS.has(row?.structure?.format);
    panel.hidden = navigation.view !== "editor" || !isSubtitle;
    qa.hidden = panel.hidden;
    if (documentId !== selectedId || panel.hidden) {
      release();
      documentId = selectedId;
      const mediaInfo = session.getProject()?.subtitleMedia?.[selectedId];
      feedback.textContent = mediaInfo ? `${translate("Attach / change video")} · ${mediaInfo.name}` : "";
    }
    if (panel.hidden) return;
    body.hidden = !selectedId;
    summary.textContent = translate(selectedId ? "Video & timing" : "Open subtitle file for video & timing");
    if (!selectedId) return;
    if (row.documentId !== selectedId) return;
    locked = Boolean(session.getProject()?.subtitleTimingLocks?.[selectedId]);
    lock.checked = locked;
    if (activeId !== row.id) {
      activeId = row.id;
      cueIndex = 0;
      playEnd = null;
      if (objectUrl) video.currentTime = currentCues()[0].startMs / 1000;
    }
    const cues = currentCues();
    cueIndex = Math.max(0, Math.min(cueIndex, cues.length - 1));
    const cue = cues[cueIndex];
    if (!cue) return;
    if (playEnd !== null) playEnd = cue.endMs;
    for (const gridRow of host.querySelectorAll("tr[data-index]")) {
      const record = session.getSegments()[Number(gridRow.dataset.index)];
      if (record?.documentId !== documentId) continue;
      const cell = gridRow.querySelector(".target-cell");
      if (!cell) continue;
      let cueList = cell.querySelector(".subtitle-cue-list");
      if (!cueList) {
        cueList = document.createElement("div");
        cueList.className = "subtitle-cue-list";
        cell.append(cueList);
      }
      cueList.textContent = subtitleCues(record, structure())
        .map((item) => `${formatSubtitleTime(item.startMs)} – ${formatSubtitleTime(item.endMs)}`)
        .join(" · ");
    }
    if (document.activeElement !== start) start.value = formatSubtitleTime(cue.startMs);
    if (document.activeElement !== end) end.value = formatSubtitleTime(cue.endMs);
    start.disabled = end.disabled = locked;
    const profile = session.getProject()?.subtitleQa || DEFAULT_SUBTITLE_QA;
    overlapRule.checked = profile.overlaps;
    for (const [key, input] of Object.entries(profileInputs))
      if (document.activeElement !== input) input.value = String(profile[key]);
    const allCues = session
      .getSegments()
      .filter((item) => item.documentId === documentId)
      .flatMap((item) => subtitleCues(item, structure()))
      .sort((a, b) => a.startMs - b.startMs);
    captionTrack.srclang = session.getProject()?.targetLang || "en";
    const track = captionTrack.track;
    track.mode = "hidden";
    for (const existing of Array.from(track.cues || [])) track.removeCue(existing);
    for (const item of allCues) {
      if (item.startMs >= 0 && item.endMs > item.startMs)
        track.addCue(new VTTCue(item.startMs / 1000, item.endMs / 1000, item.text));
    }
    const currentPosition = allCues.findIndex(
      (item) => item.segmentId === cue.segmentId && item.cueIndex === cue.cueIndex
    );
    const result = subtitleFindings(cue, allCues[currentPosition + 1], profile);
    findings.textContent = `${translate("Cue")} ${cueIndex + 1}/${cues.length} · ${result.duration.toFixed(3)} s · ${result.cps.toFixed(1)} CPS`;
    qa.textContent = result.findings.map(translate).join(" · ");
    if (row.subtitle?.needsBoundaries)
      qa.textContent += ` ${translate("Place the subtitle text boundaries before exporting.")}`;
    keepTiming.hidden = incomingTiming.hidden = !row.subtitle?.sourceTimingConflict;
    resetBoundaries.hidden = !row.subtitle?.needsBoundaries;
    if (row.subtitle?.sourceTimingConflict)
      qa.textContent += ` ${translate("Incoming source timing differs. Review local and incoming timing.")} ${formatSubtitleTime(row.subtitle.sourceTimingConflict.startMs)} – ${formatSubtitleTime(row.subtitle.sourceTimingConflict.endMs)}`;
    preview();
    drawWaveform();
  }
  summary.addEventListener(
    "click",
    action(() => {
      if (!application.getState().navigation.documentId) {
        const row = session.getSegments()[application.getState().navigation.activeIndex];
        if (row) return openDocument(row.documentId);
      }
    })
  );
  panel.addEventListener("toggle", () => {
    if (!panel.open) video.pause();
  });
  window.addEventListener("pagehide", release);
  host.addEventListener("input", () => {
    if (!panel.hidden) {
      refresh();
    }
  });
  const captureCaret = () => {
    const editor = /** @type {any} */ (document.activeElement);
    if (host.contains(editor) && typeof editor?.selectionStart === "number") lastCaret = editor.selectionStart;
  };
  document.addEventListener("selectionchange", captureCaret);
  const safeRefresh = () => {
    try {
      refresh();
    } catch (error) {
      report(error);
    }
  };
  application.subscribe(safeRefresh);
  session.subscribe(safeRefresh);
  window.addEventListener("loopcat:localechange", () => {
    for (const element of panel.querySelectorAll("[data-subtitle-label]"))
      element.textContent = translate(element.getAttribute("data-subtitle-label"));
    moreTitle.textContent = translate("Cue editing tools");
    settingsTitle.textContent = translate("General subtitle QA profile");
    safeRefresh();
  });
  safeRefresh();
  return { refresh, release };
}
