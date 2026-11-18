// Web Audio playback of pre-rendered buffers.
// iOS: the context only starts inside a real tap (touchend/click, not pointerdown), and Web Audio
// is muted by the silent switch unless the page's audio session is "playback".

import { render } from './synth.js';

let ctx = null;
let current = null;
let ticket = 0;
let keepAlive = null;
let sessionType = 'playback';

function context() {
  if (!ctx) {
    setPlaybackSession();
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  }
  return ctx;
}

// Safari 17+: play through the silent switch, like AVAudioSession .playback.
function setPlaybackSession() {
  try { if (navigator.audioSession) navigator.audioSession.type = sessionType; } catch {}
}

/** A looping silent <audio> element: while an HTML media element plays, iOS routes Web Audio
 *  through the "playback" session too, so sound works with the ringer on silent (older iOS). */
function silentLoop() {
  if (keepAlive) return keepAlive;
  const rate = 8000, n = rate / 2; // 0.5 s of 8-bit mono silence
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  keepAlive = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  keepAlive.loop = true;
  keepAlive.setAttribute('playsinline', '');
  keepAlive.setAttribute('x-webkit-airplay', 'deny');
  return keepAlive;
}

/** Must run inside a tap handler (touchend/click). Safe to call on every tap. */
export function unlock() {
  const c = context();
  setPlaybackSession();
  if (c.state !== 'running') {
    c.resume().catch(() => {});
    // A silent one-sample buffer fully unlocks older iOS versions.
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start();
  }
  const el = silentLoop();
  if (el.paused) el.play().catch(() => {});
}

/** The single shared AudioContext (also used for the mic). */
export const getContext = context;

/** 'playback' normally; 'play-and-record' while the mic is open so output stays on the speaker. */
export function setSessionType(type) {
  sessionType = type;
  setPlaybackSession();
}

/** Plays events; returns seconds until the sound has finished. */
export function play(events, instrument) {
  const my = ++ticket;
  const c = context();
  if (c.state !== 'running') c.resume().catch(() => {});
  // Defer rendering a tick so the tap's visual feedback paints first.
  setTimeout(() => {
    if (my !== ticket) return;
    const samples = render(events, instrument, c.sampleRate);
    if (my !== ticket) return;
    stopCurrent();
    const buffer = c.createBuffer(1, samples.length, c.sampleRate);
    buffer.getChannelData(0).set(samples);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    src.start();
    current = src;
  }, 0);
  return Math.max(0, ...events.map((e) => e.start + e.duration)) + 0.35;
}

export function stop() {
  ticket++;
  stopCurrent();
}

/** Page hidden: release the audio session so we don't sit in the lock screen's Now Playing. */
export function suspend() {
  stop();
  keepAlive?.pause();
  ctx?.suspend().catch(() => {});
}

function stopCurrent() {
  if (current) {
    try { current.stop(); } catch {}
    current = null;
  }
}
