import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import {
  curriculumStats,
  renderCurriculumOverview,
  renderModuleGrid,
  renderModulePage,
} from './src/components/curriculum-html';
import { renderFooter } from './src/components/footer';
import { renderHeader, SITE_NAME } from './src/components/header';
import { boardCard } from './src/components/leaderboard-html';
import { renderPlans, renderPremiumFeatures } from './src/components/pricing-html';
import { renderGuideCards, renderGuidePage } from './src/components/guides-html';
import { renderProjectCards, renderProjectPage } from './src/components/projects-html';
import { fillPlayerShell } from './src/components/player-shell';
import {
  PYODIDE_FILES,
  bundleProject,
  datasetPath,
  freeLessonIds,
  loadGuides,
  lessonPath,
  loadCurriculumFile,
  publicCurriculum,
  projectCatalogue,
  pyodideDir,
  writtenProjects,
} from './scripts/content-data';
import { availableWheels } from './scripts/pyodide-packages';
import { lessonUrl, lessonsInOrder } from './src/lib/curriculum';
import { routes } from './src/lib/routes';
import { addSeoTags, ogImageFor } from './src/lib/seo';
import type { Curriculum, CurriculumModule } from './src/player/types';

const pagesDir = resolve(__dirname, 'src/pages');
const ogDir = resolve(__dirname, 'src/assets/og');
/** dist/ normally; BUILD_OUT_DIR builds elsewhere (the production e2e build uses dist-e2e/). */
const outDir = resolve(__dirname, process.env.BUILD_OUT_DIR || 'dist');

// Inline SVG icon (the logo mark) so no extra request or binary asset is needed.
const FAVICON = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#f2c94c"/><text x="16" y="21" font-family="monospace" font-size="14" font-weight="700" text-anchor="middle" fill="#1b1f24">&gt;_</text></svg>',
)}">`;

const MIME: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.whl': 'application/zip',
};

/** Template rendered once per module at /learn/<moduleId>/. */
const MODULE_TEMPLATE = resolve(pagesDir, 'module/index.html');
/** Template rendered once per written project at /projects/<projectId>/. */
const PROJECT_TEMPLATE = resolve(pagesDir, 'project/index.html');
/** Template rendered once per guide at /guides/<slug>/. */
const GUIDE_TEMPLATE = resolve(pagesDir, 'guide/index.html');

/** Public site address for canonical and Open Graph URLs (SITE_URL in .env.local or the environment). */
const siteUrl = (): string => loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', __dirname, '').SITE_URL || 'https://example.com';

function withSeo(html: string, path: string): string {
  return addSeoTags(html, path, siteUrl(), ogImageFor(path, new Set(loadGuides().map((g) => g.slug))));
}

/** Every built page under dist/, with its public path. */
function builtPages(dir = outDir, base = '/'): { file: string; path: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return ['assets', 'data', 'pyodide', 'og'].includes(e.name) && base === '/' ? [] : builtPages(resolve(dir, e.name), `${base}${e.name}/`);
    return e.name === 'index.html' ? [{ file: resolve(dir, e.name), path: base }] : [];
  });
}

/** The security headers Firebase Hosting sends for every file (firebase.json), so `vite preview` behaves the same. */
function hostingHeaders(): Record<string, string> {
  const hosting = JSON.parse(readFileSync(resolve(__dirname, 'firebase.json'), 'utf8')).hosting as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  return Object.fromEntries(hosting.headers.filter((h) => h.source === '**').flatMap((h) => h.headers.map((x) => [x.key, x.value])));
}

/** Page file relative to src/pages → public URL path, e.g. "home/index.html" → "/". */
function routeForHtml(relPath: string): string | undefined {
  return routes.find((r) => `${r.dir}/index.html` === relPath)?.path;
}

