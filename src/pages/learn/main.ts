import '../../styles/main.css';
import '../../styles/curriculum.css';
import { anonymous, findLesson, lessonUrl, nextRecommended } from '../../lib/curriculum';
import { decorateLessons } from '../../lib/progress-view';
import { loadCurriculum } from '../../player/lesson-loader';
import { currentStreak, loadProgress, localPoints } from '../../player/progress';

const progress = loadProgress();
const visitor = anonymous(progress.lessons);
const now = new Date();

const streak = currentStreak(progress.streak, now);
document.querySelector('[data-points]')!.textContent = String(localPoints(progress));
document.querySelector('[data-streak]')!.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;

void loadCurriculum().then((curriculum) => {
  decorateLessons(document, curriculum, visitor, now);
  const next = nextRecommended(curriculum, visitor, now);
  const title = document.querySelector<HTMLElement>('[data-next-title]')!;
  const link = document.querySelector<HTMLAnchorElement>('[data-next-link]')!;
  const module = document.querySelector<HTMLElement>('[data-next-module]')!;
  if (next) {
    title.textContent = next.title;
    module.textContent = findLesson(curriculum, next.id)?.module.title ?? '';
    link.href = lessonUrl(next.id);
    link.textContent = progress.lessons[next.id]?.completed ? 'Review lesson' : 'Start lesson';
  } else {
    title.textContent = 'You’ve finished every lesson available to you.';
    module.textContent = 'More lessons arrive with accounts and premium.';
    link.hidden = true;
  }
});
