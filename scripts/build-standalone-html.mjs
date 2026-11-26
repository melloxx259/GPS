import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distAssetsDir = path.join(rootDir, 'dist', 'assets');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

function readKatexVersion() {
  try {
    const pkgPath = path.join(rootDir, 'node_modules', 'katex', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.19.1';
  } catch {
    return '0.19.1';
  }
}

function collectCompiledCss(katexVersion) {
  if (!fs.existsSync(distAssetsDir)) {
    throw new Error(`Missing ${distAssetsDir}. Run "vite build" first.`);
  }
  const cssFiles = fs
    .readdirSync(distAssetsDir)
    .filter((f) => f.endsWith('.css'))
    .sort();

  const katexFontCdn = `https://cdn.jsdelivr.net/npm/katex@${katexVersion}/dist/fonts/`;

  return cssFiles
    .map((file) => {
      let css = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
      // Rewrite Vite hashed local asset font URLs (e.g. /assets/KaTeX_Main-Regular-xxxx.woff2)
      // to canonical CDN font files so standalone file:// HTML renders KaTeX crisply.
      css = css.replace(
        /url\(["']?(?:\/assets\/|\.\/)?(KaTeX_[A-Za-z0-9_-]+)-[A-Za-z0-9_-]+\.(woff2?|ttf)["']?\)/g,
        (_m, fontName, ext) => `url("${katexFontCdn}${fontName}.${ext}")`,
      );
      return css;
    })
    .join('\n')
    .replace(/<\/style/gi, '<\\/style');
}

async function buildStandalone() {
  const katexVersion = readKatexVersion();
  const css = collectCompiledCss(katexVersion);

  const result = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'main.tsx')],
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    write: false,
    loader: {
      '.css': 'empty',
    },
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': '""',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env': '{}',
      'process.env.NODE_ENV': '"production"',
    },
  });

  const jsBundle = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const indexTemplate = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  const withoutViteScript = indexTemplate.replace(
    /\s*<script\s+type="module"\s+src="\/src\/main\.tsx"\s*><\/script>\s*/i,
    '\n',
  );

  const withCss = withoutViteScript.replace(
    '</head>',
    `  <style>\n${css}\n  </style>\n  </head>`,
  );

  const finalHtml = withCss.replace(
    '</body>',
    `  <script>\n${jsBundle}\n  </script>\n  </body>`,
  );

  fs.mkdirSync(publicDir, {recursive: true});
  const publicOut = path.join(publicDir, 'route-race-explorer.html');
  fs.writeFileSync(publicOut, finalHtml, 'utf8');

  if (fs.existsSync(distDir)) {
    const distOut = path.join(distDir, 'route-race-explorer.html');
    fs.writeFileSync(distOut, finalHtml, 'utf8');
  }

  const kb = (Buffer.byteLength(finalHtml, 'utf8') / 1024).toFixed(1);
  console.log(`Built standalone HTML (${kb} KB): public/route-race-explorer.html`);
}

buildStandalone().catch((err) => {
  console.error(err);
  process.exit(1);
});
