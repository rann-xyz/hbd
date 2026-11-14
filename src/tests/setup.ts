/* ============================================================
   TEST SETUP — jsdom ships a `crypto` object without `subtle`,
   so the cloud path in wishStore would look unavailable in tests
   and quietly fall back to device storage. Real browsers do have
   SubtleCrypto, so borrow Node's WebCrypto when jsdom is missing
   it: the tests then exercise the same code path a visitor hits.
   ============================================================ */

import { webcrypto } from 'node:crypto';

const current = globalThis.crypto as Crypto | undefined;

if (typeof current?.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}
