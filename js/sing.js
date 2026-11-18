// "Sing the interval": play a reference note, the user sings the named interval up/down,
// live pitch from the mic shows cents off target; hold within ±30¢ for 0.5 s to pass.

import * as audio from './audio.js';
import { INTERVALS } from './theory.js';
import { openMic, midiFromFreq, noteName } from './pitch.js';
import * as store from './store.js';

const { settings } = store;
const TOLERANCE = 30; // cents
const HOLD = 0.5; // seconds
const GAP = 0.15; // brief dropouts (breath, consonant) allowed while holding
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const DIRECTIONS = [{ id: 'up', label: 'Up ↑' }, { id: 'down', label: 'Down ↓' }];

let view = null;
let s = null; // session state
let mic = null;
let raf = 0;
let listenTimer = 0;
let autoTimer = 0;

export function start(container) {
  view = container;
  s = { correct: 0, total: 0, streak: 0, q: null, phase: 'idle', error: null };
  render();
}

export function stop() {
  clearTimeout(listenTimer);
  clearTimeout(autoTimer);
  cancelAnimationFrame(raf);
  mic?.close();
  mic = null;
  audio.setSessionType('playback');
  if (s) s.phase = 'idle';
}

const intervals = () => INTERVALS.filter((i) => settings.singIntervals.includes(i.id));

// ---------- flow ----------

export async function handle(action) {
  switch (action) {
    case 'sing-start': return startMic();
    case 'sing-ref': return playThenListen(refEvents());
    case 'sing-target':
      if (s.phase !== 'done') s.q.helped = true;
      return playThenListen([...refEvents(0.9), { midi: s.q.target, start: 1.0, duration: 1.2 }]);
    case 'sing-skip': return finish(false, true);
    case 'sing-next': return next();
  }
}

async function startMic() {
  audio.setSessionType('play-and-record');
  try {
    mic = await openMic(audio.getContext());
    s.error = null;
    next();
  } catch (e) {
    audio.setSessionType('playback');
    s.error = e?.name === 'NotAllowedError'
      ? 'Microphone access was blocked. Allow it in Settings → Safari → Microphone (or the browser’s site settings), then try again.'
      : 'Could not open the microphone. This needs HTTPS and a browser with mic support.';
    render();
  }
}

function next() {
  clearTimeout(autoTimer);
  const list = intervals();
  const interval = pick(list);
  const dir = pick(settings.singDirections) ?? 'up';
  const semi = interval.semitones;
  // Keep both notes in a singable range (C3 ... C5).
  const ref = dir === 'up' ? randInt(48, Math.max(48, 72 - semi)) : randInt(Math.min(72, 48 + semi), 72);
  s.q = { interval, dir, ref, target: dir === 'up' ? ref + semi : ref - semi, helped: false, result: null, startedAt: 0 };
  s.phase = 'playing';
  render();
  playThenListen(refEvents());
}

const refEvents = (duration = 1.2) => [{ midi: s.q.ref, start: 0, duration }];

/** Stop listening while we play so the mic doesn't hear the speaker, then listen again. */
function playThenListen(events) {
  if (!s.q) return;
  clearTimeout(listenTimer);
  clearTimeout(autoTimer);
  cancelAnimationFrame(raf);
  const wasDone = s.phase === 'done';
  if (!wasDone) { s.phase = 'playing'; updateStatus(); }
  const secs = audio.play(events, settings.instrument);
  listenTimer = setTimeout(() => { if (!wasDone && s.phase === 'playing') listen(); }, (secs + 0.1) * 1000);
}

