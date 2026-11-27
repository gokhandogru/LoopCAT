export const SUBTITLE_FORMATS = new Set(["srt", "vtt", "sbv"]);

export function verifiedFrameInterval(timestamps) {
  if (timestamps.length < 3) return null;
  const ordered = [...timestamps].sort((a, b) => a - b);
  const first = ordered[0];
  const measured = (ordered.at(-1) - first) / (ordered.length - 1);
  const candidates = [24000 / 1001, 24, 25, 30000 / 1001, 30, 50, 60000 / 1001, 60, 120].map((rate) => 1 / rate);
  candidates.push(measured);
  return (
    candidates.find(
      (interval) =>
        interval > 0 &&
        ordered.every(
          (time, index) => Math.abs(time - first - index * interval) <= 0.0011 && (!index || time > ordered[index - 1])
        )
    ) || null
  );
}

export function subtitlePlainText(text) {
  return String(text)
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(amp|lt|gt|nbsp|quot|apos);/g,
      (_, name) => ({ amp: "&", lt: "<", gt: ">", nbsp: "\u00a0", quot: '"', apos: "'" })[name]
    );
}

export function appendSubtitleText(container, text) {
  const stack = [container];
  for (const token of String(text).split(/(<[^>]*>)/g)) {
    const tag = /^<(\/?)(b|i|u|ruby|rt)>$/i.exec(token);
    if (tag) {
      if (tag[1]) {
        if (stack.length > 1 && stack.at(-1).tagName.toLowerCase() === tag[2].toLowerCase()) stack.pop();
      } else {
        const element = container.ownerDocument.createElement(tag[2]);
        stack.at(-1).append(element);
        stack.push(element);
      }
    } else if (!/^<[^>]*>$/.test(token))
      stack.at(-1).append(container.ownerDocument.createTextNode(subtitlePlainText(token)));
  }
}

export function parseSubtitleTime(value) {
  const match = /^(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(String(value).trim());
  if (!match) throw new Error("Enter a timestamp as HH:MM:SS.mmm.");
  const time = ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  if (!Number.isSafeInteger(time)) throw new Error("Timestamp is too large.");
  return time;
}

export function formatSubtitleTime(value) {
  const time = Math.max(0, Math.round(value));
  return `${String(Math.floor(time / 3600000)).padStart(2, "0")}:${String(Math.floor(time / 60000) % 60).padStart(2, "0")}:${String(Math.floor(time / 1000) % 60).padStart(2, "0")}.${String(time % 1000).padStart(3, "0")}`;
}

export function originalCueTiming(segment, structure) {
  const line =
    segment.structure?.timing ||
    structure?.blocks?.[segment.structure?.blockIndex]?.[segment.structure?.timingIndex || 0] ||
    "";
  const timestamps = line.match(/(?:\d+:)?\d{2}:\d{2}[,.]\d{3}/g);
  if (!timestamps || timestamps.length < 2) throw new Error("Subtitle timing metadata is missing.");
  return { startMs: parseSubtitleTime(timestamps[0]), endMs: parseSubtitleTime(timestamps[1]) };
}

export function subtitleCues(segment, structure) {
  const target = String(segment.target || "");
  if (segment.subtitle?.cues) {
    return segment.subtitle.cues.map((cue, index) => ({
      ...cue,
      segmentId: segment.id,
      cueIndex: index,
      text: target.slice(cue.from, cue.to)
    }));
  }
  return [
    {
      ...(segment.subtitle?.timing || originalCueTiming(segment, structure)),
      from: 0,
      to: target.length,
      segmentId: segment.id,
      cueIndex: 0,
      text: target
    }
  ];
}

export function validateSubtitleCues(cues, targetLength) {
  let boundary = 0;
  for (const cue of cues) {
    if (
      !Number.isSafeInteger(cue.startMs) ||
      !Number.isSafeInteger(cue.endMs) ||
      cue.startMs < 0 ||
      cue.endMs <= cue.startMs
    )
      throw new Error("Each subtitle must end after it starts.");
    if (cue.from !== boundary || !Number.isInteger(cue.to) || cue.to < cue.from || cue.to > targetLength)
      throw new Error("Place the subtitle text boundaries before exporting.");
    boundary = cue.to;
  }
  if (!cues.length || boundary !== targetLength)
    throw new Error("Place the subtitle text boundaries before exporting.");
}

// Keep text offsets aligned for a local edit. Whole-text replacements require
// explicit review because a proportional split could change the meaning.
export function adjustSubtitleBoundaries(segment, before, after) {
  if (!segment.subtitle?.cues || before === after) return;
  const subtitle = structuredClone(segment.subtitle);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const oldEnd = before.length - suffix;
  const delta = after.length - before.length;
  if (subtitle.cues.slice(0, -1).some((cue) => cue.to > prefix && cue.to < oldEnd)) subtitle.needsBoundaries = true;
  for (const cue of subtitle.cues) {
    cue.from = cue.from < prefix || cue.from === 0 ? cue.from : Math.max(prefix, cue.from + delta);
    cue.to = cue.to < prefix ? cue.to : Math.max(prefix, cue.to + delta);
  }
  subtitle.cues[0].from = 0;
  subtitle.cues.at(-1).to = after.length;
  segment.subtitle = subtitle;
}

export const DEFAULT_SUBTITLE_QA = Object.freeze({
  cps: 20,
  lineLength: 42,
  lines: 2,
  minDuration: 1,
  maxDuration: 7,
  gap: 0.08,
  overlaps: true
});

export function subtitleFindings(cue, next, profile = DEFAULT_SUBTITLE_QA) {
  const text = subtitlePlainText(cue.text);
  const lines = text.split("\n");
  const duration = (cue.endMs - cue.startMs) / 1000;
  const characters = Array.from(text.replace(/\n/g, "")).length;
  const findings = [];
  if (duration <= 0 || cue.startMs < 0) findings.push("Invalid subtitle timing");
  if (duration < profile.minDuration || duration > profile.maxDuration)
    findings.push("Subtitle duration outside project limits");
  if (characters / duration > profile.cps) findings.push("Reading speed exceeds project limit");
  if (lines.length > profile.lines) findings.push("Too many subtitle lines");
  if (lines.some((line) => Array.from(line).length > profile.lineLength)) findings.push("Subtitle line is too long");
  if (next && next.startMs < cue.endMs && profile.overlaps) findings.push("Subtitle overlaps the next cue");
  else if (next && next.startMs - cue.endMs < profile.gap * 1000) findings.push("Subtitle gap is too short");
  return { findings, cps: duration > 0 ? characters / duration : 0, duration };
}
