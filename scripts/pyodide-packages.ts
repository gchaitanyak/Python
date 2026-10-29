/**
 * Extra Pyodide packages (NumPy, pandas, Matplotlib, scikit-learn) for module 13
 * and the data projects. They aren't in the pyodide npm package, so
 * `npm run fetch:pyodide` downloads the wheels from the Pyodide CDN into
 * node_modules/pyodide/ — where Node (the validator) looks for them — checking
 * each against the sha256 in pyodide-lock.json. The dev server serves them and
 * the build copies them to dist/pyodide/, so the site self-hosts them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pyodideDir } from './content-data';

/** Packages lessons and projects may import, besides the standard library. */
export const EXTRA_PACKAGES = ['numpy', 'pandas', 'matplotlib', 'scikit-learn'];

interface LockPackage {
  name: string;
  file_name: string;
  sha256: string;
  depends: string[];
  imports: string[];
}

export interface Lock {
  info: { python: string };
  packages: Record<string, LockPackage>;
}

export const readLock = (): Lock => JSON.parse(readFileSync(resolve(pyodideDir, 'pyodide-lock.json'), 'utf8')) as Lock;

/** The packages plus everything they depend on, each once, dependencies first. */
export function withDependencies(lock: Lock, names: string[]): LockPackage[] {
  const out: LockPackage[] = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const pkg = lock.packages[key];
    if (!pkg) throw new Error(`${name} is not in pyodide-lock.json`);
    pkg.depends.forEach(visit);
    out.push(pkg);
  };
  names.forEach(visit);
  return out;
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Wheel file names that are present and intact, for the dev server and the build to serve. */
export function availableWheels(lock = readLock()): string[] {
  return Object.values(lock.packages)
    .map((p) => p.file_name)
    .filter((f) => existsSync(resolve(pyodideDir, f)));
}

export async function fetchPackages(names = EXTRA_PACKAGES): Promise<{ downloaded: string[]; present: string[] }> {
  const version = (JSON.parse(readFileSync(resolve(pyodideDir, 'package.json'), 'utf8')) as { version: string }).version;
  const base = process.env.PYODIDE_CDN ?? `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
  const downloaded: string[] = [];
  const present: string[] = [];
  for (const pkg of withDependencies(readLock(), names)) {
    const path = resolve(pyodideDir, pkg.file_name);
    if (existsSync(path) && sha256(path) === pkg.sha256) {
      present.push(pkg.file_name);
      continue;
    }
    const res = await fetch(base + pkg.file_name);
    if (!res.ok) throw new Error(`${pkg.file_name}: HTTP ${res.status} from ${base}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const got = createHash('sha256').update(bytes).digest('hex');
    if (got !== pkg.sha256) throw new Error(`${pkg.file_name}: checksum mismatch (expected ${pkg.sha256}, got ${got})`);
    writeFileSync(path, bytes);
    downloaded.push(pkg.file_name);
  }
  return { downloaded, present };
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  fetchPackages().then(
    ({ downloaded, present }) => {
      console.log(`pyodide packages: ${downloaded.length} downloaded, ${present.length} already present → node_modules/pyodide/`);
      process.exit(0);
    },
    (err: Error) => {
      console.error(`pyodide packages: ${err.message}\nThe data-science lessons and projects need these wheels. Check that ${process.env.PYODIDE_CDN ?? 'cdn.jsdelivr.net'} is reachable.`);
      process.exit(1);
    },
  );
}
