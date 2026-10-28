/** Shared by the Vite dev server and scripts/build-content.ts: what content is public. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const contentDir = resolve(import.meta.dirname, '../content');

interface RawCurriculum {
  modules: { id: string; lessons: { id: string; free: boolean; references?: unknown }[] }[];
}

function readCurriculum(): RawCurriculum {
  return JSON.parse(readFileSync(resolve(contentDir, 'curriculum.json'), 'utf8')) as RawCurriculum;
}

/** curriculum.json without the scope-only reference links. Titles, order and flags are public. */
export function publicCurriculum(): string {
  const curriculum = readCurriculum();
  for (const m of curriculum.modules) for (const l of m.lessons) delete l.references;
  return JSON.stringify(curriculum);
}

/** Ids of free lessons that have a lesson file — the only lessons served as static JSON. */
export function freeLessonIds(): string[] {
  return readCurriculum()
    .modules.flatMap((m) => m.lessons)
    .filter((l) => l.free && existsSync(lessonPath(l.id)))
    .map((l) => l.id);
}

export const lessonPath = (id: string): string => resolve(contentDir, 'lessons', `${id}.json`);

/** Files from the pyodide npm package needed to run Python (no extra packages yet). */
export const PYODIDE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
export const pyodideDir = resolve(import.meta.dirname, '../node_modules/pyodide');
