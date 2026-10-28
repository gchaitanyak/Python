import type { Curriculum, CurriculumLesson, CurriculumModule, Lesson } from './types';

export const LESSON_ID = /^py-[a-z0-9-]+$/;

export type LoadResult =
  | { status: 'ok'; lesson: Lesson; entry: CurriculumLesson; module: CurriculumModule; next?: CurriculumLesson }
  | { status: 'not-found' }
  | { status: 'locked'; entry: CurriculumLesson; module: CurriculumModule }
  | { status: 'unavailable'; entry: CurriculumLesson; module: CurriculumModule };

export async function loadCurriculum(fetcher: typeof fetch = fetch): Promise<Curriculum> {
  const res = await fetcher('/data/curriculum.json');
  if (!res.ok) throw new Error(`curriculum: HTTP ${res.status}`);
  return (await res.json()) as Curriculum;
}

/** Every lesson in learning order: modules by order, then lessons by order. */
export function lessonsInOrder(curriculum: Curriculum): { lesson: CurriculumLesson; module: CurriculumModule }[] {
  return [...curriculum.modules]
    .sort((a, b) => a.order - b.order)
    .flatMap((module) => [...module.lessons].sort((a, b) => a.order - b.order).map((lesson) => ({ lesson, module })));
}

/**
 * Free lessons are static JSON on Hosting. Premium lessons need an account
 * (Phase 4) and a subscription (Phase 6); until then they show as locked.
 */
export async function loadLesson(lessonId: string | null, fetcher: typeof fetch = fetch): Promise<LoadResult> {
  if (!lessonId || !LESSON_ID.test(lessonId)) return { status: 'not-found' };
  const ordered = lessonsInOrder(await loadCurriculum(fetcher));
  const index = ordered.findIndex((x) => x.lesson.id === lessonId);
  const found = ordered[index];
  if (!found) return { status: 'not-found' };
  const { lesson: entry, module } = found;
  if (!entry.free) return { status: 'locked', entry, module };
  const res = await fetcher(`/data/lessons/${lessonId}.json`);
  if (!res.ok) return { status: 'unavailable', entry, module };
  const lesson = (await res.json()) as Lesson;
  return { status: 'ok', lesson, entry, module, next: ordered[index + 1]?.lesson };
}
