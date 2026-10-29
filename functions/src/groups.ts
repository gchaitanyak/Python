import { randomBytes } from 'node:crypto';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { db, displayName, FieldValue, rateLimit, requireUid, Timestamp, userRef } from './lib/admin';
import { now as clockNow } from './lib/clock';
import { setSeat, syncSeats } from './lib/group-seats';
import { groupName, inviteCodeFrom, MAX_GROUPS_PER_OWNER, MAX_MEMBERS, memberStats, membersCsv, normaliseInviteCode, type MemberRow } from './lib/groups';

const groupRef = (gid: string) => db.collection('groups').doc(gid);
const memberRef = (gid: string, uid: string) => groupRef(gid).collection('members').doc(uid);
const codeRef = (code: string) => db.collection('inviteCodes').doc(code);

function newInviteCode(): string {
  const bytes = randomBytes(32);
  let i = 0;
  return inviteCodeFrom(() => (i < bytes.length ? bytes[i++]! : randomBytes(1)[0]!));
}

function str(d: unknown, key: string): string {
  const v = (d as Record<string, unknown> | null)?.[key];
  if (typeof v !== 'string' || !v) throw new HttpsError('invalid-argument', `${key} is required.`);
  return v;
}

/** The group, if the caller is one of its admins. */
async function asAdmin(request: CallableRequest<unknown>, limit = 30) {
  const uid = requireUid(request);
  await rateLimit(uid, 'groupAdmin', limit);
  const gid = str(request.data, 'groupId');
  const snap = await groupRef(gid).get();
  if (!snap.exists || !(snap.data()!.adminUids as string[]).includes(uid)) throw new HttpsError('permission-denied', 'Only this group’s admins can do that.');
  return { uid, gid, group: snap.data()! };
}

/** Creates a group with the caller as its admin (SPEC §5.7). Premium seats start at 0; the site owner sets them. */
export const createGroup = onCall(async (request) => {
  const uid = requireUid(request);
  await rateLimit(uid, 'createGroup', 5);
  const named = groupName((request.data as { name?: unknown } | null)?.name);
  if (!named.ok) throw new HttpsError('invalid-argument', named.error);
  const owned = await db.collection('groups').where('ownerUid', '==', uid).count().get();
  if (owned.data().count >= MAX_GROUPS_PER_OWNER) throw new HttpsError('resource-exhausted', `You can run up to ${MAX_GROUPS_PER_OWNER} groups.`);
  const gid = groupRef('x').parent.doc().id;
  const now = Timestamp.fromDate(await clockNow());
  return db.runTransaction(async (tx) => {
    let code = newInviteCode();
    while ((await tx.get(codeRef(code))).exists) code = newInviteCode();
    tx.create(groupRef(gid), { name: named.name, ownerUid: uid, adminUids: [uid], inviteCode: code, premiumSeats: 0, memberCount: 0, createdAt: now });
    tx.create(codeRef(code), { groupId: gid });
    tx.set(userRef(uid), { groups: { [gid]: { name: named.name, role: 'admin' } } }, { merge: true });
    return { groupId: gid, inviteCode: code };
  });
});

/** Name and size of the group behind an invite code, for the join page. */
export const groupForInvite = onCall(async (request) => {
  const uid = requireUid(request);
  await rateLimit(uid, 'groupForInvite', 20);
  const code = normaliseInviteCode((request.data as { code?: unknown } | null)?.code);
  const gid = code ? ((await codeRef(code).get()).data()?.groupId as string | undefined) : undefined;
  const group = gid ? (await groupRef(gid).get()).data() : undefined;
  if (!gid || !group) throw new HttpsError('not-found', 'That invite link isn’t valid any more. Ask your group admin for a new one.');
  const member = (await memberRef(gid, uid).get()).exists;
  return { groupId: gid, name: group.name as string, memberCount: group.memberCount as number, member };
});

export const joinGroup = onCall(async (request) => {
  const uid = requireUid(request);
  await rateLimit(uid, 'joinGroup', 10);
  const code = normaliseInviteCode((request.data as { code?: unknown } | null)?.code);
  const gid = code ? ((await codeRef(code).get()).data()?.groupId as string | undefined) : undefined;
  if (!gid) throw new HttpsError('not-found', 'That invite link isn’t valid any more. Ask your group admin for a new one.');
  const now = await clockNow();
  const joined = await db.runTransaction(async (tx) => {
    const [group, member, user] = await Promise.all([tx.get(groupRef(gid)), tx.get(memberRef(gid, uid)), tx.get(userRef(uid))]);
    if (!group.exists) throw new HttpsError('not-found', 'That group no longer exists.');
    const g = group.data()!;
    if (member.exists) return { name: g.name as string, already: true };
    if ((g.memberCount as number) >= MAX_MEMBERS) throw new HttpsError('resource-exhausted', 'This group is full.');
    tx.create(memberRef(gid, uid), { joinedAt: Timestamp.fromDate(now), username: displayName(uid, user.data()), premiumSeat: false });
    tx.update(groupRef(gid), { memberCount: FieldValue.increment(1) });
    const role = (g.adminUids as string[]).includes(uid) ? 'admin' : 'member';
    tx.set(userRef(uid), { groups: { [gid]: { name: g.name, role } } }, { merge: true });
    return { name: g.name as string, already: false };
  });
  await syncSeats(db, gid, now.getTime());
  const seat = (await memberRef(gid, uid).get()).data()?.premiumSeat === true;
  return { groupId: gid, name: joined.name, alreadyMember: joined.already, premiumSeat: seat };
});

