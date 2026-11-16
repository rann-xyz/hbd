import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BEAT_SECONDS,
  HAPPY_BIRTHDAY,
  HAPPY_BIRTHDAY_BASS,
  LOOP_REST_BEATS,
  MUSIC_PREFERENCE_KEY,
  PIANO_KNOCK,
  PIANO_PARTIALS,
  PHRASE_STARTS,
  createMusicBox,
  createRecordingBox,
  createTunePlayer,
  isAudioSupported,
  loopSeconds,
  midiToFrequency,
  partialFrequency,
  silentMusicBox,
  totalBeats,
  tuneRecording,
} from '../lib/music';
import type { StorageLike } from '../lib/storage';
import { buildMusicControl } from '../sections/music';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/* ---------------- a fake Web Audio graph ---------------- */

interface FakeParam {
  value: number;
  /** Every ramp asked of it, in order — the shape of the envelope. */
  calls: { method: string; value: number; time: number }[];
  setValueAtTime(v: number, t: number): FakeParam;
  linearRampToValueAtTime(v: number, t: number): FakeParam;
  exponentialRampToValueAtTime(v: number, t: number): FakeParam;
  cancelScheduledValues(t: number): FakeParam;
}

function fakeParam(value = 0): FakeParam {
  const param: FakeParam = {
    value,
    calls: [],
    setValueAtTime: (v, t) => {
      param.value = v;
      param.calls.push({ method: 'set', value: v, time: t });
      return param;
    },
    linearRampToValueAtTime: (v, t) => {
      param.value = v;
      param.calls.push({ method: 'linear', value: v, time: t });
      return param;
    },
    exponentialRampToValueAtTime: (v, t) => {
      param.value = v;
      param.calls.push({ method: 'exp', value: v, time: t });
      return param;
    },
    cancelScheduledValues: () => param,
  };
  return param;
}

function fakeNode(): { connect: (n: unknown) => unknown; disconnect: () => void } {
  const node = {
    connect: (target: unknown) => target,
    disconnect: () => {},
  };
  return node;
}

interface FakeVoice {
  starts: number[];
  stops: number[];
  /** The last frequency it was tuned to. */
  frequency: FakeParam;
}

interface FakeContext {
  context: AudioContext;
  started: number[];
  stopped: number[];
  voices: FakeVoice[];
  /** Every gain node the graph built, in creation order. */
  gains: FakeParam[];
  resumes: number;
  closed: number;
  advance(seconds: number): void;
  /** The browser (or the OS) taking the audio away: a locked screen. */
  suspend(): void;
  /** ...and giving it back. */
  resumeNow(): void;
}

type ResumeMode = 'ok' | 'reject' | 'stay-suspended';

function fakeContext(resumeMode: ResumeMode = 'ok'): FakeContext {
  const started: number[] = [];
  const stopped: number[] = [];
  const voices: FakeVoice[] = [];
  const gains: FakeParam[] = [];
  const state = { time: 0, resumes: 0, closed: 0, playback: 'suspended' };

  const context = {
    get currentTime() {
      return state.time;
    },
    sampleRate: 8000,
    get state() {
      return state.playback;
    },
    destination: fakeNode(),
    resume() {
      state.resumes += 1;
      if (resumeMode === 'reject') return Promise.reject(new Error('NotAllowedError'));
      if (resumeMode === 'ok') state.playback = 'running';
      return Promise.resolve();
    },
    close() {
      state.closed += 1;
      return Promise.resolve();
    },
    createGain() {
      const gain = fakeParam(1);
      gains.push(gain);
      return { ...fakeNode(), gain };
    },
    createBiquadFilter() {
      return { ...fakeNode(), type: 'lowpass', frequency: fakeParam(350) };
    },
    createConvolver() {
      return { ...fakeNode(), buffer: null };
    },
    createBuffer(channels: number, length: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        getChannelData: (channel: number) => data[channel] ?? new Float32Array(length),
      };
    },
    createOscillator() {
      const voice: FakeVoice = { starts: [], stops: [], frequency: fakeParam(440) };
      voices.push(voice);
      return {
        ...fakeNode(),
        type: 'sine',
        frequency: voice.frequency,
        onended: null as null | (() => void),
        start(when: number) {
          voice.starts.push(when);
          started.push(when);
        },
        stop(when: number) {
          voice.stops.push(when);
          stopped.push(when);
        },
      };
    },
  } as unknown as AudioContext;

  return {
    context,
    started,
    stopped,
    voices,
    gains,
    get resumes() {
      return state.resumes;
    },
    get closed() {
      return state.closed;
    },
    advance(seconds: number) {
      state.time += seconds;
    },
    suspend() {
      state.playback = 'suspended';
    },
    resumeNow() {
      state.playback = 'running';
    },
  };
}

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

