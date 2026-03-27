<div align="center">

# /ship-app

**One command to publish your app on Google Play Store.**

Build, sign, list, screenshot, and upload — fully automated from Claude Code.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Skill-blueviolet.svg)](https://claude.ai/code)
[![Frameworks](https://img.shields.io/badge/Frameworks-4-orange.svg)](#supported-frameworks)
[![Phases](https://img.shields.io/badge/Automation_Phases-13-brightgreen.svg)](#how-it-works)

</div>

---

## Quick Install

```bash
git clone https://github.com/oniani1/ship-app.git
cd ship-app
./install.sh        # macOS/Linux
# .\install.ps1     # Windows
```

Then in Claude Code:
```
/ship-app new       # First publish
/ship-app update    # New version
```

---

## The Problem

Publishing to Google Play takes **15+ manual steps**: build AAB, generate a keystore, sign the bundle, create the app listing, write descriptions in multiple languages, design an icon, take screenshots, frame them in device mockups, fill the content rating questionnaire, write a privacy policy, host it somewhere, upload everything through the console, configure the release track, and submit.

Every. Single. Time.

## The Solution

`/ship-app` automates the entire pipeline in one command. It detects your project, builds the AAB, signs it, generates all store assets with AI, captures real screenshots, creates a privacy policy, and uploads everything through the Google Play Developer API.

You review and approve at each step. It does the grunt work.

---

## What Gets Automated

| Phase | What happens | How |
|:------|:-------------|:----|
| **Detect** | Identifies your framework and extracts package name, version, signing config | Scans `build.gradle`, `package.json`, `capacitor.config`, manifests |
| **Build** | Produces a release `.aab` bundle | Framework-specific: Gradle, Capacitor sync, Bubblewrap |
| **Sign** | Signs the AAB with your keystore (or generates a new one) | `keytool` + `jarsigner` via safe args (no shell injection) |
| **Store Listing** | Generates title, descriptions, category, tags in multiple languages | AI agent analyzes your code and README |
| **App Icon** | Creates a 512x512 adaptive icon (3 variants to choose from) | DALL-E 3 or Gemini Imagen |
| **Feature Graphic** | Creates a 1024x500 banner (2 variants) | DALL-E 3 or Gemini Imagen |
| **Screenshots** | Captures real app screens at 1080x2400 and frames in device mockups | Playwright MCP + Sharp compositing |
| **Content Rating** | Analyzes code for violence, ads, UGC, data collection | Agent scans dependencies, permissions, patterns |
| **Privacy Policy** | Generates GDPR/CCPA-compliant policy and deploys it | Handlebars template + GitHub Pages |
| **Upload** | Uploads AAB, listings, images via API and sets production track | Google Play Developer API v3 (6-step edit workflow) |

---

## Supported Frameworks

| Framework | Detection | Build Pipeline |
|:----------|:----------|:---------------|
| **Android Native** | `build.gradle` / `build.gradle.kts` | `./gradlew bundleRelease` |
| **React Native** | `react-native` in deps + `android/` dir | `./gradlew bundleRelease` |
| **Capacitor / Ionic** | `@capacitor/core` in deps | `npm run build` → `cap sync` → Gradle |
| **PWA / TWA** | `twa-manifest.json` or web manifest | `bubblewrap build` |

---

## Prerequisites

| Requirement | What for | Install |
|:------------|:---------|:--------|
| **Node.js 18+** | Runtime for helper scripts | [nodejs.org](https://nodejs.org) |
| **Claude Code** | Runs the skill | [claude.ai/code](https://claude.ai/code) |
| **Android SDK** | Building AABs | Set `ANDROID_HOME` env var |
| **JDK 17+** | Signing (`keytool`, `jarsigner`) | [adoptium.net](https://adoptium.net) |
| **git** | Installation | Pre-installed on most systems |
| **GitHub CLI** | Privacy policy deployment | `gh auth login` |
| **Playwright MCP** | Screenshot capture | Configure in Claude Code settings |
| AI API key | Icon & graphic generation | [OpenAI](https://platform.openai.com) or [Gemini](https://ai.google.dev) |
| Play Developer Account | Publishing | [$25 one-time](https://play.google.com/console) |

---

## Configuration

First run guides you through setup. Or configure manually:

```bash
# Google Play API (required)
node ~/.ship-app/scripts/config.mjs --set googlePlay.serviceAccountKeyPath "/path/to/key.json"

# AI image provider (required) — "openai" or "gemini"
node ~/.ship-app/scripts/config.mjs --set imageGeneration.provider "openai"
node ~/.ship-app/scripts/config.mjs --set imageGeneration.apiKey "sk-..."

# Privacy policy (required)
node ~/.ship-app/scripts/config.mjs --set privacy.contactEmail "you@example.com"
node ~/.ship-app/scripts/config.mjs --set privacy.githubUsername "yourusername"

# Validate everything
node ~/.ship-app/scripts/config.mjs --validate
```

<details>
<summary><strong>Google Play API Setup (step by step)</strong></summary>

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create or select a project
2. Enable **Google Play Android Developer API**
3. Go to **IAM & Admin → Service Accounts** → Create service account
4. Download the **JSON key file**
5. Go to [Play Console](https://play.google.com/console/) → **Settings → API access**
6. Link your Google Cloud project
7. Grant the service account **Release manager** permissions

</details>

---

## How It Works

```
/ship-app new
```

```
Phase 0  ──  Parse arguments, determine new vs update
Phase 1  ──  Validate config (API keys, gh CLI, signing tools)
Phase 2  ──  Auto-detect project type, package name, version
Phase 3  ──  Build release .aab
Phase 4  ──  Sign with keystore (existing or generate new)
Phase 5  ──  Verify Google Play API access
Phase 6  ──  Create app in Play Console (new apps only, via Playwright)
Phase 7  ──  AI generates store listing text → you review
Phase 8  ──  AI generates icon + feature graphic → you pick variants
Phase 9  ──  Playwright captures screenshots → Sharp frames them
Phase 10 ──  Code analysis fills content rating questionnaire
Phase 11 ──  Privacy policy generated → deployed to GitHub Pages
Phase 12 ──  Google Play API uploads AAB, listings, images, sets track
Phase 13 ──  Confirmation with Play Console link
```

**Update mode** (`/ship-app update`) skips app creation and asks which assets to regenerate.

---

## Architecture

```
~/.ship-app/
├── commands/
│   └── ship-app.md              # Main skill — 13-phase orchestrator
├── agents/
│   ├── project-detective.md     # Framework & config detection
│   ├── store-listing-writer.md  # Multi-language listing generation
│   ├── code-analyzer.md         # Content rating & privacy analysis
│   └── privacy-policy-writer.md # GDPR/CCPA policy generation
├── scripts/
│   ├── config.mjs               # Config management (~/.ship-app/config.json)
│   ├── detect-project.mjs       # Project type detection
│   ├── build-aab.mjs            # Framework-specific build orchestration
│   ├── sign-aab.mjs             # Keystore generation & signing (safe args)
│   ├── google-play-auth.mjs     # Service account authentication
│   ├── google-play-upload.mjs   # 6-step edit workflow with cleanup
│   ├── generate-images.mjs      # Multi-provider AI image generation
│   ├── frame-screenshots.mjs    # Device mockup framing with Sharp
│   └── deploy-privacy-policy.mjs # GitHub Pages deployment
└── templates/
    └── privacy-policy.hbs       # Handlebars template for privacy policy
```

---

<details>
<summary><strong>Troubleshooting</strong></summary>

### Build fails
- Ensure `ANDROID_HOME` is set and points to your Android SDK
- Use JDK 17+ for modern Android projects
- Run `npm install` in the project root first

### API auth fails
- Verify the service account JSON key file exists at the configured path
- Ensure the API is enabled in Google Cloud Console
- Check that the service account has Release manager role in Play Console

### Screenshots fail
- Ensure Playwright MCP is configured in Claude Code
- Start the dev server manually if auto-detection doesn't work
- Provide the URL directly when prompted

### Image generation fails
- Verify your AI provider API key and billing
- The skill asks you to provide images manually as fallback

</details>

---

## Contributing

Contributions welcome. Open an issue or PR.

- **Bug fixes** — open a PR with a clear description
- **New framework support** — add detection in `detect-project.mjs` and build logic in `build-aab.mjs`
- **New AI providers** — add a provider function in `generate-images.mjs`

---

## License

[MIT](LICENSE)