/** Fill curriculum placeholders used by the landing page and the dashboard. */
function fillCurriculum(html: string, c: Curriculum): string {
  const stats = curriculumStats(c);
  const first = lessonsInOrder(c).find((p) => p.lesson.status === 'written')?.lesson;
  return html
    .replace('<!-- @modules -->', renderModuleGrid(c))
    .replace('<!-- @curriculum-overview -->', renderCurriculumOverview(c))
    .replace('<!-- @stat:lessons -->', String(stats.lessons))
    .replace('<!-- @stat:modules -->', String(stats.modules))
    .replace('<!-- @stat:free -->', String(stats.free))
    .replace('<!-- @board:points -->', boardCard('points', 'Today’s top points'))
    .replace('<!-- @board:streak -->', boardCard('streak', 'Today’s top streaks'))
    .replace('<!-- @board:challenge -->', boardCard('challenge', 'Today’s challenge leaderboard'))
    .replace('<!-- @plans -->', renderPlans(loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', __dirname, 'VITE_PRICE_')))
    .replace('<!-- @premium-features -->', renderPremiumFeatures())
    .replace('<!-- @projects -->', renderProjectCards(projectCatalogue()))
    .replace('<!-- @guides -->', renderGuideCards(loadGuides()))
    .replace('<!-- @next-title -->', first?.title ?? '')
    .replace('<!-- @next-href -->', first ? lessonUrl(first.id) : '/learn/');
}

function fillModule(html: string, m: CurriculumModule, c: Curriculum): string {
  const page = renderModulePage(m, c);
  return html.replace('<!-- @module-head -->', page.head).replace('<!-- @module-id -->', m.id).replace('<!-- @module -->', page.body);
}

function fillGuide(html: string, slug: string): string {
  const guide = loadGuides().find((g) => g.slug === slug)!;
  const lesson = lessonsInOrder(loadCurriculumFile()).find((p) => p.lesson.id === guide.lesson)?.lesson;
  const page = renderGuidePage(guide, lesson?.title ?? guide.title);
  return html.replace('<!-- @guide-head -->', page.head).replace('<!-- @guide -->', page.body);
}

function fillProject(html: string, id: string): string {
  const info = writtenProjects().find((p) => p.id === id)!;
  const page = renderProjectPage(info, bundleProject(id));
  return html.replace('<!-- @project-head -->', page.head).replace('<!-- @project-intro -->', page.intro);
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
        // Dev-only preview of premium lessons (player: ?preview=1). Never emitted by the build.
        const preview = /^\/data\/preview\/lessons\/(py-[a-z0-9-]+)\.json$/.exec(pathname);
        if (preview?.[1] && existsSync(lessonPath(preview[1]))) {
          res.setHeader('Content-Type', 'application/json');
          return res.end(readFileSync(lessonPath(preview[1])));
        }
        // Free projects: the bundled steps and their dataset files. Premium ones come from Firestore.
        const project = /^\/data\/projects\/([a-z0-9-]+)(?:\.json|\/([\w.-]+))$/.exec(pathname);
        if (project?.[1]) {
          const info = writtenProjects().find((p) => p.id === project[1] && p.free);
          const bundle = info ? bundleProject(info.id) : undefined;
          if (bundle && !project[2]) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(bundle));
          }
          if (bundle && bundle.datasets.some((d) => d.file === project[2])) {
            return void createReadStream(datasetPath(bundle.id, project[2]!)).pipe(res);
          }
          res.statusCode = 404;
          return res.end('Not found');
        }
        const og = /^\/og\/([a-z0-9-]+\.png)$/.exec(pathname);
        if (og?.[1] && existsSync(resolve(ogDir, og[1]))) {
          res.setHeader('Content-Type', 'image/png');
          return void createReadStream(resolve(ogDir, og[1])).pipe(res);
        }
        const py = /^\/pyodide\/([\w.-]+)$/.exec(pathname);
        // Core files, plus any package wheels fetched with `npm run fetch:pyodide`.
        if (py?.[1] && (PYODIDE_FILES.includes(py[1]) || availableWheels().includes(py[1]))) {
          res.setHeader('Content-Type', MIME[py[1].slice(py[1].lastIndexOf('.'))] ?? 'application/octet-stream');
          return void createReadStream(resolve(pyodideDir, py[1])).pipe(res);
        }
        next();
      });
      // Module pages: /learn/<moduleId>/ rendered from the module template.
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0] ?? '/';
        const match = /^\/learn\/([a-z0-9-]+)(\/?)$/.exec(pathname);
        const c = match ? loadCurriculumFile() : undefined;
        const m = c?.modules.find((x) => x.id === match?.[1]);
        if (!match || !m || !c) return next();
        if (!match[2]) {
          res.statusCode = 301;
          res.setHeader('Location', `${pathname}/`);
          return res.end();
        }
        server
          .transformIndexHtml(pathname, fillModule(readFileSync(MODULE_TEMPLATE, 'utf8'), m, c))
          .then((html) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          })
          .catch(next);
      });
      // Guide pages: /guides/<slug>/ rendered from the guide template.
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0] ?? '/';
        const match = /^\/guides\/([a-z0-9-]+)\/$/.exec(pathname);
        if (!match || !loadGuides().some((g) => g.slug === match[1])) return next();
        server
          .transformIndexHtml(pathname, fillGuide(readFileSync(GUIDE_TEMPLATE, 'utf8'), match[1]!))
          .then((html) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          })
          .catch(next);
      });
      // Project pages: /projects/<id>/ rendered from the project template.
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '/').split('?')[0] ?? '/';
        const match = /^\/projects\/([a-z0-9-]+)\/$/.exec(pathname);
        if (!match || !writtenProjects().some((p) => p.id === match[1])) return next();
        server
          .transformIndexHtml(pathname, fillProject(readFileSync(PROJECT_TEMPLATE, 'utf8'), match[1]!))
          .then((html) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          })
          .catch(next);
      });
      server.middlewares.use((req, _res, next) => {
        const [pathname = '/', query] = (req.url ?? '/').split('?');
        if (/^\/certificate\/[A-Za-z0-9]{10}\/$/.test(pathname)) req.url = `/credential/index.html${query ? `?${query}` : ''}`;
        const route = routes.find((r) => r.path === pathname);
        if (route) req.url = `/${route.dir}/index.html${query ? `?${query}` : ''}`;
        next();
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const rel = ctx.filename.slice(pagesDir.length + 1).replaceAll('\\', '/');
        const path = routeForHtml(rel) ?? (rel.startsWith('module/') ? '/learn/' : rel.startsWith('project/') ? '/projects/' : rel.startsWith('guide/') ? '/guides/' : `/${rel.replace(/index\.html$/, '')}`);
        // Dev: the request's own path. Build: tags are added per page in closeBundle, once paths are final.
        const devPath = ctx.server ? (ctx.originalUrl ?? ctx.path).split('?')[0] : undefined;
        const filled = fillPlayerShell(fillCurriculum(html, loadCurriculumFile()));
        return (devPath ? (h: string) => withSeo(h, devPath) : (h: string) => h)(filled)
          .replace('</head>', `${FAVICON}\n  </head>`)
          .replace('<!-- @header -->', renderHeader(path))

          .replace('<!-- @footer -->', renderFooter())
          .replaceAll('<!-- @site-name -->', SITE_NAME);
      },
    },
    closeBundle() {
      mkdirSync(resolve(outDir, 'pyodide'), { recursive: true });
      for (const f of [...PYODIDE_FILES, ...availableWheels()]) copyFileSync(resolve(pyodideDir, f), resolve(outDir, 'pyodide', f));
      // One static page per module from the built template.
      const template = resolve(outDir, 'module/index.html');
      if (existsSync(template)) {
        const c = loadCurriculumFile();
        const html = readFileSync(template, 'utf8');
        for (const m of c.modules) {
          mkdirSync(resolve(outDir, 'learn', m.id), { recursive: true });
          writeFileSync(resolve(outDir, 'learn', m.id, 'index.html'), fillModule(html, m, c));
        }
        rmSync(resolve(outDir, 'module'), { recursive: true, force: true });
      }
      // One static page per guide from the built template.
      const guideTemplate = resolve(outDir, 'guide/index.html');
      if (existsSync(guideTemplate)) {
        const html = readFileSync(guideTemplate, 'utf8');
        for (const g of loadGuides()) {
          mkdirSync(resolve(outDir, 'guides', g.slug), { recursive: true });
          writeFileSync(resolve(outDir, 'guides', g.slug, 'index.html'), fillGuide(html, g.slug));
        }
        rmSync(resolve(outDir, 'guide'), { recursive: true, force: true });
      }
      // One static page per written project from the built template.
      const projectTemplate = resolve(outDir, 'project/index.html');
      if (existsSync(projectTemplate)) {
        const html = readFileSync(projectTemplate, 'utf8');
        for (const p of writtenProjects()) {
          mkdirSync(resolve(outDir, 'projects', p.id), { recursive: true });
          writeFileSync(resolve(outDir, 'projects', p.id, 'index.html'), fillProject(html, p.id));
        }
        rmSync(resolve(outDir, 'project'), { recursive: true, force: true });
      }
      mkdirSync(resolve(outDir, 'og'), { recursive: true });
      for (const f of readdirSync(ogDir)) copyFileSync(resolve(ogDir, f), resolve(outDir, 'og', f));
      // Move each page to its public path: dist/home/index.html → dist/index.html.
      for (const r of routes) {
        if (r.path === `/${r.dir}/`) continue;
        const from = resolve(outDir, r.dir, 'index.html');
        if (!existsSync(from)) continue;
        mkdirSync(resolve(outDir, `.${r.path}`), { recursive: true });
        renameSync(from, resolve(outDir, `.${r.path}`, 'index.html'));
        rmSync(resolve(outDir, r.dir), { recursive: true, force: true });
      }
      // Canonical and Open Graph tags, now that every page is at its public path.
      for (const page of builtPages()) writeFileSync(page.file, withSeo(readFileSync(page.file, 'utf8'), page.path));
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
  preview: { port: 4173, strictPort: true, headers: hostingHeaders() },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        ...Object.fromEntries(routes.map((r) => [r.dir, resolve(pagesDir, r.dir, 'index.html')])),
        module: MODULE_TEMPLATE,
        project: PROJECT_TEMPLATE,
        guide: GUIDE_TEMPLATE,
      },
    },
  },
});
