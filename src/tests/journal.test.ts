import { afterEach, describe, expect, it } from 'vitest';

import { JOURNAL } from '../content';
import { WishStoreError, type StorageLike, type WishStore } from '../lib/storage';
import { resolveWishStore, type ResolvedStore } from '../lib/wishStore';
import type { Wish } from '../lib/wishes';
import { buildJournal, type JournalDeps, type JournalHandle } from '../sections/journal';

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let handle: JournalHandle | null = null;

function mount(deps: JournalDeps = {}): JournalHandle {
  const built = buildJournal({
    resolve: () => resolveWishStore({ env: {}, storage: fakeStorage() }),
    confirmDelete: () => true,
    ...deps,
  });
  document.body.append(built.element);
  handle = built;
  return built;
}

function field(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`field ${id} missing`);
  return node;
}

function form(): HTMLFormElement {
  const node = document.querySelector<HTMLFormElement>('[data-journal-form]');
  if (!node) throw new Error('form missing');
  return node;
}

function submit(): void {
  form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function errorFor(name: string): string {
  return document.querySelector<HTMLElement>(`[data-error-for="${name}"]`)?.textContent ?? '';
}

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-wish-id]'));
}

function type(title: string, description: string): void {
  const titleInput = field('wish-title-field') as HTMLInputElement;
  const descriptionInput = field('wish-description-field') as HTMLTextAreaElement;

  titleInput.value = title;
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  descriptionInput.value = description;
  descriptionInput.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  handle?.destroy();
  handle = null;
  document.body.innerHTML = '';
});

describe('journal — initial states', () => {
  it('starts in a loading state, then settles on the empty state', async () => {
    const built = mount();
    expect(built.phase()).toBe('loading');
    expect(document.body.textContent).toContain(JOURNAL.loading);

    await settle();
    expect(built.phase()).toBe('ready');
    expect(document.body.textContent).toContain(JOURNAL.empty);
    expect(cards()).toHaveLength(0);
  });

  it('says out loud where wishes are being kept', async () => {
    mount();
    await settle();
    expect(document.querySelector('[data-journal-privacy]')?.textContent).toBe(JOURNAL.deviceNotice);
    expect(document.querySelector('[data-journal-count]')?.textContent).toBe(`0 ${JOURNAL.localCountLabel}`);
  });

  it('uses the cloud notice and label when the database is the backend', async () => {
    const cloudStore: WishStore = {
      kind: 'cloud',
      list: async () => [],
      create: async () => {
        throw new WishStoreError('not used');
      },
      remove: async () => undefined,
    };
    const resolved: ResolvedStore = {
      store: cloudStore,
      kind: 'cloud',
      notice: JOURNAL.cloudNotice,
      countLabel: JOURNAL.cloudCountLabel,
      countLabelOne: JOURNAL.cloudCountLabelOne,
    };

    mount({ resolve: async () => resolved });
    await settle();

    expect(document.querySelector('[data-journal-privacy]')?.textContent).toBe(JOURNAL.cloudNotice);
    expect(document.querySelector('[data-journal-count]')?.textContent).toBe(`0 ${JOURNAL.cloudCountLabel}`);
  });

  it('says "wish" when exactly one is kept, never "1 wishes"', async () => {
    const single: Wish = {
      id: 'wish-1',
      createdAt: '2026-11-14T05:00:00.000Z',
      title: 'One wish',
      description: 'Just the one.',
      source: 'device',
    };
    const oneStore: WishStore = {
      kind: 'device',
      list: async () => [single],
      create: async () => single,
      remove: async () => undefined,
    };

    mount({
      resolve: async () => ({
        store: oneStore,
        kind: 'device',
        notice: JOURNAL.deviceNotice,
        countLabel: JOURNAL.localCountLabel,
        countLabelOne: JOURNAL.localCountLabelOne,
      }),
    });
    await settle();

    expect(cards()).toHaveLength(1);
    expect(document.querySelector('[data-journal-count]')?.textContent).toBe(
      `1 ${JOURNAL.localCountLabelOne}`,
    );
  });

  it('offers a labelled, described form', async () => {
    mount();
    await settle();

    for (const id of ['wish-title-field', 'wish-description-field']) {
      const control = field(id);
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label).not.toBeNull();
      const describedBy = control.getAttribute('aria-describedby') ?? '';
      for (const ref of describedBy.split(' ').filter(Boolean)) {
        expect(document.getElementById(ref)).not.toBeNull();
      }
    }
  });

  it('asks for a title and a body, and nothing else', async () => {
    // Regression: the form used to demand a category, which turned a private
    // wish into a filing exercise. It must not come back.
    mount();
    await settle();
    expect(document.querySelector('#wish-category-field')).toBeNull();
    expect(document.querySelectorAll('[data-journal-form] select')).toHaveLength(0);
    const controls = Array.from(document.querySelectorAll('[data-journal-form] input, [data-journal-form] textarea'));
    expect(controls.map((control) => control.getAttribute('name'))).toEqual(['title', 'description']);
  });
});

