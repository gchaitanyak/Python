import { initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, initializeAuth, indexedDBLocalPersistence, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

const env = import.meta.env;

/** Dev without .env.local talks to the Emulator Suite under the demo project, so `npm run dev` works with no setup. */
const useEmulators = env.VITE_USE_EMULATORS === 'true' || (env.DEV && !env.VITE_FIREBASE_API_KEY);

let services: FirebaseServices | undefined;

/**
 * Initialises Firebase once. Import this module only through src/lib/session.ts,
 * which loads it lazily so static pages don't pay for the SDK up front.
 */
export function firebase(): FirebaseServices {
  if (services) return services;
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-python-exercises',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  const db = getFirestore(app);
  const functions = getFunctions(app, env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  services = { app, auth, db, functions };
  return services;
}
