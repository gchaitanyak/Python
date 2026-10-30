import Anthropic from '@anthropic-ai/sdk';
import { logger } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { callOptions, db, rateLimit, requireUid, Timestamp, userIsPremium, userRef } from './lib/admin';
import { now as clockNow } from './lib/clock';
import { findPlaced, loadLesson } from './lib/content';
import { buildPrompt, guardHint, HINTS_PER_DAY, MAX_CODE_CHARS, MAX_FAIL_CHARS, referenceAnswer, SYSTEM_PROMPT } from './lib/hint';
import { isGradable, utcDay } from './lib/rules';

/** Key in Secret Manager (`firebase functions:secrets:set ANTHROPIC_API_KEY`); functions/.secret.local in the emulator. */
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
/** Model for hints. Set HINT_MODEL in functions/.env.<project> to change it. */
const HINT_MODEL = defineString('HINT_MODEL', { default: 'claude-opus-5-5' });
/** Empty in production. The emulator points it at the local fake (scripts/fake-llm.ts). */
const LLM_API_BASE = defineString('LLM_API_BASE', { default: '' });

let client: Anthropic | undefined;
const anthropic = (): Anthropic =>
  (client ??= new Anthropic({
    apiKey: ANTHROPIC_API_KEY.value(),
    baseURL: LLM_API_BASE.value() || undefined,
    timeout: 30_000, // ms; a hint that takes longer isn't worth waiting for
    maxRetries: 1,
  }));

async function askModel(prompt: string): Promise<string | undefined> {
  const response = await anthropic().beta.messages.create({
    model: HINT_MODEL.value(),
    max_tokens: 4000, // includes thinking; the hint itself is a few sentences
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') return undefined;
  const text = response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim();
  return text || undefined;
}

/**
 * An AI tutor hint for a question the learner is stuck on (SPEC §5.6).
 * Signed-in only; premium 30 a day, free 5 a day (UTC). The prompt is built
 * here from the lesson data, and the reply is checked so it never hands over
 * the reference solution.
 */
export const getHint = onCall({ ...callOptions, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to ask the AI tutor.');
  const uid = requireUid(request);
  const d = (request.data ?? {}) as Record<string, unknown>;
  if (typeof d.lessonId !== 'string' || typeof d.questionId !== 'string' || typeof d.code !== 'string' || typeof d.failMessage !== 'string') {
    throw new HttpsError('invalid-argument', 'lessonId, questionId, code and failMessage are required.');
  }
  if (d.code.length > MAX_CODE_CHARS * 2 || d.failMessage.length > MAX_FAIL_CHARS * 2) throw new HttpsError('invalid-argument', 'That’s too much text for a hint.');
  await rateLimit(uid, 'getHint', 6);

  const placed = findPlaced(d.lessonId);
  const q = loadLesson(d.lessonId)?.questions.find((x) => x.id === d.questionId);
  if (!placed || !q || !isGradable(q)) throw new HttpsError('not-found', 'No such question.');

  const now = await clockNow();
  const day = utcDay(now);
  const quotaRef = db.collection('hintQuota').doc(`${uid}_${day}`);
  const remaining = await db.runTransaction(async (tx) => {
    const [user, quota] = await Promise.all([tx.get(userRef(uid)), tx.get(quotaRef)]);
    const premium = userIsPremium(user.data(), now.getTime());
    if (!placed.lesson.free && !premium) throw new HttpsError('permission-denied', 'This lesson is locked.');
    const limit = premium ? HINTS_PER_DAY.premium : HINTS_PER_DAY.free;
    const used = (quota.data()?.count as number | undefined) ?? 0;
    if (used >= limit) {
      throw new HttpsError('resource-exhausted', premium ? `You’ve used all ${limit} AI hints for today. They reset at midnight UTC.` : `You’ve used your ${limit} free AI hints for today. Premium gives you ${HINTS_PER_DAY.premium} a day.`);
    }
    tx.set(quotaRef, { uid, day, count: used + 1 });
    return limit - used - 1;
  });

  let reply: string | undefined;
  try {
    reply = await askModel(buildPrompt(q, d.code, d.failMessage));
  } catch (err) {
    logger.error('Hint request failed', { lessonId: d.lessonId, questionId: d.questionId, error: (err as Error).message });
    // Give the hint back: the learner didn't get what they paid for with it.
    await quotaRef.set({ count: (await quotaRef.get()).data()!.count - 1 }, { merge: true });
    throw new HttpsError('unavailable', 'The AI tutor isn’t available right now. Try the regular hint, or ask again in a minute.');
  }
  const { hint, leaked } = guardHint(reply ?? '', referenceAnswer(q), q.hint ?? '');
  if (leaked) logger.warn('Hint replaced: too close to the solution', { lessonId: d.lessonId, questionId: d.questionId });

  const log = await db.collection('hintLogs').add({
    uid,
    lessonId: d.lessonId,
    questionId: d.questionId,
    createdAt: Timestamp.fromDate(now),
    helpful: null,
    replaced: leaked || !reply,
  });
  return { hint, hintId: log.id, remaining };
});
