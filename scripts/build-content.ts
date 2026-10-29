/**
 * Content build step.
 *   --emit-free       write dist/data/curriculum.json, dist/data/lessons/<id>.json for free lessons, and
 *                     dist/data/projects/<id>.json plus its dataset files for free projects
 *   --upload-premium  write premium lessons to Firestore lessonContent/{id} and premium projects (with their
 *                     dataset files) to projectContent/{id} (readable only by premium
 *                     users, per firestore.rules). Uses the Firestore emulator when FIRESTORE_EMULATOR_HOST
 *                     is set; otherwise application-default credentials and GCLOUD_PROJECT / --project=<id>.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundleProject, datasetPath, freeLessonIds, lessonPath, premiumLessonIds, publicCurriculum, writtenProjects } from './content-data';

const dist = resolve(import.meta.dirname, '../dist');

export async function uploadPremium(projectId: string): Promise<number> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ projectId });
  const db = getFirestore(app);
  const ids = premiumLessonIds();
  const batch = db.batch();
  for (const id of ids) batch.set(db.collection('lessonContent').doc(id), JSON.parse(readFileSync(lessonPath(id), 'utf8')));
  const projects = writtenProjects().filter((p) => !p.free);
  for (const p of projects) batch.set(db.collection('projectContent').doc(p.id), bundleProject(p.id));
  await batch.commit();
  return ids.length + projects.length;
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
    const projects = writtenProjects().filter((p) => p.free);
    for (const p of projects) {
      const bundle = bundleProject(p.id);
      mkdirSync(resolve(dist, 'data/projects', p.id), { recursive: true });
      writeFileSync(resolve(dist, 'data/projects', `${p.id}.json`), JSON.stringify(bundle));
      for (const d of bundle.datasets) copyFileSync(datasetPath(p.id, d.file), resolve(dist, 'data/projects', p.id, d.file));
    }
    console.log(`content: ${projects.length} free projects → dist/data/projects/`);
  }
  if (args.includes('--upload-premium')) {
    const projectId = args.find((a) => a.startsWith('--project='))?.slice(10) ?? process.env.GCLOUD_PROJECT ?? 'demo-python-exercises';
    const n = await uploadPremium(projectId);
    console.log(`content: ${n} premium lessons and projects → Firestore lessonContent/, projectContent/ (${process.env.FIRESTORE_EMULATOR_HOST ? 'emulator' : projectId})`);
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