describe('journal — validation', () => {
  it('refuses an empty wish and explains why, without touching the store', async () => {
    const built = mount();
    await settle();
    submit();
    await settle();

    expect(errorFor('title').length).toBeGreaterThan(0);
    expect(errorFor('description').length).toBeGreaterThan(0);
    expect(field('wish-title-field').getAttribute('aria-invalid')).toBe('true');
    expect(built.wishes()).toHaveLength(0);
    expect(cards()).toHaveLength(0);
  });

  it('moves focus to the first field that needs attention', async () => {
    mount();
    await settle();
    submit();
    await settle();
    expect(document.activeElement).toBe(field('wish-title-field'));
  });

  it('clears the errors once the wish is valid', async () => {
    mount();
    await settle();
    submit();
    await settle();
    expect(errorFor('title').length).toBeGreaterThan(0);

    type('A window seat', 'Somewhere far, with the whole night outside.');
    submit();
    await settle();

    expect(errorFor('title')).toBe('');
    expect(field('wish-title-field').hasAttribute('aria-invalid')).toBe(false);
  });

  it('counts characters as they are typed', async () => {
    mount();
    await settle();
    type('Four', 'Four words here');
    expect(document.getElementById('wish-title-hint')?.textContent).toBe('4 / 80');
  });
});

describe('journal — real writes through the UI', () => {
  it('saves a wish, shows it in the list and confirms it', async () => {
    const built = mount();
    await settle();

    type('A quiet place', 'Somewhere with a window, a plant and no hurry.');
    submit();
    await settle();

    expect(built.wishes()).toHaveLength(1);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.querySelector('.wish-card__title')?.textContent).toBe('A quiet place');
    expect(cards()[0]?.querySelector('.wish-card__body')?.textContent).toBe(
      'Somewhere with a window, a plant and no hurry.',
    );
    // A card shows the wish and when it was written — no category tag.
    expect(cards()[0]?.querySelector('.chip')).toBeNull();
    expect(cards()[0]?.querySelector('.wish-card__time')).not.toBeNull();
    expect(document.body.textContent).toContain(JOURNAL.savedTitle);
    expect(document.querySelector('[data-journal-count]')?.textContent).toBe(`1 ${JOURNAL.localCountLabelOne}`);
  });

  it('resets the form after a successful save', async () => {
    mount();
    await settle();
    type('Reset me', 'This should not stay in the inputs.');
    submit();
    await settle();

    expect((field('wish-title-field') as HTMLInputElement).value).toBe('');
    expect((field('wish-description-field') as HTMLTextAreaElement).value).toBe('');
  });

  it('timestamps every wish with a real time element', async () => {
    mount();
    await settle();
    type('Timestamped', 'So it can be read months later.');
    submit();
    await settle();

    const time = cards()[0]?.querySelector('time');
    expect(time?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(new Date(time?.getAttribute('datetime') ?? '').getTime())).toBe(false);
    expect(time?.getAttribute('title')?.length).toBeGreaterThan(0);
  });

  it('keeps the newest wish first', async () => {
    mount();
    await settle();
    type('First', 'Older wish written first.');
    submit();
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 5));
    type('Second', 'Newer wish written second.');
    submit();
    await settle();

    expect(cards().map((card) => card.querySelector('.wish-card__title')?.textContent)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('survives a store that refuses to save, and says so', async () => {
    const angryStore: WishStore = {
      kind: 'device',
      list: async () => [],
      create: async () => {
        throw new WishStoreError('That wish did not save.');
      },
      remove: async () => undefined,
    };

    const built = mount({
      resolve: async () => ({
        store: angryStore,
        kind: 'device',
        notice: JOURNAL.deviceNotice,
        countLabel: JOURNAL.localCountLabel,
        countLabelOne: JOURNAL.localCountLabelOne,
      }),
    });
    await settle();

    type('Will fail', 'The store is going to refuse this one.');
    submit();
    await settle();

    expect(built.wishes()).toHaveLength(0);
    expect(document.body.textContent).toContain(JOURNAL.errorTitle);
    expect(document.body.textContent).toContain('That wish did not save.');
  });
});

