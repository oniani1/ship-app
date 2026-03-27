import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

/**
 * Detect Android project type and extract metadata.
 * @param {string} projectRoot - Root directory of the project
 * @returns {{
 *   type: 'android-native' | 'react-native' | 'capacitor' | 'pwa-twa' | 'unknown',
 *   packageName: string | null,
 *   versionName: string | null,
 *   versionCode: number | null,
 *   androidDir: string | null,
 *   buildGradlePath: string | null,
 *   signingConfigured: boolean,
 *   keystorePath: string | null,
 *   devCommand: string | null,
 *   devPort: number | null,
 *   appName: string | null
 * }}
 */
export function detectProject(projectRoot) {
  const root = resolve(projectRoot);

  const result = {
    type: 'unknown',
    packageName: null,
    versionName: null,
    versionCode: null,
    androidDir: null,
    buildGradlePath: null,
    signingConfigured: false,
    keystorePath: null,
    devCommand: null,
    devPort: null,
    appName: null
  };

  // Read package.json if it exists
  const pkgJsonPath = join(root, 'package.json');
  let pkgJson = null;
  if (existsSync(pkgJsonPath)) {
    try {
      pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      result.appName = pkgJson.name || null;
      // Detect dev command
      if (pkgJson.scripts?.dev) {
        result.devCommand = 'npm run dev';
        result.devPort = extractPort(pkgJson.scripts.dev) || 5173;
      } else if (pkgJson.scripts?.start) {
        result.devCommand = 'npm start';
        result.devPort = extractPort(pkgJson.scripts.start) || 3000;
      } else if (pkgJson.scripts?.serve) {
        result.devCommand = 'npm run serve';
        result.devPort = extractPort(pkgJson.scripts.serve) || 8080;
      }
    } catch { /* ignore */ }
  }

  // Check for Capacitor
  const capConfigTs = join(root, 'capacitor.config.ts');
  const capConfigJson = join(root, 'capacitor.config.json');
  if (existsSync(capConfigTs) || existsSync(capConfigJson)) {
    result.type = 'capacitor';
    const capConfig = readCapacitorConfig(root, capConfigTs, capConfigJson);
    if (capConfig) {
      result.packageName = capConfig.appId || null;
      result.appName = capConfig.appName || result.appName;
    }
    result.androidDir = join(root, 'android');
    findGradleInfo(result, result.androidDir);
    return result;
  }

  // Check for React Native
  if (pkgJson?.dependencies?.['react-native'] && existsSync(join(root, 'android'))) {
    result.type = 'react-native';
    result.androidDir = join(root, 'android');
    // Check app.json for RN config
    const appJsonPath = join(root, 'app.json');
    if (existsSync(appJsonPath)) {
      try {
        const appJson = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
        result.appName = appJson.displayName || appJson.name || result.appName;
        result.packageName = appJson.android?.package || null;
      } catch { /* ignore */ }
    }
    findGradleInfo(result, result.androidDir);
    // RN dev port is typically 8081 (Metro) but app runs on device
    result.devPort = 8081;
    result.devCommand = 'npx react-native start';
    return result;
  }

  // Check for PWA/TWA
  const twaManifest = join(root, 'twa-manifest.json');
  const webManifest = join(root, 'manifest.json');
  const webManifest2 = join(root, 'manifest.webmanifest');
  const publicManifest = join(root, 'public', 'manifest.json');
  if (existsSync(twaManifest)) {
    result.type = 'pwa-twa';
    try {
      const twa = JSON.parse(readFileSync(twaManifest, 'utf-8'));
      result.packageName = twa.packageId || null;
      result.appName = twa.name || result.appName;
    } catch { /* ignore */ }
    return result;
  }
  if (existsSync(webManifest) || existsSync(webManifest2) || existsSync(publicManifest)) {
    // Could be a PWA — check if there's no android directory (otherwise it's something else)
    if (!existsSync(join(root, 'android'))) {
      result.type = 'pwa-twa';
      const manifestPath = [webManifest, webManifest2, publicManifest].find(p => existsSync(p));
      if (manifestPath) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          result.appName = manifest.name || manifest.short_name || result.appName;
        } catch { /* ignore */ }
      }
      return result;
    }
  }

  // Check for native Android (root-level or app/ gradle)
  const gradlePaths = [
    join(root, 'app', 'build.gradle'),
    join(root, 'app', 'build.gradle.kts'),
    join(root, 'build.gradle'),
    join(root, 'build.gradle.kts')
  ];
  for (const gp of gradlePaths) {
    if (existsSync(gp)) {
      result.type = 'android-native';
      result.androidDir = root;
      findGradleInfo(result, root);
      return result;
    }
  }

  return result;
}

