/** Shared helpers for the Cloud Functions integration tests (emulators). */
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll } from 'vitest';

export const projectId = 'demo-python-exercises';
export let env: RulesTestEnvironment;
export const apps: FirebaseApp[] = [];
let n = 0;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
});

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env.cleanup();
});

/** A fresh signed-in user with a profile doc, plus helpers to call functions as them. */
export async function newUser(tz = 'UTC') {
  const app = initializeApp({ apiKey: 'demo-key', projectId }, `u${++n}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fns = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const email = `user${n}-${Date.now()}@example.com`;
  const cred = await createUserWithEmailAndPassword(auth, email, 'correct-horse-battery');
  const uid = cred.user.uid;
  await setDoc(doc(db, 'users', uid), { firstName: `User ${n}`, tz, createdAt: serverTimestamp() });
  const call = async <T = Record<string, unknown>>(name: string, data: unknown = {}) => (await httpsCallable(fns, name)(data)).data as T;
  return { app, auth, db, uid, email, call };
}

/** Reads with rules disabled, to check what the functions stored. */
export async function read(path: string) {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return data;
}

export async function count(path: string) {
  let size = 0;
  await env.withSecurityRulesDisabled(async (ctx) => {
    size = (await getDocs(collection(ctx.firestore(), path))).size;
  });
  return size;
}

export async function admin(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data, { merge: true });
  });
}

export const errorCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'none';
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

export const today = () => new Date().toISOString().slice(0, 10);


/** Moves the Functions emulator's clock (see functions/src/lib/clock.ts); null restores real time. */
export async function setClock(when: Date | null) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const ref = doc(ctx.firestore(), '_test/clock');
    if (when) await setDoc(ref, { nowMs: when.getTime() });
    else await deleteDoc(ref);
  });
}
