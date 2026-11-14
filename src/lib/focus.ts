/* ============================================================
   FOCUS — keyboard behaviour for anything that behaves like a
   dialog. Small on purpose: the site has exactly one modal, but the
   rules (trap, restore) belong in one tested place.
   ============================================================ */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Elements inside a collapsed panel are not focusable. We check the
 * `hidden` attribute rather than layout, so this behaves identically in a
 * browser and in tests.
 */
function isReachable(node: HTMLElement): boolean {
  if (node.hasAttribute('hidden')) return false;
  return node.closest('[hidden]') === null;
}

/** Every focusable element inside a container, in document order. */
export function focusableWithin(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((node) =>
    isReachable(node),
  );
}

export interface FocusTrap {
  /** Currently focusable elements, refreshed on demand. */
  refresh(): HTMLElement[];
  release(): void;
}

/**
 * Keep Tab inside `container` while it is open, and optionally send focus
 * back where it came from when the trap is released.
 */
export function trapFocus(container: HTMLElement, restoreTo?: HTMLElement | null): FocusTrap {
  const previouslyFocused =
    restoreTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;

    const focusable = focusableWithin(container);
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    const active = document.activeElement;

    // Focus escaped the dialog entirely: pull it back to the first control.
    if (!container.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeydown, true);

  return {
    refresh: () => focusableWithin(container),
    release(): void {
      document.removeEventListener('keydown', onKeydown, true);
      previouslyFocused?.focus({ preventScroll: true });
    },
  };
}
