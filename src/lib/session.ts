/**
 * Account session for every page: who is signed in, their profile and progress,
 * and the account actions (register, sign in, email link, reset, sign out).
 * Firebase is imported dynamically, so it loads only after the page is up.
 */
import type { User } from 'firebase/auth';
import type { Visitor } from './curriculum';
import { firebaseConfigured } from './firebase-config';

export interface Profile {
  firstName: string;
  username?: string;
  tz: string;
  entitlement?: string;
  premiumUntilMs?: number | null;
  totalPoints?: number;
  streak?: { count: number; lastDay: string | null };
  mergedAnonymous?: boolean;
}

export interface Session {
  user: User;
  profile: Profile | undefined;
}

type Services = typeof import('./firebase');
let loading: Promise<Services> | undefined;
const sdk = (): Promise<Services> => (loading ??= import('./firebase'));

/** Resolves once Firebase has restored any saved sign-in: the session, or null when signed out. */
export async function currentSession(): Promise<Session | null> {
  if (!firebaseConfigured()) return null;
  const { firebase } = await sdk();
  const { auth } = firebase();
  await auth.authStateReady();
  const user = auth.currentUser;
  return user ? { user, profile: await loadProfile(user.uid) } : null;
}

/** Calls `cb` now and on every sign-in/sign-out. */
export async function watchSession(cb: (session: Session | null) => void): Promise<void> {
  if (!firebaseConfigured()) return cb(null);
  const { firebase } = await sdk();
  const { onAuthStateChanged } = await import('firebase/auth');
  onAuthStateChanged(firebase().auth, (user) => {
    if (!user) return cb(null);
    void loadProfile(user.uid).then((profile) => cb({ user, profile }));
  });
}

export async function loadProfile(uid: string): Promise<Profile | undefined> {
  const { firebase } = await sdk();
  const { doc, getDoc, Timestamp } = await import('firebase/firestore');
  const data = (await getDoc(doc(firebase().db, 'users', uid))).data();
  if (!data) return undefined;
  const until = data.premiumUntil;
  return {
    firstName: data.firstName ?? '',
    username: data.username,
    tz: data.tz ?? 'UTC',
    entitlement: data.entitlement,
    premiumUntilMs: until instanceof Timestamp ? until.toMillis() : until == null ? null : 0,
    totalPoints: data.totalPoints ?? 0,
    streak: data.streak,
    mergedAnonymous: !!data.mergedAnonymousAt,
  };
}

export const isPremium = (p: Profile | undefined, nowMs = Date.now()): boolean =>
  p?.entitlement === 'premium' && (p.premiumUntilMs == null || p.premiumUntilMs > nowMs);

/** Completion records from Firestore, in the shape the curriculum rules use. */
export async function accountVisitor(session: Session): Promise<Visitor> {
  const { firebase } = await sdk();
  const { collection, getDocs, Timestamp } = await import('firebase/firestore');
  const snap = await getDocs(collection(firebase().db, 'users', session.user.uid, 'progress'));
  const progress: Visitor['progress'] = {};
  for (const d of snap.docs) {
    const data = d.data();
    if (data.completed !== true) continue;
    const at = data.lastPractisedAt instanceof Timestamp ? data.lastPractisedAt.toDate().toISOString() : new Date().toISOString();
    progress[d.id] = { completed: true, bestAccuracy: typeof data.bestAccuracy === 'number' ? data.bestAccuracy : 0, lastPractisedAt: at };
  }
  return { signedIn: true, premium: isPremium(session.profile), progress };
}

/** Typed callable wrapper. */
export async function call<T>(name: string, data: unknown = {}): Promise<T> {
  const { firebase } = await sdk();
  const { httpsCallable } = await import('firebase/functions');
  return (await httpsCallable(firebase().functions, name)(data)).data as T;
}

const timeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Creates the profile document if it doesn't exist yet (first sign-in by email link, for example). */
export async function ensureProfile(uid: string, firstName = ''): Promise<void> {
  const { firebase } = await sdk();
  const { doc, getDoc, serverTimestamp, setDoc, updateDoc } = await import('firebase/firestore');
  const ref = doc(firebase().db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    if (firstName && !snap.data().firstName) await updateDoc(ref, { firstName });
    return;
  }
  await setDoc(ref, { firstName: firstName.slice(0, 50), tz: timeZone(), createdAt: serverTimestamp() });
}

export async function usernameAvailable(username: string): Promise<boolean> {
  const { firebase } = await sdk();
  const { doc, getDoc } = await import('firebase/firestore');
  return !(await getDoc(doc(firebase().db, 'usernames', username.toLowerCase()))).exists();
}

/* ---------- account actions ---------- */

export async function register(input: { firstName: string; username: string; email: string; password: string }): Promise<void> {
  const { firebase } = await sdk();
  const { createUserWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(firebase().auth, input.email, input.password);
  await ensureProfile(cred.user.uid, input.firstName);
  await call('claimUsername', { username: input.username });
  await afterSignIn();
  void sendEmailVerification(cred.user, { url: `${location.origin}/account/` }).catch(() => {});
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { firebase } = await sdk();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const cred = await signInWithEmailAndPassword(firebase().auth, email, password);
  await ensureProfile(cred.user.uid);
  await afterSignIn();
}

const EMAIL_KEY = 'pe:emailForSignIn';

export async function sendSignInLink(email: string, next: string): Promise<void> {
  const { firebase } = await sdk();
  const { sendSignInLinkToEmail } = await import('firebase/auth');
  const url = `${location.origin}/login/?next=${encodeURIComponent(next)}`;
  await sendSignInLinkToEmail(firebase().auth, email, { url, handleCodeInApp: true });
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* the learner will be asked for their email when they open the link */
  }
}

