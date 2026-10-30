/**
 * Production build for one environment:  tsx scripts/build.ts [--mode=production|staging]
 * Validates content, type-checks, builds the site with Vite's `.env.<mode>[.local]`
 * files, emits free content and writes the sitemap. `npm run build` = mode production.
 */
import { execFileSync } from 'node:child_process';

const mode = process.argv.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'production';
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, BUILD_MODE: mode } });

run('npm', ['run', 'validate:content']);
run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build', '--mode', mode]);
run('npx', ['tsx', 'scripts/build-content.ts', '--emit-free']);
run('npx', ['tsx', 'scripts/generate-sitemap.ts']);
console.log(`build: done (mode ${mode})`);
