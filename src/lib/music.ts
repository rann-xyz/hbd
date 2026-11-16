/* ============================================================
   MUSIC — "Happy Birthday to You", played on a music box.

   The tune is synthesised in the browser rather than shipped as an
   audio file: no asset to download on a phone connection, nothing to
   license (the melody has been public domain since 2016), and the
   timbre can be tuned to the page instead of the other way round.

   A music box is a struck tine, so every voice is a near-instant
   attack followed by a long exponential tail, plus the octave partial
   that makes it read as metal rather than as a sine-wave beep.
   ============================================================ */

import { resolveStorage, type StorageLike } from './storage';

export const MUSIC_PREFERENCE_KEY = 'hbd-fitria.music.v1';

/**
 * Fired by a section that wants the tune — the cake asks for it when the
 * reader presses "sing it with me". The shell owns the music box, so the
 * section asks rather than reaching for it.
 */
export const TUNE_REQUEST_EVENT = 'hbd:tune-request';

/** Seconds per beat. A music box is unhurried; this is roughly 103 bpm. */
export const BEAT_SECONDS = 0.58;

export interface MelodyNote {
  /** MIDI note number — 60 is middle C. */
  readonly midi: number;
  /** Length in beats. */
  readonly beats: number;
}

/**
 * Happy Birthday in C, as it is actually sung: a two-note pickup into each
 * phrase, then the long "you" that lets the box ring.
 */
export const HAPPY_BIRTHDAY: readonly MelodyNote[] = [
  // Happy birthday to you
  { midi: 67, beats: 0.5 },
  { midi: 67, beats: 0.5 },
  { midi: 69, beats: 1 },
  { midi: 67, beats: 1 },
  { midi: 72, beats: 1 },
  { midi: 71, beats: 2 },
  // Happy birthday to you
  { midi: 67, beats: 0.5 },
  { midi: 67, beats: 0.5 },
  { midi: 69, beats: 1 },
  { midi: 67, beats: 1 },
  { midi: 74, beats: 1 },
  { midi: 72, beats: 2 },
  // Happy birthday, dear Fitria
  { midi: 67, beats: 0.5 },
  { midi: 67, beats: 0.5 },
  { midi: 79, beats: 1 },
  { midi: 76, beats: 1 },
  { midi: 72, beats: 1 },
  { midi: 71, beats: 1 },
  { midi: 69, beats: 2 },
  // Happy birthday to you
  { midi: 77, beats: 0.5 },
  { midi: 77, beats: 0.5 },
  { midi: 76, beats: 1 },
  { midi: 72, beats: 1 },
  { midi: 74, beats: 1 },
  { midi: 72, beats: 2 },
];

export interface BassNote {
  /** MIDI note number. */
  readonly midi: number;
  /** Where it lands, counted in beats from the top of the tune. */
  readonly atBeat: number;
}

/** One root note under each phrase — enough to hold the tune up, no more. */
export const HAPPY_BIRTHDAY_BASS: readonly BassNote[] = [
  { midi: 48, atBeat: 0 }, // C3
  { midi: 43, atBeat: 6 }, // G2
  { midi: 48, atBeat: 12 }, // C3
  { midi: 41, atBeat: 19 }, // F2
];

/** Silence between repeats, in beats. */
export const LOOP_REST_BEATS = 2;

/**
 * How often the heartbeat wakes, in milliseconds. It is a poll, not a
 * deadline: the grid decides when a pass begins, so a late tick costs
 * nothing but a late tick — and a steady cadence is what lets the box
 * notice that the audio has been handed back.
 */
export const PUMP_INTERVAL_MS = 250;

/** How far ahead of the playhead a pass is laid down, in seconds. */
export const LOOKAHEAD_SECONDS = 0.4;

/**
 * How late the heartbeat may be before the grid is abandoned, in seconds. A
 * background tab clamps its timers to about a second, so a tick can arrive well
 * after the moment it was asked for; the pass it was meant to place is still
 * worth placing, a hair late, because the alternative is a loop that shifts
 * every time the phone looks away. Past this, the tune has genuinely stalled.
 */
export const LATE_TOLERANCE_SECONDS = 1.2;

/** The lead the very first pass gets, so its first strike is never in the past. */
const FIRST_LEAD_SECONDS = 0.12;

/** The lead a pass gets when the grid has to be re-anchored after a stall. */
const RESTART_LEAD_SECONDS = 0.08;

/** Where each of the four phrases begins, in beats from the top. */
export const PHRASE_STARTS: readonly number[] = [0, 6, 12, 19];

