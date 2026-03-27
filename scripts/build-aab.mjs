import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { detectProject } from './detect-project.mjs';

const __filename = fileURLToPath(import.meta.url);

/**
 * Build an Android App Bundle (.aab) for the detected project type.
 * @param {string} projectRoot - Root directory of the project
 * @param {string} [forceType] - Override detected project type
 * @returns {{aabPath: string, type: string, output: string}}
 */
export function buildAAB(projectRoot, forceType) {
  const root = resolve(projectRoot);
  const detection = detectProject(root);
  const type = forceType || detection.type;

  if (type === 'unknown') {
    throw new Error('Could not detect project type. Supported: android-native, react-native, capacitor, pwa-twa');
  }

  let output;
  let aabPath;

  switch (type) {
    case 'android-native': {
      const androidDir = detection.androidDir || root;
      output = runBuild(androidDir, getGradleCommand(androidDir, 'bundleRelease'));
      aabPath = findAAB(androidDir);
      break;
    }

    case 'react-native': {
      // Ensure node_modules are installed
      if (!existsSync(join(root, 'node_modules'))) {
        console.log('Installing dependencies...');
        execSync('npm install', { cwd: root, stdio: 'inherit' });
      }
      const androidDir = join(root, 'android');
      output = runBuild(androidDir, getGradleCommand(androidDir, 'bundleRelease'));
      aabPath = findAAB(androidDir);
      break;
    }

    case 'capacitor': {
      // Sync web assets to native project
      if (!existsSync(join(root, 'node_modules'))) {
        console.log('Installing dependencies...');
        execSync('npm install', { cwd: root, stdio: 'inherit' });
      }
      // Build web assets first (required for Capacitor)
      console.log('Building web assets...');
      const pkgData = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
      if (pkgData.scripts?.build) {
        execSync('npm run build', { cwd: root, stdio: 'inherit' });
      } else {
        console.log('  No build script found in package.json, skipping web build.');
      }
      // Sync to Android
      console.log('Syncing Capacitor...');
      execSync('npx cap sync android', { cwd: root, stdio: 'inherit' });
      const androidDir = join(root, 'android');
      output = runBuild(androidDir, getGradleCommand(androidDir, 'bundleRelease'));
      aabPath = findAAB(androidDir);
      break;
    }

    case 'pwa-twa': {
      aabPath = buildPwaTwa(root);
      output = 'PWA/TWA build completed';
      break;
    }

    default:
      throw new Error(`Unsupported project type: ${type}`);
  }

  if (!aabPath || !existsSync(aabPath)) {
    throw new Error(`Build completed but .aab file not found. Expected locations checked. Build output:\n${output}`);
  }

  return { aabPath, type, output: output?.toString() || '' };
}

function getGradleCommand(androidDir, task) {
  const isWindows = process.platform === 'win32';
  const gradlewPath = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');

  if (existsSync(gradlewPath)) {
    return isWindows ? `gradlew.bat ${task}` : `./gradlew ${task}`;
  }

  // Fallback to system gradle
  return `gradle ${task}`;
}

function runBuild(androidDir, command) {
  console.log(`Running: ${command} in ${androidDir}`);
  try {
    const output = execSync(command, {
      cwd: androidDir,
      stdio: 'pipe',
      timeout: 600000, // 10 minute timeout
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });
    return output.toString();
  } catch (e) {
    const stderr = e.stderr?.toString() || '';
    const stdout = e.stdout?.toString() || '';
    throw new Error(`Build failed:\n${stderr}\n${stdout}`);
  }
}

function findAAB(androidDir) {
  // Common AAB output locations
  const candidates = [
    join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab'),
    join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release-unsigned.aab'),
    join(androidDir, 'build', 'outputs', 'bundle', 'release', 'app-release.aab'),
    join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      // If it's a directory, find the first .aab in it
      if (!candidate.endsWith('.aab')) {
        const files = readdirSync(candidate).filter(f => f.endsWith('.aab'));
        if (files.length > 0) {
          return join(candidate, files[0]);
        }
      } else {
        return candidate;
      }
    }
  }

  // Recursive search as last resort (pure Node.js — works on all platforms)
  try {
    const found = findFileRecursive(androidDir, (filePath) =>
      filePath.endsWith('.aab') && filePath.includes('bundle') && filePath.includes('release')
    );
    if (found) return found;
  } catch { /* ignore */ }

  return null;
}

function findFileRecursive(dir, predicate) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFileRecursive(fullPath, predicate);
        if (found) return found;
      } else if (predicate(fullPath)) {
        return fullPath;
      }
    }
  } catch { /* permission errors, etc. */ }
  return null;
}

function buildPwaTwa(root) {
  // Check for bubblewrap
  const twaManifest = join(root, 'twa-manifest.json');

  if (existsSync(twaManifest)) {
    console.log('Building TWA with bubblewrap...');
    execSync('npx @bubblewrap/cli build', { cwd: root, stdio: 'inherit' });
  } else {
    throw new Error(
      'No twa-manifest.json found. For PWA/TWA builds, initialize bubblewrap first:\n' +
      '  npx @bubblewrap/cli init --manifest=https://your-app.com/manifest.json'
    );
  }

  // Find the output AAB
  const aabCandidates = [
    join(root, 'app-release-bundle.aab'),
    join(root, 'app-release-signed.aab'),
  ];
  return aabCandidates.find(p => existsSync(p)) || null;
}

// CLI mode
if (process.argv[1]?.endsWith('build-aab.mjs')) {
  const projectRoot = process.argv[2] || process.cwd();
  const forceType = process.argv.find(a => a.startsWith('--type='))?.split('=')[1];

  try {
    const result = buildAAB(projectRoot, forceType);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('BUILD FAILED:', e.message);
    process.exit(1);
  }
}
