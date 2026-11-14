/* ============================================================
   DOM helpers — small, typed, and deliberately boring.
   Markup is built from element objects, never from interpolated
   user data, so nothing a visitor types can become markup.
   ============================================================ */

export interface ElOptions {
  className?: string;
  text?: string;
  /** Trusted markup only: content from content.ts or ornament builders. */
  html?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  children?: readonly Node[];
  on?: Record<string, EventListener>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;

  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  if (options.children) {
    for (const child of options.children) node.append(child);
  }

  if (options.on) {
    for (const [type, handler] of Object.entries(options.on)) {
      node.addEventListener(type, handler);
    }
  }

  return node;
}

export function qs<T extends Element>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function qsa<T extends Element>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (hidden) node.setAttribute('hidden', '');
  else node.removeAttribute('hidden');
}

export function toggleClass(node: Element, className: string, on: boolean): void {
  node.classList.toggle(className, on);
}

export function on<K extends keyof HTMLElementEventMap>(
  target: EventTarget,
  type: K | string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Escape a string for use inside trusted markup templates. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build a document fragment from a list of nodes. */
export function frag(nodes: readonly Node[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const node of nodes) fragment.append(node);
  return fragment;
}

/** True when the runtime gives us a real DOM (guards for SSR-ish or test runs). */
export function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}
