/**
 * Deploys one environment, after checking its configuration is in place (docs/DEPLOY.md):
 *   tsx scripts/deploy.ts --env=staging      (npm run deploy:staging)
 *   tsx scripts/deploy.ts --env=production   (npm run deploy:production)
 * Order: build → rules and indexes → functions → hosting → premium content upload.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = resolve(import.meta.dirname, '..');
const env = process.argv.find((a) => a.startsWith('--env='))?.slice(6);
const dryRun = process.argv.includes('--check');
if (env !== 'staging' && env !== 'production') {
  console.error('usage: tsx scripts/deploy.ts --env=staging|production [--check]');
  process.exit(1);
}

const problems: string[] = [];
const aliases = (JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8')) as { projects: Record<string, string> }).projects;
const projectId = aliases[env];
if (!projectId) problems.push(`.firebaserc has no "${env}" alias — run: npx firebase use --add  (pick the project, alias "${env}")`);

const vars = loadEnv(env, root, '');
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'SITE_URL']) {
  if (!vars[key]) problems.push(`${key} is missing from .env.${env}.local`);
}
if (projectId && vars.VITE_FIREBASE_PROJECT_ID && vars.VITE_FIREBASE_PROJECT_ID !== projectId) {
  problems.push(`.env.${env}.local is for project ${vars.VITE_FIREBASE_PROJECT_ID}, but the "${env}" alias is ${projectId}`);
}
if (vars.VITE_USE_EMULATORS === 'true') problems.push(`VITE_USE_EMULATORS must not be true in .env.${env}.local`);
if (env === 'production' && !vars.VITE_RECAPTCHA_ENTERPRISE_KEY) problems.push('VITE_RECAPTCHA_ENTERPRISE_KEY is required in production (App Check)');

if (projectId) {
  const fnEnv = resolve(root, 'functions', `.env.${projectId}`);
  if (!existsSync(fnEnv)) problems.push(`functions/.env.${projectId} is missing (Stripe price ids, APP_ORIGINS, ENFORCE_APP_CHECK — see docs/DEPLOY.md)`);
  else {
    const text = readFileSync(fnEnv, 'utf8');
    for (const key of ['STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_ANNUAL', 'STRIPE_PRICE_LIFETIME', 'APP_ORIGINS']) {
      if (!new RegExp(`^${key}=\\S+`, 'm').test(text)) problems.push(`${key} is missing from functions/.env.${projectId}`);
    }
    if (/^(STRIPE|LLM)_API_BASE=\S/m.test(text)) problems.push(`functions/.env.${projectId} points at a local fake (STRIPE_API_BASE / LLM_API_BASE) — remove it`);
    if (env === 'production' && !/^ENFORCE_APP_CHECK=true$/m.test(text)) problems.push(`set ENFORCE_APP_CHECK=true in functions/.env.${projectId}`);
  }
}

if (problems.length) {
  console.error(`Not ready to deploy ${env}:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`deploy: ${env} → ${projectId}: configuration looks complete`);
if (dryRun) process.exit(0);

const run = (cmd: string, args: string[], extra: Record<string, string> = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, env: { ...process.env, ...extra } });
run('npx', ['tsx', 'scripts/build.ts', `--mode=${env}`]);
run('npx', ['firebase', 'deploy', '--project', env, '--only', 'firestore:rules,firestore:indexes']);
run('npx', ['firebase', 'deploy', '--project', env, '--only', 'functions']);
run('npx', ['firebase', 'deploy', '--project', env, '--only', 'hosting']);
run('npx', ['tsx', 'scripts/build-content.ts', '--upload-premium', `--project=${projectId}`], { GCLOUD_PROJECT: projectId! });
console.log(`deploy: ${env} done. Run the smoke checks in docs/DEPLOY.md §6.`);
