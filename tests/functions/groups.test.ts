import { doc, getDoc } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { setGroupSeats } from '../../scripts/set-group-seats';
import { admin, errorCode, newUser, projectId, read } from './helpers';

type Created = { groupId: string; inviteCode: string };
type Report = {
  group: { name: string; inviteCode: string; premiumSeats: number; memberCount: number };
  members: { uid: string; username: string; lessonsCompleted: number; averageAccuracy: number | null; lastActiveMs: number | null; premiumSeat: boolean }[];
};
const canReadPremium = (u: Awaited<ReturnType<typeof newUser>>) => getDoc(doc(u.db, 'lessonContent/py-comparison-logical')).then(() => true, () => false);

async function setup() {
  const teacher = await newUser();
  const { groupId, inviteCode } = await teacher.call<Created>('createGroup', { name: '  Year 10   Python ' });
  return { teacher, groupId, inviteCode };
}

describe('groups (SPEC §5.7, acceptance 8)', () => {
  it('admins see each member’s progress and export it as CSV', async () => {
    const { teacher, groupId, inviteCode } = await setup();
    expect(inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    const ana = await newUser();
    await admin(`users/${ana.uid}`, { username: 'ana_g' });
    expect(await ana.call('groupForInvite', { code: inviteCode.toLowerCase() })).toMatchObject({ groupId, name: 'Year 10 Python', memberCount: 0, member: false });
    expect(await ana.call('joinGroup', { code: inviteCode })).toMatchObject({ groupId, name: 'Year 10 Python', alreadyMember: false, premiumSeat: false });
    expect((await ana.call('joinGroup', { code: inviteCode })).alreadyMember).toBe(true);
    await admin(`users/${ana.uid}/progress/py-intro-first-program`, { completed: true, bestAccuracy: 80 });
    await admin(`users/${ana.uid}/progress/py-print-and-comments`, { completed: true, bestAccuracy: 100 });

    const r = await teacher.call<Report>('groupReport', { groupId });
    expect(r.group).toMatchObject({ name: 'Year 10 Python', inviteCode, premiumSeats: 0, memberCount: 1 });
    expect(r.members).toEqual([expect.objectContaining({ uid: ana.uid, username: 'ana_g', lessonsCompleted: 2, averageAccuracy: 90, premiumSeat: false })]);
    const { csv, filename } = await teacher.call<{ csv: string; filename: string }>('exportGroupCsv', { groupId });
    expect(filename).toBe('year-10-python-progress.csv');
    expect(csv.split('\r\n')[1]).toMatch(/^ana_g,\d{4}-\d\d-\d\dT[^,]+,2,90,/);
    expect((await read(`users/${ana.uid}`))?.groups).toEqual({ [groupId]: { name: 'Year 10 Python', role: 'member' } });

    // Members and strangers can't see the report or the group.
    expect(await errorCode(ana.call('groupReport', { groupId }))).toBe('functions/permission-denied');
    expect(await errorCode(getDoc(doc(ana.db, 'groups', groupId)))).toBe('permission-denied');
    expect((await getDoc(doc(teacher.db, 'groups', groupId))).data()?.name).toBe('Year 10 Python');
  });

  it('premium seats go to the earliest members and move when someone leaves', async () => {
    const { teacher, groupId, inviteCode } = await setup();
    const [a, b] = [await newUser(), await newUser()];
    await a.call('joinGroup', { code: inviteCode });
    await b.call('joinGroup', { code: inviteCode });
    expect(await canReadPremium(a)).toBe(false);

    expect(await setGroupSeats(projectId, groupId, 1)).toEqual({ seated: 1, members: 2 });
    expect(await read(`users/${a.uid}`)).toMatchObject({ entitlement: 'premium', entitlementSource: 'group', groupPremium: groupId, premiumUntil: null });
    expect(await canReadPremium(a)).toBe(true);
    expect(await canReadPremium(b)).toBe(false);

    await a.call('leaveGroup', { groupId });
    expect(await read(`users/${a.uid}`)).toMatchObject({ entitlement: 'free', groupPremium: null });
    expect(await canReadPremium(a)).toBe(false);
    expect(await canReadPremium(b)).toBe(true); // the seat moved
    expect((await teacher.call<Report>('groupReport', { groupId })).members.map((m) => m.premiumSeat)).toEqual([true]);
  });

  it('admins can remove members, add admins and regenerate the invite code', async () => {
    const { teacher, groupId, inviteCode } = await setup();
    const [a, b] = [await newUser(), await newUser()];
    await a.call('joinGroup', { code: inviteCode });
    await b.call('joinGroup', { code: inviteCode });
    await setGroupSeats(projectId, groupId, 5);
    await teacher.call('removeMember', { groupId, uid: a.uid });
    expect(await read(`users/${a.uid}`)).toMatchObject({ entitlement: 'free', groups: {} });
    expect(await errorCode(b.call('removeMember', { groupId, uid: teacher.uid }))).toBe('functions/permission-denied');

    await teacher.call('addGroupAdmin', { groupId, uid: b.uid });
    expect((await b.call<Report>('groupReport', { groupId })).members).toHaveLength(1);

    const { inviteCode: fresh } = await teacher.call<{ inviteCode: string }>('regenerateInvite', { groupId });
    expect(fresh).not.toBe(inviteCode);
    const c = await newUser();
    expect(await errorCode(c.call('joinGroup', { code: inviteCode }))).toBe('functions/not-found');
    expect((await c.call('joinGroup', { code: fresh })).groupId).toBe(groupId);
  });

  it('deleting the only admin’s account closes the group and frees its seats', async () => {
    const { teacher, groupId, inviteCode } = await setup();
    const a = await newUser();
    await a.call('joinGroup', { code: inviteCode });
    await setGroupSeats(projectId, groupId, 1);
    expect(await canReadPremium(a)).toBe(true);
    await teacher.call('deleteAccount', {});
    expect(await read(`groups/${groupId}`)).toBeUndefined();
    expect(await read(`inviteCodes/${inviteCode}`)).toBeUndefined();
    expect(await read(`users/${a.uid}`)).toMatchObject({ entitlement: 'free', groups: {} });
  });

  it('rejects bad names', async () => {
    const u = await newUser();
    expect(await errorCode(u.call('createGroup', { name: 'x' }))).toBe('functions/invalid-argument');
  });
});
