// Functional ear training: scale degrees, melodic dictation and chord function, heard in a key.
// Answer ids are semitones above the tonic (degrees) or "<root semitone><quality>" (chords).

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

export const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const SOLFEGE = ['do', 'ra', 're', 'me', 'mi', 'fa', 'fi', 'sol', 'le', 'la', 'te', 'ti'];
const NUMBERS = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];

export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

export const TONIC_CONTEXTS = [
  { id: 'drone', label: 'Drone' },
  { id: 'tonic', label: 'I chord' },
  { id: 'VI', label: 'V–I' },
  { id: 'cadence', label: 'I–IV–V–I' },
];
export const KEY_MODES = [{ id: 'major', label: 'Major' }, { id: 'minor', label: 'Minor' }];
export const KEY_CHANGES = [{ id: 'question', label: 'Every question' }, { id: 'session', label: 'Per session' }];
export const LABEL_STYLES = [{ id: 'solfege', label: 'do re mi' }, { id: 'numbers', label: '1 2 3' }, { id: 'both', label: 'Both' }];
export const RANGES = [{ id: '1', label: '1 octave' }, { id: '2', label: '2 octaves' }];
export const LENGTHS = [{ id: '2', label: '2' }, { id: '3', label: '3' }, { id: '4', label: '4' }, { id: '5', label: '5' }];

/** Settings rows for scale steps 1..7 (major / minor spelling). */
export const STEP_ROWS = [1, 2, 3, 4, 5, 6, 7].map((n) => {
  const [maj, min] = [SCALES.major[n - 1], SCALES.minor[n - 1]];
  return { id: n, title: `${n}`, detail: maj === min ? SOLFEGE[maj] : `${SOLFEGE[maj]} / ${SOLFEGE[min]}` };
});

export function degreeLabel(semi, style) {
  const s = ((semi % 12) + 12) % 12;
  if (style === 'numbers') return { title: NUMBERS[s], subtitle: '' };
  if (style === 'both') return { title: SOLFEGE[s], subtitle: NUMBERS[s] };
  return { title: SOLFEGE[s], subtitle: '' };
}

// ---------- chords ----------

const QUALITY = { M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6] };
const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
// Diatonic triads per mode, by scale step. Minor uses the major V (harmonic minor), as in real cadences.
const DIATONIC_CHORDS = {
  major: ['0M', '2m', '4m', '5M', '7M', '9m', '11d'],
  minor: ['0m', '2d', '3M', '5m', '7M', '8M', '10M'],
};

const parseChord = (id) => ({ root: Number(id.slice(0, -1)), quality: id.slice(-1) });

export function chordLabel(id, style) {
  const { root, quality } = parseChord(id);
  let roman = ROMAN[root];
  if (quality !== 'M') roman = roman.toLowerCase();
  if (quality === 'd') roman += '°';
  const sol = SOLFEGE[root];
  if (style === 'solfege') return { title: roman, subtitle: sol };
  return { title: roman, subtitle: style === 'both' ? sol : '' };
}

function chordVoicing(id, tonic) {
  const { root, quality } = parseChord(id);
  // Keep the triad near the tonic: roots above fa drop an octave.
  const base = tonic + (root > 6 ? root - 12 : root);
  return [base - 12, ...QUALITY[quality].map((i) => base + i)];
}

// ---------- key context ----------

/** Events that establish the key; returns { events, end } (seconds). */
function contextEvents(kind, tonic, mode, speed, droneUntil) {
  const third = mode === 'major' ? 4 : 3, sixth = mode === 'major' ? 9 : 8;
  const I = [tonic - 12, tonic, tonic + third, tonic + 7];
  const IV = [tonic - 7, tonic, tonic + 5, tonic + sixth];
  const V = [tonic - 5, tonic - 1, tonic + 2, tonic + 7];
  const chords = { tonic: [I], VI: [V, I], cadence: [I, IV, V, I] }[kind];
  if (!chords) {
    // Drone: low tonic + fifth, re-struck so a decaying piano keeps sounding under the question.
    const events = [];
    for (let t = 0; t < droneUntil; t += 1.6) {
      for (const midi of [tonic - 24, tonic - 17]) events.push({ midi, start: t, duration: 1.8 });
    }
    return { events, end: 1.0 };
  }
  const step = 0.75 / Math.sqrt(speed);
  const events = chords.flatMap((notes, i) =>
    notes.map((midi) => ({ midi, start: i * step, duration: i === chords.length - 1 ? step * 1.4 : step * 0.95 })));
  return { events, end: chords.length * step + 0.5 };
}

