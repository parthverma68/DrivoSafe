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
config.resolver.disableHierarchicalLookup = false;

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