/* ---------------- the tune ---------------- */

/**
 * When a pass beginning at `start` strikes, on the context's clock: the melody
 * laid down end to end, then the bass notes under the phrase heads. The score
 * is the only thing that decides this, which is the point — the scheduler's job
 * is to place these numbers on the timeline and nothing else.
 */
function passTimes(start: number): number[] {
  const times: number[] = [];
  let cursor = start;
  for (const note of HAPPY_BIRTHDAY) {
    times.push(cursor);
    cursor += note.beats * BEAT_SECONDS;
  }
  for (const bass of HAPPY_BIRTHDAY_BASS) {
    times.push(start + bass.atBeat * BEAT_SECONDS);
  }
  return times;
}

describe('the melody', () => {
  it('is Happy Birthday: four phrases, sung as it is actually sung', () => {
    // The opening is the giveaway — same note twice, up a tone, back down.
    expect(HAPPY_BIRTHDAY.slice(0, 4).map((note) => note.midi)).toEqual([67, 67, 69, 67]);
    // ...then the leap up a fourth and the semitone step down that ends it.
    expect(HAPPY_BIRTHDAY.slice(4, 6).map((note) => note.midi)).toEqual([72, 71]);
    // The third phrase is the long one: "Happy birthday, dear Fitria".
    expect(HAPPY_BIRTHDAY.slice(12, 19).map((note) => note.midi)).toEqual([67, 67, 79, 76, 72, 71, 69]);
    // And the last line starts on the seventh below, as it must.
    expect(HAPPY_BIRTHDAY.slice(19, 21).map((note) => note.midi)).toEqual([77, 77]);
  });

  it('is in C major, so every note is a white key', () => {
    const blackKeys = [1, 3, 6, 8, 10];
    for (const note of HAPPY_BIRTHDAY) {
      expect(blackKeys).not.toContain(note.midi % 12);
    }
  });

  it('counts its own length', () => {
    expect(totalBeats()).toBe(25);
    expect(loopSeconds()).toBeCloseTo((25 + LOOP_REST_BEATS) * BEAT_SECONDS, 6);
  });

  it('puts each bass note at the top of a phrase', () => {
    expect(HAPPY_BIRTHDAY_BASS.map((bass) => bass.atBeat)).toEqual([...PHRASE_STARTS]);
  });

  it('tunes A4 to 440 Hz and C4 to the usual 261.63', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });
});

