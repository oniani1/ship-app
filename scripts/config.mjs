import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const CONFIG_DIR = join(homedir(), '.ship-app');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  googlePlay: {
    serviceAccountKeyPath: ''
  },
  imageGeneration: {
    provider: '',
    apiKey: ''
  },
  privacy: {
    contactEmail: '',
    githubUsername: ''
  },
  signing: {
    defaultKeystorePath: '',
    defaultKeyAlias: ''
  }
};

export function getConfigPath() {
  return CONFIG_PATH;
}

export function getConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function updateConfig(key, value) {
  const config = getConfig() || { ...DEFAULT_CONFIG };
  const keys = key.split('.');
  let obj = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
      obj[keys[i]] = {};
    }
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  setConfig(config);
  return config;
}

export function validateConfig() {
  const config = getConfig();
  const errors = [];

  if (!config) {
    return { valid: false, errors: ['No config file found at ' + CONFIG_PATH] };
  }

  // Google Play service account
  const keyPath = config.googlePlay?.serviceAccountKeyPath;
  if (!keyPath) {
    errors.push('Missing googlePlay.serviceAccountKeyPath');
  } else if (!existsSync(keyPath)) {
    errors.push(`Service account key file not found: ${keyPath}`);
  } else {
    try {
      const keyData = JSON.parse(readFileSync(keyPath, 'utf-8'));
      if (!keyData.client_email) {
        errors.push('Service account JSON is missing client_email field');
      }
    } catch {
      errors.push('Service account key file is not valid JSON');
    }
  }

  // AI image generation
  if (!config.imageGeneration?.provider) {
    errors.push('Missing imageGeneration.provider (openai or gemini)');
  } else if (!['openai', 'gemini'].includes(config.imageGeneration.provider)) {
    errors.push('imageGeneration.provider must be "openai" or "gemini"');
  }
  if (!config.imageGeneration?.apiKey) {
    errors.push('Missing imageGeneration.apiKey');
  }

  // Privacy
  if (!config.privacy?.contactEmail) {
    errors.push('Missing privacy.contactEmail');
  }
  if (!config.privacy?.githubUsername) {
    errors.push('Missing privacy.githubUsername');
  }

  return { valid: errors.length === 0, errors, config };
}

export function initConfig() {
  if (!existsSync(CONFIG_PATH)) {
    setConfig(DEFAULT_CONFIG);
    return { created: true, path: CONFIG_PATH };
  }
  return { created: false, path: CONFIG_PATH };
}

// CLI mode
if (process.argv[1]?.endsWith('config.mjs')) {
  const cmd = process.argv[2];

  if (cmd === '--validate') {
    const result = validateConfig();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  } else if (cmd === '--init') {
    const result = initConfig();
    console.log(JSON.stringify(result));
  } else if (cmd === '--get') {
    const config = getConfig();
    console.log(JSON.stringify(config, null, 2));
  } else if (cmd === '--set' && process.argv[3] && process.argv[4]) {
    const config = updateConfig(process.argv[3], process.argv[4]);
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log('Usage:');
    console.log('  node config.mjs --init              Create default config');
    console.log('  node config.mjs --validate           Validate config');
    console.log('  node config.mjs --get                Show config');
    console.log('  node config.mjs --set <key> <value>  Set config value');
  }
}
