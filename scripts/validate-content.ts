/**
 * Validates content/: every lesson against lesson.schema.json and curriculum.json,
 * then runs reference answers through the same harness the browser uses
 * (src/worker/harness.py on Pyodide in Node):
 *   - write_code / fix_code: solution passes every test, starterCode fails at least one
 *   - fill_blank: filled template passes its tests (tests mode)
 *   - predict_output: code really prints expectedOutput
 *   - explain: exampleCode runs without error
 *   - multiple_choice: answer is one of the option ids
 * Style rules from docs/CONTENT_GUIDE.md are reported as warnings.
 *
 * Written projects (content/projects/) get the same checks, with their dataset
 * files in place, as the browser runs them.
 *
 * Usage: tsx scripts/validate-content.ts [lessonId | projectId ...]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { loadPyodide } from 'pyodide';
import type { Lesson, Question } from '../src/player/types';
import { projectToLesson } from '../src/lib/projects';
import { bundleProject, contentDir, projectCatalogue } from './content-data';

interface CurriculumFile {
  modules: { id: string; lessons: { id: string; type: string; status: string }[] }[];
}

const harnessSource = readFileSync(resolve(import.meta.dirname, '../src/worker/harness.py'), 'utf8');
const schema = JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/lesson.schema.json'), 'utf8'));
const curriculum = JSON.parse(readFileSync(resolve(contentDir, 'curriculum.json'), 'utf8')) as CurriculumFile;
const entries = new Map(curriculum.modules.flatMap((m) => m.lessons.map((l) => [l.id, { ...l, moduleId: m.id }] as const)));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

const py = await loadPyodide();
py.setStdin({ error: true });
py.runPython(`
import json, sys, types
harness = types.ModuleType("harness")
exec(${JSON.stringify(harnessSource)}, harness.__dict__)

def _call(name, payload):
    p = json.loads(payload)
    if name == "grade":
        r = harness.grade(p["code"], p["tests"], p.get("setup") or "")
    elif name == "run":
        r = harness.run_public(p["code"], p.get("setup") or "")
    elif name == "predict":
        out = harness.run_public(p["code"])
        r = {"error": out["error"], "stdout": out["stdout"], "ok": harness.check_predict(out["stdout"], p["expected"])}
    elif name == "fill":
        r = {"code": harness.fill_template(p["template"], p["values"])}
    return json.dumps(r)
`);
const callPy = py.globals.get('_call') as (name: string, payload: string) => string;
const call = <T>(name: string, payload: object): T => JSON.parse(callPy(name, JSON.stringify(payload))) as T;

interface Graded {
  passed: boolean;
  results: { name: string; passed: boolean; message: string }[];
  error: { type: string; message: string } | null;
}

function checkQuestion(q: Question, index: number): string[] {
  const errs: string[] = [];
  const tag = `${q.id} (${q.type})`;
  const expectedId = `q${String(index + 1).padStart(2, '0')}`;
  if (q.id !== expectedId) errs.push(`${tag}: expected id ${expectedId}`);
  switch (q.type) {
    case 'write_code':
    case 'fix_code': {
      const good = call<Graded>('grade', { code: q.solution, tests: q.tests, setup: q.setupCode });
      if (!good.passed) errs.push(`${tag}: solution fails: ${JSON.stringify(good.results.filter((r) => !r.passed).map((r) => r.message))}`);
      const bad = call<Graded>('grade', { code: q.starterCode, tests: q.tests, setup: q.setupCode });
      if (bad.passed) errs.push(`${tag}: starterCode already passes all tests`);
      break;
    }
    case 'fill_blank': {
      let code: string;
      try {
        code = call<{ code: string }>('fill', { template: q.template, values: q.blanks }).code;
      } catch {
        errs.push(`${tag}: number of blanks does not match the template`);
        break;
      }
      if ((q.matchMode ?? 'tests') === 'tests') {
        if (!q.tests?.length) errs.push(`${tag}: needs tests unless matchMode is exact`);
        else if (!call<Graded>('grade', { code, tests: q.tests, setup: q.setupCode }).passed) errs.push(`${tag}: filled template fails its tests`);
      }
      break;
    }
    case 'predict_output': {
      const r = call<{ error: Graded['error']; stdout: string; ok: boolean }>('predict', { code: q.code, expected: q.expectedOutput });
      if (r.error) errs.push(`${tag}: code raises ${r.error.type}: ${r.error.message}`);
      else if (!r.ok) errs.push(`${tag}: expectedOutput ${JSON.stringify(q.expectedOutput)} but code prints ${JSON.stringify(r.stdout)}`);
      break;
    }
    case 'multiple_choice':
      if (!q.options.some((o) => o.id === q.answer)) errs.push(`${tag}: answer not among option ids`);
      if (new Set(q.options.map((o) => o.id)).size !== q.options.length) errs.push(`${tag}: duplicate option ids`);
      break;
    case 'explain':
      if (q.exampleCode) {
        const r = call<{ error: Graded['error'] }>('run', { code: q.exampleCode, setup: q.setupCode });
        if (r.error) errs.push(`${tag}: exampleCode raises ${r.error.type}: ${r.error.message}`);
      }
      break;
  }
  return errs;
}

function styleWarnings(lesson: Lesson, type: string): string[] {
  const warns: string[] = [];
  const count = (...types: Question['type'][]) => lesson.questions.filter((q) => types.includes(q.type)).length;
  const n = lesson.questions.length;
  if (type === 'summary') {
    if (count('explain') > 0) warns.push('summary lessons should have no explain questions');
    if (n < 8 || n > 10) warns.push(`summary lessons should have 8–10 questions (has ${n})`);
  } else if (count('explain') > 2) {
    warns.push(`at most 2 explain questions (has ${count('explain')})`);
  }
  if (count('write_code', 'fix_code') < n / 2) warns.push(`fewer than half the questions are write_code/fix_code (${count('write_code', 'fix_code')}/${n})`);
  return warns;
}

function checkLesson(path: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  let lesson: Lesson;
  try {
    lesson = JSON.parse(readFileSync(path, 'utf8')) as Lesson;
  } catch (e) {
    return { errors: [`invalid JSON: ${(e as Error).message}`], warnings: [] };
  }
  if (!validateSchema(lesson)) {
    for (const e of validateSchema.errors ?? []) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
    return { errors, warnings: [] };
  }
  const id = basename(path, '.json');
  if (lesson.id !== id) errors.push(`id ${lesson.id} does not match file name ${id}.json`);
  const entry = entries.get(lesson.id);
  if (!entry) errors.push(`id ${lesson.id} not in curriculum.json`);
  else {
    if (entry.moduleId !== lesson.moduleId) errors.push(`moduleId should be ${entry.moduleId}`);
    if (entry.status !== 'written') errors.push(`curriculum.json status for ${lesson.id} should be "written"`);
  }
  lesson.questions.forEach((q, i) => errors.push(...checkQuestion(q, i)));
  return { errors, warnings: styleWarnings(lesson, entry?.type ?? 'lesson') };
}

const lessonsDir = resolve(contentDir, 'lessons');
const only = process.argv.slice(2);
const files = readdirSync(lessonsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .filter((f) => only.length === 0 || only.includes(basename(f, '.json')));
const projectIds = new Set(projectCatalogue().map((p) => p.id));

let failed = 0;
let missing = 0;
for (const file of files) {
  const { errors, warnings } = checkLesson(resolve(lessonsDir, file));
  console.log(`${errors.length ? 'FAIL' : 'ok  '} ${basename(file, '.json')}`);
  for (const e of errors) console.log(`     - ${e}`);
  for (const w of warnings) console.log(`     ~ warning: ${w}`);
  if (errors.length) failed++;
}

// Every lesson marked written must have a file.
if (only.length === 0) {
  const onDisk = new Set(files.map((f) => basename(f, '.json')));
  for (const [id, entry] of entries) {
    if (entry.status === 'written' && !onDisk.has(id)) {
      console.log(`FAIL ${id}\n     - marked "written" in curriculum.json but content/lessons/${id}.json is missing`);
      missing++;
    }
  }
}

console.log(`${files.length - failed}/${files.length} lessons valid${missing ? `, ${missing} missing` : ''}`);

// Projects: each written project's steps, run with its dataset files in place.
const projects = projectCatalogue().filter((p) => p.status === 'written' && (only.length === 0 || only.includes(p.id)));
let projectsFailed = 0;
for (const info of projects) {
  const errors: string[] = [];
  try {
    const project = bundleProject(info.id);
    if (project.id !== info.id) errors.push(`project.json id ${project.id} should be ${info.id}`);
    if (!project.title || !project.summary || !project.brief) errors.push('title, summary and brief are required');
    if (!(project.estimatedMinutes >= 10 && project.estimatedMinutes <= 120)) errors.push('estimatedMinutes should be 10–120');
    if (project.datasets.length === 0) errors.push('a project needs at least one dataset file');
    const lesson = projectToLesson(project);
    // Steps use the lesson question format; the id pattern and length limit are lesson-only.
    if (!validateSchema({ ...lesson, id: `py-${lesson.id}`, estimatedMinutes: 30 })) for (const e of validateSchema.errors ?? []) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
    else lesson.questions.forEach((q, i) => errors.push(...checkQuestion(q, i)));
  } catch (e) {
    errors.push(`cannot load: ${(e as Error).message}`);
  }
  console.log(`${errors.length ? 'FAIL' : 'ok  '} project ${info.id}`);
  for (const e of errors) console.log(`     - ${e}`);
  if (errors.length) projectsFailed++;
}
if (projects.length) console.log(`${projects.length - projectsFailed}/${projects.length} projects valid`);
process.exit(failed || missing || projectsFailed ? 1 : 0);
