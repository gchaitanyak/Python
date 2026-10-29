import '../../lib/page';
import '../../styles/curriculum.css';
import { mountBoard } from '../../components/leaderboard';
import { findLesson, lessonUrl, nextRecommended } from '../../lib/curriculum';
import { decorateLessons } from '../../lib/progress-view';
import { challengeHistory, utcDay, type Session } from '../../lib/session';
import { resolveVisitor } from '../../lib/visitor';
import { loadCurriculum } from '../../player/lesson-loader';
import { currentStreak, loadProgress, localPoints } from '../../player/progress';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const now = new Date();
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

void (async () => {
  const [{ visitor, session }, curriculum] = await Promise.all([resolveVisitor(), loadCurriculum()]);

  if (session) {
    const p = session.profile;
    $('[data-points]').textContent = String(p?.totalPoints ?? 0);
    $('[data-points-help]').textContent = 'Total points on your account';
    $('[data-streak]').textContent = days(currentStreak(p?.streak ?? { count: 0, lastDay: null }, now));
    $('[data-dash-lead]').textContent = `Welcome back${p?.firstName ? `, ${p.firstName}` : ''}. Work through the modules in order, or jump to any topic.`;
  } else {
    const local = loadProgress();
    $('[data-points]').textContent = String(localPoints(local));
    $('[data-streak]').textContent = days(currentStreak(local.streak, now));
  }

  decorateLessons(document, curriculum, visitor, now);
  const next = nextRecommended(curriculum, visitor, now);
  const link = $<HTMLAnchorElement>('[data-next-link]');
  if (next) {
    $('[data-next-title]').textContent = next.title;
    $('[data-next-module]').textContent = findLesson(curriculum, next.id)?.module.title ?? '';
    link.href = lessonUrl(next.id);
    link.textContent = visitor.progress[next.id]?.completed ? 'Review lesson' : 'Start lesson';
  } else {
    $('[data-next-title]').textContent = 'You’ve finished every lesson available to you.';
    $('[data-next-module]').textContent = 'More lessons arrive with premium.';
    link.hidden = true;
  }

  const uid = session?.user.uid;
  mountBoard($('[data-board="points"]'), 'points', uid);
  mountBoard($('[data-board="streak"]'), 'streak', uid);
  if (session) await showDaily(session);
})();

/** Daily challenge card: today's result and a 7-day accuracy trend (SPEC §5.4). */
async function showDaily(session: Session): Promise<void> {
  const history = await challengeHistory(session.user.uid).catch(() => []);
  const today = history.find((h) => h.date === utcDay());
  if (today?.accuracy != null) {
    $('[data-daily-status]').textContent = `Done today: ${today.accuracy}%`;
    $('[data-daily-detail]').textContent = 'Come back tomorrow for a new set. You can still practise today’s.';
    $('[data-daily-link]').textContent = 'See results';
  }
  if (history.length === 0) return;
  $('[data-trend-bars]').innerHTML = history
    .map((h) => {
      const label = new Date(`${h.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
      const value = h.accuracy == null ? 'not taken' : `${h.accuracy}%`;
      return `<li class="trend__day" data-date="${h.date}"><span class="trend__bar" style="--v:${h.accuracy ?? 0}" aria-hidden="true"></span><span class="trend__label">${label}</span><span class="visually-hidden">${h.date}: ${value}</span></li>`;
    })
    .join('');
  $('[data-trend]').hidden = false;
}