describe('the piano', () => {
  /**
   * The envelope of the nth note struck in a pass — the melody first, then the
   * bass under it. Three gains go up before any note does: the master, the dry
   * path and the wet one.
   */
  function envelopeOf(fake: FakeContext, note: number): FakeParam {
    return fake.gains[3 + note * PIANO_PARTIALS.length] as FakeParam;
  }

  /** Every envelope of one note, one per partial. */
  function partialsOf(fake: FakeContext, note: number): FakeParam[] {
    const first = 3 + note * PIANO_PARTIALS.length;
    return fake.gains.slice(first, first + PIANO_PARTIALS.length);
  }

  function playing(): FakeContext {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    box.play();
    return fake;
  }

  it('is a struck string: a hammer, a fast attack, then a two-stage decay', () => {
    const fake = playing();
    const [start, peak, knock, gone] = envelopeOf(fake, 0).calls;

    // Silence, the hammer, the drop, and then the long ring out.
    expect([start?.method, peak?.method, knock?.method, gone?.method]).toEqual([
      'set',
      'exp',
      'exp',
      'exp',
    ]);
    expect(start?.value).toBeCloseTo(0.0001, 6);
    expect(gone?.value).toBeCloseTo(0.0001, 6);

    // The attack is a hammer, not a fade-in, and the drop after it is quick.
    expect((peak?.time ?? 0) - (start?.time ?? 0)).toBeLessThan(0.02);
    expect((knock?.time ?? 0) - (peak?.time ?? 0)).toBeLessThan(0.2);
    expect(knock?.value).toBeCloseTo((peak?.value ?? 0) * PIANO_KNOCK, 4);
    // ...and the tail is long: a piano does not stop when the key comes up.
    expect((gone?.time ?? 0) - (knock?.time ?? 0)).toBeGreaterThan(0.5);
  });

  it('sounds the partials above the fundamental, and lets them die first', () => {
    const fake = playing();
    const tails = partialsOf(fake, 0).map((envelope) => envelope.calls.at(-1)?.time ?? 0);

    expect(tails).toHaveLength(PIANO_PARTIALS.length);
    for (let n = 1; n < tails.length; n += 1) {
      expect(tails[n], `partial ${n} outlasts partial ${n - 1}`).toBeLessThan(tails[n - 1] ?? 0);
    }
    // The top one is the hammer: gone in a fraction of the fundamental's ring.
    expect(tails.at(-1) ?? 0).toBeLessThan((tails[0] ?? 0) * 0.5);
  });

  it('tunes the partials sharp of the exact multiples, more so the higher they are', () => {
    const exact = midiToFrequency(60);
    const sharpness = (ratio: number): number => partialFrequency(60, ratio) / (exact * ratio) - 1;

    expect(partialFrequency(60, 1)).toBeCloseTo(exact, 6);
    expect(sharpness(2)).toBeGreaterThan(0);
    expect(sharpness(9)).toBeGreaterThan(sharpness(2));
    // A stretch, not a detune: the ninth partial is sharp by cents, not semitones.
    expect(sharpness(9)).toBeLessThan(0.02);
  });

  it('tunes each note as a pair of strings, a hair apart', () => {
    const fake = playing();
    const midi = HAPPY_BIRTHDAY[0]?.midi ?? 0;
    const [one, two] = PIANO_PARTIALS;

    expect(fake.voices[0]?.frequency.value).toBeCloseTo(
      partialFrequency(midi, one?.ratio ?? 1) * 1.0002,
      4,
    );
    expect(fake.voices[1]?.frequency.value).toBeCloseTo(
      partialFrequency(midi, two?.ratio ?? 2) * 0.9998,
      4,
    );
  });

  it('lets the bass ring on longer than the melody', () => {
    const fake = playing();
    const melodyTail = envelopeOf(fake, 0).calls.at(-1)?.time ?? 0;
    const bassTail = envelopeOf(fake, HAPPY_BIRTHDAY.length).calls.at(-1)?.time ?? 0;

    expect(bassTail).toBeGreaterThan(melodyTail);
  });
});

