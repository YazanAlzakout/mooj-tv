const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Signs release builds with the Play upload key.
 *
 * The keystore deliberately lives *outside* this repository, and so do its
 * passwords: the four values below are read from Gradle properties, which
 * belong in the user-level `~/.gradle/gradle.properties`
 * (`%USERPROFILE%\.gradle\gradle.properties` on Windows) — a file Git never
 * sees. Nothing secret is committed, and nothing secret is needed to clone
 * the repo and build a debug APK.
 *
 * This has to be a config plugin rather than an edit to android/: that
 * directory is generated, `expo prebuild --clean` wipes it, and a signing
 * config written there by hand would silently vanish on the next prebuild —
 * leaving a release build signed with the debug key, which Play rejects.
 *
 * With the properties absent the release build falls back to the debug
 * signing config, exactly as a stock Expo project does, so a machine
 * without the keystore can still produce a local release build to test.
 */
const PROPS = {
  storeFile: 'ALBASERA_UPLOAD_STORE_FILE',
  storePassword: 'ALBASERA_UPLOAD_STORE_PASSWORD',
  keyAlias: 'ALBASERA_UPLOAD_KEY_ALIAS',
  keyPassword: 'ALBASERA_UPLOAD_KEY_PASSWORD',
};

const DEBUG_SIGNING = 'signingConfig signingConfigs.debug';

const RELEASE_SIGNING_CONFIG = `        release {
            if (project.hasProperty('${PROPS.storeFile}')) {
                storeFile file(project.property('${PROPS.storeFile}'))
                storePassword project.property('${PROPS.storePassword}')
                keyAlias project.property('${PROPS.keyAlias}')
                keyPassword project.property('${PROPS.keyPassword}')
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;

    // Idempotent: prebuild can run this more than once over the same file.
    if (gradle.includes(PROPS.storeFile)) return cfg;

    // 1. Add a `release` entry to signingConfigs, after the `debug` one.
    const signingConfigsAt = gradle.indexOf('signingConfigs {');
    if (signingConfigsAt === -1) {
      throw new Error('withReleaseSigning: signingConfigs block not found');
    }
    const debugEnd = gradle.indexOf('\n        }\n', signingConfigsAt);
    if (debugEnd === -1) {
      throw new Error('withReleaseSigning: end of the debug signing config not found');
    }
    const insertAt = debugEnd + '\n        }\n'.length;
    gradle = gradle.slice(0, insertAt) + RELEASE_SIGNING_CONFIG + gradle.slice(insertAt);

    /*
     * 2. Point the release build type at it, but only when it is configured.
     *
     * Located by walking buildTypes -> release -> the signingConfig line,
     * rather than by one regex spanning the three. The generated release
     * block carries two comment lines between its opening brace and that
     * statement, which a `release \{\n\s*signingConfig` pattern fails to
     * match; and the identical statement appears in the debug block just
     * above, so the search has to start from the release block rather than
     * from the top of the file.
     */
    const buildTypesAt = gradle.indexOf('buildTypes {');
    const releaseAt = buildTypesAt === -1 ? -1 : gradle.indexOf('release {', buildTypesAt);
    const signingAt = releaseAt === -1 ? -1 : gradle.indexOf(DEBUG_SIGNING, releaseAt);
    if (signingAt === -1) {
      throw new Error('withReleaseSigning: release buildType signingConfig line not found');
    }
    gradle =
      gradle.slice(0, signingAt) +
      `signingConfig project.hasProperty('${PROPS.storeFile}') ? signingConfigs.release : signingConfigs.debug` +
      gradle.slice(signingAt + DEBUG_SIGNING.length);

    cfg.modResults.contents = gradle;
    return cfg;
  });
};
