// Copies curriculum + lesson JSON into functions/content so deployed functions can
// check answers, points and access server-side. Runs before every functions build.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'content');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(here, '../content/curriculum.json'), resolve(out, 'curriculum.json'));
cpSync(resolve(here, '../content/lessons'), resolve(out, 'lessons'), { recursive: true });