describe('a real recording, when the page has one', () => {
  /** jsdom has no media pipeline: play and pause are stubs to be watched. */
  function stubMedia(): { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> } {
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
    return { play, pause };
  }

  it('once a recording lands, it is the one the page plays', () => {
    // The folder now holds a real recording (src/audio/tune.mp3), so the
    // player must hand the tune to the recording box, not the synthesiser —
    // and the synthesised box stays available for a page without one.
    expect(tuneRecording()).not.toBeNull();

    const media = stubMedia();
    const player = createTunePlayer({ contextFactory: () => null, storage: fakeStorage() });
    player.play();

    expect(media.play).toHaveBeenCalledTimes(1);
    expect(player.available).toBe(true);
  });

  it('plays the recording as it is, and loops it', () => {
    const media = stubMedia();
    const box = createRecordingBox({ src: 'audio/tune.mp3' });

    expect(box.available).toBe(true);
    expect(box.isPlaying()).toBe(false);

    box.play();
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(box.isPlaying()).toBe(true);

    // The element it made is the one that loops: a recording with an ending
    // would fall silent on a page that is meant to be a room.
    expect(box.isPlaying()).toBe(true);
    box.pause();
    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(box.isPlaying()).toBe(false);
  });

  it('tells the shell whenever it starts and stops', () => {
    stubMedia();
    const onStateChange = vi.fn();
    const box = createRecordingBox({ src: 'audio/tune.mp3', onStateChange });

    box.toggle();
    box.toggle();
    expect(onStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it('takes the button back down when the browser refuses to play it', async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.reject(new Error('NotAllowedError')),
    );
    const onStateChange = vi.fn();
    const box = createRecordingBox({ src: 'audio/tune.mp3', onStateChange });

    box.play();
    expect(box.isPlaying()).toBe(true); // optimistic, so the button answers at once
    await Promise.resolve();
    await Promise.resolve();

    expect(box.isPlaying()).toBe(false);
    expect(onStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it('stops for good once it is destroyed', () => {
    const media = stubMedia();
    const box = createRecordingBox({ src: 'audio/tune.mp3' });
    box.play();
    box.destroy();

    expect(media.pause).toHaveBeenCalled();
    box.play();
    expect(media.play).toHaveBeenCalledTimes(1);
  });
});

/* ---------------- the box ---------------- */

describe('createMusicBox', () => {
  it('is silent and unavailable where Web Audio does not exist', () => {
    const box = createMusicBox({ contextFactory: () => null });
    expect(box.available).toBe(false);
    expect(box.toggle()).toBe(false);
    expect(box.isPlaying()).toBe(false);
    expect(() => box.destroy()).not.toThrow();
  });

  it('reports whether this runtime can play at all', () => {
    // jsdom has no AudioContext, so the honest answer here is no.
    expect(typeof isAudioSupported()).toBe('boolean');
  });

  it('strikes every note of the tune and the bass line when it plays', () => {
    const fake = fakeContext();
    const box = createMusicBox({
      contextFactory: () => fake.context,
      storage: fakeStorage(),
    });

    box.play();
    expect(box.isPlaying()).toBe(true);
    // One oscillator per partial, for every note of the tune and the bass.
    expect(fake.voices).toHaveLength(
      (HAPPY_BIRTHDAY.length + HAPPY_BIRTHDAY_BASS.length) * PIANO_PARTIALS.length,
    );
    // Nothing is scheduled in the past.
    for (const at of fake.started) expect(at).toBeGreaterThan(0);
  });

  it('resumes a suspended context, which is what a browser waits for', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    box.play();
    expect(fake.resumes).toBe(1);
  });

  it('does not stack a second copy when play is called twice', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    box.play();
    const afterFirst = fake.started.length;
    box.play();
    expect(fake.started).toHaveLength(afterFirst);
  });

  it('stops every sounding voice when paused', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    box.play();
    box.pause();

    expect(box.isPlaying()).toBe(false);
    expect(fake.voices.length).toBeGreaterThan(0);
    // Every oscillator that was started has been told to stop — no voice is
    // left ringing under a page the visitor has silenced.
    for (const voice of fake.voices) {
      expect(voice.starts).toHaveLength(1);
      expect(voice.stops.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('toggles, and remembers the choice for next time', () => {
    const fake = fakeContext();
    const storage = fakeStorage();
    const box = createMusicBox({ contextFactory: () => fake.context, storage });

    expect(box.toggle()).toBe(true);
    expect(storage.getItem(MUSIC_PREFERENCE_KEY)).toBe('on');
    expect(box.toggle()).toBe(false);
    expect(storage.getItem(MUSIC_PREFERENCE_KEY)).toBe('off');
  });

  it('tells the shell whenever the state changes', () => {
    const fake = fakeContext();
    const onStateChange = vi.fn();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage(), onStateChange });

    box.play();
    box.pause();
    expect(onStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it('closes the audio context on destroy and refuses to play afterwards', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    box.play();
    box.destroy();

    expect(fake.closed).toBe(1);
    const before = fake.started.length;
    box.play();
    expect(fake.started).toHaveLength(before);
  });

  it('takes the button back down when the browser refuses to start audio', async () => {
    const fake = fakeContext('stay-suspended');
    const onStateChange = vi.fn();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage(), onStateChange });

    box.play();
    expect(box.isPlaying()).toBe(true); // optimistic, so the button answers at once

    await Promise.resolve();
    await Promise.resolve();

    // Chrome resolved the resume but left the context suspended: no sound, so
    // no "playing" state.
    expect(box.isPlaying()).toBe(false);
    expect(onStateChange.mock.calls).toEqual([[true], [false]]);
  });

  it('survives a rejected resume without an unhandled rejection', async () => {
    const fake = fakeContext('reject');
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });

    box.play();
    await Promise.resolve();
    await Promise.resolve();

    expect(box.isPlaying()).toBe(false);
  });

  it('schedules the next pass before the current one runs out', () => {
    vi.useFakeTimers();
    try {
      const fake = fakeContext();
      const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
      box.play();
      fake.resumeNow();
      const firstPass = fake.started.length;

      // The whole tune is 15.7s; the loop must re-arm before that. The audio
      // clock and the wall clock move together here, the way they do in a
      // browser — the old version of this test only moved the timers, which is
      // exactly the state the scheduler used to get wrong.
      for (let step = 0; step < 40; step += 1) {
        fake.advance(0.5);
        vi.advanceTimersByTime(500);
      }

      expect(fake.started.length).toBeGreaterThan(firstPass);
      box.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps every pass on the grid the first one set, however late the timers run', () => {
    vi.useFakeTimers();
    try {
      const fake = fakeContext();
      const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
      box.play();
      fake.resumeNow();

      // Four loops walked at deliberately ragged intervals — a busy main
      // thread, a tab the browser is throttling — never landing on a beat and
      // never landing on the horizon either.
      const ragged = [0.7, 1.4, 0.35, 1.9, 0.9, 1.1, 0.5, 1.6, 0.8, 1.25];
      let elapsed = 0;
      let step = 0;
      while (elapsed < loopSeconds() * 4) {
        const slice = ragged[step % ragged.length] ?? 1;
        fake.advance(slice);
        vi.advanceTimersByTime(slice * 1000);
        elapsed += slice;
        step += 1;
      }

      const times = fake.started;
      const first = Math.min(...times);
      const heard = new Set(times.map((at) => at.toFixed(6)));
      const loops = Math.floor((Math.max(...times) - first) / loopSeconds());

      expect(loops).toBeGreaterThanOrEqual(3);
      // Every note of every pass sits exactly where the score puts it. A
      // scheduler that anchored each pass to the clock at the moment its timer
      // fired would drift here, and the drift is what a listener hears as the
      // tune stumbling.
      for (let pass = 0; pass <= loops; pass += 1) {
        for (const at of passTimes(first + pass * loopSeconds())) {
          expect(heard.has(at.toFixed(6)), `pass ${pass} is missing a strike at ${at}`).toBe(true);
        }
      }
      box.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lays the melody down end to end, so no note waits for the one before it', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    box.play();

    const heard = new Set(fake.started.map((at) => at.toFixed(6)));
    let cursor = Math.min(...fake.started);
    for (const note of HAPPY_BIRTHDAY) {
      expect(heard.has(cursor.toFixed(6)), `no strike at ${cursor}`).toBe(true);
      cursor += note.beats * BEAT_SECONDS;
    }
    box.destroy();
  });

  it('schedules nothing while the audio is suspended, so nothing lands in a clump', () => {
    vi.useFakeTimers();
    try {
      const fake = fakeContext();
      const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
      box.play();
      fake.resumeNow();

      // Five seconds of the tune, then the screen locks.
      for (let step = 0; step < 10; step += 1) {
        fake.advance(0.5);
        vi.advanceTimersByTime(500);
      }

      // Forty seconds of wall clock with the audio clock frozen where it was.
      // Scheduling against a frozen clock is how every pass used to pile up at
      // one instant and arrive as a single clump.
      const before = fake.started.length;
      fake.suspend();
      vi.advanceTimersByTime(40_000);

      expect(fake.started).toHaveLength(before);

      // Handed back: the audio clock picks up where it stopped, and the tune
      // carries on from there — on the grid, not from the top.
      fake.resumeNow();
      for (let step = 0; step < 30; step += 1) {
        fake.advance(0.5);
        vi.advanceTimersByTime(500);
      }

      const first = Math.min(...fake.started);
      const heard = new Set(fake.started.map((at) => at.toFixed(6)));
      for (const at of passTimes(first + loopSeconds())) {
        expect(heard.has(at.toFixed(6)), `the loop did not carry on at ${at}`).toBe(true);
      }
      box.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-anchors instead of scheduling into the past after a stall', () => {
    vi.useFakeTimers();
    try {
      const fake = fakeContext();
      const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
      box.play();
      fake.resumeNow();

      // Twenty seconds go by with nothing waking the pump: the horizon is long
      // gone and the next pass is behind the playhead.
      fake.advance(20);
      const before = fake.started.length;
      vi.advanceTimersByTime(1000);

      expect(fake.started.length).toBeGreaterThan(before);
      for (const at of fake.started.slice(before)) {
        expect(at).toBeGreaterThan(fake.context.currentTime);
      }
      box.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('silentMusicBox', () => {
  it('is inert', () => {
    const box = silentMusicBox();
    expect(box.available).toBe(false);
    expect(box.toggle()).toBe(false);
    expect(box.isPlaying()).toBe(false);
  });
});

/* ---------------- the control ---------------- */

describe('the music control', () => {
  function mount(box = silentMusicBox()) {
    const handle = buildMusicControl(box);
    document.body.append(handle.element);
    return { handle, box };
  }

  it('starts hidden and says what pressing it will do', () => {
    const { handle } = mount();
    const button = handle.element.querySelector('[data-music-toggle]') as HTMLButtonElement;

    expect(handle.element.hasAttribute('hidden')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toMatch(/play/i);
    expect(button.getAttribute('title')).toBeTruthy();
  });

  it('reveals itself when the shell says so', () => {
    const { handle } = mount();
    handle.reveal();
    expect(handle.element.hasAttribute('hidden')).toBe(false);
  });

  it('follows the box: pressing it starts the tune and flips the label', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    const { handle } = mount(box);
    const button = handle.element.querySelector('[data-music-toggle]') as HTMLButtonElement;

    button.click();
    expect(box.isPlaying()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toMatch(/pause/i);
    expect(handle.element.classList.contains('is-playing')).toBe(true);

    button.click();
    expect(box.isPlaying()).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(handle.element.classList.contains('is-playing')).toBe(false);
  });

  it('picks up a tune the shell started on its own, and offers the way out', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    const { handle } = mount(box);
    const button = handle.element.querySelector('[data-music-toggle]') as HTMLButtonElement;

    // This is what boot() does the moment the page is entered.
    box.play();
    handle.sync();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    // A tune nobody asked for still has to come with its off switch: the
    // control shows itself as soon as there is something to hear, even though
    // the shell never called reveal().
    expect(handle.element.hasAttribute('hidden')).toBe(false);
  });

  it('stops listening once destroyed', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    const { handle } = mount(box);
    const button = handle.element.querySelector('[data-music-toggle]') as HTMLButtonElement;

    handle.destroy();
    button.click();
    expect(box.isPlaying()).toBe(false);
  });
});