/** If this page was opened from a sign-in link: the email we stored when sending it ('' if unknown), else null. */
export async function pendingEmailLink(): Promise<string | null> {
  if (!firebaseConfigured()) return null;
  const { firebase } = await sdk();
  const { isSignInWithEmailLink } = await import('firebase/auth');
  if (!isSignInWithEmailLink(firebase().auth, location.href)) return null;
  try {
    return localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export async function completeEmailLink(email: string): Promise<void> {
  const { firebase } = await sdk();
  const { signInWithEmailLink } = await import('firebase/auth');
  const cred = await signInWithEmailLink(firebase().auth, email, location.href);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
  await ensureProfile(cred.user.uid);
  await afterSignIn();
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { firebase } = await sdk();
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(firebase().auth, email, { url: `${location.origin}/login/` });
}

export async function resendVerification(): Promise<void> {
  const { firebase } = await sdk();
  const { sendEmailVerification } = await import('firebase/auth');
  const user = firebase().auth.currentUser;
  if (user) await sendEmailVerification(user, { url: `${location.origin}/account/` });
}

export async function updateFirstName(firstName: string): Promise<void> {
  const { firebase } = await sdk();
  const { doc, updateDoc } = await import('firebase/firestore');
  const uid = firebase().auth.currentUser?.uid;
  if (uid) await updateDoc(doc(firebase().db, 'users', uid), { firstName: firstName.trim().slice(0, 50) });
}

/** Sign out and clear this device's cached progress and drafts (SPEC §8). */
export async function signOut(): Promise<void> {
  const { firebase } = await sdk();
  const { signOut: fbSignOut } = await import('firebase/auth');
  await fbSignOut(firebase().auth);
  clearLocalCaches();
}

export async function deleteAccount(): Promise<void> {
  await call('deleteAccount');
  await signOut();
}

export function clearLocalCaches(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('pe:')) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Merge any anonymous progress on this device into the account, then forget it locally. */
async function afterSignIn(): Promise<void> {
  const { loadProgress } = await import('../player/progress');
  const local = loadProgress();
  const progress = Object.entries(local.lessons).map(([lessonId, l]) => ({
    lessonId,
    completed: l.completed,
    bestAccuracy: l.bestAccuracy,
    lastPractisedAt: l.lastPractisedAt,
  }));
  if (progress.length === 0) return;
  try {
    await call('mergeAnonymousProgress', { progress });
    clearLocalCaches();
  } catch {
    /* keep local progress; it can merge on the next sign-in */
  }
}

/** Friendly text for Firebase errors. */
export function errorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const known: Record<string, string> = {
    'auth/invalid-credential': 'That email and password don’t match. Try again or reset your password.',
    'auth/wrong-password': 'That email and password don’t match. Try again or reset your password.',
    'auth/user-not-found': 'That email and password don’t match. Try again or reset your password.',
    'auth/email-already-in-use': 'An account with this email already exists. Log in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a password with at least 8 characters.',
    'auth/missing-password': 'Enter your password.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/invalid-action-code': 'This link has expired or was already used. Request a new one.',
    'auth/network-request-failed': 'Can’t reach the server. Check your connection.',
    'functions/already-exists': 'That username is taken. Try another.',
    'functions/resource-exhausted': 'Too many requests. Wait a minute and try again.',
  };
  if (known[code]) return known[code];
  if (code.startsWith('functions/')) return (err as Error).message || 'Something went wrong. Try again.';
  return 'Something went wrong. Try again.';
}

/* ---------- leaderboard (top 10 + own rank; fuller boards come with gamification) ---------- */

export interface LeaderRow {
  uid: string;
  username: string;
  points: number;
}

export const utcDay = (now = new Date()): string => now.toISOString().slice(0, 10);

/** Today's top points (UTC day, shared by everyone), plus the viewer's own row and rank when signed in. */
export async function leaderboard(uid?: string): Promise<{ top: LeaderRow[]; me?: LeaderRow & { rank: number } }> {
  const { firebase } = await sdk();
  const { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } = await import('firebase/firestore');
  const col = collection(firebase().db, 'dailyScores', utcDay(), 'users');
  const snap = await getDocs(query(col, orderBy('points', 'desc'), limit(10)));
  const top = snap.docs.map((d) => ({ uid: d.id, username: String(d.data().username ?? 'learner'), points: Number(d.data().points ?? 0) }));
  if (!uid) return { top };
  const mine = (await getDoc(doc(col, uid))).data();
  if (!mine) return { top };
  const points = Number(mine.points ?? 0);
  const ahead = (await getCountFromServer(query(col, where('points', '>', points)))).data().count;
  return { top, me: { uid, username: String(mine.username ?? ''), points, rank: ahead + 1 } };
}
