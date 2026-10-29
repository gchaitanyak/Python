import '../../lib/page';
import '../../styles/curriculum.css';
import { escapeHtml } from '../../components/html';
import { findLesson, lessonUrl, nextRecommended } from '../../lib/curriculum';
import { decorateLessons } from '../../lib/progress-view';
import { firebaseConfigured } from '../../lib/firebase-config';
import { leaderboard } from '../../lib/session';
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

  await showLeaderboard(session?.user.uid);
})();

async function showLeaderboard(uid: string | undefined): Promise<void> {
  const list = $('[data-leaderboard]');
  const me = $('[data-leaderboard-me]');
  if (!firebaseConfigured()) {
    list.innerHTML = '<li class="help-text">Leaderboards are not available here.</li>';
    return;
  }
  try {
    const board = await leaderboard(uid);
    list.innerHTML = board.top.length
      ? board.top
          .map(
            (r, i) =>
              `<li class="leaderboard__row${r.uid === uid ? ' leaderboard__row--me' : ''}"><span class="leaderboard__rank">${i + 1}</span><span class="leaderboard__name">${escapeHtml(r.username)}${r.uid === uid ? ' (you)' : ''}</span><span class="leaderboard__points">${r.points} pts</span></li>`,
          )
          .join('')
      : '<li class="help-text">No points yet today — be the first.</li>';
    me.innerHTML = board.me
      ? `You: #${board.me.rank} with ${board.me.points} pts today.`
      : uid
        ? 'Earn points today to appear here.'
        : '<a href="/login/?next=/learn/">Log in</a> to appear on the leaderboard.';
  } catch {
    list.innerHTML = '<li class="help-text">The leaderboard couldn’t be loaded.</li>';
  }
}
