/* ============================================================
   ENTRY POINT
   Styles first (so the page never flashes unstyled), then the app.
   ============================================================ */

import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

import { boot } from './app';

function start(): void {
  boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
