import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const dir = resolve(import.meta.dirname, '../../functions/src');

it('every callable function uses the shared options, so App Check applies to all of them', () => {
  const calls = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .flatMap((f) => [...readFileSync(resolve(dir, f), 'utf8').matchAll(/onCall\(([^,]*)/g)].map((m) => ({ f, arg: m[1]!.trim() })));
  expect(calls.length).toBeGreaterThan(20);
  for (const c of calls) expect(c.arg, c.f).toMatch(/^(callOptions|\{ \.\.\.callOptions)/);
});
