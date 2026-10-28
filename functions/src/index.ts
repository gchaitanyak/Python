import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/** Liveness check for the emulator and deploys. Real callables arrive in later phases. */
export const health = onRequest((_req, res) => {
  res.json({ ok: true });
});
