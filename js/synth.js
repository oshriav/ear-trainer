// Offline synthesis: renders a whole question into one Float32Array, so timing is
// sample-accurate. Port of Audio/Synth.swift (piano, Karplus-Strong guitar, PolyBLEP synth).

import { frequency } from './theory.js';

/** events: [{ midi, start, duration }] (seconds). Returns normalized mono samples. */
export function render(events, instrument, sr) {
  const tail = 0.4;
  const end = Math.max(0, ...events.map((e) => e.start + e.duration)) + tail;
  const out = new Float32Array(Math.max(1, Math.floor(end * sr)));
  const list = instrument === 'guitar' ? strummed(events) : events;
  for (const e of list) {
    if (instrument === 'piano') piano(e, out, sr);
    else if (instrument === 'guitar') guitar(e, out, sr);
    else synth(e, out, sr);
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.8 / peak : 0;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

function span(e, out, sr) {
  const start = Math.floor(e.start * sr);
  const length = Math.min(out.length - start, Math.floor((e.duration + 0.35) * sr));
  return { start, length, noteOff: Math.floor(e.duration * sr) };
}

/** xorshift32, seeded per note so a question sounds the same on replay. */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

// Piano: inharmonic partials, two detuned strings, two-stage decay, hammer noise.
function piano(e, out, sr) {
  const { start, length, noteOff } = span(e, out, sr);
  if (length <= 0) return;
  const f0 = frequency(e.midi);
  const voice = new Float64Array(length);
  const baseDecay = 0.5 + f0 / 300;
  const inharm = 0.0003;

  for (let n = 1; n <= 16; n++) {
    const fn = n * f0 * Math.sqrt(1 + inharm * n * n);
    if (fn > sr * 0.45) break;
    const amp = Math.exp(-(n - 1) * 0.12) / Math.pow(n, 1.1);
    const decay = baseDecay * (1 + 0.45 * (n - 1));
    const w1 = (2 * Math.PI * fn) / sr;
    const w2 = w1 * 1.0007;
    const fastMul = Math.exp((-3.0 * decay) / sr);
    const slowMul = Math.exp((-0.5 * decay) / sr);
    let fast = 0.65 * amp, slow = 0.35 * amp;
    // Rotating phasors instead of sin() per sample: same output, far cheaper in JS.
    const c1 = Math.cos(w1), s1 = Math.sin(w1), c2 = Math.cos(w2), s2 = Math.sin(w2);
    let x1 = 1, y1 = 0, x2 = Math.cos(n * 1.3), y2 = Math.sin(n * 1.3);
    for (let i = 0; i < length; i++) {
      voice[i] += (y1 + y2) * 0.5 * (fast + slow);
      const nx1 = x1 * c1 - y1 * s1; y1 = x1 * s1 + y1 * c1; x1 = nx1;
      const nx2 = x2 * c2 - y2 * s2; y2 = x2 * s2 + y2 * c2; x2 = nx2;
      fast *= fastMul;
      slow *= slowMul;
    }
  }

  // Hammer thump: short low-passed noise burst.
  const noise = rng(Math.imul(e.midi, 7919) | 1);
  const a = 1 - Math.exp((-2 * Math.PI * Math.min(4000, f0 * 6)) / sr);
  let lp = 0;
  for (let i = 0; i < Math.min(length, Math.floor(0.02 * sr)); i++) {
    lp += a * (noise() - lp);
    voice[i] += lp * 0.25 * Math.exp(-i / (0.004 * sr));
  }

  const attack = 0.003 * sr;
  for (let i = 0; i < length; i++) {
    const env = Math.min(1, i / attack) * (i < noteOff ? 1 : Math.exp((-(i - noteOff) / sr) * 14));
    out[start + i] += voice[i] * env;
  }
}

/** Notes that start together get a quick low-to-high strum, like a pick across the strings. */
function strummed(events) {
  const groups = new Map();
  events.forEach((e, i) => {
    if (!groups.has(e.start)) groups.set(e.start, []);
    groups.get(e.start).push(i);
  });
  const result = events.map((e) => ({ ...e }));
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    idx.sort((a, b) => events[a].midi - events[b].midi).forEach((i, rank) => {
      const delay = rank * 0.015;
      result[i].start += delay;
      result[i].duration = Math.max(0.1, result[i].duration - delay);
    });
  }
  return result;
}

// Guitar: Karplus-Strong plucked string with all-pass fine tuning.
function guitar(e, out, sr) {
  const { start, length, noteOff } = span(e, out, sr);
  if (length <= 0) return;
  // Loop delay = integer line + 0.5 (averaging filter) + fractional all-pass, so pitch is exact.
  const period = sr / frequency(e.midi);
  const lineLength = Math.max(2, Math.floor(period - 0.5 - 0.1));
  const fraction = period - 0.5 - lineLength;
  const c = (1 - fraction) / (1 + fraction);

  const line = new Float64Array(lineLength);
  const noise = rng((Math.imul(e.midi, 2654435761) + 12345) | 1);
  let lp = 0, mean = 0;
  for (let i = 0; i < lineLength; i++) {
    lp += 0.5 * (noise() - lp);
    line[i] = lp;
    mean += lp;
  }
  mean /= lineLength;
  for (let i = 0; i < lineLength; i++) line[i] -= mean;

  const loss = 0.996;
  let index = 0, previous = 0, apIn = 0, apOut = 0;
  for (let i = 0; i < length; i++) {
    const current = line[index];
    const averaged = 0.5 * (current + previous) * loss;
    previous = current;
    const tuned = c * averaged + apIn - c * apOut;
    apIn = averaged;
    apOut = tuned;
    line[index] = tuned;
    if (++index === lineLength) index = 0;
    const release = i < noteOff ? 1 : Math.exp((-(i - noteOff) / sr) * 18);
    out[start + i] += current * release;
  }
}

// Synth: two detuned PolyBLEP saws through an enveloped 2-pole low-pass.
function synth(e, out, sr) {
  const { start, length, noteOff } = span(e, out, sr);
  if (length <= 0) return;
  const f0 = frequency(e.midi);
  const dt1 = (f0 * 0.996) / sr, dt2 = (f0 * 1.004) / sr;
  let p1 = 0, p2 = 0.37, lp1 = 0, lp2 = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sr;
    let env = t < 0.01 ? t / 0.01 : 0.6 + 0.4 * Math.exp(-(t - 0.01) / 0.15);
    if (i >= noteOff) env *= Math.exp(-(i - noteOff) / sr / 0.08);
    const v = 2 * p1 - 1 - polyBlep(p1, dt1) + (2 * p2 - 1 - polyBlep(p2, dt2));
    p1 += dt1; if (p1 >= 1) p1 -= 1;
    p2 += dt2; if (p2 >= 1) p2 -= 1;
    const cutoff = Math.min(sr * 0.4, f0 * (2.5 + 6 * Math.exp(-t * 5)));
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
    lp1 += a * (v - lp1);
    lp2 += a * (lp1 - lp2);
    out[start + i] += lp2 * 0.5 * env;
  }
}

function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  } else if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}
