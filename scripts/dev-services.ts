/**
 * Runs inside `firebase emulators:exec` (npm run dev, e2e tests): uploads premium
 * lessons to the Firestore emulator, then serves the fake Stripe and the fake
 * Claude API until stopped. /health on the fake Stripe answers only once all are ready.
 */
import { uploadPremium } from './build-content';
import { FAKE_LLM_PORT, startFakeLlm } from './fake-llm';
import { FAKE_STRIPE_PORT, startFakeStripe } from './fake-stripe';

const n = await uploadPremium(process.env.GCLOUD_PROJECT ?? 'demo-python-exercises');
console.log(`[dev-services] ${n} premium lessons uploaded to the Firestore emulator`);
await startFakeLlm();
console.log(`[dev-services] fake Claude API on http://127.0.0.1:${FAKE_LLM_PORT}`);
await startFakeStripe();
console.log(`[dev-services] fake Stripe on http://127.0.0.1:${FAKE_STRIPE_PORT}`);
await new Promise(() => {});
