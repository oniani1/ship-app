import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import { getConfig } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

/**
 * Generate a privacy policy HTML page from app analysis data.
 * @param {{
 *   appName: string,
 *   contactEmail: string,
 *   effectiveDate?: string,
 *   dataCollection: {
 *     personalInfo?: boolean,
 *     location?: boolean,
 *     camera?: boolean,
 *     storage?: boolean,
 *     contacts?: boolean
 *   },
 *   thirdPartyServices: string[],
 *   hasAds: boolean,
 *   hasAnalytics: boolean,
 *   hasAuth: boolean,
 *   hasUGC: boolean,
 *   childrenTargeted: boolean
 * }} data
 * @returns {string} Generated HTML string
 */
export function generatePrivacyPolicyHTML(data) {
  const {
    appName,
    contactEmail,
    effectiveDate = new Date().toISOString().split('T')[0],
    dataCollection = {},
    thirdPartyServices = [],
    hasAds = false,
    hasAnalytics = false,
    hasAuth = false,
    hasUGC = false,
    childrenTargeted = false
  } = data;

  // Load template
  const templatePath = join(TEMPLATES_DIR, 'privacy-policy.hbs');
  if (existsSync(templatePath)) {
    const template = Handlebars.compile(readFileSync(templatePath, 'utf-8'));
    return template(data);
  }

  // Fallback: generate inline HTML
  const css = existsSync(join(TEMPLATES_DIR, 'privacy-policy-styles.css'))
    ? readFileSync(join(TEMPLATES_DIR, 'privacy-policy-styles.css'), 'utf-8')
    : getDefaultCSS();

  const sections = [];

  // Introduction
  sections.push(`
    <h2>Introduction</h2>
    <p>${appName} ("we", "our", or "us") is committed to protecting your privacy.
    This Privacy Policy explains how we collect, use, and safeguard your information
    when you use our mobile application.</p>
    <p>By using the app, you agree to the collection and use of information in accordance
    with this policy.</p>
  `);

  // Information Collection
  const collectedItems = [];
  if (hasAuth) collectedItems.push('Account information (email, name) when you create an account');
  if (dataCollection.personalInfo) collectedItems.push('Personal information you provide through forms');
  if (dataCollection.location) collectedItems.push('Location data when you grant location permissions');
  if (dataCollection.camera) collectedItems.push('Photos or camera data when you use camera features');
  if (dataCollection.contacts) collectedItems.push('Contact information when you grant contacts permissions');
  if (hasUGC) collectedItems.push('Content you create, upload, or share within the app');
  if (hasAnalytics) collectedItems.push('Usage data and analytics (app interactions, crash reports)');
  collectedItems.push('Device information (device type, operating system, unique device identifiers)');

  sections.push(`
    <h2>Information We Collect</h2>
    <ul>${collectedItems.map(item => `<li>${item}</li>`).join('\n')}</ul>
  `);

  // How We Use Information
  sections.push(`
    <h2>How We Use Your Information</h2>
    <ul>
      <li>To provide and maintain the app's functionality</li>
      <li>To improve user experience and app performance</li>
      ${hasAuth ? '<li>To manage your account and provide customer support</li>' : ''}
      ${hasAnalytics ? '<li>To analyze usage patterns and fix issues</li>' : ''}
      ${hasAds ? '<li>To display relevant advertisements</li>' : ''}
      <li>To comply with legal obligations</li>
    </ul>
  `);

  // Third-Party Services
  if (thirdPartyServices.length > 0 || hasAds || hasAnalytics) {
    const services = [...thirdPartyServices];
    if (hasAnalytics && !services.some(s => s.toLowerCase().includes('analytics'))) {
      services.push('Analytics services');
    }
    if (hasAds && !services.some(s => s.toLowerCase().includes('ad'))) {
      services.push('Advertising services');
    }

    sections.push(`
      <h2>Third-Party Services</h2>
      <p>We may use the following third-party services that may collect information:</p>
      <ul>${services.map(s => `<li>${s}</li>`).join('\n')}</ul>
      <p>These services have their own privacy policies. We encourage you to review them.</p>
    `);
  }

  // Data Security
  sections.push(`
    <h2>Data Security</h2>
    <p>We implement appropriate security measures to protect your personal information.
    However, no method of transmission over the Internet or electronic storage is 100% secure,
    and we cannot guarantee absolute security.</p>
  `);

  // Data Retention
  sections.push(`
    <h2>Data Retention</h2>
    <p>We retain your personal data only for as long as necessary to fulfill the purposes
    described in this policy. When data is no longer needed, we will delete or anonymize it.</p>
  `);

  // Your Rights (GDPR / CCPA)
  sections.push(`
    <h2>Your Rights</h2>
    <p>Depending on your location, you may have the following rights:</p>
    <ul>
      <li><strong>Access:</strong> Request a copy of your personal data</li>
      <li><strong>Correction:</strong> Request correction of inaccurate data</li>
      <li><strong>Deletion:</strong> Request deletion of your personal data</li>
      <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
      <li><strong>Opt-out:</strong> Opt out of data collection or marketing communications</li>
    </ul>
    <p>To exercise these rights, contact us at <a href="mailto:${contactEmail}">${contactEmail}</a>.</p>
  `);

  // Children's Privacy
  if (childrenTargeted) {
    sections.push(`
      <h2>Children's Privacy</h2>
      <p>This app is designed for users of all ages. We comply with the Children's Online
      Privacy Protection Act (COPPA) and do not knowingly collect personal information
      from children under 13 without parental consent.</p>
    `);
  } else {
    sections.push(`
      <h2>Children's Privacy</h2>
      <p>This app is not directed at children under 13. We do not knowingly collect
      personal information from children under 13. If you believe we have collected
      such information, please contact us to have it removed.</p>
    `);
  }

  // Changes
  sections.push(`
    <h2>Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. Changes will be posted on this page
    with an updated effective date. Continued use of the app after changes constitutes acceptance.</p>
  `);

  // Contact
  sections.push(`
    <h2>Contact Us</h2>
    <p>If you have questions about this Privacy Policy, contact us at:
    <a href="mailto:${contactEmail}">${contactEmail}</a></p>
  `);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - ${appName}</title>
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy</h1>
    <p class="app-name">${appName}</p>
    <p class="effective-date">Effective Date: ${effectiveDate}</p>
    ${sections.join('\n')}
  </div>
</body>
</html>`;
}

/**
 * Deploy privacy policy to GitHub Pages.
 * @param {{
 *   html: string,
 *   repoName?: string,
 *   appName: string,
 *   githubUsername?: string
 * }} options
 * @returns {Promise<{url: string, repoUrl: string}>}
 */
export async function deployToGitHubPages(options) {
  const {
    html,
    appName,
    repoName: repoOverride,
    githubUsername: usernameOverride
  } = options;

  const config = getConfig();
  const username = usernameOverride || config?.privacy?.githubUsername;
  const repoName = repoOverride || `${slugify(appName)}-privacy`;

  if (!username) {
    throw new Error('GitHub username not configured. Set privacy.githubUsername in config.');
  }

  // Check if gh CLI is available
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    throw new Error('GitHub CLI (gh) is not authenticated. Run: gh auth login');
  }

  // Create temp directory for the pages content
  const tmpDir = join(process.cwd(), '.ship-app-temp', 'privacy-policy');
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(tmpDir, 'index.html'), html, 'utf-8');

  // Check if repo exists, create if not
  try {
    execSync(`gh repo view ${username}/${repoName}`, { stdio: 'pipe' });
  } catch {
    console.log(`Creating repository ${username}/${repoName}...`);
    const safeDesc = appName.replace(/["`$\\]/g, '');
    execSync(`gh repo create ${repoName} --public --description "Privacy Policy for ${safeDesc}"`, {
      stdio: 'pipe'
    });
  }

  // Use gh-pages to deploy
  try {
    const ghPages = (await import('gh-pages')).default;
    await new Promise((resolve, reject) => {
      ghPages.publish(tmpDir, {
        repo: `https://github.com/${username}/${repoName}.git`,
        branch: 'gh-pages',
        message: `Update privacy policy for ${appName}`,
        dotfiles: false
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (e) {
    // Fallback: manual git push
    console.log('gh-pages publish failed, trying manual deployment...');
    const gitDir = join(tmpDir, '.git-deploy');
    mkdirSync(gitDir, { recursive: true });

    execSync(`git init`, { cwd: tmpDir, stdio: 'pipe' });
    execSync(`git add -A`, { cwd: tmpDir, stdio: 'pipe' });
    execSync(`git commit -m "Update privacy policy"`, { cwd: tmpDir, stdio: 'pipe' });
    execSync(`git branch -M gh-pages`, { cwd: tmpDir, stdio: 'pipe' });
    execSync(
      `git push -f https://github.com/${username}/${repoName}.git gh-pages`,
      { cwd: tmpDir, stdio: 'pipe' }
    );
  }

  // Enable GitHub Pages if not already
  try {
    execSync(
      `gh api repos/${username}/${repoName}/pages -X POST -f source.branch=gh-pages -f source.path=/`,
      { stdio: 'pipe' }
    );
  } catch { /* May already be enabled */ }

  const url = `https://${username}.github.io/${repoName}/`;
  return { url, repoUrl: `https://github.com/${username}/${repoName}` };
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getDefaultCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           line-height: 1.6; color: #333; background: #fafafa; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #fff;
                 min-height: 100vh; }
    h1 { font-size: 2em; margin-bottom: 8px; color: #111; }
    h2 { font-size: 1.3em; margin: 32px 0 12px; color: #222; }
    p { margin-bottom: 12px; }
    ul { margin: 12px 0; padding-left: 24px; }
    li { margin-bottom: 6px; }
    a { color: #1a73e8; }
    .app-name { font-size: 1.1em; color: #555; margin-bottom: 4px; }
    .effective-date { font-size: 0.9em; color: #777; margin-bottom: 24px; }
  `;
}

// CLI mode
if (process.argv[1]?.endsWith('deploy-privacy-policy.mjs')) {
  const cmd = process.argv[2];

  if (cmd === '--generate') {
    const appName = process.argv.find(a => a.startsWith('--name='))?.split('=')[1] || 'My App';
    const email = process.argv.find(a => a.startsWith('--email='))?.split('=')[1] || 'contact@example.com';
    const output = process.argv.find(a => a.startsWith('--out='))?.split('=')[1] || './privacy-policy.html';
    const analysisFile = process.argv.find(a => a.startsWith('--analysis='))?.split('=')[1];

    // If analysis JSON provided, use it; otherwise use empty defaults
    let analysisData = {
      dataCollection: {},
      thirdPartyServices: [],
      hasAds: false,
      hasAnalytics: false,
      hasAuth: false,
      hasUGC: false,
      childrenTargeted: false
    };
    if (analysisFile) {
      try {
        const analysis = JSON.parse(readFileSync(resolve(analysisFile), 'utf-8'));
        analysisData = { ...analysisData, ...analysis.privacy || analysis };
      } catch (e) {
        console.error(`Warning: could not read analysis file: ${e.message}`);
      }
    }

    const html = generatePrivacyPolicyHTML({
      appName,
      contactEmail: email,
      ...analysisData
    });

    writeFileSync(resolve(output), html, 'utf-8');
    console.log(`Privacy policy generated: ${output}`);
  } else if (cmd === '--deploy') {
    const appName = process.argv.find(a => a.startsWith('--name='))?.split('=')[1] || 'My App';
    const htmlFile = process.argv.find(a => a.startsWith('--html='))?.split('=')[1];

    const html = htmlFile
      ? readFileSync(resolve(htmlFile), 'utf-8')
      : generatePrivacyPolicyHTML({ appName, contactEmail: 'contact@example.com', dataCollection: {}, thirdPartyServices: [], hasAds: false, hasAnalytics: false, hasAuth: false, hasUGC: false, childrenTargeted: false });

    const result = await deployToGitHubPages({ html, appName });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Usage:');
    console.log('  node deploy-privacy-policy.mjs --generate --name="App" --email="a@b.com" --out=./pp.html');
    console.log('  node deploy-privacy-policy.mjs --deploy --name="App" [--html=./pp.html]');
  }
}
