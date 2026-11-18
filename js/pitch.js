// Microphone pitch detection in the page (YIN). No server; works offline.

/** YIN fundamental estimate. Returns { freq, clarity } or null when unvoiced/quiet. */
export function yin(buf, sr, threshold = 0.12) {
  const half = buf.length >> 1;
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / buf.length) < 0.01) return null;

  const tauMin = Math.floor(sr / 1100); // highest pitch ~1100 Hz
  const tauMax = Math.min(half - 1, Math.floor(sr / 65)); // lowest ~65 Hz
  const d = new Float32Array(tauMax + 2);
  // Difference function.
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // Cumulative mean normalized difference.
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  // First dip under the threshold, walked down to its local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 1) return null;
  // Parabolic interpolation for sub-sample accuracy.
  const a = d[tau - 1], b = d[tau], c = d[tau + 1];
  const denom = a + c - 2 * b;
  const refined = denom !== 0 ? tau + (a - c) / (2 * denom) : tau;
  return { freq: sr / refined, clarity: 1 - b };
}

export const midiFromFreq = (f) => 69 + 12 * Math.log2(f / 440);

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (midi) => {
  const m = Math.round(midi);
  return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
};

/** Opens the mic on the shared AudioContext. Must be called from a tap the first time (iOS). */
export async function openMic(ctx) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  // Safari only pulls audio through nodes that reach the destination; route it there silently.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(analyser).connect(mute).connect(ctx.destination);
  const buf = new Float32Array(analyser.fftSize);
  return {
    read() {
      analyser.getFloatTimeDomainData(buf);
      return yin(buf, ctx.sampleRate);
    },
    close() {
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      mute.disconnect();
    },
  };
}
