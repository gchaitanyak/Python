/** Adds per-visitor status and lock state to curriculum HTML rendered at build time. */
import { STATUS_LABEL, lessonAccess, lessonStatus, moduleProgress, type Visitor } from './curriculum';
import type { Curriculum } from '../player/types';

export function decorateLessons(root: ParentNode, c: Curriculum, v: Visitor, now = new Date()): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-lesson-id]')) {
    const id = el.dataset.lessonId!;
    const status = lessonStatus(v.progress[id], now);
    const access = lessonAccess(c, id, v);
    el.dataset.status = status;
    el.dataset.access = access.kind;
    const label = el.querySelector<HTMLElement>('[data-state-label]');
    if (!label) continue;
    switch (access.kind) {
      case 'coming-soon':
        label.textContent = '';
        break;
      case 'sign-in':
        label.textContent = 'Locked · sign in';
        break;
      case 'upgrade':
        label.textContent = 'Locked · premium';
        break;
      case 'finish-previous':
        label.textContent = status === 'not-started' ? 'Locked · finish previous lesson' : STATUS_LABEL[status];
        break;
      case 'open':
        label.textContent = STATUS_LABEL[status];
        break;
    }
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-module-id]')) {
    const m = c.modules.find((x) => x.id === el.dataset.moduleId);
    const target = el.querySelector<HTMLElement>('[data-module-progress]');
    if (m && target) {
      const { done, total } = moduleProgress(m, v);
      target.textContent = `${done} of ${total} lessons done`;
    }
  }
}
