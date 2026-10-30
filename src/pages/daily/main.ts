import '../../lib/page';
import '../../styles/player.css';
import '../../styles/curriculum.css';
import { escapeHtml } from '../../components/html';
import { mountBoard } from '../../components/leaderboard';
import { firebaseConfigured } from '../../lib/firebase-config';
import { loginUrl } from '../../lib/page';
import { call, challengeResult, currentSession, getDailyChallenge, type ChallengeResult, type DailyChallenge } from '../../lib/session';
import { formatSeconds, Player, type FinishContext } from '../../player/player';
import { PythonClient } from '../../player/python-client';
import type { Lesson, Question } from '../../player/types';

const root = document.querySelector<HTMLElement>('[data-player]')!;
const intro = document.querySelector<HTMLElement>('[data-daily-intro]')!;
const status = document.querySelector<HTMLElement>('[data-daily-status]')!;
const startButton = document.querySelector<HTMLButtonElement>('[data-daily-start]')!;
root.querySelector<HTMLElement>('[data-head]')!.hidden = true;

let player: Player | undefined;
const python = new PythonClient(
  () => new Worker(new URL('../../worker/python.worker.ts', import.meta.url), { type: 'module' }),
  (s, detail) => player?.setPythonStatus(s, detail),
);
player = new Player(root, python);

interface SubmitResponse extends ChallengeResult {
  scored: boolean;
  total: number;
  correct: number;
  rank: number;
  streak: number;
}

function say(kind: 'info' | 'success' | 'error', html: string): void {
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.innerHTML = html;
}

const stat = (label: string, value: string) => `<div class="stat"><dt>${label}</dt><dd>${value}</dd></div>`;

void (async () => {
  if (!firebaseConfigured()) {
    document.querySelector('[data-daily-date]')!.textContent = 'The daily challenge isn’t available here.';
    return;
  }
  const session = await currentSession().catch(() => null);
  let challenge: DailyChallenge;
  try {
    challenge = await getDailyChallenge();
  } catch {
    document.querySelector('[data-daily-date]')!.textContent = 'Today’s challenge couldn’t be loaded. Try again in a moment.';
    return;
  }
  const uid = session?.user.uid;
  const date = challenge.date;
  const nice = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  document.querySelector('[data-daily-date]')!.textContent = `${nice} · ${challenge.questions.length} questions · resets at 00:00 UTC`;
  mountBoard(document.querySelector('[data-board="challenge"]')!, 'challenge', uid, date);

  let scored: ChallengeResult | undefined = uid ? await challengeResult(uid, date).catch(() => undefined) : undefined;
  const describe = () => {
    if (scored) {
      say('success', `You scored <strong>${scored.accuracy}%</strong> in ${formatSeconds(scored.seconds)} today. Practise again — it won’t change your score.`);
      startButton.textContent = 'Practise again';
    } else if (!session) {
      say('info', `<a href="${loginUrl()}">Log in</a> to submit a scored attempt and join the leaderboard. You can still practise.`);
      startButton.textContent = 'Practise today’s challenge';
    }
  };
  describe();

  const lesson: Lesson = {
    id: `daily-${date}`,
    moduleId: 'daily',
    title: `Daily challenge · ${nice}`,
    estimatedMinutes: 5,
    basePoints: 0,
    intro: '',
    questions: challenge.questions as unknown as Question[],
  };

  const begin = () => {
    intro.hidden = true;
    player!.start(lesson, { mode: 'challenge', crumb: { text: 'Daily challenge', href: '/daily/' }, onFinish });
  };

  function onFinish(ctx: FinishContext): void {
    const practice = !session || !!scored;
    const head = `<h2 class="summary__title" tabindex="-1">${practice ? 'Practice round complete' : 'Challenge complete!'}</h2>`;
    const actions = `<div class="summary__actions"><button type="button" class="btn btn--primary" data-again>Practise again</button><a class="btn btn--ghost" href="/learn/">Back to dashboard</a></div>`;
    const render = (stats: string, note: string) => {
      ctx.summary.innerHTML = `${head}<dl class="stats">${stats}</dl><p class="summary__note">${note}</p>${actions}`;
      ctx.summary.querySelector('[data-again]')!.addEventListener('click', begin);
      ctx.summary.querySelector<HTMLElement>('.summary__title')!.focus();
    };
    const local = stat('Correct', `${ctx.correct} of ${ctx.total}`) + stat('Time', formatSeconds(ctx.seconds));
    if (practice) {
      render(local, scored ? `Your scored result today: ${scored.accuracy}% in ${formatSeconds(scored.seconds)}.` : `<a href="${loginUrl()}">Log in</a> to submit a scored attempt tomorrow.`);
      return;
    }
    render(local, 'Saving your result…');
    void call<SubmitResponse>('submitChallenge', { date, answers: ctx.answers, seconds: ctx.seconds })
      .then((r) => {
        scored = r;
        render(
          stat('Accuracy', `${r.accuracy}%`) + stat('Time', formatSeconds(r.seconds)) + stat('Rank', `#${r.rank}`) + stat('Streak', `${r.streak} ${r.streak === 1 ? 'day' : 'days'}`),
          r.scored ? 'Your score is on today’s leaderboard below.' : 'You’d already done today’s challenge, so this round was practice.',
        );
        describe();
      })
      .catch((err: Error) => render(local, `We couldn’t save your result: ${escapeHtml(err.message)}`));
  }

  startButton.disabled = false;
  startButton.addEventListener('click', begin);
})();
