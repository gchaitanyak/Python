/**
 * Draws the Open Graph share images (1200×630 PNG): one for the site and one per
 * guide, into src/assets/og/. They're committed, so builds don't need a browser;
 * run this again after adding or renaming a guide:  npx tsx scripts/make-og-images.ts
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadGuides } from './content-data';

const out = resolve(import.meta.dirname, '../src/assets/og');

const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

function card(eyebrow: string, title: string, subtitle: string): string {
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: #1b1f24; color: #fff; display: flex; flex-direction: column; justify-content: space-between; padding: 72px 80px; }
  .brand { display: flex; align-items: center; gap: 20px; font-size: 34px; font-weight: 700; }
  .mark { width: 72px; height: 72px; border-radius: 14px; background: #f2c94c; color: #1b1f24; display: grid; place-items: center;
          font: 700 30px ui-monospace, Menlo, Consolas, monospace; }
  .eyebrow { color: #f2c94c; font-size: 28px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 18px; }
  h1 { font-size: 76px; line-height: 1.08; max-width: 1000px; }
  p { font-size: 32px; color: #c9d1d9; margin-top: 22px; max-width: 980px; line-height: 1.3; }
  .code { font: 26px ui-monospace, Menlo, Consolas, monospace; color: #8b949e; }
</style></head><body>
  <div class="brand"><div class="mark">&gt;_</div>Python Exercises</div>
  <div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
  <div class="code">print("learn Python by writing it")</div>
</body></html>`;
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const jobs: [string, string][] = [
  ['default', card('Interactive lessons', 'Learn Python by writing it', 'Short lessons, real code in your browser, instant feedback, points and streaks.')],
  ...loadGuides().map((g): [string, string] => [`guide-${g.slug}`, card('Python guide', g.title, 'With examples you can run in your browser.')]),
];
for (const [name, html] of jobs) {
  await page.setContent(html);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
}
await browser.close();
console.log(`og images: ${jobs.length} → src/assets/og/`);
