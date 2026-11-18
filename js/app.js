// UI: home, quiz, stats, settings sheet. Port of the SwiftUI views.

import * as audio from './audio.js';
import {
  INSTRUMENTS, INTERVALS, INTERVAL_MODES, CHORDS, CHORD_GROUPS, CHORD_MODES, INVERSION_CANDIDATES,
  INVERSION_NAMES, INVERSION_BASS, chordNotes,
} from './theory.js';
import { KINDS, summary, itemLabel, makeExercise } from './exercises.js';
import * as store from './store.js';

const { settings } = store;
const $ = (sel) => document.querySelector(sel);
const navTitle = $('#nav-title'), navLeft = $('#nav-left'), navRight = $('#nav-right');
const view = $('#view'), sheet = $('#sheet'), sheetBody = $('#sheet-body');

// iOS only allows audio after a tap; unlock on the first one.
document.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });

// ---------- shared bits ----------

const segmented = (name, items, value) => `
  <div class="segmented" role="radiogroup">
    ${items.map((it) => `<button role="radio" aria-checked="${it.id === value}" data-seg="${name}" data-value="${it.id}"
      class="${it.id === value ? 'on' : ''}">${it.label}</button>`).join('')}
  </div>`;

const toggleRow = (key, value, title, detail = '', keep = 0) => `
  <label class="row toggle">
    <span class="grow">${title}</span>
    ${detail ? `<span class="secondary">${detail}</span>` : ''}
    <input type="checkbox" data-member="${key}" data-value="${value}" data-keep="${keep}"
      ${settings[key].includes(value) ? 'checked' : ''}>
    <span class="switch"></span>
  </label>`;

const boolRow = (key, title) => `
  <label class="row toggle">
    <span class="grow">${title}</span>
    <input type="checkbox" data-bool="${key}" ${settings[key] ? 'checked' : ''}>
    <span class="switch"></span>
  </label>`;

const fmtSpeed = (v) => `${Number(v.toFixed(2))}×`;
const fmtDelay = (v) => `${v.toFixed(1)} s`;

const slider = (key, title, min, max, step, fmt, icons) => `
  <div class="row slider">
    <div class="slider-head"><span>${title}</span><span class="secondary mono" data-out="${key}">${fmt(settings[key])}</span></div>
    <div class="slider-track">
      ${icons ? `<span class="secondary">${icons[0]}</span>` : ''}
      <input type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-range="${key}" data-fmt="${fmt === fmtSpeed ? 'speed' : 'delay'}">
      ${icons ? `<span class="secondary">${icons[1]}</span>` : ''}
    </div>
  </div>`;

const section = (header, body, footer = '') => `
  <section>
    ${header ? `<h3>${header}</h3>` : ''}
    <div class="group">${body}</div>
    ${footer ? `<p class="footer">${footer}</p>` : ''}
  </section>`;

const groupHeader = (title, group) => `
  <span class="grow">${title}</span>
  <button class="link small" data-all="${group}" data-on="1">All</button> ·
  <button class="link small" data-all="${group}" data-on="0">None</button>`;

function setNav(title, left = '', right = '') {
  navTitle.textContent = title;
  navLeft.innerHTML = left;
  navRight.innerHTML = right;
}

const backButton = `<button class="link" data-action="home">‹ Back</button>`;

// ---------- home ----------

function renderHome() {
  setNav('Ear Trainer', '', `<button class="link icon" data-action="stats" aria-label="Stats">📊</button>`);
  view.innerHTML = `
    ${section('Practice', KINDS.map((k) => `
      <button class="row nav-row" data-action="quiz" data-kind="${k.id}">
        <span class="icon-badge">${k.icon}</span>
        <span class="grow"><b>${k.title}</b><br><small class="secondary">${summary(k.id, settings)}</small></span>
        <span class="chevron">›</span>
      </button>`).join(''))}
    ${section('Sound', `
      <div class="row">${segmented('instrument', INSTRUMENTS, settings.instrument)}</div>
      <button class="row link" data-action="test-sound">▶︎ Test sound</button>`,
      'Tip: in Safari tap Share → Add to Home Screen to install. Works offline after the first visit.')}
    ${section('Coming soon', ['Scales', 'Melodic dictation', 'Chord progressions']
      .map((t) => `<div class="row secondary">${t}</div>`).join(''))}`;
}