export function totalBeats(): number {
  return HAPPY_BIRTHDAY.reduce((sum, note) => sum + note.beats, 0);
}

/** How long one pass of the tune lasts, rest included, in seconds. */
export function loopSeconds(): number {
  return (totalBeats() + LOOP_REST_BEATS) * BEAT_SECONDS;
}

/** Equal temperament, A4 = 440 Hz. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ------------------------------------------------------------------ */

type AudioContextCtor = new () => AudioContext;

function findAudioContext(): AudioContextCtor | null {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export function isAudioSupported(): boolean {
  return findAudioContext() !== null;
}

export interface MusicBox {
  /** False when the runtime has no Web Audio at all — the UI hides itself. */
  readonly available: boolean;
  isPlaying(): boolean;
  /** Starts (or restarts) the tune. Safe to call repeatedly. */
  play(): void;
  pause(): void;
  /** Flips the state and returns the new one. */
  toggle(): boolean;
  destroy(): void;
}

export interface MusicBoxOptions {
  /** Injected by tests; defaults to the real Web Audio API. */
  readonly contextFactory?: () => AudioContext | null;
  readonly storage?: StorageLike;
  /** Called whenever playback starts or stops, so the button can follow. */
  readonly onStateChange?: (playing: boolean) => void;
  /** Set false to ignore the stored preference (used by tests). */
  readonly rememberPreference?: boolean;
}

/**
 * A short noise tail: enough to sound like a room, not like a cathedral.
 */
function buildRoomImpulse(context: AudioContext, seconds = 1.6, decay = 2.6): AudioBuffer {
  const rate = context.sampleRate || 44100;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = context.createBuffer(2, length, rate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
    }
  }

  return impulse;
}

/** Nothing to hear and nothing to click: the control hides itself. */
export function silentMusicBox(): MusicBox {
  return {
    available: false,
    isPlaying: () => false,
    play: () => {},
    pause: () => {},
    toggle: () => false,
    destroy: () => {},
  };
}

