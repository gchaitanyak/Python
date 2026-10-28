import { escapeHtml } from '../components/html';
import { lessonUrl, moduleUrl } from '../lib/curriculum';
import type { RunResult } from '../worker/protocol';
import { createEditor, type CodeEditor } from './editor';
import { blankCount, fillTemplate, gradeAnswer, type Answer } from './grading';
import type { LoadResult } from './lesson-loader';
import { inline, renderMarkdown } from './markdown';
import { currentStreak, localPoints, loadDraft, recordCompletion, saveDraft } from './progress';
import type { PythonClient, PythonStatus } from './python-client';
import { accuracy, emptyState, maxPoints, pointsFor, totalPoints, type QuestionState } from './scoring';
import { isGradable, type Lesson, type Question } from './types';

const TYPE_LABEL: Record<Question['type'], string> = {
  explain: 'Read and try',
  write_code: 'Write code',
  fix_code: 'Fix the code',
  predict_output: 'Predict the output',
  multiple_choice: 'Choose one',
  fill_blank: 'Fill in the blanks',
};

/** What the learner has entered for each question, kept while they move around the lesson. */
interface Work {
  code?: string;
  text?: string;
  choice?: string | null;
  blanks?: string[];
  /** Lines typed into the Input box, fed to input() on Run. */
  stdin?: string;
  hintShown?: boolean;
  feedback?: { kind: 'pass' | 'fail' | 'info'; html: string };
}

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

export class Player {
  private lesson!: Lesson;
  private result!: Extract<LoadResult, { status: 'ok' }>;
  private index = 0;
  private states: Record<string, QuestionState> = {};
  private work: Record<string, Work> = {};
  private editor: CodeEditor | undefined;
  private busy = false;
  private pythonStatus: PythonStatus = 'loading';

  private readonly el;

  constructor(
    private readonly root: HTMLElement,
    private readonly python: PythonClient,
  ) {
    this.el = {
      head: $(root, '[data-head]'),
      title: $(root, '[data-lesson-title]'),
      crumb: $(root, '[data-crumb]'),
      bar: $(root, '[data-progress]'),
      barFill: $(root, '[data-progress-fill]'),
      progressText: $(root, '[data-progress-text]'),
      points: $(root, '[data-points]'),
      form: $<HTMLFormElement>(root, '[data-question-form]'),
      intro: $(root, '[data-intro]'),
      qTitle: $(root, '[data-q-title]'),
      qType: $(root, '[data-q-type]'),
      prompt: $(root, '[data-prompt]'),
      answer: $(root, '[data-answer]'),
      hint: $(root, '[data-hint]'),
      feedback: $(root, '[data-feedback]'),
      work: $(root, '[data-work]'),
      workArea: $(root, '[data-work-area]'),
      consoleWrap: $(root, '[data-console-wrap]'),
      console: $(root, '[data-console]'),
      pyStatus: $(root, '[data-python-status]'),
      btnPrev: $<HTMLButtonElement>(root, '[data-action="prev"]'),
      btnSkip: $<HTMLButtonElement>(root, '[data-action="skip"]'),
      btnHint: $<HTMLButtonElement>(root, '[data-action="hint"]'),
      btnSolution: $<HTMLButtonElement>(root, '[data-action="solution"]'),
      btnReset: $<HTMLButtonElement>(root, '[data-action="reset"]'),
      btnRun: $<HTMLButtonElement>(root, '[data-action="run"]'),
      btnPrimary: $<HTMLButtonElement>(root, '[data-action="primary"]'),
      summary: $(root, '[data-summary]'),
      message: $(root, '[data-message]'),
      announce: $(root, '[data-announce]'),
      dialog: $<HTMLDialogElement>(document, '[data-solution-dialog]'),
    };
    this.bindEvents();
  }

  /* ---------- lifecycle ---------- */

