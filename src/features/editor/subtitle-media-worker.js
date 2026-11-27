import { Input, BlobSource, MP4, WEBM, AudioSampleSink, VideoSampleSink, EncodedPacketSink } from "mediabunny";
import { verifiedFrameInterval } from "./subtitle-model.js";

let input;
let videoTrack;
let generation = 0;
const send = (message, transfer = []) => /** @type {any} */ (self).postMessage(message, transfer);

async function inspect(file, token) {
  input?.dispose();
  input = new Input({ source: new BlobSource(file), formats: [MP4, WEBM] });
  const current = input;
  videoTrack = await current.getPrimaryVideoTrack();
  const duration = await current.computeDuration();
  const audio = await current.getPrimaryAudioTrack();
  send({ type: "metadata", duration });
  const jobs = [];
  if (videoTrack)
    jobs.push(
      (async () => {
        const timestamps = [];
        for await (const packet of new EncodedPacketSink(videoTrack).packets(undefined, undefined, {
          metadataOnly: true
        })) {
          if (token !== generation) return;
          timestamps.push(packet.timestamp);
        }
        const interval = verifiedFrameInterval(timestamps);
        const origin = await videoTrack.getFirstTimestamp();
        if (token === generation)
          send({
            type: "frames",
            interval: interval && (await videoTrack.canDecode()) ? interval : null,
            origin
          });
      })()
    );
  if (audio && (await audio.canDecode()))
    jobs.push(
      (async () => {
        const rate = 100;
        const peaks = new Float32Array(Math.ceil(duration * rate) + 1);
        let lastSent = 0;
        for await (const sample of new AudioSampleSink(audio).samples()) {
          try {
            if (token !== generation) return;
            for (let channel = 0; channel < sample.numberOfChannels; channel++) {
              const data = new Float32Array(sample.numberOfFrames);
              sample.copyTo(data, { planeIndex: channel, format: "f32-planar" });
              for (let index = 0; index < data.length; index++) {
                const bin = Math.floor((sample.timestamp + index / sample.sampleRate) * rate);
                if (bin >= 0 && bin < peaks.length) peaks[bin] = Math.max(peaks[bin], Math.abs(data[index]));
              }
            }
            if (sample.timestamp - lastSent > 10) {
              send({ type: "peaks", peaks, rate, progress: sample.timestamp / duration });
              lastSent = sample.timestamp;
            }
          } finally {
            sample.close();
          }
        }
        if (token === generation) send({ type: "peaks", peaks, rate, progress: 1 });
      })()
    );
  else send({ type: "notice", message: "Waveform unavailable for this audio track." });
  await Promise.all(jobs);
}

self.onmessage = ({ data }) => {
  if (data.type === "open") {
    const token = ++generation;
    inspect(data.file, token).catch((error) => send({ type: "notice", message: error.message }));
  } else if (data.type === "frame" && videoTrack) {
    const token = generation;
    new VideoSampleSink(videoTrack)
      .getSample(data.time)
      .then((sample) => {
        if (!sample) return;
        try {
          if (token !== generation) return;
          const frame = sample.toVideoFrame();
          send({ type: "frame", frame, timestamp: sample.timestamp, request: data.request }, [frame]);
        } finally {
          sample.close();
        }
      })
      .catch((error) => send({ type: "notice", message: error.message }));
  }
};
