// Settings and stats persisted in localStorage. Port of Exercises/Stores.swift.

const SETTINGS_KEY = 'settings.v1';
const STATS_KEY = 'stats.v1';

export const DEFAULT_SETTINGS = {
  instrument: 'piano',
  intervals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  intervalModes: ['ascending'],
  chords: ['maj', 'min', 'dim', 'aug'],
  chordModes: ['block'],
  chordInversions: false,
  inversionChords: ['maj', 'min'],
  inversions: [0, 1, 2],
  inversionModes: ['block'],
  singIntervals: [2, 3, 4, 5, 7, 12],
  singDirections: ['up'],
  singAnyOctave: true,
  fnContext: 'cadence', // drone | tonic | VI | cadence
  fnKeyModes: ['major'],
  fnKeyChange: 'question', // question | session
  fnLabels: 'solfege', // solfege | numbers | both
  fnRange: '1',
  fnLength: '3',
  fnDegrees: [1, 2, 3, 4, 5, 6, 7],
  fnChromatic: false,
  fnResolve: true,
  fnChordDegrees: [1, 2, 4, 5, 6],
  fnBorrowed: false,
  melodicSpeed: 1.0,
  autoNext: 'always', // off | afterCorrect | always
  delayAfterCorrect: 1.0,
  delayAfterWrong: 2.5,
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Tolerant load: missing or wrong-typed keys get defaults.
const stored = load(SETTINGS_KEY, {});
export const settings = { ...DEFAULT_SETTINGS };
for (const k of Object.keys(DEFAULT_SETTINGS)) {
  const d = DEFAULT_SETTINGS[k];
  if (stored[k] !== undefined && Array.isArray(stored[k]) === Array.isArray(d) && typeof stored[k] === typeof d) {
    settings[k] = stored[k];
  }
}

export function saveSettings() { save(SETTINGS_KEY, settings); }

/** Toggle membership in an array setting; refuses to drop below `keepAtLeast`. */
export function toggleMember(key, value, on, keepAtLeast = 0) {
  const arr = settings[key];
  if (on && !arr.includes(value)) arr.push(value);
  else if (!on && arr.includes(value) && arr.length > keepAtLeast) arr.splice(arr.indexOf(value), 1);
  saveSettings();
}

/** exercise id -> item id -> { correct, total } */
export let stats = load(STATS_KEY, {});

/** seconds: time from the question starting to the answer (optional). */
export function record(kind, item, correct, seconds) {
  const byKind = (stats[kind] ??= {});
  const t = (byKind[item] ??= { correct: 0, total: 0 });
  t.total += 1;
  if (correct) t.correct += 1;
  if (Number.isFinite(seconds) && seconds > 0 && seconds < 600) {
    t.time = (t.time ?? 0) + seconds;
    t.timed = (t.timed ?? 0) + 1;
  }
  save(STATS_KEY, stats);
}

export function resetStats() {
  stats = {};
  save(STATS_KEY, stats);
}

export function exportData() {
  return JSON.stringify({ settings, stats }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (data.stats && typeof data.stats === 'object') { stats = data.stats; save(STATS_KEY, stats); }
  if (data.settings && typeof data.settings === 'object') {
    Object.assign(settings, data.settings);
    saveSettings();
  }
}

// Ask the browser not to evict our data under storage pressure.
navigator.storage?.persist?.().catch(() => {});
