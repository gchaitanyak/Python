import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { grantGroupSeat, revokeGroupSeat } from './entitlement';
import { seatHolders } from './groups';

const toUser = (data: FirebaseFirestore.DocumentData | undefined) => ({
  entitlement: data?.entitlement,
  entitlementSource: data?.entitlementSource,
  premiumUntilMs: data?.premiumUntil instanceof Timestamp ? data.premiumUntil.toMillis() : data?.premiumUntil == null ? null : 0,
  groupPremium: data?.groupPremium ?? null,
});

const toFirestore = (update: Record<string, unknown>) => {
  const { premiumUntilMs, ...rest } = update;
  return 'premiumUntilMs' in update ? { ...rest, premiumUntil: premiumUntilMs == null ? null : Timestamp.fromMillis(premiumUntilMs as number) } : rest;
};

/** Applies a seat change to one user's profile (no-op if nothing changes). */
export async function setSeat(db: Firestore, uid: string, gid: string, seated: boolean, nowMs: number): Promise<void> {
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const user = toUser(snap.data());
    if (seated && user.groupPremium && user.groupPremium !== gid) return; // already seated by another group
    const update = seated ? grantGroupSeat(user, gid, nowMs) : revokeGroupSeat(user, gid, nowMs);
    if (update) tx.set(ref, toFirestore(update), { merge: true });
  });
}

/**
 * Gives the group's premium seats to its earliest members and takes them from
 * the rest. Run after anyone joins or leaves, and when the site owner changes
 * the seat count (scripts/set-group-seats.ts).
 */
export async function syncSeats(db: Firestore, gid: string, nowMs = Date.now()): Promise<{ seated: number }> {
  const group = (await db.collection('groups').doc(gid).get()).data();
  const members = (await db.collection('groups').doc(gid).collection('members').get()).docs.map((d) => ({
    uid: d.id,
    joinedAtMs: (d.data().joinedAt as Timestamp | undefined)?.toMillis() ?? 0,
    seat: d.data().premiumSeat === true,
  }));
  const holders = seatHolders(members, typeof group?.premiumSeats === 'number' ? group.premiumSeats : 0);
  for (const m of members) {
    const seated = holders.has(m.uid);
    await setSeat(db, m.uid, gid, seated, nowMs);
    if (seated !== m.seat) await db.collection('groups').doc(gid).collection('members').doc(m.uid).set({ premiumSeat: seated }, { merge: true });
  }
  return { seated: holders.size };
}
