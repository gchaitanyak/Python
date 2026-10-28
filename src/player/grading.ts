import type { PythonClient } from './python-client';
import type { Question } from './types';

/** What the learner submitted for a question, by question type. */
export type Answer =
  | { kind: 'code'; code: string }
  | { kind: 'text'; text: string }
  | { kind: 'choice'; optionId: string | null }
  | { kind: 'blanks'; values: string[] };

export interface Verdict {
  passed: boolean;
  /** Public message for a failed check: the first failing test's message, never test code. */
  message: string;
  stdout: string;
  stderr: string;
}

/** Same normalisation as harness.check_predict: ignore trailing spaces per line and outer blank lines. */
export function checkPredict(learnerText: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\r\n?/g, '\n')
      .replace(/^\n+|\n+$/g, '')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');
  return norm(learnerText) === norm(expected);
}

/** Same as harness.fill_template: substitute each ___ in order. */
export function fillTemplate(template: string, values: string[]): string {
  const parts = template.split('___');
  if (parts.length - 1 !== values.length) throw new Error('number of blanks does not match number of values');
  return parts.reduce((out, rest, i) => (i === 0 ? rest : out + values[i - 1] + rest), '');
}

export const blankCount = (template: string): number => template.split('___').length - 1;

const pass = (stdout = '', stderr = ''): Verdict => ({ passed: true, message: '', stdout, stderr });
const fail = (message: string, stdout = '', stderr = ''): Verdict => ({ passed: false, message, stdout, stderr });

export async function gradeAnswer(question: Question, answer: Answer, python: PythonClient): Promise<Verdict> {
  switch (question.type) {
    case 'explain':
      return pass();
    case 'multiple_choice': {
      if (answer.kind !== 'choice' || !answer.optionId) return fail('Pick one of the options first.');
      return answer.optionId === question.answer ? pass() : fail('That’s not the right option — try again.');
    }
    case 'predict_output': {
      if (answer.kind !== 'text' || !answer.text.trim()) return fail('Type what you think the code prints.');
      return checkPredict(answer.text, question.expectedOutput)
        ? pass()
        : fail('That’s not what this code prints. Trace it one line at a time.');
    }
    case 'fill_blank': {
      if (answer.kind !== 'blanks' || answer.values.some((v) => !v.trim())) return fail('Fill in every blank.');
      if (question.matchMode === 'exact') {
        const ok = answer.values.every((v, i) => v.trim() === (question.blanks[i] ?? '').trim());
        return ok ? pass() : fail('At least one blank isn’t right yet.');
      }
      const code = fillTemplate(question.template, answer.values);
      return fromGrade(await python.grade(code, question.tests ?? []));
    }
    case 'write_code':
    case 'fix_code': {
      if (answer.kind !== 'code') return fail('Write some code first.');
      return fromGrade(await python.grade(answer.code, question.tests, question.setupCode));
    }
  }
}

function fromGrade(result: Awaited<ReturnType<PythonClient['grade']>>): Verdict {
  if (result.passed) return pass(result.stdout, result.stderr);
  const first = result.results.find((r) => !r.passed);
  return fail(first?.message ?? 'Not quite.', result.stdout, result.stderr);
}
