import { db } from './admin';

/**
 * The current time. In the Functions emulator only, tests can move the clock by
 * writing `_test/clock {nowMs}` (rules deny clients; production never reads it).
 * This is how day-boundary behaviour (streaks, daily challenges) is tested.
 */
export async function now(): Promise<Date> {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const fake = (await db.doc('_test/clock').get()).data()?.nowMs;
    if (typeof fake === 'number') return new Date(fake);
  }
  return new Date();
}
