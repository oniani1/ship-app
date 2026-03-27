import { createReadStream, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from './google-play-auth.mjs';
import { getConfig } from './config.mjs';

const __filename = fileURLToPath(import.meta.url);

/**
 * Upload an app bundle and manage store listing via the Google Play Developer API.
 * Implements the full edit workflow: insert → upload → listings → images → track → commit.
 *
 * @param {{
 *   packageName: string,
 *   aabPath?: string,
 *   listings?: Record<string, { title: string, shortDescription: string, fullDescription: string }>,
 *   images?: Record<string, { icon?: string, featureGraphic?: string, phoneScreenshots?: string[] }>,
 *   track?: string,
 *   releaseNotes?: Array<{ language: string, text: string }>,
 *   releaseStatus?: string,
 *   updateListings?: boolean,
 *   updateImages?: boolean
 * }} options
 * @returns {Promise<{
 *   editId: string,
 *   versionCode?: number,
 *   commitResult: any,
 *   uploadedImages: string[],
 *   errors: string[]
 * }>}
 */
export async function upload(options) {
  const {
    packageName,
    aabPath,
    listings,
    images,
    track = 'production',
    releaseNotes = [],
    releaseStatus = 'completed',
    updateListings = true,
    updateImages = true
  } = options;

  const config = getConfig();
  const client = await createClient(config?.googlePlay?.serviceAccountKeyPath);
  const errors = [];
  const uploadedImages = [];

  // Step 1: Create a new edit
  console.log('Step 1/6: Creating edit...');
  let editId;
  try {
    const edit = await client.edits.insert({
      packageName,
      requestBody: {}
    });
    editId = edit.data.id;
    console.log(`  Edit created: ${editId}`);
  } catch (e) {
    throw new Error(`Failed to create edit for ${packageName}: ${e.message}`);
  }

  // Wrap remaining steps in try/finally to clean up edit on failure
  try {

  // Step 2: Upload AAB (if provided)
  let versionCode;
  if (aabPath) {
    console.log('Step 2/6: Uploading AAB...');
    try {
      const bundle = await client.edits.bundles.upload({
        packageName,
        editId,
        media: {
          mimeType: 'application/octet-stream',
          body: createReadStream(aabPath)
        }
      }, {
        timeout: 300000, // 5 minute timeout for upload
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      versionCode = bundle.data.versionCode;
      console.log(`  Bundle uploaded. Version code: ${versionCode}`);
    } catch (e) {
      throw new Error(`Failed to upload AAB: ${e.message}`);
    }
  } else {
    console.log('Step 2/6: Skipping AAB upload (not provided)');
  }

  // Step 3: Update store listings
  if (updateListings && listings) {
    console.log('Step 3/6: Updating store listings...');
    for (const [language, listing] of Object.entries(listings)) {
      try {
        await client.edits.listings.update({
          packageName,
          editId,
          language,
          requestBody: {
            title: listing.title,
            shortDescription: listing.shortDescription,
            fullDescription: listing.fullDescription
          }
        });
        console.log(`  Updated listing for ${language}`);
      } catch (e) {
        errors.push(`Failed to update listing for ${language}: ${e.message}`);
        console.error(`  Error updating ${language}: ${e.message}`);
      }
    }
  } else {
    console.log('Step 3/6: Skipping listing updates');
  }

  // Step 4: Upload images
  if (updateImages && images) {
    console.log('Step 4/6: Uploading images...');
    for (const [language, languageImages] of Object.entries(images)) {
      // Upload icon
      if (languageImages.icon) {
        try {
          // Delete existing icons first
          await client.edits.images.deleteall({
            packageName, editId, language, imageType: 'icon'
          }).catch(() => {});

          await client.edits.images.upload({
            packageName,
            editId,
            language,
            imageType: 'icon',
            media: {
              mimeType: 'image/png',
              body: createReadStream(languageImages.icon)
            }
          });
          uploadedImages.push(`${language}/icon`);
          console.log(`  Uploaded icon for ${language}`);
        } catch (e) {
          errors.push(`Failed to upload icon for ${language}: ${e.message}`);
        }
      }

      // Upload feature graphic
      if (languageImages.featureGraphic) {
        try {
          await client.edits.images.deleteall({
            packageName, editId, language, imageType: 'featureGraphic'
          }).catch(() => {});

          await client.edits.images.upload({
            packageName,
            editId,
            language,
            imageType: 'featureGraphic',
            media: {
              mimeType: 'image/png',
              body: createReadStream(languageImages.featureGraphic)
            }
          });
          uploadedImages.push(`${language}/featureGraphic`);
          console.log(`  Uploaded feature graphic for ${language}`);
        } catch (e) {
          errors.push(`Failed to upload feature graphic for ${language}: ${e.message}`);
        }
      }

      // Upload phone screenshots
      if (languageImages.phoneScreenshots?.length > 0) {
        try {
          // Delete existing screenshots first
          await client.edits.images.deleteall({
            packageName, editId, language, imageType: 'phoneScreenshots'
          }).catch(() => {});

          for (let i = 0; i < languageImages.phoneScreenshots.length; i++) {
            const ssPath = languageImages.phoneScreenshots[i];
            await client.edits.images.upload({
              packageName,
              editId,
              language,
              imageType: 'phoneScreenshots',
              media: {
                mimeType: 'image/png',
                body: createReadStream(ssPath)
              }
            });
            uploadedImages.push(`${language}/phoneScreenshot-${i + 1}`);
          }
          console.log(`  Uploaded ${languageImages.phoneScreenshots.length} screenshots for ${language}`);
        } catch (e) {
          errors.push(`Failed to upload screenshots for ${language}: ${e.message}`);
        }
      }
    }
  } else {
    console.log('Step 4/6: Skipping image uploads');
  }

  // Step 5: Set release track
  if (versionCode) {
    console.log(`Step 5/6: Setting track to ${track}...`);
    try {
      const defaultNotes = releaseNotes.length > 0 ? releaseNotes : [
        { language: 'en-US', text: 'Bug fixes and improvements.' }
      ];

      await client.edits.tracks.update({
        packageName,
        editId,
        track,
        requestBody: {
          track,
          releases: [{
            status: releaseStatus,
            versionCodes: [versionCode],
            releaseNotes: defaultNotes
          }]
        }
      });
      console.log(`  Track ${track} set with version ${versionCode}`);
    } catch (e) {
      throw new Error(`Failed to set track: ${e.message}`);
    }
  } else {
    console.log('Step 5/6: Skipping track update (no version code)');
  }

  // Step 6: Commit the edit
  console.log('Step 6/6: Committing edit...');
  let commitResult;
  try {
    const commit = await client.edits.commit({
      packageName,
      editId
    });
    commitResult = commit.data;
    console.log('  Edit committed successfully!');
  } catch (e) {
    // If commit fails due to 409, it might be a stale edit
    if (e.code === 409) {
      throw new Error('Edit conflict (409). Another edit may be in progress. Please try again.');
    }
    throw new Error(`Failed to commit edit: ${e.message}`);
  }

  return { editId, versionCode, commitResult, uploadedImages, errors };

  } catch (e) {
    // Clean up the edit on failure so it doesn't block future uploads
    console.error('  Upload failed, cleaning up edit...');
    try {
      await client.edits.delete({ packageName, editId });
      console.log('  Edit deleted.');
    } catch { /* edit may already be committed or expired */ }
    throw e;
  }
}

/**
 * Check if an app exists on Google Play.
 * @param {string} packageName
 * @returns {Promise<boolean>}
 */
export async function appExists(packageName) {
  const config = getConfig();
  const client = await createClient(config?.googlePlay?.serviceAccountKeyPath);

  try {
    const edit = await client.edits.insert({ packageName, requestBody: {} });
    await client.edits.delete({ packageName, editId: edit.data.id });
    return true;
  } catch (e) {
    if (e.code === 404) return false;
    throw e;
  }
}

/**
 * Get the latest version info for an app.
 * @param {string} packageName
 * @param {string} [track='production']
 * @returns {Promise<{versionCode: number, versionName: string} | null>}
 */
export async function getLatestVersion(packageName, track = 'production') {
  const config = getConfig();
  const client = await createClient(config?.googlePlay?.serviceAccountKeyPath);

  try {
    const edit = await client.edits.insert({ packageName, requestBody: {} });
    const editId = edit.data.id;

    const trackInfo = await client.edits.tracks.get({ packageName, editId, track });
    await client.edits.delete({ packageName, editId });

    const releases = trackInfo.data.releases || [];
    const latest = releases.find(r => r.status === 'completed');
    if (latest?.versionCodes?.length > 0) {
      return {
        versionCode: Math.max(...latest.versionCodes.map(Number)),
        status: latest.status
      };
    }
    return null;
  } catch {
    return null;
  }
}

// CLI mode
if (process.argv[1] === __filename) {
  const cmd = process.argv[2];

  if (cmd === '--check-app') {
    const pkg = process.argv[3];
    const exists = await appExists(pkg);
    console.log(JSON.stringify({ packageName: pkg, exists }));
  } else if (cmd === '--latest-version') {
    const pkg = process.argv[3];
    const track = process.argv[4] || 'production';
    const version = await getLatestVersion(pkg, track);
    console.log(JSON.stringify({ packageName: pkg, track, version }));
  } else if (cmd === '--upload') {
    // Accept upload config from a JSON file (avoids ESM import issues with node -e)
    const configPath = process.argv[3];
    if (!configPath) {
      console.error('Usage: node google-play-upload.mjs --upload <config.json>');
      process.exit(1);
    }
    try {
      const uploadConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      const result = await upload(uploadConfig);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('UPLOAD FAILED:', e.message);
      process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  node google-play-upload.mjs --check-app <packageName>');
    console.log('  node google-play-upload.mjs --latest-version <packageName> [track]');
    console.log('  node google-play-upload.mjs --upload <config.json>');
  }
}
