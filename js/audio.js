// Web Audio playback of pre-rendered buffers. iOS needs the context unlocked by a user tap.

import { render } from './synth.js';

let ctx = null;
let current = null;
let ticket = 0;

function context() {
  if (!ctx) {
    // Safari 17+: play through the silent switch, like AVAudioSession .playback.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  }
  return ctx;
}

/** Call from a user gesture (tap) so iOS allows audio. */
export function unlock() {
  const c = context();
  if (c.state !== 'running') c.resume();
  // A silent one-sample buffer fully unlocks older iOS versions.
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, c.sampleRate);
  src.connect(c.destination);
  src.start();
}

export function play(events, instrument) {
  const my = ++ticket;
  const c = context();
  if (c.state !== 'running') c.resume();
  // Defer rendering a tick so the tap's visual feedback paints first.
  setTimeout(() => {
    if (my !== ticket) return;
    const samples = render(events, instrument, c.sampleRate);
    if (my !== ticket) return;
    stopCurrent();
    const buffer = c.createBuffer(1, samples.length, c.sampleRate);
    buffer.copyToChannel(samples, 0);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    src.start();
    current = src;
  }, 0);
}

export function stop() {
  ticket++;
  stopCurrent();
}

function stopCurrent() {
  if (current) {
    try { current.stop(); } catch {}
    current = null;
  }
}
