import { onRequest } from 'firebase-functions/v2/https';
import './lib/admin';

export { claimShareBonus } from './claimShareBonus';
export { claimUsername } from './claimUsername';
export { buildDailyChallenge, getDailyChallenge, submitChallenge } from './dailyChallenge';
export { completeLesson } from './completeLesson';
export { deleteAccount } from './deleteAccount';
export { mergeAnonymousProgress } from './mergeAnonymousProgress';
export { createCheckoutSession, createPortalSession, stripeWebhook } from './payments';
export { submitAnswer } from './submitAnswer';

/** Liveness check for the emulator and deploys. */
export const health = onRequest((_req, res) => {
  res.json({ ok: true });
});
