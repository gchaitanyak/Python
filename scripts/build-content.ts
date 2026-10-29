/**
 * Content build step.
 *   --emit-free       write dist/data/curriculum.json and dist/data/lessons/<id>.json for free lessons
 *   --upload-premium  write premium lessons to Firestore lessonContent/{id} (readable only by premium
 *                     users, per firestore.rules). Uses the Firestore emulator when FIRESTORE_EMULATOR_HOST
 *                     is set; otherwise application-default credentials and GCLOUD_PROJECT / --project=<id>.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freeLessonIds, lessonPath, premiumLessonIds, publicCurriculum } from './content-data';

const dist = resolve(import.meta.dirname, '../dist');

export async function uploadPremium(projectId: string): Promise<number> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId });
  const db = getFirestore(app);
  const ids = premiumLessonIds();
  const batch = db.batch();
  for (const id of ids) batch.set(db.collection('lessonContent').doc(id), JSON.parse(readFileSync(lessonPath(id), 'utf8')));
  await batch.commit();
  return ids.length;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--emit-free')) {
    const lessonsOut = resolve(dist, 'data/lessons');
    mkdirSync(lessonsOut, { recursive: true });
    writeFileSync(resolve(dist, 'data/curriculum.json'), publicCurriculum());
    const ids = freeLessonIds();
    for (const id of ids) copyFileSync(lessonPath(id), resolve(lessonsOut, `${id}.json`));
    console.log(`content: ${ids.length} free lessons → dist/data/lessons/`);
  }
  if (args.includes('--upload-premium')) {
    const projectId = args.find((a) => a.startsWith('--project='))?.slice(10) ?? process.env.GCLOUD_PROJECT ?? 'demo-python-exercises';
    const n = await uploadPremium(projectId);
    console.log(`content: ${n} premium lessons → Firestore lessonContent/ (${process.env.FIRESTORE_EMULATOR_HOST ? 'emulator' : projectId})`);
  }
  if (!args.includes('--emit-free') && !args.includes('--upload-premium')) {
    console.error('usage: tsx scripts/build-content.ts [--emit-free] [--upload-premium [--project=<id>]]');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
