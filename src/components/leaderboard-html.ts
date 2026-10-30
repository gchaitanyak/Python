import { escapeHtml } from './html';

export type BoardKind = 'points' | 'streak' | 'challenge';

/** Markup for one board card (the dashboard and /daily/ fill it with mountBoard). */
export function boardCard(kind: BoardKind, title: string): string {
  return `<div class="card leaderboard" data-board="${kind}">
  <h2 class="dash__label">${escapeHtml(title)}</h2>
  <ol class="leaderboard__list" data-board-list aria-live="polite"><li class="help-text">Loading…</li></ol>
  <p class="help-text" data-board-me></p>
</div>`;
}
