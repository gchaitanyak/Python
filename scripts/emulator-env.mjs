// Creates the git-ignored emulator config the functions need:
//   functions/.secret.local — Stripe and Anthropic secrets (fake values; replace with your own test keys to use the real services)
//   functions/.env.local    — points the Stripe and Anthropic clients at the local fakes (scripts/fake-stripe.ts, scripts/fake-llm.ts)
// Keys already in a file are left alone; missing ones are appended.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../functions');
const files = {
  '.secret.local': 'STRIPE_SECRET_KEY=sk_test_fake_emulator\nSTRIPE_WEBHOOK_SECRET=whsec_fake_emulator_secret\nANTHROPIC_API_KEY=sk-ant-fake-emulator\n',
  '.env.local':
    '# Emulator only. Remove STRIPE_API_BASE to use real Stripe test mode (see docs/STRIPE.md),\n# and LLM_API_BASE to send hints to the real Claude API (put a real key in .secret.local).\nSTRIPE_API_BASE=http://127.0.0.1:12111\nLLM_API_BASE=http://127.0.0.1:12112\n',
};
for (const [name, content] of Object.entries(files)) {
  const path = resolve(dir, name);
  if (!existsSync(path)) {
    writeFileSync(path, content);
    continue;
  }
  const current = readFileSync(path, 'utf8');
  const has = (key) => new RegExp(`^#?\\s*${key}=`, 'm').test(current);
  const missing = content.split('\n').filter((line) => /^[A-Z_]+=/.test(line) && !has(line.split('=')[0]));
  if (missing.length) appendFileSync(path, `${current.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`);
}
