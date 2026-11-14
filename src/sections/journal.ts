/* ============================================================
   SECTION G — WISH JOURNAL
   A real form with real validation, real persistence and real
   states: loading, empty, error (with retry), and success. Wishes
   are private by default — the store only ever returns this
   device's own records, and the UI says which backend is in use.
   ============================================================ */

import { JOURNAL } from '../content';
import { el, setHidden, setText } from '../lib/dom';
import { counterText, formatDateTime, formatRelative } from '../lib/format';
import {
  WISH_LIMITS,
  sortWishes,
  validateWish,
  type Wish,
  type WishField,
  type WishFieldErrors,
} from '../lib/wishes';
import { resolveWishStore, type ResolvedStore } from '../lib/wishStore';

export type JournalPhase = 'loading' | 'ready' | 'error';

export interface JournalHandle {
  readonly element: HTMLElement;
  phase(): JournalPhase;
  wishes(): readonly Wish[];
  refresh(): Promise<void>;
  destroy(): void;
}

export interface JournalDeps {
  readonly resolve?: () => Promise<ResolvedStore>;
  readonly now?: () => Date;
  readonly confirmDelete?: (message: string) => boolean;
}

const FIELD_IDS: Record<WishField, string> = {
  title: 'wish-title-field',
  description: 'wish-description-field',
};

/** Hint and error nodes use the short ids the reader (and the tests) expect. */
const HINT_IDS: Record<WishField, string> = {
  title: 'wish-title-hint',
  description: 'wish-description-hint',
};

const ERROR_IDS: Record<WishField, string> = {
  title: 'wish-title-error',
  description: 'wish-description-error',
};

