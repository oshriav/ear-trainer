// Music theory data: intervals, chords, modes. Port of Music/Theory.swift.

export const frequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export const INSTRUMENTS = [
  { id: 'piano', label: 'Piano' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'synth', label: 'Synth' },
];

const INTERVAL_NAMES = [
  'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Tritone',
  'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave',
  'Minor 9th', 'Major 9th', 'Minor 10th', 'Major 10th', 'Perfect 11th', 'Aug. 11th', 'Perfect 12th',
];
const INTERVAL_SHORTS = [
  'P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8',
  'm9', 'M9', 'm10', 'M10', 'P11', 'A11', 'P12',
];

/** semitones is the id. */
export const INTERVALS = INTERVAL_NAMES.map((name, i) => ({
  id: i, semitones: i, name, short: INTERVAL_SHORTS[i], compound: i > 12,
}));

export const INTERVAL_MODES = [
  { id: 'ascending', label: 'Melodic ↑' },
  { id: 'descending', label: 'Melodic ↓' },
  { id: 'harmonic', label: 'Harmonic' },
];

export const CHORD_GROUPS = ['Triads', 'Seventh chords', 'Other chords'];

const c = (id, name, symbol, intervals, group) => ({ id, name, symbol, intervals, group });
export const CHORDS = [
  c('maj', 'Major', 'maj', [0, 4, 7], 'Triads'),
  c('min', 'Minor', 'm', [0, 3, 7], 'Triads'),
  c('dim', 'Diminished', '°', [0, 3, 6], 'Triads'),
  c('aug', 'Augmented', '+', [0, 4, 8], 'Triads'),
  c('sus2', 'Sus 2', 'sus2', [0, 2, 7], 'Triads'),
  c('sus4', 'Sus 4', 'sus4', [0, 5, 7], 'Triads'),
  c('maj7', 'Major 7', 'maj7', [0, 4, 7, 11], 'Seventh chords'),
  c('7', 'Dominant 7', '7', [0, 4, 7, 10], 'Seventh chords'),
  c('m7', 'Minor 7', 'm7', [0, 3, 7, 10], 'Seventh chords'),
  c('m7b5', 'Half-dim 7', 'ø7', [0, 3, 6, 10], 'Seventh chords'),
  c('dim7', 'Diminished 7', '°7', [0, 3, 6, 9], 'Seventh chords'),
  c('mMaj7', 'Minor-major 7', 'm(maj7)', [0, 3, 7, 11], 'Seventh chords'),
  c('aug7', 'Augmented 7', '+7', [0, 4, 8, 10], 'Seventh chords'),
  c('augMaj7', 'Aug. major 7', '+maj7', [0, 4, 8, 11], 'Seventh chords'),
  c('7sus4', '7 sus 4', '7sus4', [0, 5, 7, 10], 'Seventh chords'),
  c('6', 'Major 6', '6', [0, 4, 7, 9], 'Other chords'),
  c('m6', 'Minor 6', 'm6', [0, 3, 7, 9], 'Other chords'),
  c('add9', 'Add 9', 'add9', [0, 4, 7, 14], 'Other chords'),
  c('madd9', 'Minor add 9', 'm(add9)', [0, 3, 7, 14], 'Other chords'),
  c('69', '6/9', '6/9', [0, 4, 7, 9, 14], 'Other chords'),
  c('9', 'Dominant 9', '9', [0, 4, 7, 10, 14], 'Other chords'),
  c('maj9', 'Major 9', 'maj9', [0, 4, 7, 11, 14], 'Other chords'),
  c('m9', 'Minor 9', 'm9', [0, 3, 7, 10, 14], 'Other chords'),
  c('7b9', '7 flat 9', '7♭9', [0, 4, 7, 10, 13], 'Other chords'),
  c('7#9', '7 sharp 9', '7♯9', [0, 4, 7, 10, 15], 'Other chords'),
];

export const chordById = (id) => CHORDS.find((ch) => ch.id === id);

/** Chords whose inversions are unambiguous: triads and four-note chords. */
export const INVERSION_CANDIDATES = CHORDS.filter((ch) => ch.intervals.length <= 4);

export const maxInversion = (chord) => Math.min(chord.intervals.length - 1, 3);

/** MIDI notes for `chord` on `root`, with the lowest `inversion` notes raised an octave. */
export function chordNotes(chord, root, inversion) {
  const notes = chord.intervals.map((i) => root + i).sort((a, b) => a - b);
  for (let k = 0; k < Math.min(inversion, maxInversion(chord)); k++) {
    notes[0] += 12;
    notes.sort((a, b) => a - b);
  }
  return notes;
}

export const CHORD_MODES = [
  { id: 'block', label: 'Block' },
  { id: 'arpeggio', label: 'Arpeggio ↑' },
];

export const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion'];
export const INVERSION_BASS = ['root in bass', '3rd in bass', '5th in bass', '7th in bass'];
