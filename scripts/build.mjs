// Construit le renderer (React → bundle unique) et, avec --web, une version
// HTML autonome (un seul fichier, fonctionne hors connexion dans un navigateur).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// fileURLToPath gère les chemins Windows (D:\...) que .pathname casse en « /D:/... »
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => path.join(root, ...p);
const watch = process.argv.includes('--watch');
const web = process.argv.includes('--web');
const pwa = process.argv.includes('--pwa');
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
  if (web || pwa) {
    const css = fs.readFileSync(r('src/renderer/dist/app.css'), 'utf8');
    const js = fs.readFileSync(r('src/renderer/dist/app.js'), 'utf8');
    const pdf = fs.readFileSync(r('src/renderer/vendor/pdf.min.js'), 'utf8');
    const worker = fs.readFileSync(r('src/renderer/vendor/pdf.worker.min.js'), 'utf8');
    const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
    // Appli mobile (PWA) : installable, hors ligne, reçoit les fichiers partagés (Android)
    const pwaHead = `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#1a2440">
<link rel="apple-touch-icon" href="apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="CorrigePro">`;
    const pwaScript = `<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');</script>`;
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">${pwa ? pwaHead : '<meta name="viewport" content="width=device-width, initial-scale=1.0">'}
<title>CorrigePro</title><style>${css}</style></head>
<body><div id="root"></div><div id="print-root"></div>
<script type="text/plain" id="pdf-worker-src">${esc(worker)}</script>
<script>${esc(pdf)}</script>
<script>(function(){var s=document.getElementById('pdf-worker-src').textContent;if(window.pdfjsLib){window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([s],{type:'text/javascript'}));}})();</script>
<script>${esc(js)}</script>${pwa ? pwaScript : ''}
</body></html>`;
    if (web) {
      fs.mkdirSync(r('dist-web'), { recursive: true });
      fs.writeFileSync(r('dist-web/corrigepro.html'), html);
      console.log(`Version HTML : dist-web/corrigepro.html (${(html.length / 1024 / 1024).toFixed(2)} Mo)`);
    }
    if (pwa) {
      const out = r('dist-pwa');
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'index.html'), html);
      for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) fs.copyFileSync(r('assets/pwa', f), path.join(out, f));
      fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
        name: 'CorrigePro', short_name: 'CorrigePro', lang: 'fr', start_url: './', scope: './', display: 'standalone',
        background_color: '#f0f2f6', theme_color: '#1a2440',
        icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
        share_target: { action: './recevoir', method: 'POST', enctype: 'multipart/form-data', params: { files: [{ name: 'file', accept: ['application/json', '.json'] }] } },
      }, null, 2));
      // Version du cache = empreinte du contenu : chaque mise en ligne remplace l'ancienne version
      const hash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
      const sw = fs.readFileSync(r('scripts/sw.js'), 'utf8').replace('__CACHE__', `corrigepro-${pkg.version}-${hash}`);
      fs.writeFileSync(path.join(out, 'sw.js'), sw);
      console.log(`Appli mobile : dist-pwa/ (${(html.length / 1024 / 1024).toFixed(2)} Mo)`);
    }
  }
}