  show(result: LoadResult): void {
    if (result.status !== 'ok') return this.showMessage(result);
    this.result = result;
    this.lesson = result.lesson;
    this.states = Object.fromEntries(this.lesson.questions.map((q) => [q.id, emptyState()]));
    this.work = {};
    this.index = 0;
    document.title = `${this.lesson.title} — Python Exercises`;
    this.el.title.textContent = this.lesson.title;
    this.el.crumb.textContent = result.placed.module.title;
    this.el.crumb.setAttribute('href', moduleUrl(result.placed.module.id));
    const earlier = result.recommendFirst;
    const note = earlier
      ? `<p class="note">Recommended: finish <a href="${moduleUrl(earlier.id)}">${escapeHtml(earlier.title)}</a> first. You can still start here.</p>`
      : '';
    this.el.intro.innerHTML = note + renderMarkdown(this.lesson.intro);
    this.el.intro.hidden = false;
    this.el.head.hidden = false;
    this.el.form.hidden = false;
    this.el.summary.hidden = true;
    this.el.message.hidden = true;
    this.renderQuestion(false);
  }

  setPythonStatus(status: PythonStatus, detail?: string): void {
    this.pythonStatus = status;
    const text: Record<PythonStatus, string> = {
      loading: 'Loading Python…',
      ready: 'Python ready',
      busy: 'Running…',
      error: `Python failed to load${detail ? `: ${detail}` : ''}. Reload the page to try again.`,
    };
    this.el.pyStatus.textContent = text[status];
    this.el.pyStatus.dataset.status = status;
  }

  private get question(): Question {
    return this.lesson.questions[this.index]!;
  }

  private get state(): QuestionState {
    return this.states[this.question.id]!;
  }

  private get current(): Work {
    return (this.work[this.question.id] ??= {});
  }

  /* ---------- events ---------- */

