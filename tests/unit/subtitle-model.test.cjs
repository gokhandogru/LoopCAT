const assert = require("node:assert/strict");
const test = require("node:test");
const load = () => import("../../src/features/editor/subtitle-model.js");

test("CFR verification handles fractional rates and timestamp quantization while rejecting VFR", async () => {
  const { verifiedFrameInterval } = await load();
  const timestamps = Array.from({ length: 2400 }, (_, index) => Math.round((index * 1001) / 24) / 1000);
  assert.equal(verifiedFrameInterval(timestamps), 1001 / 24000);
  timestamps[50] += 0.02;
  assert.equal(verifiedFrameInterval(timestamps), null);
});

test("subtitle timestamps handle legacy hours, fractions and reject invalid ranges", async () => {
  const model = await load();
  for (const time of [0, 2250, 360000001]) assert.equal(model.parseSubtitleTime(model.formatSubtitleTime(time)), time);
  assert.equal(model.parseSubtitleTime("0:00:01.000"), 1000);
  assert.throws(() => model.parseSubtitleTime("00:99:00.000"));
  assert.throws(() => model.validateSubtitleCues([{ startMs: 2, endMs: 1, from: 0, to: 1 }], 1));
});

test("subtitle typing retains cue partitions and flags replacements across boundaries", async () => {
  const { adjustSubtitleBoundaries, validateSubtitleCues } = await load();
  const segment = {
    subtitle: {
      version: 1,
      cues: [
        { startMs: 0, endMs: 1000, from: 0, to: 5 },
        { startMs: 1000, endMs: 2000, from: 5, to: 10 }
      ]
    }
  };
  adjustSubtitleBoundaries(segment, "HelloWorld", "Hello World");
  validateSubtitleCues(segment.subtitle.cues, 11);
  assert.equal(segment.subtitle.cues[0].to, 6);
  assert.equal(segment.subtitle.cues[1].from, 6);
  assert.ok(!segment.subtitle.needsBoundaries);
  adjustSubtitleBoundaries(segment, "Hello World", "Merhaba dünya");
  assert.equal(segment.subtitle.needsBoundaries, true);
});

test("subtitle QA counts visible Unicode text and checks adjacent groups", async () => {
  const { subtitleFindings } = await load();
  const result = subtitleFindings({ startMs: 0, endMs: 1000, text: "<i>Çağrı 😀</i>" }, { startMs: 950 });
  assert.equal(result.cps, 7);
  assert.ok(result.findings.includes("Subtitle overlaps the next cue"));
});
