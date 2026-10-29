import type { Server } from 'node:http';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeLlm } from '../../scripts/fake-llm';
import { admin, errorCode, newUser, read, today } from './helpers';

let fake: Server;
beforeAll(async () => {
  fake = await startFakeLlm();
});
afterAll(() => {
  fake.close();
});

const FREE_Q = { lessonId: 'py-variables', questionId: 'q02' };
const PREMIUM_Q = { lessonId: 'py-comparison-logical', questionId: 'q02' };
const ask = (extra: Record<string, unknown> = {}) => ({ ...FREE_Q, code: 'x = 1', failMessage: 'name should be a string', ...extra });
type Hint = { hint: string; hintId: string; remaining: number };

describe('getHint (SPEC §5.6)', () => {
  it('refuses anonymous visitors', async () => {
    const res = await fetch('http://127.0.0.1:5001/demo-python-exercises/us-central1/getHint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: ask() }),
    });
    expect(res.status).toBe(401);
  });

  it('gives a free user 5 hints a day, then stops', async () => {
    const u = await newUser();
    const first = await u.call<Hint>('getHint', ask());
    expect(first.hint).toContain('name should be a string');
    expect(first.remaining).toBe(4);
    for (let i = 0; i < 4; i++) await u.call('getHint', ask());
    expect(await errorCode(u.call('getHint', ask()))).toBe('functions/resource-exhausted');
    expect((await read(`hintQuota/${u.uid}_${today()}`))?.count).toBe(5);
  });

  it('gives premium users 30 a day and opens premium lessons to them only', async () => {
    const free = await newUser();
    expect(await errorCode(free.call('getHint', ask(PREMIUM_Q)))).toBe('functions/permission-denied');

    const pro = await newUser();
    await admin(`users/${pro.uid}`, { entitlement: 'premium', premiumUntil: null });
    const r = await pro.call<Hint>('getHint', ask(PREMIUM_Q));
    expect(r.remaining).toBe(29);
    await admin(`hintQuota/${pro.uid}_${today()}`, { count: 29 });
    expect((await pro.call<Hint>('getHint', ask())).remaining).toBe(0);
    expect(await errorCode(pro.call('getHint', ask()))).toBe('functions/resource-exhausted');
  });

  it('never passes the reference solution through, and logs feedback', async () => {
    const u = await newUser();
    const r = await u.call<Hint>('getHint', ask({ code: '# LEAK_SOLUTION' }));
    expect(r.hint).not.toContain('Here is the full answer');
    const log = await read(`hintLogs/${r.hintId}`);
    expect(log).toMatchObject({ uid: u.uid, lessonId: 'py-variables', questionId: 'q02', helpful: null, replaced: true });
    expect(log).not.toHaveProperty('code'); // learner code isn't stored

    // 👍/👎: the owner may set `helpful`, nothing else.
    await updateDoc(doc(u.db, 'hintLogs', r.hintId), { helpful: true });
    expect((await getDoc(doc(u.db, 'hintLogs', r.hintId))).data()?.helpful).toBe(true);
    const other = await newUser();
    expect(await errorCode(updateDoc(doc(other.db, 'hintLogs', r.hintId), { helpful: false }))).toBe('permission-denied');
  });

  it('rejects unknown questions and oversized input', async () => {
    const u = await newUser();
    expect(await errorCode(u.call('getHint', ask({ questionId: 'q99' })))).toBe('functions/not-found');
    expect(await errorCode(u.call('getHint', ask({ questionId: 'q01' })))).toBe('functions/not-found'); // explain: nothing to hint
    expect(await errorCode(u.call('getHint', ask({ code: 'x'.repeat(20_000) })))).toBe('functions/invalid-argument');
  });
});
