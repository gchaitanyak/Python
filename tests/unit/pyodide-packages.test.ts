import { describe, expect, it } from 'vitest';
import { EXTRA_PACKAGES, readLock, withDependencies } from '../../scripts/pyodide-packages';

describe('pyodide packages', () => {
  const lock = readLock();

  it('resolves the data-science packages with their dependencies, dependencies first', () => {
    const names = withDependencies(lock, EXTRA_PACKAGES).map((p) => p.name.toLowerCase());
    for (const n of ['numpy', 'pandas', 'matplotlib', 'scikit-learn', 'scipy', 'python-dateutil']) expect(names).toContain(n);
    expect(new Set(names).size).toBe(names.length);
    expect(names.indexOf('numpy')).toBeLessThan(names.indexOf('pandas'));
    expect(names.indexOf('scipy')).toBeLessThan(names.indexOf('scikit-learn'));
  });

  it('has a sha256 for every wheel and rejects unknown packages', () => {
    for (const p of withDependencies(lock, EXTRA_PACKAGES)) expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => withDependencies(lock, ['no-such-package'])).toThrow(/not in pyodide-lock/);
  });
});
