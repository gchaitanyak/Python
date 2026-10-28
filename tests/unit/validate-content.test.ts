import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function validate(contentDir?: string) {
  const env = { ...process.env };
  if (contentDir) env.CONTENT_DIR = contentDir;
  else delete env.CONTENT_DIR;
  return spawnSync('npx', ['tsx', 'scripts/validate-content.ts'], { cwd: root, env, encoding: 'utf8' });
}

describe('validate-content', () => {
  it('fails (so the build fails) on an invalid lesson and names every problem', () => {
    const r = validate(resolve(root, 'tests/fixtures/bad-content'));
    expect(r.status).toBe(1);
    for (const problem of [
      'q01 (write_code): solution fails',
      'q01 (write_code): starterCode already passes all tests',
      'q03 (predict_output): expected id q02',
      'expectedOutput "2" but code prints "1\\n"',
      'answer not among option ids',
      'q04 (explain): exampleCode raises ZeroDivisionError',
      'number of blanks does not match the template',
      'marked "written" in curriculum.json but content/lessons/py-missing.json is missing',
    ]) {
      expect(r.stdout).toContain(problem);
    }
  }, 120_000);

  it('passes on the real content', () => {
    const r = validate();
    expect(r.stdout).toMatch(/(\d+)\/\1 lessons valid/);
    expect(r.status).toBe(0);
  }, 120_000);
});
