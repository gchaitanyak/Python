// Creates the git-ignored emulator config the functions need, if it's missing:
//   functions/.secret.local — Stripe secrets (fake test values; replace with your own sk_test_/whsec_ to use real Stripe)
//   functions/.env.local    — points the Stripe client at the local fake (scripts/fake-stripe.ts)
// Existing files are left alone.
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../functions');
const files = {
  '.secret.local': 'STRIPE_SECRET_KEY=sk_test_fake_emulator\nSTRIPE_WEBHOOK_SECRET=whsec_fake_emulator_secret\n',
  '.env.local': '# Emulator only. Remove STRIPE_API_BASE to use real Stripe test mode (see docs/STRIPE.md).\nSTRIPE_API_BASE=http://127.0.0.1:12111\n',
};
for (const [name, content] of Object.entries(files)) {
  const path = resolve(dir, name);
  if (!existsSync(path)) writeFileSync(path, content);
}
