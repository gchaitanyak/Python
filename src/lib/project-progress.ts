/**
 * Which projects a learner has finished. Kept on this device, and for signed-in
 * learners also in users/{uid}/projects/{id}. Projects award no points, so the
 * client may write this record itself (firestore.rules limits it to a timestamped flag).
 */
import { currentSession } from './session';

const KEY = 'pe:projects:v1';

function local(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export async function finishedProjects(): Promise<Set<string>> {
  const done = new Set(Object.keys(local()));
  const session = await currentSession().catch(() => null);
  if (session) {
    const { firebase } = await import('./firebase');
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(firebase().db, 'users', session.user.uid, 'projects')).catch(() => undefined);
    for (const d of snap?.docs ?? []) if (d.data().completed === true) done.add(d.id);
  }
  return done;
}

export async function recordFinished(projectId: string, uid: string | undefined): Promise<void> {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...local(), [projectId]: new Date().toISOString() }));
  } catch {
    /* storage unavailable */
  }
  if (!uid) return;
  const { firebase } = await import('./firebase');
  const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
  await setDoc(doc(firebase().db, 'users', uid, 'projects', projectId), { completed: true, completedAt: serverTimestamp() });
}

/** Labels finished projects in a grid rendered by renderProjectCards. */
export async function markFinishedProjects(root: ParentNode): Promise<void> {
  const done = await finishedProjects();
  for (const card of root.querySelectorAll<HTMLElement>('[data-project-id]')) {
    if (!done.has(card.dataset.projectId!)) continue;
    card.dataset.finished = 'true';
    const state = card.querySelector('[data-project-state]');
    if (state) state.textContent = 'Completed ✓';
  }
}
