/**
 * Markup for the lesson player, shared by /practice/ and /daily/ and inserted at
 * build time (<!-- @player -->). `src/player/player.ts` binds to the data-* hooks.
 */
export function playerShell(): { open: string; body: string; close: string } {
  const open = '<main id="main" tabindex="-1" class="player" data-player>';
  const body = `
      <p class="visually-hidden" data-announce aria-live="polite"></p>

      <div class="player__head container" data-head>
        <nav aria-label="Breadcrumb" class="crumbs">
          <a href="/learn/">Learn</a> <span aria-hidden="true">›</span> <a data-crumb href="/learn/"></a>
        </nav>
        <h1 class="player__title" data-lesson-title>Loading lesson…</h1>
        <div class="player__meta">
          <div class="progress" data-progress role="progressbar" aria-label="Lesson progress" aria-valuemin="1" aria-valuemax="1" aria-valuenow="1">
            <span class="progress__fill" data-progress-fill></span>
          </div>
          <span class="player__count" data-progress-text></span>
          <span class="player__points" data-points aria-label="Points this lesson">0 pts</span>
        </div>
      </div>

      <div class="container intro" data-intro hidden></div>

      <form class="player__body container" data-question-form novalidate hidden>
        <section class="player__prompt" aria-labelledby="question-title">
          <p class="q-type" data-q-type></p>
          <h2 id="question-title" class="q-title" data-q-title tabindex="-1">Question 1</h2>
          <div class="prose" data-prompt></div>
          <div data-answer></div>
          <div class="hint" data-hint id="question-hint" hidden></div>
          <div class="ai-hint" data-ai-hint id="question-ai-hint" aria-live="polite" hidden></div>
          <div class="feedback" data-feedback role="status" aria-live="polite"></div>
        </section>

        <section class="player__work" data-work aria-label="Code">
          <div data-work-area></div>
          <div class="console" data-console-wrap hidden>
            <h3 class="work__label">Output</h3>
            <pre class="console__out" data-console aria-live="polite"></pre>
          </div>
          <p class="py-status" data-python-status role="status">Loading Python…</p>
        </section>

        <div class="player__actions">
          <div class="actions__group">
            <button type="button" class="btn btn--ghost" data-action="prev">← Previous</button>
            <button type="button" class="btn btn--ghost" data-action="skip">Skip</button>
          </div>
          <div class="actions__group">
            <button type="button" class="btn btn--ghost" data-action="hint" aria-controls="question-hint">Hint</button>
            <button type="button" class="btn btn--ghost" data-action="ai-hint" aria-controls="question-ai-hint" hidden>Ask the AI tutor</button>
            <button type="button" class="btn btn--ghost" data-action="solution">Show solution</button>
            <button type="button" class="btn btn--ghost" data-action="reset">Reset code</button>
          </div>
        </div>
        <div class="player__main-actions">
          <button type="button" class="btn btn--secondary" data-action="run" aria-keyshortcuts="Shift+Enter">Run</button>
          <button type="submit" class="btn btn--primary" data-action="primary" aria-keyshortcuts="Enter">Check</button>
        </div>
      </form>

      <section class="container summary" data-summary hidden aria-label="Lesson summary"></section>
      <section class="container message" data-message hidden></section>
    `;
  const close = `</main>
    <dialog class="dialog" data-solution-dialog aria-labelledby="solution-dialog-title">
      <form method="dialog">
        <h2 id="solution-dialog-title">Show the solution?</h2>
        <p>You’ll get 0 points for this question. Tip: try the hint first, or check twice more and the solution unlocks.</p>
        <div class="dialog__actions">
          <button class="btn btn--ghost" value="cancel" autofocus>Keep trying</button>
          <button class="btn btn--primary" value="show">Show solution</button>
        </div>
      </form>
    </dialog>
`;
  return { open, body, close };
}

/** The whole player: <!-- @player -->. Pages with extra sections use @player-open / @player-body / @player-close. */
export function fillPlayerShell(html: string): string {
  const { open, body, close } = playerShell();
  return html
    .replace('<!-- @player -->', open + body + close)
    .replace('<!-- @player-open -->', open)
    .replace('<!-- @player-body -->', body)
    .replace('<!-- @player-close -->', close);
}
