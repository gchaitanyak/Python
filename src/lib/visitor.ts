import { loadProgress } from '../player/progress';
import { anonymous, type Visitor } from './curriculum';
import { accountVisitor, currentSession, type Session } from './session';

/** Who is looking: the signed-in account's progress, or this device's anonymous progress. */
export async function resolveVisitor(): Promise<{ visitor: Visitor; session: Session | null }> {
  const session = await currentSession().catch(() => null);
  if (session) {
    try {
      return { visitor: await accountVisitor(session), session };
    } catch {
      return { visitor: { signedIn: true, premium: false, progress: {} }, session };
    }
  }
  return { visitor: anonymous(loadProgress().lessons), session: null };
}
