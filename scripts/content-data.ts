/** Shared by the Vite dev server and scripts/build-content.ts: what content is public. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGuide } from '../src/lib/guides';

/** content/ by default; CONTENT_DIR points the validator at another tree (used by its own tests). */
export const contentDir = process.env.CONTENT_DIR ? resolve(process.env.CONTENT_DIR) : resolve(import.meta.dirname, '../content');

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

/** Ids of premium lessons that have a lesson file — uploaded to Firestore, never served statically. */
export function premiumLessonIds(): string[] {
  return readCurriculum()
    .modules.flatMap((m) => m.lessons)
    .filter((l) => !l.free && existsSync(lessonPath(l.id)))
    .map((l) => l.id);
}

export const lessonPath = (id: string): string => resolve(contentDir, 'lessons', `${id}.json`);

/** Files from the pyodide npm package needed to run Python (no extra packages yet). */
export const PYODIDE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
export const pyodideDir = resolve(import.meta.dirname, '../node_modules/pyodide');

/** Full curriculum (with references) for build-time page rendering. */
export function loadCurriculumFile(): import('../src/player/types').Curriculum {
  return JSON.parse(readFileSync(resolve(contentDir, 'curriculum.json'), 'utf8'));
}

/* ---------- projects (SPEC §5.8) ---------- */

export const projectsDir = resolve(contentDir, 'projects');

/** content/projects/projects.json: every planned project, in order. Public. */
export function projectCatalogue(): import('../src/lib/projects').ProjectInfo[] {
  const file = resolve(projectsDir, 'projects.json');
  if (!existsSync(file)) return [];
  const { projects } = JSON.parse(readFileSync(file, 'utf8')) as { projects: import('../src/lib/projects').ProjectInfo[] };
  return [...projects].sort((a, b) => a.order - b.order);
}

export const writtenProjects = () => projectCatalogue().filter((p) => p.status === 'written');

/** A written project with its dataset files' contents included. */
export function bundleProject(id: string): import('../src/lib/projects').Project {
  const p = JSON.parse(readFileSync(resolve(projectsDir, id, 'project.json'), 'utf8')) as import('../src/lib/projects').Project;
  return { ...p, datasets: p.datasets.map((d) => ({ ...d, content: readFileSync(resolve(projectsDir, id, d.file), 'utf8') })) };
}

export const datasetPath = (id: string, file: string): string => resolve(projectsDir, id, file);

/* ---------- guides (SPEC §5.9) ---------- */

export const guidesDir = resolve(contentDir, 'guides');

/** Every guide in content/guides/, sorted by title. */
export function loadGuides(): import('../src/lib/guides').Guide[] {
  if (!existsSync(guidesDir)) return [];
  return readdirSync(guidesDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseGuide(f.slice(0, -3), readFileSync(resolve(guidesDir, f), 'utf8')))
    .sort((a, b) => a.title.localeCompare(b.title));
}
