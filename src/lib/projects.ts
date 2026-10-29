/**
 * Guided projects (SPEC §5.8). A project is a brief, one or more dataset files
 * and a list of steps in the lesson question format. It plays in the lesson
 * player: each step gets the dataset files written into Python's file system
 * first (through setupCode), so steps work on their own and can be retried.
 */
import type { Lesson, Question } from '../player/types';

/** One row of content/projects/projects.json — public. */
export interface ProjectInfo {
  id: string;
  order: number;
  title: string;
  summary: string;
  free: boolean;
  status: 'written' | 'to-write';
  skills: string[];
  /** Pyodide packages the steps import (loaded on demand). */
  packages: string[];
}

export interface DatasetFile {
  file: string;
  description: string;
  /** Filled in when the project is bundled for the browser. */
  content?: string;
}

/** content/projects/<id>/project.json, bundled with its dataset contents. */
export interface Project {
  id: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  brief: string;
  datasets: DatasetFile[];
  steps: Question[];
}

export const projectUrl = (id: string): string => `/projects/${id}/`;
/** Id the player and drafts use for a project, kept apart from lesson ids. */
export const projectLessonId = (id: string): string => `project-${id}`;

/** Python that (re)creates the dataset files. JSON string literals are valid Python string literals. */
export function datasetSetup(datasets: DatasetFile[]): string {
  const files = datasets.filter((d) => typeof d.content === 'string');
  if (files.length === 0) return '';
  const entries = files.map((d) => `    ${JSON.stringify(d.file)}: ${JSON.stringify(d.content)},`).join('\n');
  return `for _name, _text in {\n${entries}\n}.items():\n    with open(_name, "w") as _f:\n        _f.write(_text)\n`;
}

/** The project as a lesson the player (and the validator) can run. */
export function projectToLesson(p: Project): Lesson {
  const setup = datasetSetup(p.datasets);
  const steps = p.steps.map((q): Question => {
    if (!setup || q.type === 'multiple_choice' || q.type === 'predict_output') return q;
    if (q.type === 'explain' && !q.exampleCode) return q;
    return { ...q, setupCode: setup + (q.setupCode ? `\n${q.setupCode}` : '') } as Question;
  });
  return { id: projectLessonId(p.id), moduleId: 'projects', title: p.title, estimatedMinutes: p.estimatedMinutes, basePoints: 10, intro: p.brief, questions: steps };
}

/** A .py file to keep working offline: every code step's task as a comment, with room for the learner's code. */
export function starterScript(p: Project, siteUrl: string): string {
  const wrap = (text: string) => text.replace(/\*\*|`/g, '').replace(/(.{1,74})(\s+|$)/g, '# $1\n').trimEnd();
  const out = [`# ${p.title} — starter file`, `# ${siteUrl}${projectUrl(p.id)}`, `# Keep ${p.datasets.map((d) => d.file).join(', ')} in the same folder as this file.`];
  let first = true;
  for (const q of p.steps) {
    if (q.type !== 'write_code' && q.type !== 'fix_code') continue;
    out.push('', `# ${'-'.repeat(72)}`, wrap(q.prompt), `# ${'-'.repeat(72)}`, '', first ? q.starterCode.trimEnd() : '# Your code here', '');
    first = false;
  }
  return `${out.join('\n').trimEnd()}\n`;
}