function listen() {
  s.phase = 'listening';
  if (!s.q.startedAt) s.q.startedAt = performance.now(); // timing starts when singing can start
  s.hold = 0;
  s.lastIn = -1;
  s.recent = [];
  updateStatus();
  let last = performance.now();
  const tick = (now) => {
    if (s.phase !== 'listening' || !mic) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const p = mic.read();
    let cents = null, sung = null;
    if (p && p.clarity > 0.85) {
      // Median of the last 3 readings smooths single-frame octave jumps.
      s.recent.push(midiFromFreq(p.freq));
      if (s.recent.length > 3) s.recent.shift();
      sung = [...s.recent].sort((a, b) => a - b)[s.recent.length >> 1];
      cents = (sung - s.q.target) * 100;
      if (settings.singAnyOctave) cents = ((((cents + 600) % 1200) + 1200) % 1200) - 600;
    } else {
      s.recent = [];
    }
    const t = now / 1000;
    if (cents !== null && Math.abs(cents) <= TOLERANCE) {
      s.hold += dt;
      s.lastIn = t;
    } else if (t - s.lastIn > GAP) {
      s.hold = 0;
    }
    updateTuner(cents, sung);
    if (s.hold >= HOLD) return finish(true);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function finish(ok, skipped = false) {
  if (!s.q || s.phase === 'done') return;
  cancelAnimationFrame(raf);
  clearTimeout(listenTimer);
  const counted = ok && !s.q.helped;
  s.q.result = skipped ? 'skipped' : counted ? 'correct' : 'helped';
  s.phase = 'done';
  s.total += 1;
  if (counted) { s.correct += 1; s.streak += 1; } else s.streak = 0;
  const seconds = ok && s.q.startedAt ? (performance.now() - s.q.startedAt) / 1000 : undefined;
  s.q.seconds = seconds;
  s.times = s.times ?? [];
  if (seconds) s.times.push(seconds);
  store.record('sing', String(s.q.interval.id), counted, seconds);
  // Play the answer: confirmation when right, the target when skipped.
  audio.play([...refEvents(0.9), { midi: s.q.target, start: 1.0, duration: 1.2 }], settings.instrument);
  render();
  if (settings.autoNext === 'always' || (settings.autoNext === 'afterCorrect' && counted)) {
    // Leave time for the answer to play before the next reference note.
    const delay = 2.4 + (counted ? settings.delayAfterCorrect : settings.delayAfterWrong);
    autoTimer = setTimeout(next, delay * 1000);
  }
}

export function pauseAutoNext() { clearTimeout(autoTimer); }

// ---------- view ----------

function render() {
  if (!view) return;
  if (intervals().length === 0) {
    view.innerHTML = `<div class="empty"><p><b>Pick at least one interval</b></p>
      <button class="primary" data-action="settings">Open settings</button></div>`;
    return;
  }
  if (!mic) {
    view.innerHTML = `<div class="empty">
      <p><b>Sing the interval</b></p>
      <p class="secondary narrow">You'll hear a note, then sing the named interval from it. Hold the pitch steady for half a second.</p>
      ${s.error ? `<p class="fb bad narrow">${s.error}</p>` : ''}
      <button class="primary" data-action="sing-start">🎤 Start</button>
      <p class="secondary narrow"><small>Uses the microphone on this device only — nothing is recorded or sent.</small></p>
    </div>`;
    return;
  }
  const q = s.q;
  const pct = s.total ? ` · ${Math.round((s.correct / s.total) * 100)}%` : '';
  const avg = s.times?.length ? ` · ⏱ ${(s.times.reduce((a, b) => a + b, 0) / s.times.length).toFixed(1)}s` : '';
  const done = s.phase === 'done';
  let result = '';
  if (done) {
    result = q.result === 'correct' ? `<div class="fb ok">Correct! <span class="secondary mono">${q.seconds.toFixed(1)}s</span></div>`
      : q.result === 'helped' ? `<div class="fb">Got it, after hearing it (not counted)</div>`
      : `<div class="fb bad">Target was ${noteName(q.target)}</div>`;
  }
  view.innerHTML = `
    <div class="quiz">
      <div class="score mono secondary">
        <span class="grow">${s.correct}/${s.total}${pct}${avg}</span>
        ${s.streak >= 2 ? `<span class="streak">🔥 ${s.streak}</span>` : ''}
      </div>
      <div class="prompt"><span class="secondary">Sing a</span><br>
        <b class="big">${q.interval.name} ${q.dir === 'up' ? '↑' : '↓'}</b><br>
        <span class="secondary">from the reference note</span></div>
      <div class="tuner">
        <div class="ring" id="ring"><div class="ring-inner"><b id="sung">–</b><small id="cents" class="secondary mono">&nbsp;</small></div></div>
        <div class="meter"><div class="zone"></div><div class="center"></div><div class="needle" id="needle"></div></div>
        <div class="meter-labels secondary"><span>flat</span><span>sharp</span></div>
      </div>
      <div class="feedback" id="status">${result}</div>
      <div class="sing-actions">
        <button class="pill" data-action="sing-ref">🔊 Reference</button>
        <button class="pill" data-action="sing-target">🎯 Play target</button>
        <button class="pill" data-action="sing-skip" ${done ? 'disabled' : ''}>Skip</button>
      </div>
      <button class="primary next" data-action="sing-next" ${done ? '' : 'disabled'}>Next</button>
    </div>`;
  updateStatus();
  if (done) updateTuner(0, q.target, true);
}

function updateStatus() {
  const el = view?.querySelector('#status');
  if (!el || s.phase === 'done') return;
  el.innerHTML = `<span class="secondary">${s.phase === 'playing' ? 'Listen…' : s.phase === 'listening' ? '🎤 Sing now' : ''}</span>`;
}

function updateTuner(cents, sung, final = false) {
  const needle = view.querySelector('#needle');
  if (!needle) return;
  const ring = view.querySelector('#ring');
  const label = view.querySelector('#sung');
  const centsEl = view.querySelector('#cents');
  if (cents === null) {
    needle.style.opacity = '0.25';
    label.textContent = '–';
    centsEl.innerHTML = '&nbsp;';
  } else {
    const clamped = Math.max(-50, Math.min(50, cents));
    const inZone = Math.abs(cents) <= TOLERANCE;
    needle.style.opacity = '1';
    needle.style.left = `${50 + clamped}%`;
    needle.style.background = inZone ? 'var(--green)' : Math.abs(cents) <= 50 ? 'var(--orange)' : 'var(--red)';
    label.textContent = noteName(sung);
    centsEl.textContent = final ? '' : `${cents > 0 ? '+' : ''}${Math.round(cents)}¢`
      + (Math.abs(cents) > 50 ? (cents > 0 ? ' ↓' : ' ↑') : '');
  }
  const progress = final ? 1 : Math.min(1, (s.hold ?? 0) / HOLD);
  ring.style.setProperty('--p', `${progress * 100}%`);
}

export function onHidden() {
  // iOS stops the mic in the background anyway; ask for a fresh Start on return.
  stop();
  render();
}
