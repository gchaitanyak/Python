import { findLesson, lessonAccess, lessonsInOrder, unfinishedEarlierModule, type Access, type Placed, type Visitor } from '../lib/curriculum';
import type { Curriculum, CurriculumLesson, CurriculumModule, Lesson } from './types';

export const LESSON_ID = /^py-[a-z0-9-]+$/;

export type LoadResult =
  | {
      status: 'ok';
      lesson: Lesson;
      placed: Placed;
      next?: CurriculumLesson;
      /** Set on a module's first lesson when an earlier module is unfinished (SPEC §5.3). */
      recommendFirst?: CurriculumModule;
    }
  | { status: 'not-found' }
  | { status: 'locked'; placed: Placed; access: Exclude<Access, { kind: 'open' } | { kind: 'coming-soon' }> }
  | { status: 'unavailable'; placed: Placed };

export interface LoadOptions {
  fetcher?: typeof fetch;
  /** Dev-only: open premium lessons from /data/preview/ so authors can play them before payments exist. */
  preview?: boolean;
}

export async function loadCurriculum(fetcher: typeof fetch = fetch): Promise<Curriculum> {
  const res = await fetcher('/data/curriculum.json');
  if (!res.ok) throw new Error(`curriculum: HTTP ${res.status}`);
  return (await res.json()) as Curriculum;
}

/**
 * Free lessons are static JSON on Hosting. Premium lessons need an account
 * (Phase 4) and a subscription (Phase 6); until then they show as locked.
 */
export async function loadLesson(lessonId: string | null, visitor: Visitor, options: LoadOptions = {}): Promise<LoadResult> {
  const fetcher = options.fetcher ?? fetch;
  if (!lessonId || !LESSON_ID.test(lessonId)) return { status: 'not-found' };
  const curriculum = await loadCurriculum(fetcher);
  const placed = findLesson(curriculum, lessonId);
  if (!placed) return { status: 'not-found' };

  const preview = !!options.preview && !placed.lesson.free;
  const access = lessonAccess(curriculum, lessonId, preview ? { ...visitor, signedIn: true, premium: true } : visitor);
  if (access.kind === 'coming-soon') return { status: 'unavailable', placed };
  if (access.kind !== 'open') return { status: 'locked', placed, access };

  const res = await fetcher(`/data/${preview ? 'preview/' : ''}lessons/${lessonId}.json`);
  if (!res.ok) return { status: 'unavailable', placed };
  const lesson = (await res.json()) as Lesson;
  const ordered = lessonsInOrder(curriculum);
  const next = ordered[ordered.findIndex((p) => p.lesson.id === lessonId) + 1]?.lesson;
  const recommendFirst = placed.index === 0 ? unfinishedEarlierModule(curriculum, placed.module.id, visitor) : undefined;
  return { status: 'ok', lesson, placed, next, recommendFirst };
}