// ---------- stats ----------

function renderStats() {
  setNav('Stats', backButton);
  const color = (a) => (a >= 0.85 ? 'var(--green)' : a >= 0.6 ? 'var(--orange)' : 'var(--red)');
  view.innerHTML = KINDS.map((k) => {
    const rows = Object.entries(store.stats[k.id] ?? {})
      .map(([id, t]) => ({ id, ...t, acc: t.total ? t.correct / t.total : 0 }))
      .sort((a, b) => a.acc - b.acc);
    return section(k.title, rows.length === 0
      ? `<div class="row secondary">No answers yet</div>`
      : rows.map((r) => `
        <div class="row stat">
          <div class="stat-head mono">
            <span class="grow">${itemLabel(k.id, r.id)}</span>
            <span class="secondary">${r.correct}/${r.total}</span>
            <b class="pct">${Math.round(r.acc * 100)}%</b>
          </div>
          <div class="bar"><div style="width:${r.acc * 100}%;background:${color(r.acc)}"></div></div>
        </div>`).join(''));
  }).join('') + section('Backup', `
      <button class="row link" data-action="export">Export stats & settings</button>
      <label class="row link">Import from file<input type="file" accept="application/json,.json" data-import hidden></label>`,
      'Keep a backup in case iOS clears website data.')
    + section('', `<button class="row link danger" data-action="reset">Reset all stats</button>`);
}

// ---------- settings sheet ----------

let sheetKind = null;