/** Note path from a degree back to the nearest tonic, through the scale. */
function resolution(midi, tonic, mode) {
  const scale = SCALES[mode];
  const rel = ((midi - tonic) % 12 + 12) % 12;
  const octave = midi - rel; // tonic at or below the note
  const path = [midi];
  if (rel === 0) return path;
  if (rel >= 8) {
    for (const s of scale) if (s > rel) path.push(octave + s);
    path.push(octave + 12);
  } else {
    for (const s of [...scale].reverse()) if (s < rel) path.push(octave + s);
  }
  return path;
}

const melody = (notes, start, step, last = 1.2) =>
  notes.map((midi, i) => ({ midi, start: start + i * step, duration: i === notes.length - 1 ? last : step * 0.95 }));

// ---------- exercises ----------

function pickKey(s) {
  const modes = s.fnKeyModes.length ? s.fnKeyModes : ['major'];
  return { tonic: 55 + randInt(0, 11), mode: pick(modes) }; // G3 ... F♯4
}

const keyName = (k) => `${NOTE_NAMES[k.tonic % 12]} ${k.mode}`;

/** Semitones available as notes in `mode` with the current settings. */
function notePool(s, mode) {
  const diatonic = s.fnDegrees.map((n) => SCALES[mode][n - 1]);
  if (!s.fnChromatic) return diatonic;
  const chromatic = [...Array(12).keys()].filter((x) => !SCALES[mode].includes(x));
  return [...diatonic, ...chromatic];
}

function chordPool(s, mode) {
  const diatonic = s.fnChordDegrees.map((n) => DIATONIC_CHORDS[mode][n - 1]);
  if (!s.fnBorrowed) return diatonic;
  const other = mode === 'major' ? 'minor' : 'major';
  return [...diatonic, ...s.fnChordDegrees.map((n) => DIATONIC_CHORDS[other][n - 1])];
}

const uniq = (arr) => [...new Set(arr)];
const modesOf = (s) => (s.fnKeyModes.length ? s.fnKeyModes : ['major']);

/** Place `semi` (above tonic) in the allowed range, near `near` if given. */
function placeNote(semi, tonic, s, near) {
  const lowOct = s.fnRange === '2' ? -1 : 0;
  const options = [];
  for (let o = lowOct; o <= 0; o++) options.push(tonic + semi + 12 * o);
  if (near === undefined) return pick(options);
  return options.reduce((a, b) => (Math.abs(b - near) < Math.abs(a - near) ? b : a));
}

