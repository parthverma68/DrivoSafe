# Building the DrivoSafe tablet app locally

Bare React Native 0.86.2 (no Expo). **Android is the supported target** — the product is a
dash-mounted Android tablet (SYSTEM_DESIGN §4.1). The `ios/` project is the stock template and
is not maintained.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node** | ≥ 22.11 | enforced by `engines` |
| **JDK** | **17** | Not 21. React Native's Gradle plugin pins a Java 17 toolchain; on 21 alone Gradle tries to auto-download 17 and fails if it can't reach the toolchain resolver. |
| **Android SDK** | Platform 36, Build-Tools 36.0.0, NDK 27.1.12297006 | via Android Studio, or `cmdline-tools` |
| **Watchman** | optional | macOS/Linux file watching for Metro |

Install Java 17 and point `JAVA_HOME` at it:

```bash
# macOS (Homebrew)
brew install --cask temurin@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Debian / Ubuntu
sudo apt install openjdk-17-jdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

java -version   # must print 17.x
```

Android SDK — easiest is Android Studio → *SDK Manager* → install **Android 16 (API 36)**,
**Build-Tools 36.0.0**, **NDK 27.1.12297006**, **CMake**. Then:

```bash
export ANDROID_HOME=$HOME/Android/Sdk          # macOS: $HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

Gradle also reads `native/android/local.properties` if you prefer not to use env vars:

```properties
sdk.dir=/Users/you/Library/Android/sdk
```

(That file is gitignored — it is machine-specific.)

---

## 2. Install dependencies

**From the repository root, not from `native/`.** This is an npm workspace; installing inside
`native/` produces a broken tree.

```bash
cd DrivoSafe
npm install
```

---

## 3. Run it

```bash
cd native

npm start                       # Metro, terminal 1
npm run android                 # build + install + launch, terminal 2
```

Or a single shot — `run-android` starts Metro itself if it isn't already running:

```bash
npm run android
```

On a physical tablet: enable **Developer options → USB debugging**, connect, confirm with
`adb devices`. On an emulator, create a **tablet** AVD (landscape, ≥ 1280×800) — the layout is
designed for a 10–12" landscape screen and a phone AVD will look wrong.

---

## 4. Useful commands

```bash
npm run bundle                  # production JS bundle only — no SDK or device needed.
                                # The fastest way to check that every import resolves.

cd android && ./gradlew assembleDebug     # APK at app/build/outputs/apk/debug/
cd android && ./gradlew assembleRelease   # needs a signing config
cd android && ./gradlew clean

npm test --workspace @drivosafe/shared    # domain tests, plain Node, no RN needed
```

---

## 5. Monorepo notes

Two things differ from a stock React Native project, both because this is an npm workspace.

**Metro** (`metro.config.js`) watches the repo root and resolves from both `native/node_modules`
and the root `node_modules`, so `@drivosafe/shared` — which lives outside the project directory —
is visible.

**Gradle** (`android/settings.gradle`) locates `@react-native/gradle-plugin`,
`react-native` and `@react-native/codegen` by walking up the directory tree looking for
`node_modules/<pkg>`, the same lookup Node performs. The stock template hardcodes
`../node_modules/...`, which is wrong here: npm hoists most packages to the repo root while
`react-native` itself stays in `native/node_modules` because it is version-pinned. Two
sharp edges are worth knowing if you touch that file:

- `PluginManagementSpec.includeBuild` accepts **only a String**. Passing a `File` silently falls
  through to `Settings.includeBuild`, registering an ordinary included build that contributes no
  plugins — and it surfaces much later as `Plugin [id: 'com.facebook.react.settings'] was not
  found`.
- The plugin build is included **twice** on purpose. The one in `pluginManagement` supplies the
  settings plugin; the one at the bottom performs dependency substitution for the versionless
  `com.facebook.react:react-native-gradle-plugin` on the root buildscript classpath. Removing
  either breaks the build in a place that does not obviously point back here.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Included build ... does not exist` | Dependencies not installed, or installed inside `native/` | `npm install` at the **repo root** |
| `Plugin [id: 'com.facebook.react.settings'] was not found` | `includeBuild` given a `File` instead of a `String` | See §5 |
| `Could not find com.facebook.react:react-native-gradle-plugin:` (no version) | The bottom `includeBuild` is missing | See §5 |
| `Cannot find a Java installation ... languageVersion=17` | Running on JDK 21 with no 17 available | Install JDK 17, set `JAVA_HOME` |
| `SDK location not found` | No `ANDROID_HOME` and no `local.properties` | See §1 |
| Metro cannot resolve `@drivosafe/shared` | Stale Metro cache | `npm start -- --reset-cache` |
| Skia crashes on launch | `@shopify/react-native-skia` needs a real native build | Never runs in a JS-only bundle; use `npm run android` |
| Red screen: `Unable to load script` | Metro not running, or device cannot reach it | `npm start`, then `adb reverse tcp:8081 tcp:8081` |

---

## 7. Kiosk deployment

For a production in-cab image (SYSTEM_DESIGN §17), set `KIOSK = true` in `src/App.jsx` to drop
the surface switcher, then enrol the tablet as **device owner** via your MDM. The manifest
already declares the landscape lock, `keepScreenOn`, the sensor permission set, and a
`HOME`-category launcher intent so the app can be pinned as the launcher.