function openSettings(kind) {
  sheetKind = kind;
  stopAutoNext();
  renderSettings();
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeSettings() {
  sheet.classList.remove('open');
  setTimeout(() => { sheet.hidden = true; }, 250);
  sheetKind = null;
  restartQuiz();
}

function renderSettings() {
  const scroll = sheetBody.scrollTop;
  const kind = sheetKind;
  $('#sheet-title').textContent = `${KINDS.find((k) => k.id === kind).title} settings`;
  const melodic = (modes) => modes.includes('ascending') || modes.includes('descending') || modes.includes('arpeggio');
  const speed = slider('melodicSpeed', 'Melodic speed', 0.5, 3, 0.25, fmtSpeed, ['🐢', '🐇']);
  let body = section('Sound', `<div class="row">${segmented('instrument', INSTRUMENTS, settings.instrument)}</div>`);

  if (kind === 'intervals') {
    body += section('Playback', INTERVAL_MODES.map((m) => toggleRow('intervalModes', m.id, m.label, '', 1)).join('')
      + (melodic(settings.intervalModes) ? speed : ''));
    for (const [title, group, items] of [
      ['Simple intervals', 'simple', INTERVALS.filter((i) => !i.compound)],
      ['Compound intervals', 'compound', INTERVALS.filter((i) => i.compound)],
    ]) {
      body += section(groupHeader(title, `intervals:${group}`),
        items.map((i) => toggleRow('intervals', i.id, i.name, i.short)).join(''));
    }
  } else if (kind === 'chords') {
    body += section('Playback', CHORD_MODES.map((m) => toggleRow('chordModes', m.id, m.label, '', 1)).join('')
      + (melodic(settings.chordModes) ? speed : '') + boolRow('chordInversions', 'Random inversions'));
    for (const g of CHORD_GROUPS) {
      body += section(groupHeader(g, `chords:${g}`),
        CHORDS.filter((ch) => ch.group === g).map((ch) => toggleRow('chords', ch.id, ch.name, ch.symbol)).join(''));
    }
  } else {
    body += section('Playback', CHORD_MODES.map((m) => toggleRow('inversionModes', m.id, m.label, '', 1)).join('')
      + (melodic(settings.inversionModes) ? speed : ''));
    body += section('Inversions', [0, 1, 2, 3].map((i) => toggleRow('inversions', i, INVERSION_NAMES[i], INVERSION_BASS[i])).join(''),
      '3rd inversion is only asked on four-note chords.');
    for (const g of CHORD_GROUPS) {
      const items = INVERSION_CANDIDATES.filter((ch) => ch.group === g);
      if (items.length === 0) continue;
      body += section(groupHeader(g, `inversionChords:${g}`),
        items.map((ch) => toggleRow('inversionChords', ch.id, ch.name, ch.symbol, 1)).join(''));
    }
  }

  const autoItems = [{ id: 'off', label: 'Off' }, { id: 'afterCorrect', label: 'Correct only' }, { id: 'always', label: 'Always' }];
  body += section('Auto next', `<div class="row">${segmented('autoNext', autoItems, settings.autoNext)}</div>`
    + (settings.autoNext !== 'off' ? slider('delayAfterCorrect', 'After correct', 0.2, 5, 0.1, fmtDelay) : '')
    + (settings.autoNext === 'always' ? slider('delayAfterWrong', 'After wrong', 0.2, 5, 0.1, fmtDelay) : ''),
    'Moves on by itself after the delay. Tapping an answer to compare pauses it.');

  sheetBody.innerHTML = body;
  sheetBody.scrollTop = scroll;
}

function setAll(spec, on) {
  const [key, group] = spec.split(':');
  let ids;
  if (key === 'intervals') ids = INTERVALS.filter((i) => i.compound === (group === 'compound')).map((i) => i.id);
  else if (key === 'chords') ids = CHORDS.filter((ch) => ch.group === group).map((ch) => ch.id);
  else ids = INVERSION_CANDIDATES.filter((ch) => ch.group === group).map((ch) => ch.id);
  const arr = settings[key];
  if (on) {
    for (const id of ids) if (!arr.includes(id)) arr.push(id);
  } else {
    const rest = arr.filter((id) => !ids.includes(id));
    // Inversion exercise must keep at least one chord.
    if (key !== 'inversionChords' || rest.length > 0) settings[key] = rest;
  }
  store.saveSettings();
}

// ---------- quiz ----------

let quiz = null;
let autoTimer = null;

function stopAutoNext() {
  clearTimeout(autoTimer);
  autoTimer = null;
}

function startQuiz(kind) {
  quiz = { kind, exercise: makeExercise(kind, settings), question: null, chosen: null, correct: 0, total: 0, streak: 0 };
  renderQuiz();
  if (quiz.exercise.options.length >= 2) {
    const q = quiz;
    setTimeout(() => { if (quiz === q && !q.question) nextQuestion(); }, 300);
  }
}

function restartQuiz() {
  if (!quiz) return;
  stopAutoNext();
  audio.stop();
  startQuiz(quiz.kind);
}

function nextQuestion() {
  stopAutoNext();
  let q = quiz.exercise.makeQuestion();
  // One re-roll makes back-to-back repeats rare without forbidding them.
  if (q.answerID === quiz.question?.answerID) q = quiz.exercise.makeQuestion();
  quiz.question = q;
  quiz.chosen = null;
  audio.play(q.events, settings.instrument);
  renderQuiz();
}

function answer(id) {
  const q = quiz.question;
  if (!q) return;
  if (quiz.chosen !== null) {
    stopAutoNext(); // user is comparing; don't yank the question away
    audio.play(q.render(id), settings.instrument);
    return;
  }
  quiz.chosen = id;
  quiz.total += 1;
  const ok = id === q.answerID;
  if (ok) { quiz.correct += 1; quiz.streak += 1; } else quiz.streak = 0;
  store.record(quiz.kind, q.answerID, ok);
  navigator.vibrate?.(ok ? 15 : [30, 40, 30]);
  if (settings.autoNext === 'always' || (settings.autoNext === 'afterCorrect' && ok)) {
    const delay = ok ? settings.delayAfterCorrect : settings.delayAfterWrong;
    autoTimer = setTimeout(nextQuestion, delay * 1000);
  }
  renderQuiz();
}

function renderQuiz() {
  const { kind, exercise: ex, question: q, chosen } = quiz;
  setNav(KINDS.find((k) => k.id === kind).title, backButton,
    `<button class="link icon" data-action="settings" aria-label="Settings">⚙︎</button>`);

  if (ex.options.length < 2) {
    view.innerHTML = `<div class="empty"><p><b>Pick at least two answers</b></p>
      <button class="primary" data-action="settings">Open settings</button></div>`;
    return;
  }

  const titleOf = (id) => ex.options.find((o) => o.id === id)?.title ?? id;
  let feedback = '';
  if (q && chosen !== null) {
    feedback = (chosen === q.answerID
      ? `<div class="fb ok">Correct!</div>`
      : `<div class="fb bad">It was ${titleOf(q.answerID)}</div>`)
      + `<small class="secondary">Tap any answer to hear it</small>`;
  }
  const state = (o) => (!q || chosen === null ? '' : o.id === q.answerID ? 'correct' : o.id === chosen ? 'wrong' : '');
  const pct = quiz.total ? ` · ${Math.round((quiz.correct / quiz.total) * 100)}%` : '';

  view.innerHTML = `
    <div class="quiz">
      <div class="score mono secondary">
        <span class="grow">${quiz.correct}/${quiz.total}${pct}</span>
        ${quiz.streak >= 2 ? `<span class="streak">🔥 ${quiz.streak}</span>` : ''}
      </div>
      <button class="replay" data-action="replay" aria-label="Replay">🔊</button>
      <div class="prompt"><b>${ex.prompt}</b><br><span class="secondary">${q?.caption ?? '&nbsp;'}</span></div>
      <div class="feedback">${feedback}</div>
      <div class="answers">
        ${ex.options.map((o) => `
          <button class="answer ${state(o)}" data-answer="${o.id}">
            <b>${o.title}</b><small class="secondary">${o.subtitle}</small>
          </button>`).join('')}
      </div>
      <button class="primary next" data-action="next" ${chosen === null ? 'disabled' : ''}>Next</button>
    </div>`;
}

// ---------- routing & events ----------

function route() {
  stopAutoNext();
  audio.stop();
  const [, page, kind] = location.hash.split('/');
  if (page === 'quiz' && KINDS.some((k) => k.id === kind)) startQuiz(kind);
  else { quiz = null; page === 'stats' ? renderStats() : renderHome(); }
  window.scrollTo(0, 0);
}

function refresh() {
  if (sheetKind) renderSettings();
  if (!quiz) route();
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.seg) {
    settings[t.dataset.seg] = t.dataset.value;
    store.saveSettings();
    return refresh();
  }
  if (t.dataset.all) {
    setAll(t.dataset.all, t.dataset.on === '1');
    return refresh();
  }
  if (t.dataset.answer !== undefined) return answer(t.dataset.answer);
  switch (t.dataset.action) {
    case 'home': location.hash = '#/'; break;
    case 'stats': location.hash = '#/stats'; break;
    case 'quiz': location.hash = `#/quiz/${t.dataset.kind}`; break;
    case 'settings': openSettings(quiz.kind); break;
    case 'close-settings': closeSettings(); break;
    case 'replay': if (quiz?.question) audio.play(quiz.question.events, settings.instrument); break;
    case 'next': nextQuestion(); break;
    case 'test-sound':
      audio.play(chordNotes(CHORDS[0], 60, 0).map((midi) => ({ midi, start: 0, duration: 1.5 })), settings.instrument);
      break;
    case 'reset':
      if (confirm('Reset all stats?')) { store.resetStats(); renderStats(); }
      break;
    case 'export': exportBackup(); break;
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.member) {
    const value = t.dataset.member === 'chords' || t.dataset.member === 'inversionChords'
      || t.dataset.member.endsWith('Modes') ? t.dataset.value : Number(t.dataset.value);
    store.toggleMember(t.dataset.member, value, t.checked, Number(t.dataset.keep));
    refresh();
  } else if (t.dataset.bool) {
    settings[t.dataset.bool] = t.checked;
    store.saveSettings();
    refresh();
  } else if (t.dataset.range) {
    store.saveSettings();
  } else if (t.dataset.import !== undefined && t.files?.[0]) {
    t.files[0].text().then((txt) => {
      try { store.importData(txt); alert('Imported.'); } catch { alert('Could not read that file.'); }
      renderStats();
    });
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.dataset.range) return;
  settings[t.dataset.range] = Number(t.value);
  const out = document.querySelector(`[data-out="${t.dataset.range}"]`);
  if (out) out.textContent = (t.dataset.fmt === 'speed' ? fmtSpeed : fmtDelay)(settings[t.dataset.range]);
});

async function exportBackup() {
  const name = `eartrainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([store.exportData()], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAutoNext(); audio.stop(); } });
route();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
