import { firebaseConfigured } from '../lib/firebase-config';
import { watchBoard, type Board, type BoardKind, type BoardRow } from '../lib/session';
import { escapeHtml } from './html';

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function formatValue(kind: BoardKind, row: Pick<BoardRow, 'value' | 'seconds'>): string {
  if (kind === 'points') return `${row.value} pts`;
  if (kind === 'streak') return `${row.value} ${row.value === 1 ? 'day' : 'days'}`;
  return `${row.value}% · ${formatTime(row.seconds ?? 0)}`;
}

const EMPTY: Record<BoardKind, string> = {
  points: 'No points yet today — be the first.',
  streak: 'No streaks yet today.',
  challenge: 'Nobody has taken today’s challenge yet.',
};

/**
 * Live top 10 + "You: #rank" for one board. Expects a container holding
 * `[data-board-list]` (an <ol>) and `[data-board-me]`.
 */
export function mountBoard(container: HTMLElement, kind: BoardKind, uid: string | undefined, date?: string): void {
  const list = container.querySelector<HTMLElement>('[data-board-list]')!;
  const me = container.querySelector<HTMLElement>('[data-board-me]')!;
  if (!firebaseConfigured()) {
    list.innerHTML = '<li class="help-text">Leaderboards are not available here.</li>';
    return;
  }
  const render = (board: Board) => {
    list.innerHTML = board.top.length
      ? board.top
          .map(
            (r, i) =>
              `<li class="leaderboard__row${r.uid === uid ? ' leaderboard__row--me' : ''}" data-uid="${escapeHtml(r.uid)}"><span class="leaderboard__rank">${i + 1}</span><span class="leaderboard__name">${escapeHtml(r.username)}${r.uid === uid ? ' (you)' : ''}</span><span class="leaderboard__points">${formatValue(kind, r)}</span></li>`,
          )
          .join('')
      : `<li class="help-text">${EMPTY[kind]}</li>`;
    if (board.me) me.textContent = `You: #${board.me.rank} with ${formatValue(kind, board.me)} today.`;
    else if (uid) me.textContent = kind === 'challenge' ? 'Take today’s challenge to appear here.' : 'Finish a lesson today to appear here.';
    else me.innerHTML = `<a href="/login/?next=${encodeURIComponent(location.pathname)}">Log in</a> to appear on the leaderboard.`;
  };
  watchBoard(kind, uid, render, date).catch(() => {
    list.innerHTML = '<li class="help-text">The leaderboard couldn’t be loaded.</li>';
  });
}
