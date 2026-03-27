import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './config.mjs';

const __filename = fileURLToPath(import.meta.url);

/**
 * Generate an app icon using AI image generation.
 * @param {{
 *   appName: string,
 *   appDescription: string,
 *   category?: string,
 *   outputDir: string,
 *   variants?: number,
 *   provider?: string,
 *   apiKey?: string
 * }} options
 * @returns {Promise<string[]>} Paths to generated icon files
 */
export async function generateIcon(options) {
  const {
    appName,
    appDescription,
    category = '',
    outputDir,
    variants = 3,
    provider: providerOverride,
    apiKey: apiKeyOverride
  } = options;

  const config = getConfig();
  const provider = providerOverride || config?.imageGeneration?.provider;
  const apiKey = apiKeyOverride || config?.imageGeneration?.apiKey;

  if (!provider || !apiKey) {
    throw new Error('Image generation not configured. Set imageGeneration.provider and apiKey in config.');
  }

  mkdirSync(outputDir, { recursive: true });
  const paths = [];

  const basePrompt = buildIconPrompt(appName, appDescription, category);

  for (let i = 0; i < variants; i++) {
    const variantPrompt = i === 0 ? basePrompt
      : i === 1 ? `${basePrompt} Use a geometric, flat design style.`
      : `${basePrompt} Use a modern 3D rendered style with soft shadows.`;

    const imageBuffer = await generateImage(provider, apiKey, variantPrompt, 1024, 1024);

    // Resize to 512x512 using sharp
    const sharp = (await import('sharp')).default;
    const resized = await sharp(imageBuffer)
      .resize(512, 512, { fit: 'cover' })
      .png()
      .toBuffer();

    const outputPath = join(outputDir, `icon-variant-${i + 1}.png`);
    writeFileSync(outputPath, resized);
    paths.push(outputPath);
  }

  return paths;
}

/**
 * Generate a feature graphic (1024x500) using AI image generation.
 * @param {{
 *   appName: string,
 *   appDescription: string,
 *   outputDir: string,
 *   variants?: number,
 *   provider?: string,
 *   apiKey?: string
 * }} options
 * @returns {Promise<string[]>} Paths to generated feature graphic files
 */
export async function generateFeatureGraphic(options) {
  const {
    appName,
    appDescription,
    outputDir,
    variants = 2,
    provider: providerOverride,
    apiKey: apiKeyOverride
  } = options;

  const config = getConfig();
  const provider = providerOverride || config?.imageGeneration?.provider;
  const apiKey = apiKeyOverride || config?.imageGeneration?.apiKey;

  if (!provider || !apiKey) {
    throw new Error('Image generation not configured.');
  }

  mkdirSync(outputDir, { recursive: true });
  const paths = [];

  for (let i = 0; i < variants; i++) {
    const prompt = buildFeatureGraphicPrompt(appName, appDescription, i);
    // Request landscape image
    const imageBuffer = await generateImage(provider, apiKey, prompt, 1792, 1024);

    // Crop to exactly 1024x500
    const sharp = (await import('sharp')).default;
    // Play Store requires 24-bit PNG (no alpha) for feature graphics
    const cropped = await sharp(imageBuffer)
      .resize(1024, 500, { fit: 'cover', position: 'center' })
      .removeAlpha()
      .png()
      .toBuffer();

    const outputPath = join(outputDir, `feature-graphic-variant-${i + 1}.png`);
    writeFileSync(outputPath, cropped);
    paths.push(outputPath);
  }

  return paths;
}

// --- Provider implementations ---

async function generateImage(provider, apiKey, prompt, width, height) {
  if (provider === 'openai') {
    return generateWithOpenAI(apiKey, prompt, width, height);
  } else if (provider === 'gemini') {
    return generateWithGemini(apiKey, prompt, width, height);
  }
  throw new Error(`Unknown image generation provider: ${provider}. Supported: openai, gemini`);
}

async function generateWithOpenAI(apiKey, prompt, width, height) {
  // Map to closest DALL-E 3 supported size
  let size;
  if (width > height) {
    size = '1792x1024';
  } else if (width < height) {
    size = '1024x1792';
  } else {
    size = '1024x1024';
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality: 'hd',
      response_format: 'b64_json'
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error (${response.status}): ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const b64 = data.data[0].b64_json;
  return Buffer.from(b64, 'base64');
}

async function generateWithGemini(apiKey, prompt, width, height) {
  // Use Gemini's image generation endpoint (Imagen 3)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: width > height ? '16:9' : width < height ? '9:16' : '1:1'
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error (${response.status}): ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    throw new Error('Gemini returned no image data');
  }
  return Buffer.from(b64, 'base64');
}

// --- Prompt builders ---

function buildIconPrompt(appName, description, category) {
  return [
    `Design a professional Android app icon for an app called "${appName}".`,
    description ? `The app is: ${description}.` : '',
    category ? `Category: ${category}.` : '',
    'Requirements:',
    '- Single centered symbolic element on a clean background',
    '- NO text or letters in the icon',
    '- Suitable as a Google Play Store adaptive icon',
    '- Simple, modern, memorable design',
    '- Material Design style with clean lines',
    '- Vibrant but professional color palette',
    '- The icon should work well at small sizes (48x48 and up)',
    '- Solid or subtle gradient background'
  ].filter(Boolean).join(' ');
}

function buildFeatureGraphicPrompt(appName, description, variantIndex) {
  const styles = [
    'Use a gradient background with the app concept visualized abstractly.',
    'Use a clean, minimal design with bold typography and subtle patterns.'
  ];

  return [
    `Design a Google Play Store feature graphic banner (landscape orientation) for "${appName}".`,
    description ? `The app is: ${description}.` : '',
    'Requirements:',
    '- Must include the app name prominently',
    '- Professional, eye-catching banner design',
    '- Clean and modern aesthetic',
    '- Landscape format optimized for 1024x500 pixels',
    styles[variantIndex % styles.length]
  ].filter(Boolean).join(' ');
}

// CLI mode
if (process.argv[1]?.endsWith('generate-images.mjs')) {
  const cmd = process.argv[2];
  const name = process.argv.find(a => a.startsWith('--name='))?.split('=')[1] || 'MyApp';
  const desc = process.argv.find(a => a.startsWith('--desc='))?.split('=')[1] || '';
  const outDir = process.argv.find(a => a.startsWith('--out='))?.split('=')[1] || './generated-assets';

  try {
    if (cmd === '--icon') {
      const paths = await generateIcon({ appName: name, appDescription: desc, outputDir: outDir });
      console.log(JSON.stringify({ icons: paths }));
    } else if (cmd === '--feature') {
      const paths = await generateFeatureGraphic({ appName: name, appDescription: desc, outputDir: outDir });
      console.log(JSON.stringify({ featureGraphics: paths }));
    } else {
      console.log('Usage:');
      console.log('  node generate-images.mjs --icon --name="App Name" --desc="Description" --out=./output');
      console.log('  node generate-images.mjs --feature --name="App Name" --desc="Description" --out=./output');
    }
  } catch (e) {
    console.error('IMAGE GENERATION FAILED:', e.message);
    process.exit(1);
  }
}