export function buildJournal(deps: JournalDeps = {}): JournalHandle {
  const now = deps.now ?? ((): Date => new Date());
  const confirmDelete = deps.confirmDelete ?? ((message: string): boolean => window.confirm(message));
  const resolve = deps.resolve ?? ((): Promise<ResolvedStore> => resolveWishStore());

  let phase: JournalPhase = 'loading';
  let resolved: ResolvedStore | null = null;
  let wishes: Wish[] = [];
  let submitting = false;
  let status: 'idle' | 'success' | 'error' = 'idle';
  let statusMessage = '';

  const headingId = 'journal-title';

  const eyebrow = el('p', { className: 'eyebrow', text: JOURNAL.eyebrow, attrs: { 'data-reveal': '' } });
  const heading = el('h2', { className: 'h2', attrs: { id: headingId, 'data-reveal': '' }, text: JOURNAL.heading });
  const intro = el('p', { className: 'lead', text: JOURNAL.intro, attrs: { 'data-reveal': '' } });
  const privacy = el('p', { className: 'small journal__privacy', attrs: { 'data-journal-privacy': '' } });
  const countLabel = el('p', { className: 'small', attrs: { 'data-journal-count': '' } });

  /* ---------------- form ---------------- */

  const errors: Record<WishField, HTMLElement> = {
    title: el('p', { className: 'field__error', attrs: { id: ERROR_IDS.title, 'data-error-for': 'title' } }),
    description: el('p', {
      className: 'field__error',
      attrs: { id: ERROR_IDS.description, 'data-error-for': 'description' },
    }),
  };

  const titleInput = el('input', {
    className: 'field__control',
    attrs: {
      id: FIELD_IDS.title,
      type: 'text',
      name: 'title',
      maxlength: WISH_LIMITS.titleMax,
      autocomplete: 'off',
      placeholder: JOURNAL.fields.title.placeholder,
      'aria-describedby': `${HINT_IDS.title} ${ERROR_IDS.title}`,
    },
  });

  const titleHint = el('p', {
    className: 'field__hint',
    attrs: { id: HINT_IDS.title },
    text: counterText('', WISH_LIMITS.titleMax),
  });

  const descriptionInput = el('textarea', {
    className: 'field__control',
    attrs: {
      id: FIELD_IDS.description,
      name: 'description',
      maxlength: WISH_LIMITS.descriptionMax,
      rows: 5,
      placeholder: JOURNAL.fields.description.placeholder,
      'aria-describedby': `${HINT_IDS.description} ${ERROR_IDS.description}`,
    },
  });

  const descriptionHint = el('p', {
    className: 'field__hint',
    attrs: { id: HINT_IDS.description },
    text: counterText('', WISH_LIMITS.descriptionMax),
  });

  const submitButton = el('button', {
    className: 'btn btn--solid journal__submit',
    text: JOURNAL.submit,
    attrs: { type: 'submit', 'data-journal-submit': '' },
  });

  const formStatus = el('div', { attrs: { 'data-journal-status': '', 'aria-live': 'polite' } });

  const form = el('form', {
    className: 'paper paper--blush journal__form',
    attrs: { 'data-journal-form': '', novalidate: '' },
    children: [
      el('h3', { className: 'h3', text: JOURNAL.formHeading }),
      el('div', {
        className: 'field',
        children: [
          el('label', { className: 'field__label', text: JOURNAL.fields.title.label, attrs: { for: FIELD_IDS.title } }),
          titleInput,
          titleHint,
          errors.title,
        ],
      }),
      el('div', {
        className: 'field',
        children: [
          el('label', {
            className: 'field__label',
            text: JOURNAL.fields.description.label,
            attrs: { for: FIELD_IDS.description },
          }),
          descriptionInput,
          descriptionHint,
          errors.description,
        ],
      }),
      submitButton,
      formStatus,
    ],
  });

  /* ---------------- list ---------------- */

  const listStates = el('div', { attrs: { 'data-journal-states': '' } });
  const wishList = el('div', { className: 'wishes', attrs: { 'data-journal-list': '' } });

  const listColumn = el('div', {
    className: 'journal__list',
    children: [el('h3', { className: 'h3', text: JOURNAL.listHeading }), countLabel, listStates, wishList],
  });

  const section = el('section', {
    className: 'section journal',
    attrs: { id: 'journal', 'aria-labelledby': headingId },
    children: [
      el('div', {
        className: 'page',
        children: [
          el('div', {
            className: 'section__head',
            children: [eyebrow, heading, intro, privacy],
          }),
          el('div', { className: 'journal__layout', children: [form, listColumn] }),
        ],
      }),
    ],
  });

  /* ---------------- rendering ---------------- */

  function clearErrors(): void {
    for (const field of Object.keys(errors) as WishField[]) {
      errors[field].textContent = '';
      const control = section.querySelector<HTMLElement>(`#${FIELD_IDS[field]}`);
      control?.removeAttribute('aria-invalid');
    }
  }

  function showErrors(fieldErrors: WishFieldErrors): void {
    for (const [field, message] of Object.entries(fieldErrors) as [WishField, string][]) {
      errors[field].textContent = message;
      section.querySelector<HTMLElement>(`#${FIELD_IDS[field]}`)?.setAttribute('aria-invalid', 'true');
    }
  }

  function firstInvalidControl(fieldErrors: WishFieldErrors): HTMLElement | null {
    const order: WishField[] = ['title', 'description'];
    const first = order.find((field) => fieldErrors[field] !== undefined);
    if (!first) return null;
    return section.querySelector<HTMLElement>(`#${FIELD_IDS[first]}`);
  }

  function wishCard(wish: Wish): HTMLElement {
    const created = now();
    const time = el('time', {
      className: 'wish-card__time small',
      text: formatRelative(wish.createdAt, created),
      attrs: { datetime: wish.createdAt, title: formatDateTime(wish.createdAt) },
    });

    const remove = el('button', {
      className: 'wish-card__remove',
      text: '×',
      attrs: { type: 'button', 'aria-label': `${JOURNAL.removeLabel}: ${wish.title}`, 'data-wish-remove': wish.id },
    });

    remove.addEventListener('click', () => {
      void deleteWish(wish);
    });

    return el('article', {
      className: 'wish-card',
      attrs: { 'data-wish-id': wish.id },
      children: [
        el('div', {
          className: 'wish-card__top',
          children: [time, remove],
        }),
        el('h4', { className: 'wish-card__title', text: wish.title }),
        el('p', { className: 'wish-card__body', text: wish.description }),
      ],
    });
  }

  function renderStates(): void {
    while (listStates.firstChild) listStates.removeChild(listStates.firstChild);

    if (status === 'success') {
      listStates.append(
        el('div', {
          className: 'state state--success',
          children: [
            el('p', { className: 'state__title', text: JOURNAL.savedTitle }),
            el('p', { className: 'state__body', text: statusMessage || JOURNAL.savedBody }),
          ],
        }),
      );
      return;
    }

    if (status === 'error') {
      const retry = el('button', {
        className: 'btn btn--quiet',
        text: JOURNAL.retry,
        attrs: { type: 'button', 'data-journal-retry': '' },
      });
      retry.addEventListener('click', () => {
        void load();
      });

      listStates.append(
        el('div', {
          className: 'state state--error',
          children: [
            el('p', { className: 'state__title', text: JOURNAL.errorTitle }),
            el('p', { className: 'state__body', text: statusMessage }),
            retry,
          ],
        }),
      );
      return;
    }

    if (phase === 'loading') {
      listStates.append(
        el('div', {
          className: 'state',
          children: [
            el('p', { className: 'state__body', text: JOURNAL.loading }),
            el('div', {
              className: 'skeleton',
              attrs: { 'aria-hidden': 'true' },
              children: [el('span'), el('span'), el('span')],
            }),
          ],
        }),
      );
      return;
    }

    if (wishes.length === 0) {
      listStates.append(
        el('div', {
          className: 'state',
          children: [el('p', { className: 'state__body', text: JOURNAL.empty })],
        }),
      );
    }
  }

  function renderList(): void {
    while (wishList.firstChild) wishList.removeChild(wishList.firstChild);
    for (const wish of wishes) wishList.append(wishCard(wish));
    setHidden(wishList, wishes.length === 0);
  }

  function renderCount(): void {
    const count = wishes.length;
    // "1 wishes" is the kind of small wrongness a birthday page cannot afford.
    const suffix =
      count === 1
        ? (resolved?.countLabelOne ?? JOURNAL.localCountLabelOne)
        : (resolved?.countLabel ?? JOURNAL.localCountLabel);
    setText(countLabel, `${count} ${suffix}`);
    setText(privacy, resolved?.notice ?? JOURNAL.deviceNotice);
  }

  function render(): void {
    renderStates();
    renderList();
    renderCount();
    submitButton.disabled = submitting || phase === 'error';
    setText(submitButton, submitting ? JOURNAL.submitting : JOURNAL.submit);
  }

  /* ---------------- behaviour ---------------- */

  async function load(): Promise<void> {
    phase = 'loading';
    status = 'idle';
    render();

    try {
      if (!resolved) resolved = await resolve();
      wishes = await resolved.store.list();
      phase = 'ready';
    } catch (error) {
      phase = 'error';
      status = 'error';
      statusMessage = error instanceof Error ? error.message : JOURNAL.errorTitle;
    }
    render();
  }

  async function deleteWish(wish: Wish): Promise<void> {
    if (!resolved) return;
    if (!confirmDelete(JOURNAL.removeConfirm)) return;

    try {
      await resolved.store.remove(wish.id);
      wishes = wishes.filter((item) => item.id !== wish.id);
      status = 'idle';
      render();
    } catch (error) {
      status = 'error';
      statusMessage = error instanceof Error ? error.message : JOURNAL.errorTitle;
      render();
    }
  }

  async function submit(): Promise<void> {
    if (submitting || !resolved) return;

    const result = validateWish({
      title: titleInput.value,
      description: descriptionInput.value,
    });

    clearErrors();

    if (!result.ok) {
      showErrors(result.errors);
      firstInvalidControl(result.errors)?.focus();
      return;
    }

    submitting = true;
    render();

    try {
      const created = await resolved.store.create(result.value);
      wishes = sortWishes([created, ...wishes]);
      status = 'success';
      statusMessage = JOURNAL.savedBody;
      form.reset();
      updateCounters();
      clearErrors();
      phase = 'ready';
    } catch (error) {
      status = 'error';
      statusMessage = error instanceof Error ? error.message : JOURNAL.errorTitle;
    } finally {
      submitting = false;
      render();
    }
  }

  function updateCounters(): void {
    setText(titleHint, counterText(titleInput.value, WISH_LIMITS.titleMax));
    setText(descriptionHint, counterText(descriptionInput.value, WISH_LIMITS.descriptionMax));
  }

  const onTitleInput = (): void => updateCounters();
  const onDescriptionInput = (): void => updateCounters();
  const onSubmit = (event: Event): void => {
    event.preventDefault();
    void submit();
  };

  titleInput.addEventListener('input', onTitleInput);
  descriptionInput.addEventListener('input', onDescriptionInput);
  form.addEventListener('submit', onSubmit);

  updateCounters();
  render();
  void load();

  return {
    element: section,
    phase: () => phase,
    wishes: () => wishes,
    refresh: load,
    destroy(): void {
      titleInput.removeEventListener('input', onTitleInput);
      descriptionInput.removeEventListener('input', onDescriptionInput);
      form.removeEventListener('submit', onSubmit);
    },
  };
}
