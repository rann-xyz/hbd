/* ============================================================
   MOTION — lightweight, respectful, and never load-bearing.
   Everything here degrades to "just show the content" when the
   reader prefers reduced motion, when the API is missing, or when
   the element is already on screen.
   ============================================================ */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(REDUCED_QUERY).matches;
}

export function watchReducedMotion(handler: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  const listener = (event: MediaQueryListEvent): void => handler(event.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Run a WAAPI animation, or nothing at all when motion is unwanted. */
export function enter(
  node: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions = {},
): Animation | null {
  if (prefersReducedMotion()) return null;
  if (typeof node.animate !== 'function') return null;
  return node.animate(keyframes, {
    duration: options.duration ?? 620,
    delay: options.delay ?? 0,
    easing: options.easing ?? 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    fill: options.fill ?? 'both',
  });
}

export interface RevealOptions {
  /** Milliseconds added per element inside the same observation batch. */
  stagger?: number;
  /** CSS class applied when the element has entered. */
  className?: string;
}

/**
 * Reveal every [data-reveal] descendant once it scrolls into view.
 * Returns a teardown function. Without IntersectionObserver support the
 * content is shown immediately — no section may ever depend on JS motion.
 */
export function revealOnScroll(root: ParentNode, options: RevealOptions = {}): () => void {
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (targets.length === 0) return () => {};

  const className = options.className ?? 'is-in';
  const stagger = prefersReducedMotion() ? 0 : (options.stagger ?? 90);

  const show = (node: HTMLElement): void => node.classList.add(className);

  if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
    for (const node of targets) show(node);
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      let index = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        if (stagger > 0) node.style.setProperty('--reveal-delay', `${index * stagger}ms`);
        index += 1;
        show(node);
        observer.unobserve(node);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  );

  for (const node of targets) observer.observe(node);
  return () => observer.disconnect();
}

/** Scroll to an element, honouring reduced-motion. */
export function scrollToElement(node: Element, focusTarget?: HTMLElement): void {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  node.scrollIntoView({ behavior, block: 'start' });
  if (focusTarget) {
    // Move focus so keyboard and screen-reader users follow the jump.
    focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  }
}

/** Animate a number from one value to another (used for countdown digits). */
export function animateNumber(
  from: number,
  to: number,
  duration: number,
  onFrame: (value: number) => void,
): () => void {
  if (prefersReducedMotion() || duration <= 0 || from === to) {
    onFrame(to);
    return () => {};
  }

  let raf = 0;
  let cancelled = false;
  const start = performance.now();

  const step = (now: number): void => {
    if (cancelled) return;
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    onFrame(Math.round(from + (to - from) * eased));
    if (progress < 1) raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

/** Pulse a class on a node, removing it again after the animation. */
export function pulseClass(node: Element, className: string, duration = 520): void {
  if (prefersReducedMotion()) return;
  node.classList.remove(className);
  // Force a reflow so a repeated class application restarts the animation.
  void (node as HTMLElement).offsetWidth;
  node.classList.add(className);
  window.setTimeout(() => node.classList.remove(className), duration);
}
