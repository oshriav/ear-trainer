// Exercises: build answer options and random questions. Port of Exercises/Exercise.swift.

import {
  INTERVALS, INTERVAL_MODES, CHORDS, CHORD_MODES, INVERSION_CANDIDATES, INVERSION_NAMES,
  INVERSION_BASS, chordById, chordNotes, maxInversion,
} from './theory.js';
import { makeFunctional, functionalSummary, functionalItemLabel } from './functional.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const label = (list, id) => list.find((m) => m.id === id)?.label ?? id;

export const KIND_GROUPS = ['Intervals', 'Chords', 'Functional'];

/** title: full name (nav, stats); short: row label on home, under its group. */
export const KINDS = [
  { id: 'intervals', group: 'Intervals', short: 'Recognize', title: 'Recognize intervals', icon: '↕' },
  { id: 'sing', group: 'Intervals', short: 'Sing', title: 'Sing intervals', icon: '🎤' },
  { id: 'chords', group: 'Chords', short: 'Quality', title: 'Chord quality', icon: '🎹' },
  { id: 'inversions', group: 'Chords', short: 'Inversions', title: 'Chord inversions', icon: '⟲' },
  { id: 'degrees', group: 'Functional', short: 'Scale degrees', title: 'Scale degrees', icon: '🎯' },
  { id: 'dictation', group: 'Functional', short: 'Melodic dictation', title: 'Melodic dictation', icon: '🎼' },
  { id: 'functions', group: 'Functional', short: 'Chord function', title: 'Chord function', icon: '🏠' },
];

export function summary(kind, s) {
  const modes = (list, ids) => list.filter((m) => ids.includes(m.id)).map((m) => m.label).join(', ');
  switch (kind) {
    case 'intervals':
      return `${s.intervals.length} intervals · ${modes(INTERVAL_MODES, s.intervalModes)}`;
    case 'chords':
      return `${s.chords.length} chords · ${modes(CHORD_MODES, s.chordModes)}`
        + (s.chordInversions ? ' · inversions' : '');
    case 'inversions':
      return `${s.inversions.length} inversions · ${s.inversionChords.length} chords · `
        + modes(CHORD_MODES, s.inversionModes);
    case 'sing':
      return `${s.singIntervals.length} intervals · `
        + s.singDirections.map((d) => (d === 'up' ? '↑' : '↓')).join('') + (s.singAnyOctave ? ' · any octave' : '');
    default: return functionalSummary(kind, s);
  }
}

export function itemLabel(kind, id, s) {
  switch (kind) {
    case 'intervals': case 'sing': return INTERVALS[Number(id)]?.name ?? id;
    case 'chords': return chordById(id)?.name ?? id;
    case 'inversions': return INVERSION_NAMES[Number(id)] ?? id;
    default: return functionalItemLabel(kind, id, s);
  }
}

function chordEvents(notes, mode, speed) {
  if (mode === 'block') return notes.map((midi) => ({ midi, start: 0, duration: 2.0 }));
  const step = 0.35 / speed;
  const end = notes.length * step + 1.2;
  return notes.map((midi, i) => ({ midi, start: i * step, duration: end - i * step }));
}

/** Returns { prompt, options: [{id,title,subtitle}], makeQuestion() }.
 *  A question is { answerID, caption, events, render(optionId) -> events }. */
export function makeExercise(kind, s) {
  const speed = s.melodicSpeed;
  if (['degrees', 'dictation', 'functions'].includes(kind)) return makeFunctional(kind, s);
  switch (kind) {
    case 'intervals': {
      const intervals = INTERVALS.filter((i) => s.intervals.includes(i.id));
      const modes = INTERVAL_MODES.filter((m) => s.intervalModes.includes(m.id)).map((m) => m.id);
      return {
        prompt: 'Which interval?',
        options: intervals.map((i) => ({ id: String(i.id), title: i.name, subtitle: i.short })),
        makeQuestion() {
          const interval = pick(intervals) ?? INTERVALS[12];
          const mode = pick(modes) ?? 'ascending';
          const maxSpan = intervals.length ? Math.max(...intervals.map((i) => i.semitones)) : 12;
          const low = 48, high = 79; // C3 ... G5
          const ref = mode === 'descending' ? randInt(low + maxSpan, high) : randInt(low, high - maxSpan);
          const events = (semi) => {
            switch (mode) {
              case 'ascending':
                return [{ midi: ref, start: 0, duration: 0.9 / speed },
                  { midi: ref + semi, start: 1.0 / speed, duration: 1.2 }];
              case 'descending':
                return [{ midi: ref, start: 0, duration: 0.9 / speed },
                  { midi: ref - semi, start: 1.0 / speed, duration: 1.2 }];
              default:
                return [{ midi: ref, start: 0, duration: 1.8 }, { midi: ref + semi, start: 0, duration: 1.8 }];
            }
          };
          return {
            answerID: String(interval.id), caption: label(INTERVAL_MODES, mode),
            events: events(interval.semitones), render: (id) => events(Number(id) || 0),
          };
        },
      };
    }
    case 'chords': {
      const chords = CHORDS.filter((ch) => s.chords.includes(ch.id));
      const modes = CHORD_MODES.filter((m) => s.chordModes.includes(m.id)).map((m) => m.id);
      return {
        prompt: 'Which chord?',
        options: chords.map((ch) => ({ id: ch.id, title: ch.name, subtitle: ch.symbol })),
        makeQuestion() {
          const chord = pick(chords) ?? CHORDS[0];
          const mode = pick(modes) ?? 'block';
          const root = randInt(48, 59); // C3 ... B3
          const inversion = s.chordInversions ? randInt(0, maxInversion(chord)) : 0;
          const events = (type) => chordEvents(chordNotes(type, root, inversion), mode, speed);
          let caption = label(CHORD_MODES, mode);
          if (inversion > 0) caption += ` · inversion ${inversion}`;
          return {
            answerID: chord.id, caption, events: events(chord),
            render: (id) => { const t = chordById(id); return t ? events(t) : []; },
          };
        },
      };
    }
    case 'inversions': {
      const chords = INVERSION_CANDIDATES.filter((ch) => s.inversionChords.includes(ch.id));
      const inversions = [...s.inversions].sort((a, b) => a - b);
      const modes = CHORD_MODES.filter((m) => s.inversionModes.includes(m.id)).map((m) => m.id);
      return {
        prompt: 'Which inversion?',
        options: inversions.map((i) => ({ id: String(i), title: INVERSION_NAMES[i], subtitle: INVERSION_BASS[i] })),
        makeQuestion() {
          // Pick the inversion first, then a chord that has it (3rd inversion needs a 4-note chord).
          const playable = inversions.filter((inv) => chords.some((ch) => maxInversion(ch) >= inv));
          const inversion = pick(playable) ?? 0;
          const chord = pick(chords.filter((ch) => maxInversion(ch) >= inversion)) ?? CHORDS[0];
          const mode = pick(modes) ?? 'block';
          const root = randInt(48, 57);
          const events = (inv) => chordEvents(chordNotes(chord, root, inv), mode, speed);
          return {
            answerID: String(inversion), caption: `${chord.name} · ${label(CHORD_MODES, mode)}`,
            events: events(inversion), render: (id) => events(Number(id) || 0),
          };
        },
      };
    }
  }
}
