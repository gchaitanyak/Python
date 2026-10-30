/** Whether Firebase can be used in this build — checked without loading the SDK. */
const env = import.meta.env;
export const firebaseConfigured = (): boolean =>
  env.VITE_USE_EMULATORS === 'true' || (env.DEV && !env.VITE_FIREBASE_API_KEY) || !!env.VITE_FIREBASE_API_KEY;
