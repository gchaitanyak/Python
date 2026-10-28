import { describe, expect, it, vi } from 'vitest';
import { checkPredict, fillTemplate, gradeAnswer } from '../../src/player/grading';
import type { PythonClient } from '../../src/player/python-client';
import type { Question } from '../../src/player/types';

const python = (passed: boolean, message = 'public message') =>
  ({
    grade: vi.fn(async () => ({
      passed,
      stdout: '',
      stderr: '',
      error: null,
      results: [{ name: 'hidden', passed, message: passed ? '' : message }],
    })),
  }) as unknown as PythonClient;

describe('checkPredict (matches harness.check_predict)', () => {
  it('ignores trailing spaces per line and outer newlines', () => {
    expect(checkPredict('10  \n', '10')).toBe(true);
    expect(checkPredict('\na\nb  \n\n', 'a\nb')).toBe(true);
    expect(checkPredict('a\r\nb', 'a\nb')).toBe(true);
  });

  it('is strict about leading spaces and content', () => {
    expect(checkPredict(' 10', '10')).toBe(false);
    expect(checkPredict('1 0', '10')).toBe(false);
  });
});

describe('fillTemplate', () => {
  it('substitutes blanks in order', () => {
    expect(fillTemplate('a = ___ + ___', ['1', '2'])).toBe('a = 1 + 2');
  });

  it('rejects the wrong number of values', () => {
    expect(() => fillTemplate('a = ___', [])).toThrow();
  });
});

describe('gradeAnswer', () => {
  const mc: Question = { id: 'q01', type: 'multiple_choice', prompt: '', hint: '', answer: 'b', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] };

  it('grades multiple choice locally', async () => {
    expect((await gradeAnswer(mc, { kind: 'choice', optionId: 'b' }, python(false))).passed).toBe(true);
    expect((await gradeAnswer(mc, { kind: 'choice', optionId: 'a' }, python(true))).passed).toBe(false);
  });

  it('returns only the first failing test’s public message for code', async () => {
    const q: Question = { id: 'q02', type: 'write_code', prompt: '', hint: '', starterCode: '', solution: '', tests: [{ name: 't', code: 'assert secret == 42', message: 'm' }] };
    const verdict = await gradeAnswer(q, { kind: 'code', code: 'x = 1' }, python(false, 'Expected total to be 15.'));
    expect(verdict).toMatchObject({ passed: false, message: 'Expected total to be 15.' });
    expect(verdict.message).not.toContain('assert');
  });

  it('grades exact-match blanks without Python', async () => {
    const q: Question = { id: 'q03', type: 'fill_blank', prompt: '', hint: '', template: 'x = ___', blanks: ['len'], matchMode: 'exact' };
    const py = python(false);
    expect((await gradeAnswer(q, { kind: 'blanks', values: [' len '] }, py)).passed).toBe(true);
    expect(py.grade).not.toHaveBeenCalled();
  });

  it('runs tests on the filled template', async () => {
    const q: Question = { id: 'q04', type: 'fill_blank', prompt: '', hint: '', template: 'x = ___', blanks: ['0'], tests: [] };
    const py = python(true);
    await gradeAnswer(q, { kind: 'blanks', values: ['0'] }, py);
    expect(py.grade).toHaveBeenCalledWith('x = 0', []);
  });
});