function readCapacitorConfig(root, tsPath, jsonPath) {
  // Try JSON first (simpler to parse)
  if (existsSync(jsonPath)) {
    try {
      return JSON.parse(readFileSync(jsonPath, 'utf-8'));
    } catch { /* ignore */ }
  }
  // Try TS — extract appId and appName with regex
  if (existsSync(tsPath)) {
    try {
      const content = readFileSync(tsPath, 'utf-8');
      const appId = content.match(/appId:\s*['"]([^'"]+)['"]/)?.[1];
      const appName = content.match(/appName:\s*['"]([^'"]+)['"]/)?.[1];
      return { appId, appName };
    } catch { /* ignore */ }
  }
  return null;
}

function findGradleInfo(result, androidDir) {
  const appGradlePaths = [
    join(androidDir, 'app', 'build.gradle'),
    join(androidDir, 'app', 'build.gradle.kts'),
    join(androidDir, 'build.gradle'),
    join(androidDir, 'build.gradle.kts')
  ];

  for (const gp of appGradlePaths) {
    if (!existsSync(gp)) continue;
    result.buildGradlePath = gp;
    const content = readFileSync(gp, 'utf-8');
    const isKts = gp.endsWith('.kts');

    // Extract applicationId / namespace
    const appIdMatch = isKts
      ? content.match(/applicationId\s*=\s*"([^"]+)"/)
      : content.match(/applicationId\s+["']([^"']+)["']/);
    if (appIdMatch) result.packageName = appIdMatch[1];

    // namespace (newer gradle)
    if (!result.packageName) {
      const nsMatch = isKts
        ? content.match(/namespace\s*=\s*"([^"]+)"/)
        : content.match(/namespace\s+["']([^"']+)["']/);
      if (nsMatch) result.packageName = nsMatch[1];
    }

    // Extract versionName
    const vnMatch = isKts
      ? content.match(/versionName\s*=\s*"([^"]+)"/)
      : content.match(/versionName\s+["']([^"']+)["']/);
    if (vnMatch) result.versionName = vnMatch[1];

    // Extract versionCode
    const vcMatch = isKts
      ? content.match(/versionCode\s*=\s*(\d+)/)
      : content.match(/versionCode\s+(\d+)/);
    if (vcMatch) result.versionCode = parseInt(vcMatch[1]);

    // Check signing config
    result.signingConfigured = content.includes('signingConfigs') && content.includes('release');

    // Try to find keystore path in gradle.properties or the gradle file itself
    const ksMatch = content.match(/storeFile\s*[=:]\s*file\(["']([^"']+)["']\)/);
    if (ksMatch) {
      result.keystorePath = resolve(androidDir, ksMatch[1]);
    }

    // Check gradle.properties for keystore info
    const propsPath = join(androidDir, 'gradle.properties');
    if (existsSync(propsPath)) {
      const props = readFileSync(propsPath, 'utf-8');
      const ksFileMatch = props.match(/RELEASE_STORE_FILE\s*=\s*(.+)/);
      if (ksFileMatch && !result.keystorePath) {
        result.keystorePath = resolve(androidDir, ksFileMatch[1].trim());
      }
    }

    break; // Use the first found gradle file
  }

  // Fallback: read AndroidManifest.xml for package name
  if (!result.packageName) {
    const manifestPaths = [
      join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml'),
      join(androidDir, 'src', 'main', 'AndroidManifest.xml')
    ];
    for (const mp of manifestPaths) {
      if (existsSync(mp)) {
        const content = readFileSync(mp, 'utf-8');
        const pkgMatch = content.match(/package="([^"]+)"/);
        if (pkgMatch) result.packageName = pkgMatch[1];
        break;
      }
    }
  }
}

function extractPort(script) {
  const portMatch = script.match(/(?:--port|--p|-p)[=\s]+(\d+)/);
  if (portMatch) return parseInt(portMatch[1]);
  const portEnv = script.match(/PORT=(\d+)/);
  if (portEnv) return parseInt(portEnv[1]);
  return null;
}

// CLI mode
if (process.argv[1]?.endsWith('detect-project.mjs')) {
  const projectRoot = process.argv[2] || process.cwd();
  const result = detectProject(projectRoot);
  console.log(JSON.stringify(result, null, 2));
}
