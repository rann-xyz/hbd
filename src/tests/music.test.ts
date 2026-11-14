import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BEAT_SECONDS,
  HAPPY_BIRTHDAY,
  HAPPY_BIRTHDAY_BASS,
  LOOP_REST_BEATS,
  MUSIC_PREFERENCE_KEY,
  PHRASE_STARTS,
  createMusicBox,
  isAudioSupported,
  loopSeconds,
  midiToFrequency,
  shouldAutoStart,
  silentMusicBox,
  totalBeats,
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
  setValueAtTime(v: number, t: number): FakeParam;
  linearRampToValueAtTime(v: number, t: number): FakeParam;
  exponentialRampToValueAtTime(v: number, t: number): FakeParam;
  cancelScheduledValues(t: number): FakeParam;
}

function fakeParam(value = 0): FakeParam {
  const param: FakeParam = {
    value,
    setValueAtTime: (v) => {
      param.value = v;
      return param;
    },
    linearRampToValueAtTime: (v) => {
      param.value = v;
      return param;
    },
    exponentialRampToValueAtTime: (v) => {
      param.value = v;
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
}

interface FakeContext {
  context: AudioContext;
  started: number[];
  stopped: number[];
  voices: FakeVoice[];
  resumes: number;
  closed: number;
  advance(seconds: number): void;
}

type ResumeMode = 'ok' | 'reject' | 'stay-suspended';

function fakeContext(resumeMode: ResumeMode = 'ok'): FakeContext {
  const started: number[] = [];
  const stopped: number[] = [];
  const voices: FakeVoice[] = [];
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
      return { ...fakeNode(), gain: fakeParam(1) };
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
      const voice: FakeVoice = { starts: [], stops: [] };
      voices.push(voice);
      return {
        ...fakeNode(),
        type: 'sine',
        frequency: fakeParam(440),
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
    get resumes() {
      return state.resumes;
    },
    get closed() {
      return state.closed;
    },
    advance(seconds: number) {
      state.time += seconds;
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

/* ---------------- the preference ---------------- */

describe('shouldAutoStart', () => {
  it('starts the tune for a first-time visitor', () => {
    expect(shouldAutoStart({ storage: fakeStorage() })).toBe(true);
  });

  it('stays quiet for someone who turned it off last time', () => {
    expect(shouldAutoStart({ storage: fakeStorage({ [MUSIC_PREFERENCE_KEY]: 'off' }) })).toBe(false);
  });

  it('survives storage that throws', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(shouldAutoStart({ storage: hostile })).toBe(true);
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
    // Two oscillators per voice: the fundamental and its octave partial.
    expect(fake.voices).toHaveLength((HAPPY_BIRTHDAY.length + HAPPY_BIRTHDAY_BASS.length) * 2);
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
      const firstPass = fake.started.length;

      // The whole tune is 15.7s; the loop must re-arm before that.
      vi.advanceTimersByTime(loopSeconds() * 1000);
      expect(fake.started.length).toBeGreaterThan(firstPass);
      box.pause();
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

  it('picks up a tune the shell started on its own', () => {
    const fake = fakeContext();
    const box = createMusicBox({ contextFactory: () => fake.context, storage: fakeStorage() });
    const { handle } = mount(box);
    const button = handle.element.querySelector('[data-music-toggle]') as HTMLButtonElement;

    // This is what boot() does when the surprise opens.
    box.play();
    handle.sync();

    expect(button.getAttribute('aria-pressed')).toBe('true');
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