export function makeFunctional(kind, s) {
  const speed = s.melodicSpeed;
  const style = s.fnLabels;
  const fixedKey = s.fnKeyChange === 'session' ? pickKey(s) : null;
  const getKey = () => fixedKey ?? pickKey(s);

  if (kind === 'functions') {
    const ids = uniq(modesOf(s).flatMap((m) => chordPool(s, m)))
      .sort((a, b) => parseChord(a).root - parseChord(b).root || a.localeCompare(b));
    return {
      prompt: 'Which chord?',
      options: ids.map((id) => ({ id, ...chordLabel(id, style) })),
      makeQuestion() {
        const key = getKey();
        const pool = chordPool(s, key.mode).filter((id) => ids.includes(id));
        const id = pick(pool) ?? ids[0];
        const ctx = contextEvents(s.fnContext, key.tonic, key.mode, speed, 2.6);
        const chordEv = (cid, start) => chordVoicing(cid, key.tonic).map((midi) => ({ midi, start, duration: 1.6 }));
        const tonicId = key.mode === 'major' ? '0M' : '0m';
        return {
          answerID: id, caption: keyName(key),
          events: [...ctx.events, ...chordEv(id, ctx.end)],
          render: (cid) => chordEv(cid, 0),
          after: s.fnResolve && id !== tonicId ? [...chordEv(id, 0), ...chordEv(tonicId, 1.0)] : null,
        };
      },
    };
  }

  const ids = uniq(modesOf(s).flatMap((m) => notePool(s, m))).sort((a, b) => a - b);
  const options = ids.map((x) => ({ id: String(x), ...degreeLabel(x, style) }));

  if (kind === 'dictation') {
    const length = Number(s.fnLength) || 3;
    return {
      prompt: `Which ${length} notes?`,
      options,
      makeQuestion() {
        const key = getKey();
        const pool = notePool(s, key.mode).filter((x) => ids.includes(x));
        const semis = [];
        const notes = [];
        for (let i = 0; i < length; i++) {
          let semi = pick(pool);
          if (i > 0 && pool.length > 1 && semi === semis[i - 1]) semi = pick(pool);
          semis.push(semi);
          notes.push(placeNote(semi, key.tonic, s, notes[i - 1]));
        }
        const step = 0.7 / speed;
        const ctx = contextEvents(s.fnContext, key.tonic, key.mode, speed, 0);
        const dur = ctx.end + length * step + 1.2;
        const drone = s.fnContext === 'drone' ? contextEvents('drone', key.tonic, key.mode, speed, dur).events : ctx.events;
        const noteOf = (id) => placeNote(Number(id), key.tonic, s, notes[0]);
        return {
          answerID: semis.join(' '), parts: semis.map(String), caption: keyName(key),
          events: [...drone, ...melody(notes, ctx.end, step)],
          render: (id) => [{ midi: noteOf(id), start: 0, duration: 1.0 }],
        };
      },
    };
  }

  // degrees
  return {
    prompt: 'Which degree?',
    options,
    makeQuestion() {
      const key = getKey();
      const pool = notePool(s, key.mode).filter((x) => ids.includes(x));
      const semi = pick(pool) ?? 0;
      const midi = placeNote(semi, key.tonic, s);
      const ctx = contextEvents(s.fnContext, key.tonic, key.mode, speed, 0);
      const drone = s.fnContext === 'drone' ? contextEvents('drone', key.tonic, key.mode, speed, ctx.end + 1.4).events : ctx.events;
      const noteAt = (id) => placeNote(Number(id), key.tonic, s, midi);
      const walk = (m) => melody(resolution(m, key.tonic, key.mode), 0, 0.45 / speed, 1.0);
      return {
        answerID: String(semi), caption: keyName(key),
        events: [...drone, { midi, start: ctx.end, duration: 1.4 }],
        render: (id) => (s.fnResolve ? walk(noteAt(id)) : [{ midi: noteAt(id), start: 0, duration: 1.2 }]),
        after: s.fnResolve && semi !== 0 ? walk(midi) : null,
      };
    },
  };
}

export function functionalSummary(kind, s) {
  const ctx = TONIC_CONTEXTS.find((c) => c.id === s.fnContext)?.label ?? '';
  const modes = modesOf(s).join(' + ');
  if (kind === 'functions') return `${s.fnChordDegrees.length} chords · ${modes} · ${ctx}${s.fnBorrowed ? ' · borrowed' : ''}`;
  const n = `${s.fnDegrees.length} degrees${s.fnChromatic ? ' + chromatic' : ''}`;
  return kind === 'dictation' ? `${s.fnLength} notes · ${n} · ${modes}` : `${n} · ${modes} · ${ctx}`;
}

export function functionalItemLabel(kind, id, s) {
  if (kind === 'functions') return chordLabel(id, s.fnLabels).title;
  const l = degreeLabel(Number(id), s.fnLabels);
  return l.subtitle ? `${l.title} (${l.subtitle})` : l.title;
}
