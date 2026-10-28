import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { renderFooter } from './src/components/footer';
import { renderHeader } from './src/components/header';
import { PYODIDE_FILES, freeLessonIds, lessonPath, publicCurriculum, pyodideDir } from './scripts/content-data';
import { routes } from './src/lib/routes';

const pagesDir = resolve(__dirname, 'src/pages');
const outDir = resolve(__dirname, 'dist');

// Inline SVG icon (the logo mark) so no extra request or binary asset is needed.
const FAVICON = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#f2c94c"/><text x="16" y="21" font-family="monospace" font-size="14" font-weight="700" text-anchor="middle" fill="#1b1f24">&gt;_</text></svg>',
)}">`;

const MIME: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json',
};

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
      // Dev equivalents of what the build emits: /data/* (free content) and /pyodide/*.
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0] ?? '/';
        if (pathname === '/data/curriculum.json') {
          res.setHeader('Content-Type', 'application/json');
          return res.end(publicCurriculum());
        }
        const lesson = /^\/data\/lessons\/(py-[a-z0-9-]+)\.json$/.exec(pathname);
        if (lesson?.[1]) {
          if (!freeLessonIds().includes(lesson[1])) {
            res.statusCode = 404;
            return res.end('Not found');
          }
          res.setHeader('Content-Type', 'application/json');
          return res.end(readFileSync(lessonPath(lesson[1])));
        }
        const py = /^\/pyodide\/([\w.-]+)$/.exec(pathname);
        if (py?.[1] && PYODIDE_FILES.includes(py[1])) {
          res.setHeader('Content-Type', MIME[py[1].slice(py[1].lastIndexOf('.'))] ?? 'application/octet-stream');
          return void createReadStream(resolve(pyodideDir, py[1])).pipe(res);
        }
        next();
      });
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
        return html
          .replace('</head>', `${FAVICON}\n  </head>`)
          .replace('<!-- @header -->', renderHeader(path))
          .replace('<!-- @footer -->', renderFooter());
      },
    },
    closeBundle() {
      mkdirSync(resolve(outDir, 'pyodide'), { recursive: true });
      for (const f of PYODIDE_FILES) copyFileSync(resolve(pyodideDir, f), resolve(outDir, 'pyodide', f));
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
  worker: { format: 'es' },
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
