// Construit le renderer (React → bundle unique) et, avec --web, une version
// HTML autonome (un seul fichier, fonctionne hors connexion dans un navigateur).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (...p) => path.join(root, ...p);
const watch = process.argv.includes('--watch');
const web = process.argv.includes('--web');
const pkg = JSON.parse(fs.readFileSync(r('package.json'), 'utf8'));

const opts = {
  entryPoints: [r('src/renderer/app/index.jsx')],
  bundle: true,
  outfile: r('src/renderer/dist/app.js'),
  format: 'iife',
  target: ['chrome110'],
  jsx: 'automatic',
  loader: { '.woff2': 'dataurl', '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(pkg.version) },
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const { context } = await import('esbuild');
  const ctx = await context(opts);
  await ctx.watch();
  console.log('Surveillance des fichiers…');
} else {
  await build(opts);
  if (web) {
    const css = fs.readFileSync(r('src/renderer/dist/app.css'), 'utf8');
    const js = fs.readFileSync(r('src/renderer/dist/app.js'), 'utf8');
    const pdf = fs.readFileSync(r('src/renderer/vendor/pdf.min.js'), 'utf8');
    const worker = fs.readFileSync(r('src/renderer/vendor/pdf.worker.min.js'), 'utf8');
    const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CorrigePro</title><style>${css}</style></head>
<body><div id="root"></div><div id="print-root"></div>
<script type="text/plain" id="pdf-worker-src">${esc(worker)}</script>
<script>${esc(pdf)}</script>
<script>(function(){var s=document.getElementById('pdf-worker-src').textContent;if(window.pdfjsLib){window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([s],{type:'text/javascript'}));}})();</script>
<script>${esc(js)}</script>
</body></html>`;
    fs.mkdirSync(r('dist-web'), { recursive: true });
    fs.writeFileSync(r('dist-web/corrigepro.html'), html);
    console.log(`Version HTML : dist-web/corrigepro.html (${(html.length / 1024 / 1024).toFixed(2)} Mo)`);
  }
}
