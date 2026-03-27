import { spawnSync } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

/** Run a command safely with args array (no shell interpolation). */
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'pipe', ...options });
  if (result.error) {
    throw new Error(`Failed to execute ${cmd}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || '';
    const stdout = result.stdout?.toString() || '';
    throw new Error(`${cmd} exited with code ${result.status}:\n${stderr}\n${stdout}`);
  }
  return result.stdout?.toString() || '';
}

/**
 * Generate a new keystore for signing.
 * @param {{
 *   path: string,
 *   alias: string,
 *   password: string,
 *   dname: { cn: string, ou?: string, o?: string, l?: string, st?: string, c?: string }
 * }} options
 * @returns {{ keystorePath: string }}
 */
export function generateKeystore({ path: ksPath, alias, password, dname }) {
  const resolvedPath = resolve(ksPath);

  if (existsSync(resolvedPath)) {
    throw new Error(`Keystore already exists at ${resolvedPath}. Use a different path or delete the existing one.`);
  }

  const dnameStr = [
    dname.cn ? `CN=${dname.cn}` : null,
    dname.ou ? `OU=${dname.ou}` : null,
    dname.o ? `O=${dname.o}` : null,
    dname.l ? `L=${dname.l}` : null,
    dname.st ? `ST=${dname.st}` : null,
    dname.c ? `C=${dname.c}` : null,
  ].filter(Boolean).join(', ');

  run('keytool', [
    '-genkey', '-v',
    '-keystore', resolvedPath,
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', password,
    '-keypass', password,
    '-dname', dnameStr
  ]);

  return { keystorePath: resolvedPath };
}

/**
 * Sign an AAB file with a keystore.
 * @param {{
 *   aabPath: string,
 *   keystorePath: string,
 *   keystorePassword: string,
 *   keyAlias: string,
 *   keyPassword: string
 * }} options
 * @returns {{ signedAabPath: string }}
 */
export function signAAB({ aabPath, keystorePath, keystorePassword, keyAlias, keyPassword }) {
  const resolvedAab = resolve(aabPath);
  const resolvedKs = resolve(keystorePath);

  if (!existsSync(resolvedAab)) {
    throw new Error(`AAB file not found: ${resolvedAab}`);
  }
  if (!existsSync(resolvedKs)) {
    throw new Error(`Keystore not found: ${resolvedKs}`);
  }

  // Create a copy for signing (don't modify original)
  const dir = dirname(resolvedAab);
  const signedPath = join(dir, 'app-release-signed.aab');
  copyFileSync(resolvedAab, signedPath);

  run('jarsigner', [
    '-verbose',
    '-sigalg', 'SHA256withRSA',
    '-digestalg', 'SHA-256',
    '-keystore', resolvedKs,
    '-storepass', keystorePassword,
    '-keypass', keyPassword,
    signedPath,
    keyAlias
  ]);

  return { signedAabPath: signedPath };
}

/**
 * Check if an AAB is already signed.
 * @param {string} aabPath
 * @returns {boolean}
 */
export function isAlreadySigned(aabPath) {
  const result = spawnSync('jarsigner', ['-verify', resolve(aabPath)], { stdio: 'pipe' });
  return result.status === 0;
}

/**
 * Verify that keytool and jarsigner are available.
 * @returns {{ keytool: boolean, jarsigner: boolean }}
 */
export function checkTools() {
  const kt = spawnSync('keytool', ['-help'], { stdio: 'pipe' });
  const js = spawnSync('jarsigner', ['-help'], { stdio: 'pipe' });
  return {
    keytool: !kt.error,
    jarsigner: !js.error
  };
}

// CLI mode
if (process.argv[1]?.endsWith('sign-aab.mjs')) {
  const cmd = process.argv[2];

  if (cmd === '--check-tools') {
    const tools = checkTools();
    console.log(JSON.stringify(tools, null, 2));
    process.exit(tools.keytool && tools.jarsigner ? 0 : 1);
  } else if (cmd === '--generate-keystore') {
    const path = process.argv[3];
    const alias = process.argv[4] || 'release';
    const password = process.argv[5] || 'changeit';
    const cn = process.argv[6] || 'Developer';
    try {
      const result = generateKeystore({ path, alias, password, dname: { cn } });
      console.log(JSON.stringify(result));
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  } else if (cmd === '--sign') {
    const aabPath = process.argv[3];
    const keystorePath = process.argv[4];
    const keystorePassword = process.argv[5];
    const keyAlias = process.argv[6] || 'release';
    const keyPassword = process.argv[7] || keystorePassword;
    try {
      const result = signAAB({ aabPath, keystorePath, keystorePassword, keyAlias, keyPassword });
      console.log(JSON.stringify(result));
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  } else if (cmd === '--verify') {
    const aabPath = process.argv[3];
    console.log(JSON.stringify({ signed: isAlreadySigned(aabPath) }));
  } else {
    console.log('Usage:');
    console.log('  node sign-aab.mjs --check-tools');
    console.log('  node sign-aab.mjs --generate-keystore <path> [alias] [password] [cn]');
    console.log('  node sign-aab.mjs --sign <aab> <keystore> <password> [alias] [keyPassword]');
    console.log('  node sign-aab.mjs --verify <aab>');
  }
}
