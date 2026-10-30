import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lessonsInOrder, type Placed } from './rules';
import type { Curriculum, Lesson } from './types';

/** Copied from ../content by copy-content.mjs at build time. */
const dir = resolve(__dirname, '../../content');

export const curriculum: Curriculum = JSON.parse(readFileSync(resolve(dir, 'curriculum.json'), 'utf8'));
const ordered = lessonsInOrder(curriculum);
const placedById = new Map(ordered.map((p) => [p.lesson.id, p]));
const lessonCache = new Map<string, Lesson>();

export const findPlaced = (lessonId: string): Placed | undefined => placedById.get(lessonId);

export function nextLessonId(lessonId: string): string | null {
  const i = ordered.findIndex((p) => p.lesson.id === lessonId);
  return ordered[i + 1]?.lesson.id ?? null;
}

export function loadLesson(lessonId: string): Lesson | undefined {
  if (!/^py-[a-z0-9-]+$/.test(lessonId) || placedById.get(lessonId)?.lesson.status !== 'written') return undefined;
  let lesson = lessonCache.get(lessonId);
  if (!lesson) {
    lesson = JSON.parse(readFileSync(resolve(dir, 'lessons', `${lessonId}.json`), 'utf8')) as Lesson;
    lessonCache.set(lessonId, lesson);
  }
  return lesson;
}