describe('journal — deletion', () => {
  it('deletes a wish after confirmation and updates the count', async () => {
    const built = mount({ confirmDelete: () => true });
    await settle();
    type('Delete me', 'This one is not staying.');
    submit();
    await settle();
    expect(cards()).toHaveLength(1);

    document.querySelector<HTMLButtonElement>('[data-wish-remove]')?.click();
    await settle();

    expect(built.wishes()).toHaveLength(0);
    expect(cards()).toHaveLength(0);
    expect(document.body.textContent).toContain(JOURNAL.empty);
    expect(document.querySelector('[data-journal-count]')?.textContent).toBe(`0 ${JOURNAL.localCountLabel}`);
  });

  it('keeps the wish when the confirmation is declined', async () => {
    const built = mount({ confirmDelete: () => false });
    await settle();
    type('Keeping this', 'Declined the confirmation on purpose.');
    submit();
    await settle();

    document.querySelector<HTMLButtonElement>('[data-wish-remove]')?.click();
    await settle();

    expect(built.wishes()).toHaveLength(1);
    expect(cards()).toHaveLength(1);
  });

  it('labels each delete button with the wish it belongs to', async () => {
    mount();
    await settle();
    type('Named wish', 'So the delete button can name it too.');
    submit();
    await settle();

    const remove = document.querySelector<HTMLButtonElement>('[data-wish-remove]');
    expect(remove?.getAttribute('aria-label')).toContain('Named wish');
  });
});

describe('journal — error state and retry', () => {
  it('shows an error state with a retry that really retries', async () => {
    let failFirst = true;
    const flakyStore: WishStore = {
      kind: 'device',
      list: async () => {
        if (failFirst) {
          failFirst = false;
          throw new WishStoreError('The database is not answering.');
        }
        return [] as Wish[];
      },
      create: async () => {
        throw new WishStoreError('unused');
      },
      remove: async () => undefined,
    };

    const built = mount({
      resolve: async () => ({
        store: flakyStore,
        kind: 'device',
        notice: JOURNAL.deviceNotice,
        countLabel: JOURNAL.localCountLabel,
        countLabelOne: JOURNAL.localCountLabelOne,
      }),
    });
    await settle();

    expect(built.phase()).toBe('error');
    expect(document.body.textContent).toContain('The database is not answering.');
    const submitButton = document.querySelector<HTMLButtonElement>('[data-journal-submit]');
    expect(submitButton?.disabled).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-journal-retry]')?.click();
    await settle();

    expect(built.phase()).toBe('ready');
    expect(document.body.textContent).toContain(JOURNAL.empty);
    expect(submitButton?.disabled).toBe(false);
  });
});

describe('journal — teardown', () => {
  it('stops accepting submissions once destroyed', async () => {
    const built = mount();
    await settle();
    built.destroy();

    type('Too late', 'The journal has been torn down already.');
    submit();
    await settle();

    expect(built.wishes()).toHaveLength(0);
  });

  it('can be refreshed on demand', async () => {
    const built = mount();
    await settle();
    await built.refresh();
    expect(built.phase()).toBe('ready');
  });
});
