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
  /** Dev-only: open premium lessons from /data/preview/ without an account (authoring aid). */
  preview?: boolean;
  /** Reads a premium lesson from Firestore (lessonContent/{id}); the rules let only premium users read it. */
  premiumLoader?: (lessonId: string) => Promise<Lesson | undefined>;
}

export async function loadCurriculum(fetcher: typeof fetch = fetch): Promise<Curriculum> {
  const res = await fetcher('/data/curriculum.json');
  if (!res.ok) throw new Error(`curriculum: HTTP ${res.status}`);
  return (await res.json()) as Curriculum;
}

/**
 * Free lessons are static JSON on Hosting. Premium lessons are read from
 * Firestore, where the security rules enforce the paywall (SPEC §6).
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

  let lesson: Lesson | undefined;
  if (!placed.lesson.free && !preview) {
    lesson = await options.premiumLoader?.(lessonId).catch(() => undefined);
  } else {
    const res = await fetcher(`/data/${preview ? 'preview/' : ''}lessons/${lessonId}.json`);
    lesson = res.ok ? ((await res.json()) as Lesson) : undefined;
  }
  if (!lesson) return { status: 'unavailable', placed };
  const ordered = lessonsInOrder(curriculum);
  const next = ordered[ordered.findIndex((p) => p.lesson.id === lessonId) + 1]?.lesson;
  const recommendFirst = placed.index === 0 ? unfinishedEarlierModule(curriculum, placed.module.id, visitor) : undefined;
  return { status: 'ok', lesson, placed, next, recommendFirst };
}
