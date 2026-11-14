import { afterEach, describe, expect, it } from 'vitest';

import { focusableWithin, trapFocus, type FocusTrap } from '../lib/focus';

/** Every trap made in a test is released afterwards, so listeners never leak. */
const traps: FocusTrap[] = [];

function trap(container: HTMLElement, restoreTo?: HTMLElement | null): FocusTrap {
  const created = trapFocus(container, restoreTo);
  traps.push(created);
  return created;
}

function container(html: string): HTMLElement {
  const node = document.createElement('div');
  node.innerHTML = html;
  document.body.append(node);
  return node;
}

function pressTab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

afterEach(() => {
  while (traps.length > 0) traps.pop()?.release();
  document.body.innerHTML = '';
});

describe('focusableWithin', () => {
  it('finds the focusable controls in document order', () => {
    const node = container('<a href="#one">one</a><button>two</button><input type="text"><textarea></textarea>');
    expect(focusableWithin(node).map((el) => el.tagName)).toEqual(['A', 'BUTTON', 'INPUT', 'TEXTAREA']);
  });

  it('ignores disabled controls, hidden panels and tabindex="-1"', () => {
    const node = container(`
      <button disabled>disabled</button>
      <input type="hidden" value="x">
      <div hidden><button>inside a closed panel</button></div>
      <span tabindex="-1">not tabbable</span>
      <button>real</button>
    `);
    const found = focusableWithin(node);
    expect(found).toHaveLength(1);
    expect(found[0]?.textContent).toBe('real');
  });

  it('returns nothing for an empty container', () => {
    expect(focusableWithin(container('<p>text only</p>'))).toEqual([]);
  });
});

describe('trapFocus', () => {
  it('wraps from the last control to the first', () => {
    const node = container('<button id="a">a</button><button id="b">b</button><button id="c">c</button>');
    trap(node);

    node.querySelector<HTMLButtonElement>('#c')?.focus();
    const event = pressTab();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('a');
  });

  it('wraps backwards from the first control to the last', () => {
    const node = container('<button id="a">a</button><button id="b">b</button><button id="c">c</button>');
    trap(node);

    node.querySelector<HTMLButtonElement>('#a')?.focus();
    const event = pressTab(true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('c');
  });

  it('lets Tab move normally between controls in the middle', () => {
    const node = container('<button id="a">a</button><button id="b">b</button>');
    trap(node);

    node.querySelector<HTMLButtonElement>('#a')?.focus();
    const event = pressTab();

    // Not intercepted: the browser handles the move from a to b.
    expect(event.defaultPrevented).toBe(false);
  });

  it('pulls focus back in when it has escaped the container', () => {
    const node = container('<button id="inside">inside</button>');
    const outside = container('<button id="outside">outside</button>');
    trap(node);

    outside.querySelector<HTMLButtonElement>('#outside')?.focus();
    pressTab();

    expect(document.activeElement?.id).toBe('inside');
  });

  it('does not intercept Tab once released', () => {
    const node = container('<button id="a">a</button><button id="b">b</button>');
    const released = trap(node);
    released.release();

    const event = pressTab();
    expect(event.defaultPrevented).toBe(false);
  });

  it('returns focus where it came from on release', () => {
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.append(opener);
    opener.focus();

    const node = container('<button id="a">a</button>');
    const released = trap(node, opener);
    node.querySelector<HTMLButtonElement>('#a')?.focus();
    released.release();

    expect(document.activeElement?.id).toBe('opener');
  });

  it('refuses to let focus leave a container with no focusable children', () => {
    const node = container('<p>nothing to focus</p>');
    trap(node);

    const event = pressTab();
    expect(event.defaultPrevented).toBe(true);
  });
});
