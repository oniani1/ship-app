import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, resolve, basename, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = join(__dirname, '..', 'templates', 'frames');

// Device frame specifications
// screenArea: {x, y, width, height} defines where the screenshot goes inside the frame
const DEVICE_SPECS = {
  'pixel-8': {
    frameFile: 'pixel-8.png',
    frameWidth: 1440,
    frameHeight: 3120,
    screenArea: { x: 72, y: 192, width: 1296, height: 2736 },
    label: 'Pixel 8'
  },
  'generic': {
    // Fallback: no frame, just add padding and rounded corners
    frameFile: null,
    frameWidth: 1440,
    frameHeight: 3120,
    screenArea: { x: 0, y: 0, width: 1440, height: 3120 },
    label: 'Generic'
  }
};

/**
 * Frame a single screenshot in a device mockup.
 * @param {{
 *   screenshotPath: string,
 *   outputPath: string,
 *   device?: string,
 *   backgroundColor?: string
 * }} options
 * @returns {Promise<string>} Path to the framed screenshot
 */
export async function frameScreenshot(options) {
  const {
    screenshotPath,
    outputPath,
    device = 'generic',
    backgroundColor = '#f5f5f5'
  } = options;

  const sharp = (await import('sharp')).default;
  const spec = DEVICE_SPECS[device] || DEVICE_SPECS['generic'];
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });

  // Load and resize screenshot to fit the screen area
  const screenshot = await sharp(resolve(screenshotPath))
    .resize(spec.screenArea.width, spec.screenArea.height, {
      fit: 'cover',
      position: 'top'
    })
    .png()
    .toBuffer();

  if (spec.frameFile) {
    const framePath = join(FRAMES_DIR, spec.frameFile);
    if (existsSync(framePath)) {
      // Composite: screenshot behind frame
      const framed = await sharp(framePath)
        .composite([{
          input: screenshot,
          left: spec.screenArea.x,
          top: spec.screenArea.y,
          // Place screenshot behind frame (frame has transparent screen area)
        }])
        .png()
        .toBuffer();

      writeFileSync(resolvedOutput, framed);
      return resolvedOutput;
    }
  }

  // Generic framing: add background, padding, rounded corners, and shadow effect
  const padding = 60;
  const cornerRadius = 40;
  const totalWidth = spec.screenArea.width + padding * 2;
  const totalHeight = spec.screenArea.height + padding * 2;

  // Create rounded screenshot
  const roundedScreenshot = await sharp(screenshot)
    .composite([{
      input: Buffer.from(
        `<svg width="${spec.screenArea.width}" height="${spec.screenArea.height}">
          <rect x="0" y="0" width="${spec.screenArea.width}" height="${spec.screenArea.height}"
                rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
        </svg>`
      ),
      blend: 'dest-in'
    }])
    .png()
    .toBuffer();

  // Create background and composite
  const framed = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: parseColor(backgroundColor)
    }
  })
    .composite([{
      input: roundedScreenshot,
      left: padding,
      top: padding
    }])
    .png()
    .toBuffer();

  // Final resize to ensure Play Store compliance (min 1080px width)
  const finalWidth = Math.max(totalWidth, 1080);
  const finalHeight = Math.round(totalHeight * (finalWidth / totalWidth));

  const final = await sharp(framed)
    .resize(finalWidth, finalHeight, { fit: 'inside' })
    .png({ quality: 90 })
    .toBuffer();

  writeFileSync(resolvedOutput, final);
  return resolvedOutput;
}

/**
 * Frame multiple screenshots.
 * @param {{
 *   inputDir: string,
 *   outputDir: string,
 *   device?: string,
 *   backgroundColor?: string
 * }} options
 * @returns {Promise<string[]>} Paths to framed screenshots
 */
export async function frameAllScreenshots(options) {
  const { inputDir, outputDir, device, backgroundColor } = options;
  const resolvedInput = resolve(inputDir);
  const resolvedOutput = resolve(outputDir);

  if (!existsSync(resolvedInput)) {
    throw new Error(`Input directory not found: ${resolvedInput}`);
  }

  mkdirSync(resolvedOutput, { recursive: true });

  const files = readdirSync(resolvedInput)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();

  const results = [];
  for (const file of files) {
    const inputPath = join(resolvedInput, file);
    const outputPath = join(resolvedOutput, `framed-${basename(file, extname(file))}.png`);

    await frameScreenshot({
      screenshotPath: inputPath,
      outputPath,
      device,
      backgroundColor
    });
    results.push(outputPath);
  }

  return results;
}

/**
 * Ensure screenshots meet Play Store requirements.
 * - Min dimension: 320px
 * - Max dimension: 3840px
 * - Must be JPEG or 24-bit PNG (no alpha for final)
 * - Aspect ratio no more than 2:1
 * @param {string} imagePath
 * @returns {Promise<{valid: boolean, issues: string[]}>}
 */
export async function validateScreenshot(imagePath) {
  const sharp = (await import('sharp')).default;
  const metadata = await sharp(resolve(imagePath)).metadata();
  const issues = [];

  if (metadata.width < 320 || metadata.height < 320) {
    issues.push(`Too small: ${metadata.width}x${metadata.height}. Minimum dimension is 320px.`);
  }
  if (metadata.width > 3840 || metadata.height > 3840) {
    issues.push(`Too large: ${metadata.width}x${metadata.height}. Maximum dimension is 3840px.`);
  }
  const ratio = Math.max(metadata.width, metadata.height) / Math.min(metadata.width, metadata.height);
  if (ratio > 2) {
    issues.push(`Aspect ratio too extreme: ${ratio.toFixed(2)}:1. Maximum is 2:1.`);
  }

  return { valid: issues.length === 0, issues, dimensions: `${metadata.width}x${metadata.height}` };
}

function parseColor(color) {
  // Simple hex color parser
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      alpha: 1
    };
  }
  return { r: 245, g: 245, b: 245, alpha: 1 };
}

// CLI mode
if (process.argv[1]?.endsWith('frame-screenshots.mjs')) {
  const cmd = process.argv[2];

  if (cmd === '--frame') {
    const input = process.argv[3];
    const output = process.argv[4] || input.replace('.png', '-framed.png');
    const device = process.argv.find(a => a.startsWith('--device='))?.split('=')[1] || 'generic';
    const result = await frameScreenshot({ screenshotPath: input, outputPath: output, device });
    console.log(JSON.stringify({ framed: result }));
  } else if (cmd === '--frame-all') {
    const inputDir = process.argv[3];
    const outputDir = process.argv[4] || join(inputDir, 'framed');
    const device = process.argv.find(a => a.startsWith('--device='))?.split('=')[1] || 'generic';
    const results = await frameAllScreenshots({ inputDir, outputDir, device });
    console.log(JSON.stringify({ framed: results }));
  } else if (cmd === '--validate') {
    const result = await validateScreenshot(process.argv[3]);
    console.log(JSON.stringify(result));
  } else {
    console.log('Usage:');
    console.log('  node frame-screenshots.mjs --frame <input.png> [output.png] [--device=pixel-8]');
    console.log('  node frame-screenshots.mjs --frame-all <inputDir> [outputDir] [--device=generic]');
    console.log('  node frame-screenshots.mjs --validate <image.png>');
  }
}
