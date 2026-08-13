#!/usr/bin/env node
/* Catch identifiers that are used but never defined or imported.
 *
 * Written after shipping exactly that: `useRef` was used three times in
 * native/src/screens/DriveScreen.jsx and never added to the React import. The
 * file parsed, Babel compiled it, Metro bundled it and the APK installed —
 * because an undefined identifier is only an error when the line *runs*. It ran
 * the moment a driver pressed "Start shift", and the screen crashed.
 *
 * Nothing else in this repo would have caught it. The tests cover
 * @drivosafe/shared, which is pure and has no host imports; the two hosts have
 * no test runner because their components need a DOM or a device. A parse
 * succeeds on any syntactically valid file. So the gap is specifically
 * *reference* errors in host code, and this closes it cheaply: walk each file's
 * top-level scope and report anything referenced that is neither bound locally
 * nor a real global.
 *
 *   node scripts/check-undefined.mjs
 */
import { transformSync } from '@babel/core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TREES = ['shared/src', 'app/src', 'native/src'];

/* Everything a browser, Node or React Native legitimately provides without an
 * import. Built from the running Node's own globals plus the host extras, so it
 * does not drift as the language grows. */
const ALLOWED = new Set([
  ...Object.getOwnPropertyNames(globalThis),
  // timers and scheduling
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  // module systems
  'require', 'module', 'exports', '__dirname', '__filename',
  // React Native
  '__DEV__', 'fetch', 'FormData', 'Headers', 'Request', 'Response', 'XMLHttpRequest',
  'Blob', 'FileReader', 'WebSocket', 'alert', 'navigator', 'performance', 'console',
  // browser (the web build)
  'window', 'document', 'localStorage', 'sessionStorage', 'screen', 'location',
  'history', 'Image', 'Audio', 'AudioContext', 'webkitAudioContext',
  'SpeechSynthesisUtterance', 'speechSynthesis', 'ResizeObserver', 'IntersectionObserver',
  'MutationObserver', 'getComputedStyle', 'matchMedia', 'devicePixelRatio',
  'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'DOMParser',
]);

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (/\.(jsx?|mjs)$/.test(entry)) files.push(full);
  }
};
for (const tree of TREES) {
  const dir = path.join(root, tree);
  try { walk(dir); } catch { /* tree not present */ }
}

const problems = [];

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    /* Parse only — no preset. The presets differ per workspace and none of them
     * change which identifiers a file references. */
    parserOpts: { sourceType: 'module', plugins: ['jsx', 'classProperties', 'objectRestSpread'] },
    plugins: [
      () => ({
        visitor: {
          Program(programPath) {
            /* Babel's scope tracker already computes this: `globals` is every
             * identifier referenced in the file that has no binding anywhere up
             * the scope chain — which is precisely "used but never defined". */
            for (const [name, node] of Object.entries(programPath.scope.globals)) {
              if (ALLOWED.has(name)) continue;
              problems.push({
                file: path.relative(root, file),
                line: node.loc ? node.loc.start.line : 0,
                name,
              });
            }
          },
        },
      }),
    ],
  });
}

if (problems.length === 0) {
  console.log(`\n[32mOK[0m — ${files.length} files, no undefined identifiers.\n`);
  process.exit(0);
}

console.log('\n[31mUndefined identifiers[0m — used but never imported or declared:\n');
const seen = new Set();
for (const p of problems) {
  const key = `${p.file}:${p.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${p.file}:${p.line}  [31m${p.name}[0m`);
}
console.log(`\n${seen.size} problem${seen.size === 1 ? '' : 's'}. These throw at runtime, not at build time.\n`);
process.exit(1);
