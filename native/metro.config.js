const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/* Monorepo wiring (SYSTEM_DESIGN §3.1).
 *
 * @drivosafe/shared lives outside this project directory, so Metro has to be
 * told two things: watch the repo root for changes, and resolve modules from
 * both the app's and the root's node_modules. Without the second, the hoisted
 * copies of react / react-native are invisible from inside `native/`.
 *
 * `react-road-hazards` needs no special handling: Metro reads its
 * `react-native` entry field and picks the Skia renderer automatically, so the
 * same `import { RoadHazardView } from 'react-road-hazards'` that resolves to
 * the <canvas> renderer on web resolves to the Skia one here.
 */
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
// workspace packages are symlinks; resolve them rather than following blindly
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// @drivosafe/shared lives outside native/, so Metro's normal hierarchical
// lookup would resolve its `react` import to the hoisted root copy while
// native's own screens use native/node_modules/react — two React instances
// in one bundle, which breaks hooks ("Cannot read property 'useState' of
// null"). Pinning this via disableHierarchicalLookup (instead of the
// resolveRequest override below) is tempting but wrong: it also stops Metro
// from finding *any* nested, package-local node_modules dependency — e.g.
// react-native-reanimated ships its own pinned semver@7 under
// node_modules/react-native-reanimated/node_modules/semver, which its
// validate-worklets-version.js script needs (the root's semver@6.3.1 lacks
// the `functions/satisfies` submodule reanimated expects). So: leave
// hierarchical lookup on for everything, and only redirect these two
// specific module ids straight to native's copy.
// Resolved once, here, via Node's own resolution algorithm starting from
// native/ — NOT hardcoded to native/node_modules/<pkg>. npm's hoisting
// decisions shift across installs (react-native itself lives at the repo
// root, not nested under native/, while react has moved between the two
// across installs in this repo already); asking Node "what would native/'s
// own code get for this import" self-adapts to wherever that actually is.
const PINNED_TO_NATIVE = {
  react: path.dirname(require.resolve('react/package.json', { paths: [projectRoot] })),
  'react-native': path.dirname(require.resolve('react-native/package.json', { paths: [projectRoot] })),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (PINNED_TO_NATIVE[moduleName]) {
    return context.resolveRequest(context, PINNED_TO_NATIVE[moduleName], platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