export function createMusicBox(options: MusicBoxOptions = {}): MusicBox {
  const rememberPreference = options.rememberPreference ?? true;
  const storage = options.storage ?? (rememberPreference ? resolveStorage() : null);

  // A runtime with no Web Audio gets no control at all, rather than a button
  // that looks alive and does nothing. With the real API that is a feature
  // test — never a speculative AudioContext, which browsers ration. An
  // injected factory is asked once, and a null answer means silence.
  let context: AudioContext | null = null;
  if (options.contextFactory) {
    context = options.contextFactory();
    if (!context) return silentMusicBox();
  } else if (!isAudioSupported()) {
    return silentMusicBox();
  }

  let master: GainNode | null = null;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  /** Where the current grid's first pass begins, on the audio clock. */
  let gridStart = 0;
  /** Which pass of that grid is next to be laid down. */
  let passIndex = 0;
  const sounding = new Set<OscillatorNode>();

  function persist(playingNow: boolean): void {
    if (!storage) return;
    try {
      storage.setItem(MUSIC_PREFERENCE_KEY, playingNow ? 'on' : 'off');
    } catch {
      // A browser refusing storage must not stop the music.
    }
  }

  function build(): boolean {
    if (master) return true;

    if (!context) {
      const Ctor = findAudioContext();
      if (!Ctor) return false;
      try {
        context = new Ctor();
      } catch {
        return false;
      }
    }

    master = context.createGain();
    master.gain.value = 0;

    // Roll the very top off: a real music box has no brittle high end.
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;

    const dry = context.createGain();
    dry.gain.value = 0.85;

    const wet = context.createGain();
    wet.gain.value = 0.26;

    const room = context.createConvolver();
    room.buffer = buildRoomImpulse(context);

    master.connect(tone);
    tone.connect(dry);
    dry.connect(context.destination);
    tone.connect(room);
    room.connect(wet);
    wet.connect(context.destination);

    return true;
  }

  /** One struck tine. */
  function strike(midi: number, at: number, seconds: number, level: number): void {
    if (!context || !master) return;

    const frequency = midiToFrequency(midi);
    const envelope = context.createGain();
    envelope.connect(master);

    const tail = Math.max(0.9, seconds * 1.7);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + tail);

    const fundamental = context.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(frequency, at);
    fundamental.connect(envelope);

    // The octave partial decays faster than the fundamental, the way metal does.
    const shimmer = context.createGain();
    shimmer.gain.setValueAtTime(0.18, at);
    shimmer.gain.exponentialRampToValueAtTime(0.0001, at + tail * 0.55);

    const partial = context.createOscillator();
    partial.type = 'sine';
    partial.frequency.setValueAtTime(frequency * 2, at);
    partial.connect(shimmer);
    shimmer.connect(envelope);

    sounding.add(fundamental);
    sounding.add(partial);

    fundamental.onended = (): void => {
      sounding.delete(fundamental);
      sounding.delete(partial);
      fundamental.disconnect();
      partial.disconnect();
      shimmer.disconnect();
      envelope.disconnect();
    };

    fundamental.start(at);
    fundamental.stop(at + tail + 0.05);
    partial.start(at);
    partial.stop(at + tail * 0.55 + 0.05);
  }

  function schedulePass(startAt: number): void {
    if (!context) return;

    let cursor = startAt;
    for (const note of HAPPY_BIRTHDAY) {
      strike(note.midi, cursor, note.beats * BEAT_SECONDS, 0.42);
      cursor += note.beats * BEAT_SECONDS;
    }

    for (const bass of HAPPY_BIRTHDAY_BASS) {
      strike(bass.midi, startAt + bass.atBeat * BEAT_SECONDS, 2 * BEAT_SECONDS, 0.16);
    }
  }

  function armPump(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(pump, PUMP_INTERVAL_MS);
  }

  /**
   * The heartbeat. Every pass begins where the grid says it does — the first
   * pass's start plus a whole number of loops — and never where the clock
   * happened to be when a timer fired. That is the whole difference between a
   * tune that loops and a tune that stumbles a little further behind itself
   * with every repeat.
   *
   * Two states it refuses to schedule in. A suspended context has a frozen
   * clock, so laying passes down against it piles them all at the same instant
   * and hands them back as one clump; it waits instead, and picks the grid up
   * when the audio returns. And a grid that has fallen behind the playhead — a
   * throttled tab, a screen that stayed locked for a minute — is re-anchored
   * rather than scheduled into the past.
   *
   * It does not try to resume the context itself: a resume from a timer is not
   * a gesture, and a box that keeps asking would fight the browser that took
   * the audio away on purpose.
   */
  function pump(): void {
    timer = null;
    if (destroyed || !playing || !context) return;

    if (context.state !== 'running') {
      armPump();
      return;
    }

    const now = context.currentTime;
    let next = gridStart + passIndex * loopSeconds();

    // Only a pass the playhead has left properly behind is re-anchored: one
    // that is merely a tick late is still on the grid, and moving it would be
    // the drift this whole function exists to prevent.
    if (now - next > LATE_TOLERANCE_SECONDS) {
      gridStart = now + RESTART_LEAD_SECONDS;
      passIndex = 0;
      next = gridStart;
    }

    if (next - now > LOOKAHEAD_SECONDS) {
      armPump();
      return;
    }

    schedulePass(next);
    passIndex += 1;
    armPump();
  }

  function play(): void {
    if (destroyed || playing) return;
    if (!build() || !context || !master) return;

    const target = context;
    playing = true;

    // Everything is scheduled against currentTime, which does not advance
    // while the context is suspended — so scheduling first is safe, and the
    // tune begins the moment the browser lets it. The grid is set here once,
    // and every later pass is placed relative to it.
    const now = target.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(0.9, now + 1.1);

    gridStart = now + FIRST_LEAD_SECONDS;
    passIndex = 1;
    schedulePass(gridStart);
    armPump();
    persist(true);
    options.onStateChange?.(true);

    // A context created before any gesture starts suspended. This call sits
    // inside the click that opened the surprise, which is what the browser is
    // waiting for — but if it still refuses, take the button back down rather
    // than leave it claiming to play.
    if (target.state === 'suspended') {
      void target
        .resume()
        .then(() => {
          if (target.state !== 'running') pause();
        })
        .catch(() => pause());
    }
  }

  function pause(): void {
    if (!playing) return;
    playing = false;

    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    if (context && master) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.35);

      // Let the tail ring out before tearing the voices down.
      for (const voice of sounding) {
        try {
          voice.stop(now + 0.4);
        } catch {
          // Already stopped — nothing to do.
        }
      }
    }

    persist(false);
    options.onStateChange?.(false);
  }

  return {
    available: true,
    isPlaying: () => playing,
    play,
    pause,
    toggle(): boolean {
      if (playing) {
        pause();
        return false;
      }
      play();
      return playing;
    },
    destroy(): void {
      destroyed = true;
      pause();
      sounding.clear();
      if (context && typeof context.close === 'function') void context.close();
      context = null;
      master = null;
    },
  };
}
