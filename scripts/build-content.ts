/**
 * Content build step.
 *   --emit-free   write dist/data/curriculum.json and dist/data/lessons/<id>.json for free lessons
 * (--upload-premium arrives with payments in Phase 6.)
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freeLessonIds, lessonPath, publicCurriculum } from './content-data';

const dist = resolve(import.meta.dirname, '../dist');

if (process.argv.includes('--emit-free')) {
  const lessonsOut = resolve(dist, 'data/lessons');
  mkdirSync(lessonsOut, { recursive: true });
  writeFileSync(resolve(dist, 'data/curriculum.json'), publicCurriculum());
  const ids = freeLessonIds();
  for (const id of ids) copyFileSync(lessonPath(id), resolve(lessonsOut, `${id}.json`));
  console.log(`content: ${ids.length} free lessons → dist/data/lessons/`);
} else {
  console.error('usage: tsx scripts/build-content.ts --emit-free');
  process.exit(1);
}
