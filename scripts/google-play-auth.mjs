import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { getConfig } from './config.mjs';

/**
 * Create an authenticated Google Play Developer API client.
 * @param {string} [keyPath] - Path to service account JSON key. Uses config if omitted.
 * @returns {Promise<import('googleapis').androidpublisher_v3.Androidpublisher>}
 */
export async function createClient(keyPath) {
  const resolvedPath = keyPath || getConfig()?.googlePlay?.serviceAccountKeyPath;
  if (!resolvedPath) {
    throw new Error('No service account key path provided. Run: node config.mjs --set googlePlay.serviceAccountKeyPath /path/to/key.json');
  }

  const keyData = JSON.parse(readFileSync(resolvedPath, 'utf-8'));

  const auth = new google.auth.GoogleAuth({
    credentials: keyData,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  const authClient = await auth.getClient();
  return google.androidpublisher({ version: 'v3', auth: authClient });
}

/**
 * Verify that the service account can authenticate and access the API.
 * @param {string} [keyPath] - Path to service account JSON key.
 * @param {string} [packageName] - Optional package name to test access to.
 * @returns {Promise<{success: boolean, email: string, error?: string}>}
 */
export async function verifyAuth(keyPath, packageName) {
  try {
    const resolvedPath = keyPath || getConfig()?.googlePlay?.serviceAccountKeyPath;
    if (!resolvedPath) {
      return { success: false, error: 'No service account key path configured. Run: node config.mjs --set googlePlay.serviceAccountKeyPath /path/to/key.json' };
    }
    const keyData = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
    const client = await createClient(resolvedPath);

    const result = {
      success: true,
      email: keyData.client_email,
      projectId: keyData.project_id
    };

    // If a package name is provided, verify access to that app
    if (packageName) {
      try {
        const edit = await client.edits.insert({
          packageName,
          requestBody: {}
        });
        // Clean up the test edit
        await client.edits.delete({
          packageName,
          editId: edit.data.id
        });
        result.appAccess = true;
      } catch (e) {
        if (e.code === 404) {
          result.appAccess = false;
          result.appAccessNote = `App ${packageName} not found. This is expected for new apps.`;
        } else if (e.code === 403) {
          result.appAccess = false;
          result.appAccessNote = `Service account lacks permission for ${packageName}. Check Play Console API access settings.`;
        } else {
          result.appAccess = false;
          result.appAccessNote = e.message;
        }
      }
    }

    return result;
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}

// CLI mode
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const cmd = process.argv[2];
  const keyPath = process.argv.find(a => a.startsWith('--key='))?.split('=')[1];
  const packageName = process.argv.find(a => a.startsWith('--package='))?.split('=')[1];

  if (cmd === '--verify') {
    const result = await verifyAuth(keyPath, packageName);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  } else {
    console.log('Usage:');
    console.log('  node google-play-auth.mjs --verify [--key=/path/to/key.json] [--package=com.example.app]');
  }
}
