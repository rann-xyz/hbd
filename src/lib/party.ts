/* ============================================================
   THE PARTY LOG — what the reader has already done.

   The little resident notices things. It says one sort of thing while it is
   still waiting to be let in, another once the party has started, and another
   again after the candles. It could reach into another section's markup to
   find that out, or subscribe to events it would then have to unsubscribe
   from; instead the two sections that know mark it here, and the creature
   reads it when it is booped.

   Three booleans and no DOM: nothing to leak, nothing to tear down.
   ============================================================ */

export interface PartyState {
  /** The surprise has been opened. */
  readonly opened: boolean;
  /** The cake has been cut. */
  readonly cakeCut: boolean;
}

let opened = false;
let cakeCut = false;

/** The reader opened the surprise. */
export function markOpened(): void {
  opened = true;
}

/** The reader cut the cake. */
export function markCakeCut(): void {
  cakeCut = true;
}

export function partyState(): PartyState {
  return { opened, cakeCut };
}

/**
 * Back to the top of the page. The log lives in the module, so tests share one
 * copy of it and have to put it back; the page itself only ever walks forward.
 */
export function resetParty(): void {
  opened = false;
  cakeCut = false;
}