  private bindEvents(): void {
    const { form } = this.el;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.primary();
    });
    this.el.btnPrev.addEventListener('click', () => this.go(this.index - 1));
    this.el.btnSkip.addEventListener('click', () => this.next());
    this.el.btnHint.addEventListener('click', () => this.toggleHint());
    this.el.btnSolution.addEventListener('click', () => this.requestSolution());
    this.el.btnReset.addEventListener('click', () => this.reset());
    this.el.btnRun.addEventListener('click', () => void this.run());
    this.el.dialog.addEventListener('close', () => {
      if (this.el.dialog.returnValue === 'show') this.revealSolution();
      else this.el.btnSolution.focus();
    });

    // Keyboard: Enter = Check/Continue, Shift+Enter = Run. The editor handles its own keys.
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement;
      if (target.closest('.cm-editor') || target.closest('button, a, summary')) return;
      // Input box: Enter adds a line (programs may read several), Shift+Enter runs.
      if (target.matches('[data-stdin]')) {
        if (e.shiftKey) {
          e.preventDefault();
          void this.run();
        }
        return;
      }
      const isTextarea = target instanceof HTMLTextAreaElement;
      if (e.shiftKey) {
        if (isTextarea) return; // newline in a multi-line answer
        e.preventDefault();
        if (!this.el.btnRun.hidden) void this.run();
        return;
      }
      if (e.altKey) return;
      e.preventDefault();
      void this.primary();
    });
  }

  /* ---------- rendering ---------- */

  private renderQuestion(moveFocus = true): void {
    const q = this.question;
    const n = this.lesson.questions.length;
    this.editor?.destroy();
    this.editor = undefined;

    this.el.intro.hidden = this.index !== 0;
    this.el.qTitle.textContent = `Question ${this.index + 1}`;
    this.el.qType.textContent = TYPE_LABEL[q.type];
    this.el.prompt.innerHTML = renderMarkdown(q.prompt);
    this.el.answer.innerHTML = '';
    this.el.workArea.innerHTML = '';
    this.el.console.textContent = '';
    this.el.consoleWrap.hidden = true;

    this.el.bar.setAttribute('aria-valuenow', String(this.index + 1));
    this.el.bar.setAttribute('aria-valuemax', String(n));
    this.el.bar.setAttribute('aria-valuetext', `Question ${this.index + 1} of ${n}`);
    this.el.barFill.style.width = `${((this.index + 1) / n) * 100}%`;
    this.el.progressText.textContent = `Question ${this.index + 1} of ${n}`;
    this.updatePoints();

    switch (q.type) {
      case 'explain':
        if (q.exampleCode) {
          this.mountEditor(this.current.code ?? q.exampleCode, 'Example code — edit and run it');
          if (q.exampleCode.includes('input(')) this.mountStdin(false);
        }
        this.el.work.hidden = !q.exampleCode;
        break;
      case 'write_code':
      case 'fix_code': {
        const draft = this.current.code ?? loadDraft(this.lesson.id, q.id) ?? q.starterCode;
        this.mountEditor(draft, q.type === 'fix_code' ? 'Code to fix' : 'Your code', true);
        if ([q.starterCode, q.solution].some((c) => c.includes('input('))) this.mountStdin(!!q.setupCode?.includes('__input__'));
        this.el.work.hidden = false;
        break;
      }
      case 'predict_output':
        this.el.workArea.innerHTML = `<h3 class="work__label">Code</h3><pre class="code-sample"><code>${escapeHtml(q.code)}</code></pre>`;
        this.el.answer.innerHTML = `<label class="field-label" for="predict-input">Your answer — what does it print?</label>
          <textarea id="predict-input" class="text-input text-input--mono" rows="3" spellcheck="false" autocomplete="off" aria-describedby="predict-help"></textarea>
          <p id="predict-help" class="help-text">Enter checks your answer. Shift+Enter adds a new line.</p>`;
        this.el.work.hidden = false;
        {
          const input = $<HTMLTextAreaElement>(this.el.answer, 'textarea');
          input.value = this.current.text ?? '';
          input.addEventListener('input', () => (this.current.text = input.value));
        }
        break;
      case 'multiple_choice': {
        const name = `choice-${q.id}`;
        this.el.answer.innerHTML = `<fieldset class="choices"><legend class="visually-hidden">Options</legend>${q.options
          .map(
            (o) => `<label class="choice"><input type="radio" name="${name}" value="${escapeHtml(o.id)}"><span>${inline(o.text)}</span></label>`,
          )
          .join('')}</fieldset>`;
        for (const radio of this.el.answer.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
          radio.checked = radio.value === this.current.choice;
          radio.addEventListener('change', () => (this.current.choice = radio.value));
        }
        this.el.work.hidden = true;
        break;
      }
      case 'fill_blank': {
        const count = blankCount(q.template);
        const values = this.current.blanks ?? Array.from({ length: count }, () => '');
        this.current.blanks = values;
        const parts = q.template.split('___');
        const html = parts
          .map((part, i) =>
            i === 0
              ? escapeHtml(part)
              : `<input class="blank" type="text" data-blank="${i - 1}" aria-label="Blank ${i} of ${count}" spellcheck="false" autocomplete="off" autocapitalize="off">${escapeHtml(part)}`,
          )
          .join('');
        this.el.workArea.innerHTML = `<h3 class="work__label">Fill in the blanks</h3><pre class="code-sample code-sample--blanks"><code>${html}</code></pre>`;
        for (const input of this.el.workArea.querySelectorAll<HTMLInputElement>('input[data-blank]')) {
          const i = Number(input.dataset.blank);
          input.value = values[i] ?? '';
          sizeBlank(input);
          input.addEventListener('input', () => {
            values[i] = input.value;
            sizeBlank(input);
          });
        }
        this.el.work.hidden = false;
        break;
      }
    }

    this.renderHint();
    this.renderFeedback();
    this.renderActions();
    this.el.announce.textContent = `Question ${this.index + 1} of ${n}: ${TYPE_LABEL[q.type]}`;
    if (moveFocus) this.focusQuestion();
  }

  private mountEditor(doc: string, label: string, saveDrafts = false): void {
    const lessonId = this.lesson.id;
    const qid = this.question.id;
    this.el.workArea.innerHTML = `<div class="work__label-row"><h3 class="work__label">${escapeHtml(label)}</h3><span class="help-text">Shift+Enter runs · Ctrl/⌘+Enter checks · Esc then Tab leaves the editor</span></div><div class="editor-host"></div>`;
    this.editor = createEditor($(this.el.workArea, '.editor-host'), {
      doc,
      label,
      onRun: () => void this.run(),
      onCheck: () => void this.primary(),
      onChange: (code) => {
        this.current.code = code;
        if (saveDrafts) saveDraft(lessonId, qid, code);
      },
    });
  }

  /** Box for the lines input() reads when the learner presses Run. */
  private mountStdin(hasSample: boolean): void {
    const help = hasSample
      ? 'One line per <code>input()</code> call. Leave it empty to use the sample answers.'
      : 'One line per <code>input()</code> call.';
    this.el.workArea.insertAdjacentHTML(
      'beforeend',
      `<div class="stdin"><label class="work__label" for="stdin-input">Input</label>
        <textarea id="stdin-input" class="text-input text-input--mono" rows="2" spellcheck="false" autocomplete="off" data-stdin aria-describedby="stdin-help"></textarea>
        <p id="stdin-help" class="help-text">${help} Shift+Enter runs.</p></div>`,
    );
    const box = $<HTMLTextAreaElement>(this.el.workArea, '[data-stdin]');
    box.value = this.current.stdin ?? '';
    box.addEventListener('input', () => (this.current.stdin = box.value));
  }

  private focusQuestion(): void {
    const q = this.question;
    if (this.state.correct || q.type === 'explain') return this.el.qTitle.focus();
    if (this.editor) return this.editor.focus();
    const first = this.root.querySelector<HTMLElement>('[data-answer] textarea, [data-answer] input, [data-work-area] input');
    (first ?? this.el.qTitle).focus();
  }

  private renderActions(): void {
    const q = this.question;
    const done = this.state.correct || q.type === 'explain';
    const gradable = isGradable(q);
    const runnable =
      (q.type === 'explain' && !!q.exampleCode) ||
      q.type === 'write_code' ||
      q.type === 'fix_code' ||
      (q.type === 'fill_blank' && q.matchMode !== 'exact');
    this.el.btnPrev.disabled = this.index === 0;
    this.el.btnSkip.hidden = !gradable || done;
    this.el.btnHint.hidden = !gradable || !q.hint;
    this.el.btnHint.setAttribute('aria-expanded', String(!!this.current.hintShown));
    this.el.btnSolution.hidden = !gradable || this.state.correct;
    this.el.btnReset.hidden = !(q.type === 'write_code' || q.type === 'fix_code' || q.type === 'fill_blank' || (q.type === 'explain' && q.exampleCode));
    this.el.btnRun.hidden = !runnable;
    const last = this.index === this.lesson.questions.length - 1;
    this.el.btnPrimary.textContent = done ? (last ? 'Finish lesson →' : 'Continue →') : 'Check';
    this.el.btnPrimary.dataset.mode = done ? 'continue' : 'check';
    this.el.btnPrimary.disabled = this.busy;
    this.el.btnRun.disabled = this.busy;
  }

  private renderHint(): void {
    const q = this.question;
    this.el.hint.hidden = !this.current.hintShown || !q.hint;
    this.el.hint.innerHTML = q.hint ? `<strong>Hint:</strong> ${inline(q.hint)}` : '';
  }

  private renderFeedback(): void {
    const fb = this.current.feedback;
    this.el.feedback.className = `feedback${fb ? ` feedback--${fb.kind}` : ''}`;
    this.el.feedback.innerHTML = fb?.html ?? '';
  }

  private updatePoints(): void {
    this.el.points.textContent = `${totalPoints(this.states)} pts`;
  }

  private setFeedback(kind: 'pass' | 'fail' | 'info', html: string): void {
    this.current.feedback = { kind, html };
    this.renderFeedback();
  }

  private showConsole(result: RunResult, emptyText = '(no output)'): void {
    const parts: string[] = [];
    if (result.stdout) parts.push(result.stdout.replace(/\n$/, ''));
    if (result.stderr) parts.push(result.stderr.replace(/\n$/, ''));
    if (result.error) {
      const where = result.error.line ? ` (line ${result.error.line})` : '';
      parts.push(`${result.error.type}: ${result.error.message}${where}`);
    }
    this.el.consoleWrap.hidden = false;
    this.el.console.textContent = parts.join('\n') || emptyText;
    this.el.console.classList.toggle('console--error', !!result.error);
  }

  /* ---------- actions ---------- */

  private async withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (this.busy) return undefined;
    this.busy = true;
    this.renderActions();
    this.el.btnPrimary.setAttribute('aria-busy', 'true');
    try {
      return await fn();
    } catch (err) {
      this.setFeedback('fail', escapeHtml(`Something went wrong running Python: ${err instanceof Error ? err.message : String(err)}`));
      return undefined;
    } finally {
      this.busy = false;
      this.el.btnPrimary.removeAttribute('aria-busy');
      this.renderActions();
    }
  }

  private runnableCode(): string | undefined {
    const q = this.question;
    if (q.type === 'fill_blank') return fillTemplate(q.template, this.current.blanks ?? []);
    return this.editor?.code;
  }

  async run(): Promise<void> {
    if (this.el.btnRun.hidden) return;
    const code = this.runnableCode();
    if (code === undefined) return;
    const q = this.question;
    await this.withBusy(async () => {
      this.el.consoleWrap.hidden = false;
      if (this.pythonStatus === 'loading') this.el.console.textContent = 'Loading Python…';
      const setup = q.type === 'write_code' || q.type === 'fix_code' ? q.setupCode : undefined;
      const stdin = this.current.stdin?.trim() ? this.current.stdin : undefined;
      this.showConsole(await this.python.run(code, setup, stdin));
    });
  }

  async primary(): Promise<void> {
    if (this.busy) return;
    if (this.el.btnPrimary.dataset.mode === 'continue') return this.next();
    await this.check();
  }

  private answer(): Answer {
    const q = this.question;
    switch (q.type) {
      case 'multiple_choice':
        return { kind: 'choice', optionId: this.current.choice ?? null };
      case 'predict_output':
        return { kind: 'text', text: this.current.text ?? '' };
      case 'fill_blank':
        return { kind: 'blanks', values: this.current.blanks ?? [] };
      default:
        return { kind: 'code', code: this.editor?.code ?? '' };
    }
  }

  private async check(): Promise<void> {
    const q = this.question;
    if (!isGradable(q) || this.state.correct) return this.next();
    const answer = this.answer();
    const needsPython = q.type === 'write_code' || q.type === 'fix_code' || (q.type === 'fill_blank' && q.matchMode !== 'exact');
    await this.withBusy(async () => {
      if (needsPython && this.pythonStatus === 'loading') this.setFeedback('info', 'Loading Python…');
      const verdict = await gradeAnswer(q, answer, this.python);
      const incomplete = !verdict.passed && isIncomplete(answer);
      if (needsPython) this.showConsole({ stdout: verdict.stdout, stderr: verdict.stderr, error: null });
      if (incomplete) {
        this.setFeedback('info', escapeHtml(verdict.message));
        return;
      }
      const s = this.state;
      s.tries += 1;
      if (verdict.passed) {
        s.correct = true;
        s.firstTry = s.tries === 1 && !s.viewedSolution;
        s.points = pointsFor(maxPoints(q, this.lesson), s.tries, s.viewedSolution);
        const explanation = q.explanation ? `<p>${inline(q.explanation)}</p>` : '';
        this.setFeedback('pass', `<p class="feedback__title">Correct! +${s.points} pts</p>${explanation}`);
        this.updatePoints();
      } else {
        const more = s.tries >= 2 && !s.viewedSolution ? '<p class="feedback__more">Stuck? You can now view the solution.</p>' : '';
        this.setFeedback('fail', `<p class="feedback__title">Not quite</p><p>${inline(verdict.message)}</p>${more}`);
      }
    });
    this.renderActions();
    if (this.state.correct) this.el.btnPrimary.focus();
  }

  private next(): void {
    if (this.index >= this.lesson.questions.length - 1) return this.finish();
    this.go(this.index + 1);
  }

  private go(index: number): void {
    if (index < 0 || index >= this.lesson.questions.length) return;
    this.index = index;
    this.renderQuestion();
  }

  private toggleHint(): void {
    this.current.hintShown = !this.current.hintShown;
    this.renderHint();
    this.renderActions();
  }

  private requestSolution(): void {
    if (this.state.viewedSolution || this.state.tries >= 2) return this.revealSolution();
    this.el.dialog.returnValue = '';
    this.el.dialog.showModal();
  }

  private revealSolution(): void {
    const q = this.question;
    const s = this.state;
    s.viewedSolution = true;
    let shown = '';
    switch (q.type) {
      case 'write_code':
      case 'fix_code':
        if (this.editor) this.editor.code = q.solution;
        shown = 'The solution is now in the editor.';
        break;
      case 'predict_output': {
        this.current.text = q.expectedOutput;
        const input = this.el.answer.querySelector('textarea');
        if (input) input.value = q.expectedOutput;
        shown = `It prints:</p><pre class="code-sample"><code>${escapeHtml(q.expectedOutput)}</code></pre><p>`;
        break;
      }
      case 'multiple_choice': {
        this.current.choice = q.answer;
        const radio = this.el.answer.querySelector<HTMLInputElement>(`input[value="${CSS.escape(q.answer)}"]`);
        if (radio) radio.checked = true;
        const option = q.options.find((o) => o.id === q.answer);
        shown = `The answer is: ${option ? inline(option.text) : ''}`;
        break;
      }
      case 'fill_blank':
        this.current.blanks = [...q.blanks];
        this.el.workArea.querySelectorAll<HTMLInputElement>('input[data-blank]').forEach((input, i) => {
          input.value = q.blanks[i] ?? '';
          sizeBlank(input);
        });
        shown = 'The blanks are filled in.';
        break;
      case 'explain':
        return;
    }
    const explanation = q.explanation ? `<p>${inline(q.explanation)}</p>` : '';
    this.setFeedback(
      'info',
      `<p class="feedback__title">Solution</p><p>${shown}</p>${explanation}<p>Press Check to continue. This question now scores 0 points.</p>`,
    );
    this.renderActions();
    this.el.btnPrimary.focus();
  }

  private reset(): void {
    const q = this.question;
    if (q.type === 'write_code' || q.type === 'fix_code') {
      if (this.editor) this.editor.code = q.starterCode;
      saveDraft(this.lesson.id, q.id, null);
      this.editor?.focus();
    } else if (q.type === 'explain' && q.exampleCode && this.editor) {
      this.editor.code = q.exampleCode;
      this.editor.focus();
    } else if (q.type === 'fill_blank') {
      this.current.blanks = this.current.blanks?.map(() => '');
      this.renderQuestion();
    }
  }

  /* ---------- end of lesson ---------- */

  private finish(): void {
    const acc = accuracy(this.lesson, this.states);
    const points = totalPoints(this.states);
    const { progress, isNewBest } = recordCompletion(this.lesson.id, { accuracy: acc, points, questionState: this.states });
    for (const q of this.lesson.questions) saveDraft(this.lesson.id, q.id, null);
    const skipped = this.lesson.questions.filter((q) => isGradable(q) && !this.states[q.id]?.correct).length;
    const streak = currentStreak(progress.streak, new Date());
    const next = this.result.next;
    const shareUrl = `${location.origin}/practice/?lesson=${encodeURIComponent(this.lesson.id)}`;

    this.el.form.hidden = true;
    this.el.intro.hidden = true;
    this.el.summary.hidden = false;
    this.el.summary.innerHTML = `
      <h2 class="summary__title" tabindex="-1">Lesson complete!</h2>
      <p class="summary__lead">${escapeHtml(this.lesson.title)}</p>
      <dl class="stats">
        <div class="stat"><dt>Accuracy</dt><dd>${acc}%</dd></div>
        <div class="stat"><dt>Points earned</dt><dd>${points}</dd></div>
        <div class="stat"><dt>Streak</dt><dd>${streak} ${streak === 1 ? 'day' : 'days'}</dd></div>
      </dl>
      <p class="summary__note">${skipped ? `You skipped ${skipped} ${skipped === 1 ? 'question' : 'questions'} — practise again to complete ${skipped === 1 ? 'it' : 'them'}. ` : ''}${
        isNewBest ? 'New best score for this lesson.' : ''
      } Total points on this device: ${localPoints(progress)}. Sign-up (coming soon) will save your progress to your account.</p>
      <div class="summary__actions">
        ${next ? `<a class="btn btn--primary" href="${lessonUrl(next.id)}">Next: ${escapeHtml(next.title)} →</a>` : ''}
        <button type="button" class="btn btn--ghost" data-summary-action="again">Practise again</button>
        <button type="button" class="btn btn--ghost" data-summary-action="share">Share</button>
        <a class="btn btn--ghost" href="/learn/">Back to Learn</a>
      </div>
      <p class="help-text" data-share-status role="status"></p>`;
    $(this.el.summary, '[data-summary-action="again"]').addEventListener('click', () => this.show(this.result));
    $(this.el.summary, '[data-summary-action="share"]').addEventListener('click', () => void share(shareUrl, this.lesson.title, $(this.el.summary, '[data-share-status]')));
    this.el.announce.textContent = `Lesson complete. Accuracy ${acc} percent, ${points} points.`;
    $(this.el.summary, '.summary__title').focus();
  }

  private showMessage(result: Exclude<LoadResult, { status: 'ok' }>): void {
    this.el.head.hidden = true;
    this.el.form.hidden = true;
    this.el.intro.hidden = true;
    this.el.summary.hidden = true;
    this.el.message.hidden = false;
    const back = '<a class="btn btn--primary" href="/learn/">Back to Learn</a>';
    if (result.status === 'not-found') {
      this.el.message.innerHTML = `<h1>Lesson not found</h1><p>We couldn’t find that lesson. Pick one from the Learn page.</p>${back}`;
      document.title = 'Lesson not found — Python Exercises';
      return;
    }
    const { lesson, module } = result.placed;
    const head = `<p class="crumbs"><a href="/learn/">Learn</a> <span aria-hidden="true">›</span> <a href="${moduleUrl(module.id)}">${escapeHtml(module.title)}</a></p><h1>${escapeHtml(lesson.title)}</h1>`;
    let body: string;
    if (result.status === 'unavailable') {
      body = `<p>This lesson is being written and isn’t ready yet. Try another lesson in the meantime.</p>${back}`;
    } else if (result.access.kind === 'finish-previous') {
      const prev = result.access.previous;
      body = `<div class="lock"><h2>Finish “${escapeHtml(prev.title)}” first</h2><p>Lessons in a module open one after another. Complete the previous lesson to unlock this one.</p><a class="btn btn--primary" href="${lessonUrl(prev.id)}">Go to ${escapeHtml(prev.title)}</a></div>`;
    } else if (result.access.kind === 'upgrade') {
      body = `<div class="lock"><h2>Upgrade to continue</h2><p>This lesson is part of the full course. Premium plans are coming soon.</p>${back}</div>`;
    } else {
      body = `<div class="lock"><h2>Sign in required</h2><p>This lesson is part of the full course. Accounts and subscriptions are coming soon — the free lessons are open to everyone now.</p>${back}</div>`;
    }
    this.el.message.innerHTML = head + body;
    document.title = `${lesson.title} — Python Exercises`;
  }
}

/** True when the learner hasn't actually answered yet (doesn't count as a try). */
function isIncomplete(answer: Answer): boolean {
  switch (answer.kind) {
    case 'choice':
      return !answer.optionId;
    case 'text':
      return !answer.text.trim();
    case 'blanks':
      return answer.values.some((v) => !v.trim());
    case 'code':
      return false;
  }
}

function sizeBlank(input: HTMLInputElement): void {
  input.style.width = `${Math.max(4, input.value.length + 1)}ch`;
}

async function share(url: string, title: string, status: HTMLElement): Promise<void> {
  const text = `I just finished the “${title}” Python lesson.`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    status.textContent = 'Link copied to your clipboard.';
  } catch {
    status.textContent = `Share this link: ${url}`;
  }
}
