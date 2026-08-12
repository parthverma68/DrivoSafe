#!/usr/bin/env node
/* Does the built APK actually contain the native modules we think it does?
 *
 * The failure this exists to catch: a dependency is installed, Metro bundles
 * its JavaScript happily, the Gradle build succeeds — and the native half is
 * still missing from the APK, because autolinking generates `PackageList.java`
 * into `app/build/generated/autolinking/` and Gradle will happily consider that
 * task up to date against a build directory created before the dependency
 * existed. The result installs, runs, and silently falls back to whatever the
 * JS guard does. That is a nasty class of bug: everything reports success and
 * the feature is simply absent.
 *
 * So this checks the three places the truth can diverge, in order:
 *
 *   1. node_modules      — is the package installed at all?
 *   2. autolinking       — does the RN CLI report an android sourceDir for it?
 *   3. the artefacts     — is its package in the generated PackageList.java,
 *                          and are its classes in the APK's dex?
 *
 * Step 3 is the only one that answers the question the phone asks. The first
 * two only tell you the build *should* have worked.
 *
 *   node scripts/verify-native-modules.mjs
 *   node scripts/verify-native-modules.mjs path/to/app-release.apk
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const nativeRoot = path.resolve(here, '..');
const require = createRequire(path.join(nativeRoot, 'package.json'));

/* Native modules whose absence is silent rather than fatal — the ones a JS
 * guard or a graceful fallback would hide. A module that crashes the app when
 * missing does not need to be on this list; it reports itself. */
const WATCHED = [
  { pkg: 'react-native-vision-camera', javaPackage: 'com.mrousavy.camera', dexPath: 'com/mrousavy/camera' },
];

const ok = (m) => console.log(`  [32m✓[0m ${m}`);
const bad = (m) => console.log(`  [31m✗[0m ${m}`);
const info = (m) => console.log(`  [2m·[0m ${m}`);

let failed = false;
const fail = (m) => { bad(m); failed = true; };

/* ---------------------------------------------------- 1. is it installed? -- */
console.log('\nInstalled packages');
const installed = {};
for (const m of WATCHED) {
  try {
    const pkgJson = require.resolve(`${m.pkg}/package.json`);
    const dir = path.dirname(pkgJson);
    installed[m.pkg] = dir;
    ok(`${m.pkg}@${JSON.parse(readFileSync(pkgJson, 'utf8')).version} — ${path.relative(path.resolve(nativeRoot, '..'), dir)}`);
  } catch {
    fail(`${m.pkg} is not installed. Run \`npm install\` at the repo root.`);
  }
}

/* --------------------------------------------------- 2. does it autolink? -- */
console.log('\nAutolinking (what Gradle will be told)');
let config = null;
try {
  const out = execFileSync('npx', ['react-native', 'config'], {
    cwd: nativeRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  config = JSON.parse(out);
} catch (e) {
  fail(`could not run \`npx react-native config\`: ${e.message.split('\n')[0]}`);
}

if (config) {
  const deps = config.dependencies || {};
  info(`${Object.keys(deps).length} native dependencies discovered`);
  for (const m of WATCHED) {
    const entry = deps[m.pkg];
    const android = entry && entry.platforms && entry.platforms.android;
    if (android && android.sourceDir) ok(`${m.pkg} → ${path.relative(nativeRoot, android.sourceDir)}`);
    else fail(`${m.pkg} is installed but autolinking does not see it on Android.`);
  }
}

/* --------------------------------------- 3a. the generated PackageList.java */
console.log('\nGenerated PackageList.java (the file that decides what loads)');
const generated = path.join(
  nativeRoot, 'android', 'app', 'build', 'generated', 'autolinking', 'src', 'main', 'java',
  'com', 'facebook', 'react', 'PackageList.java'
);
if (!existsSync(generated)) {
  info('not generated yet — nothing has been built in this checkout.');
} else {
  const src = readFileSync(generated, 'utf8');
  for (const m of WATCHED) {
    if (src.includes(m.javaPackage)) ok(`${m.javaPackage} is registered`);
    else {
      fail(
        `${m.javaPackage} is MISSING from the generated PackageList — this build directory `
        + 'predates the dependency. Run `cd android && ./gradlew clean` and build again.'
      );
    }
  }
}

/* ------------------------------------------------------- 3b. the APK dex -- */
const apkArg = process.argv[2];
const defaultApks = [
  'android/app/build/outputs/apk/release/app-release.apk',
  'android/app/build/outputs/apk/debug/app-debug.apk',
].map((p) => path.join(nativeRoot, p));
const apk = apkArg ? path.resolve(apkArg) : defaultApks.find((p) => existsSync(p));

console.log('\nAPK contents (the only check that answers what the phone sees)');
if (!apk || !existsSync(apk)) {
  info('no APK found — pass one as an argument, or build first.');
  info('  npx react-native build-android --mode=release');
} else {
  info(path.relative(process.cwd(), apk));
  let tmp = null;
  try {
    tmp = mkdtempSync(path.join(tmpdir(), 'apkcheck-'));
    execFileSync('unzip', ['-o', '-q', apk, 'classes*.dex', '-d', tmp], { stdio: 'ignore' });
    const dexes = readdirSync(tmp).filter((f) => f.endsWith('.dex'));
    if (dexes.length === 0) throw new Error('no dex files in the APK');
    info(`${dexes.length} dex file${dexes.length === 1 ? '' : 's'}`);

    /* Class names survive in the dex string table verbatim, so a byte search
     * for the package path is sufficient and needs no dex parser. */
    const blobs = dexes.map((f) => readFileSync(path.join(tmp, f)));
    for (const m of WATCHED) {
      const needle = Buffer.from(m.dexPath);
      const present = blobs.some((b) => b.includes(needle));
      if (present) ok(`${m.dexPath} classes are in the APK`);
      else {
        fail(
          `${m.dexPath} is NOT in the APK. The JS will load, the native module will not, `
          + 'and the app will fall back silently. Clean and rebuild:\n'
          + '        cd android && ./gradlew clean && cd ..\n'
          + '        npx react-native build-android --mode=release'
        );
      }
    }
  } catch (e) {
    fail(`could not inspect the APK: ${e.message.split('\n')[0]}`);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(
  failed
    ? '\n[31mFAILED[0m — at least one native module will be missing at runtime.\n'
    : '\n[32mOK[0m — every watched native module is present.\n'
);
process.exit(failed ? 1 : 0);