/** Takes `uid` out of the group: membership, seat and the group entry on their profile. */
async function removeFromGroup(gid: string, uid: string, nowMs: number): Promise<void> {
  const removed = await db.runTransaction(async (tx) => {
    const [group, member] = await Promise.all([tx.get(groupRef(gid)), tx.get(memberRef(gid, uid))]);
    if (!member.exists) return false;
    tx.delete(memberRef(gid, uid));
    if (group.exists) tx.update(groupRef(gid), { memberCount: FieldValue.increment(-1) });
    const admin = group.exists && (group.data()!.adminUids as string[]).includes(uid);
    if (!admin) tx.set(userRef(uid), { groups: { [gid]: FieldValue.delete() } }, { merge: true });
    else tx.set(userRef(uid), { groups: { [gid]: { role: 'admin' } } }, { merge: true });
    return true;
  });
  if (!removed) return;
  await setSeat(db, uid, gid, false, nowMs);
  await syncSeats(db, gid, nowMs); // the freed seat moves to the next member
}

export const leaveGroup = onCall(async (request) => {
  const uid = requireUid(request);
  await rateLimit(uid, 'leaveGroup', 10);
  await removeFromGroup(str(request.data, 'groupId'), uid, (await clockNow()).getTime());
  return { left: true };
});

export const removeMember = onCall(async (request) => {
  const { gid } = await asAdmin(request);
  await removeFromGroup(gid, str(request.data, 'uid'), (await clockNow()).getTime());
  return { removed: true };
});

export const regenerateInvite = onCall(async (request) => {
  const { gid, group } = await asAdmin(request, 10);
  return db.runTransaction(async (tx) => {
    let code = newInviteCode();
    while ((await tx.get(codeRef(code))).exists) code = newInviteCode();
    tx.delete(codeRef(group.inviteCode as string));
    tx.create(codeRef(code), { groupId: gid });
    tx.update(groupRef(gid), { inviteCode: code });
    return { inviteCode: code };
  });
});

/** Makes a member an admin too (groups can have several). */
export const addGroupAdmin = onCall(async (request) => {
  const { gid, group } = await asAdmin(request, 10);
  const member = str(request.data, 'uid');
  if (!(await memberRef(gid, member).get()).exists) throw new HttpsError('not-found', 'Only members can become admins.');
  await groupRef(gid).update({ adminUids: FieldValue.arrayUnion(member) });
  await userRef(member).set({ groups: { [gid]: { name: group.name, role: 'admin' } } }, { merge: true });
  return { added: true };
});

async function report(gid: string): Promise<MemberRow[]> {
  const members = await groupRef(gid).collection('members').get();
  const rows = await Promise.all(
    members.docs.map(async (m) => {
      const progress = await userRef(m.id).collection('progress').get();
      const stats = memberStats(
        progress.docs.map((p) => {
          const d = p.data();
          return { completed: d.completed, bestAccuracy: d.bestAccuracy, lastPractisedAtMs: d.lastPractisedAt instanceof Timestamp ? d.lastPractisedAt.toMillis() : null };
        }),
      );
      return { uid: m.id, username: String(m.data().username ?? ''), joinedAtMs: (m.data().joinedAt as Timestamp | undefined)?.toMillis() ?? 0, premiumSeat: m.data().premiumSeat === true, ...stats };
    }),
  );
  return rows.sort((a, b) => a.username.localeCompare(b.username));
}

/** Admin portal data: the group and each member's progress (SPEC §5.7). */
export const groupReport = onCall(async (request) => {
  const { gid, group } = await asAdmin(request);
  return {
    group: { id: gid, name: group.name, inviteCode: group.inviteCode, premiumSeats: group.premiumSeats ?? 0, memberCount: group.memberCount ?? 0 },
    members: await report(gid),
  };
});

export const exportGroupCsv = onCall(async (request) => {
  const { gid, group } = await asAdmin(request, 10);
  const slug = String(group.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
  return { filename: `${slug}-progress.csv`, csv: membersCsv(await report(gid)) };
});

/** Account deletion: leave every group; groups left without an admin are closed. */
export async function removeUserFromGroups(uid: string, groups: Record<string, unknown> | undefined, nowMs: number): Promise<void> {
  for (const gid of Object.keys(groups ?? {})) {
    await removeFromGroup(gid, uid, nowMs);
    const snap = await groupRef(gid).get();
    if (!snap.exists) continue;
    const admins = (snap.data()!.adminUids as string[]).filter((a) => a !== uid);
    if (admins.length > 0) {
      await groupRef(gid).update({ adminUids: admins, ownerUid: admins[0] });
      continue;
    }
    // No admins left: release every member's seat, then close the group.
    const members = await groupRef(gid).collection('members').get();
    for (const m of members.docs) await removeFromGroup(gid, m.id, nowMs);
    await codeRef(snap.data()!.inviteCode as string).delete();
    await db.recursiveDelete(groupRef(gid));
  }
}
