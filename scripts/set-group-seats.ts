/**
 * Site owner only: sets how many premium seats a group has (SPEC §5.7 — manual
 * for now, Stripe seats later) and hands them to the earliest members.
 *
 *   tsx scripts/set-group-seats.ts --group=<groupId> --seats=<n> [--project=<projectId>]
 *
 * Uses the Firestore emulator when FIRESTORE_EMULATOR_HOST is set; otherwise
 * application-default credentials (`gcloud auth application-default login`).
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// The seat logic lives with the functions; load firebase-admin from there so both use one copy.
const require = createRequire(resolve(import.meta.dirname, '../functions/package.json'));
const { initializeApp, getApps } = require('firebase-admin/app') as typeof import('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore') as typeof import('firebase-admin/firestore');

export async function setGroupSeats(projectId: string, groupId: string, seats: number): Promise<{ seated: number; members: number }> {
  const { syncSeats } = await import('../functions/src/lib/group-seats');
  const app = getApps()[0] ?? initializeApp({ projectId });
  const db = getFirestore(app);
  const ref = db.collection('groups').doc(groupId);
  const group = await ref.get();
  if (!group.exists) throw new Error(`No group ${groupId}`);
  await ref.update({ premiumSeats: seats });
  const { seated } = await syncSeats(db, groupId);
  return { seated, members: (group.data()!.memberCount as number) ?? 0 };
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const groupId = arg('group');
  const seats = Number(arg('seats'));
  if (!groupId || !Number.isInteger(seats) || seats < 0) {
    console.error('usage: tsx scripts/set-group-seats.ts --group=<groupId> --seats=<n> [--project=<projectId>]');
    process.exit(1);
  }
  setGroupSeats(arg('project') ?? process.env.GCLOUD_PROJECT ?? 'demo-python-exercises', groupId, seats).then(
    ({ seated, members }) => {
      console.log(`group ${groupId}: ${seats} premium seats, ${seated} in use, ${members} members`);
      process.exit(0);
    },
    (err: Error) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
