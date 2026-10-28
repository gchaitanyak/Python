import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { renderFooter } from './src/components/footer';
import { renderHeader } from './src/components/header';
import { routes } from './src/lib/routes';

const pagesDir = resolve(__dirname, 'src/pages');
const outDir = resolve(__dirname, 'dist');

/** Page file relative to src/pages → public URL path, e.g. "home/index.html" → "/". */
function routeForHtml(relPath: string): string | undefined {
  return routes.find((r) => `${r.dir}/index.html` === relPath)?.path;
}

/**
 * Serves each route from its src/pages/<dir>/ folder at its public path, and
 * fills <!-- @header --> / <!-- @footer --> at build time so pages are static HTML.
 */
function pagesPlugin(): Plugin {
  return {
    name: 'pages',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname = '/', query] = (req.url ?? '/').split('?');
        const route = routes.find((r) => r.path === pathname);
        if (route) req.url = `/${route.dir}/index.html${query ? `?${query}` : ''}`;
        next();
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const rel = ctx.filename.slice(pagesDir.length + 1).replaceAll('\\', '/');
        const path = routeForHtml(rel) ?? '/';
        return html.replace('<!-- @header -->', renderHeader(path)).replace('<!-- @footer -->', renderFooter());
      },
    },
    closeBundle() {
      // Move each page to its public path: dist/home/index.html → dist/index.html.
      for (const r of routes) {
        if (r.path === `/${r.dir}/`) continue;
        const from = resolve(outDir, r.dir, 'index.html');
        if (!existsSync(from)) continue;
        mkdirSync(resolve(outDir, `.${r.path}`), { recursive: true });
        renameSync(from, resolve(outDir, `.${r.path}`, 'index.html'));
        rmSync(resolve(outDir, r.dir), { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  root: pagesDir,
  envDir: __dirname,
  publicDir: false,
  plugins: [pagesPlugin()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(routes.map((r) => [r.dir, resolve(pagesDir, r.dir, 'index.html')])),
    },
  },
});
