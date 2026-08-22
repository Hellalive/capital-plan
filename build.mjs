import { readFile, writeFile } from 'node:fs/promises';

const modelSource = await readFile(new URL('./model.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');

const bundledModel = modelSource.replace(/^export\s+/gm, '');
const bundledApp = appSource.replace(/^import\s+\{[^;]+\}\s+from\s+'\.\/model\.js';\s*/m, '');
const banner = `/* Capital Plan — bundle autonome généré par build.mjs. */\n`;
const bundle = `${banner}(() => {\n'use strict';\n${bundledModel}\n${bundledApp}\n})();\n`;

await writeFile(new URL('./app.bundle.js', import.meta.url), bundle, 'utf8');
console.log('app.bundle.js generated.');
