---
name: ship-app
description: Publish your app to Google Play Store. Handles build, signing, store listing, screenshots, content rating, privacy policy, and upload. Works with Android Native, React Native, Capacitor/Ionic, and PWA/TWA projects.
argument-hint: "new" for first publish, "update" for existing app, or leave empty
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_select_option, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_resize, mcp__playwright__browser_wait_for, mcp__playwright__browser_file_upload, mcp__playwright__browser_evaluate, mcp__playwright__browser_press_key
---

# Ship App — Publish to Google Play Store

Automate the entire Google Play Store publishing pipeline: detect project, build AAB, sign, generate listing, create assets, capture screenshots, set content rating, generate privacy policy, and upload — all in one command.

## Arguments
- `$ARGUMENTS` — Mode: `new` (first publish), `update` (existing app), a package name like `com.example.app`, or empty (will ask).

## Important: Script Location
All helper scripts are in the ship-app installation directory. Detect it:
```bash
SHIP_APP_DIR="$HOME/.ship-app"
```
Run scripts with: `node "$SHIP_APP_DIR/scripts/<script>.mjs" <args>`

## State Management

**State file:** `.ship-app-temp/state.json` — tracks progress for crash recovery.

**Schema:**
```json
{
  "mode": "new|update",
  "phase": 0,
  "packageName": "",
  "aabPath": "",
  "signedAabPath": "",
  "versionCode": null,
  "listings": {},
  "assets": {},
  "analysisData": {},
  "privacyUrl": "",
  "devServerPid": null
}
```

**At the start:** If `.ship-app-temp/state.json` exists, ask user: "Found previous session at Phase N. Resume or start fresh?" If resume, skip to the saved phase.

**After each phase:** Update `state.json` with the current phase number and any new data collected.

---

## Phase 0: Determine Mode

- If `$ARGUMENTS` is "new" → `MODE=new`
- If `$ARGUMENTS` is "update" or contains a package name (has dots like `com.x.y`) → `MODE=update`
- If empty → Ask the user: "Is this a **new app** or an **update** to an existing app?"
- Store the mode. Write initial state: `{ "mode": "<mode>", "phase": 0 }`

## Phase 1: Configuration Check

Run: `node "$SHIP_APP_DIR/scripts/config.mjs" --validate`

Also check for `gh` CLI (needed for privacy policy deployment):
```bash
gh auth status 2>/dev/null
```
If `gh` is not authenticated, add to setup: "Run `gh auth login` to authenticate with GitHub."

**If validation fails**, guide the user through setup:

1. **Google Play Service Account** — needed for API uploads:
   - "Do you have a Google Play Developer API service account JSON key?"
   - If NO, provide step-by-step:
     1. Go to Google Cloud Console → Create or select a project
     2. Enable "Google Play Android Developer API"
     3. Go to IAM & Admin → Service Accounts → Create
     4. Download the JSON key file
     5. Go to Play Console → Settings → API access → Link the Google Cloud project
     6. Invite the service account email with "Release manager" permissions
   - Save path: `node "$SHIP_APP_DIR/scripts/config.mjs" --set googlePlay.serviceAccountKeyPath "/path/to/key.json"`

2. **AI Image Generation** — needed for icons and feature graphic:
   - Ask: "Which AI image provider? (openai / gemini)"
   - Ask for the API key
   - Save: `node "$SHIP_APP_DIR/scripts/config.mjs" --set imageGeneration.provider "openai"`
   - Save: `node "$SHIP_APP_DIR/scripts/config.mjs" --set imageGeneration.apiKey "sk-..."`

3. **Privacy & GitHub** — needed for privacy policy deployment:
   - Ask for contact email and GitHub username
   - Save both via `config.mjs --set`

4. **Signing** (optional, can configure later):
   - Ask if they have a default keystore path
   - Save if provided

Re-validate after setup. STOP if still incomplete. Update state: `{ "phase": 1 }`

## Phase 2: Project Detection

Run the `project-detective` agent against the current working directory to detect:
- Framework type (android-native, react-native, capacitor, pwa-twa)
- Package name, version name, version code
- Signing configuration
- Dev server command and port

Alternatively, run the script directly: `node "$SHIP_APP_DIR/scripts/detect-project.mjs" "$(pwd)"`

Present findings to user and confirm. If detection fails, ask user to specify:
- Framework type
- Package name (com.example.app format)

**For UPDATE mode:** After detection, check the current published version:
```bash
node "$SHIP_APP_DIR/scripts/google-play-upload.mjs" --latest-version <packageName>
```
Display: "Current published version code: X. Your new versionCode must be higher."

Update state with `packageName`, `versionName`, `versionCode`. Set `"phase": 2`.

## Phase 3: Build AAB

Run: `node "$SHIP_APP_DIR/scripts/build-aab.mjs" "$(pwd)"`

This auto-detects the framework and runs the appropriate build:
- **Android Native / React Native**: `./gradlew bundleRelease`
- **Capacitor**: `npm run build` → `npx cap sync android` → `./gradlew bundleRelease`
- **PWA/TWA**: `bubblewrap build`

**If build fails:** Show the full error output. Common fixes:
- Missing Android SDK: "Set ANDROID_HOME environment variable"
- Wrong Java version: "Install JDK 17+ for modern Android projects"
- Missing dependencies: "Run npm install first"

STOP on build failure — do not continue. Update state with `aabPath`. Set `"phase": 3`.

## Phase 4: Sign AAB

1. Check if the build already produced a signed AAB (gradle signing config)
2. Run: `node "$SHIP_APP_DIR/scripts/sign-aab.mjs" --verify <aab-path>`
3. If already signed → skip to Phase 5

If NOT signed:
- Ask user: "Use existing keystore or generate a new one?"
- **Existing**: Ask for keystore path, alias, keystore password, and key password
  - Ask: "Does your key password differ from the keystore password?" (often they're the same)
- **New**: Ask for keystore details (name, organization, country)
  - Run: `node "$SHIP_APP_DIR/scripts/sign-aab.mjs" --generate-keystore <path> <alias> <password> <cn>`
- Sign: `node "$SHIP_APP_DIR/scripts/sign-aab.mjs" --sign <aab> <keystore> <keystorePassword> <keyAlias> <keyPassword>`

**For UPDATE mode**: WARN prominently — "You MUST use the SAME keystore as the original release. Using a different keystore will cause the upload to fail."

Update state with `signedAabPath`. Set `"phase": 4`.

## Phase 5: Google Play API Auth

Run: `node "$SHIP_APP_DIR/scripts/google-play-auth.mjs" --verify`

If a package name is known: `node "$SHIP_APP_DIR/scripts/google-play-auth.mjs" --verify --package=<packageName>`

**If auth fails:** The config setup in Phase 1 should have caught this, but if it still fails:
- Check the service account has "Release manager" role in Play Console
- Check the API is enabled in Google Cloud Console
- The service account email must be added as a user in Play Console → Settings → API access

Set `"phase": 5`.

## Phase 6: App Creation (NEW mode only)

**Skip this entire phase if MODE=update.**

The Google Play API cannot create new apps — this must be done in the Play Console UI.

### Playwright Automation (preferred):

1. `browser_navigate` to `https://play.google.com/console/`
2. `browser_snapshot` — check if logged in (look for "All apps" text)
3. If not logged in: Tell user "Please log in to Google Play Console in the browser window that opened. Say 'done' when ready."
4. Wait for user confirmation, then `browser_snapshot` again to verify
5. Look for and click "Create app" button
6. `browser_wait_for` the creation form to load
7. `browser_snapshot` to get form field references
8. Fill each field using `browser_type`:
   - App name: `browser_click` on the name input, then `browser_type` the app name
   - Default language: `browser_select_option` for language dropdown
   - App or Game: `browser_click` on the appropriate radio button
   - Free or Paid: `browser_click` on the appropriate radio button
   - Policy checkboxes: `browser_click` each required checkbox
9. Click "Create app" submit button
10. `browser_wait_for` navigation to new app dashboard
11. Extract app ID from URL via `browser_evaluate`

### Manual Fallback:

If Playwright fails at any step, provide these instructions:
1. Open https://play.google.com/console/
2. Click "Create app"
3. Fill in: App name, Default language, App/Game, Free/Paid
4. Accept the declarations
5. Click "Create app"
6. Tell user: "Once created, come back and say 'done'. I'll continue with the API for everything else."

Set `"phase": 6`.

## Phase 7: Store Listing Generation

Launch the `store-listing-writer` agent with context:
- App name, package name, project type
- Contents of README.md (if exists)
- Contents of package.json description
- List of key component/screen names from the source code

The agent generates: title, shortDescription, fullDescription, category, tags.

**Multi-language support:**
- Ask user: "Which languages should the listing support?" Suggest common options: en-US, ka (Georgian), ru (Russian)
- Agent generates translations for each selected language

**Present ALL generated content to user for review.**
- User can edit any field before proceeding
- Strictly enforce character limits: title ≤ 30, shortDescription ≤ 80, fullDescription ≤ 4000
- If user edits exceed limits, warn and ask them to shorten

Save listings to state. Set `"phase": 7`.

## Phase 8: AI Asset Generation

Generate app icon and feature graphic using the configured AI provider.

### App Icon (512x512):
Run: `node "$SHIP_APP_DIR/scripts/generate-images.mjs" --icon --name="<appName>" --desc="<shortDescription>" --out=".ship-app-temp/assets"`

- Generates 3 variants
- Tell user to open the folder to compare:
  - macOS: `open .ship-app-temp/assets`
  - Windows: `explorer .ship-app-temp\assets`
  - Linux: `xdg-open .ship-app-temp/assets`
- Also try reading the PNG files (works in Claude.ai web/desktop, not in CLI)
- User picks one (1, 2, or 3) → rename to `icon.png`
- If user doesn't like any: ask for style guidance, regenerate

### Feature Graphic (1024x500):
Run: `node "$SHIP_APP_DIR/scripts/generate-images.mjs" --feature --name="<appName>" --desc="<shortDescription>" --out=".ship-app-temp/assets"`

- Generates 2 variants, user picks one → rename to `feature-graphic.png`

**For UPDATE mode:** Ask "Do you want to update the app icon and feature graphic?" If no, skip.

Save asset paths to state. Set `"phase": 8`.

## Phase 9: Screenshot Capture + Framing

### Step 1: Start or detect dev server

Check if a dev server is already running on common ports (3000, 5173, 8080, 8100):
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null
```

If not running:
- Use the dev command from Phase 2 detection
- Start it and capture the PID: `npm run dev & echo $!`
- Save the PID to state as `devServerPid`
- Wait for it to be ready
- **IMPORTANT: Check for port conflicts first. If port is occupied, use a different port.**

If no dev server possible (native Android only): Ask user for URL or skip screenshots.

Fallback: Ask user "What URL should I use to capture screenshots?"

### Step 2: Detect screens

Read route definitions (React Router, file-based routing) or use the `project-detective` agent:
- Identify key screens: home/main, list/feed, detail, settings, profile, onboarding
- Select up to 8 screens automatically

Present the list to user: "I found these screens to screenshot. Add, remove, or reorder?"

### Step 3: Capture screenshots

For each screen:
1. `browser_resize` to `{ width: 1080, height: 2400 }` (high-res phone viewport)
2. `browser_navigate` to the screen URL
3. `browser_wait_for` with `{ time: 2 }` to let content render
4. `browser_take_screenshot` saving to `.ship-app-temp/screenshots/screen-N.png`

### Step 4: Frame screenshots

Run: `node "$SHIP_APP_DIR/scripts/frame-screenshots.mjs" --frame-all ".ship-app-temp/screenshots" ".ship-app-temp/framed"`

Tell user to open `.ship-app-temp/framed/` to review framed screenshots.

Play Store requirements: minimum 2 screenshots, maximum 8, min 1080px width.

**For UPDATE mode:** Ask "Do you want to capture new screenshots?" If no, skip.

Set `"phase": 9`.

## Phase 10: Content Rating

Launch the `code-analyzer` agent to scan the codebase for:
- Violence, sexual content, profanity, drugs
- User-generated content, ads, in-app purchases
- Data collection patterns, permissions

The agent returns a structured JSON with content rating answers and privacy analysis.
Save the analysis JSON to `.ship-app-temp/analysis.json`.

### Playwright Path (preferred):
1. Navigate to the app's content rating page in Play Console
2. `browser_snapshot` to find questionnaire elements
3. For each question: `browser_click` on Yes/No based on analysis
4. Submit the questionnaire

### Manual Fallback:
Present the analysis to the user as a checklist:
```
Content Rating Analysis:
- Violence: No
- Sexual Content: No
- User-Generated Content: Yes (chat feature detected)
- Ads: Yes (AdMob dependency found)
- In-App Purchases: No
...
Please enter these answers in Play Console → Content Rating → Start questionnaire
```

**For UPDATE mode:** Ask "Has the app content changed significantly?" If no, skip.

Set `"phase": 10`.

## Phase 11: Privacy Policy

Use the analysis from Phase 10 to generate and deploy a privacy policy.

1. Ask for contact email (use from config if available)
2. Generate HTML using the analysis data:
   ```bash
   node "$SHIP_APP_DIR/scripts/deploy-privacy-policy.mjs" --generate \
     --name="<appName>" --email="<email>" \
     --analysis=".ship-app-temp/analysis.json" \
     --out=".ship-app-temp/privacy-policy.html"
   ```
3. Show the generated policy to user for review (read the HTML file)
4. Deploy:
   ```bash
   node "$SHIP_APP_DIR/scripts/deploy-privacy-policy.mjs" --deploy \
     --name="<appName>" --html=".ship-app-temp/privacy-policy.html"
   ```
5. Report the GitHub Pages URL

**For UPDATE mode:** Ask "Do you want to update the privacy policy?" If no, skip.

Save `privacyUrl` to state. Set `"phase": 11`.

## Phase 12: Upload to Google Play

Construct the upload configuration as a JSON file and use the `--upload` CLI:

1. Write `.ship-app-temp/upload-config.json`:
```json
{
  "packageName": "<packageName>",
  "aabPath": "<signedAabPath>",
  "listings": {
    "en-US": { "title": "...", "shortDescription": "...", "fullDescription": "..." }
  },
  "images": {
    "en-US": {
      "icon": ".ship-app-temp/assets/icon.png",
      "featureGraphic": ".ship-app-temp/assets/feature-graphic.png",
      "phoneScreenshots": [".ship-app-temp/framed/framed-screen-1.png", "..."]
    }
  },
  "track": "production",
  "releaseNotes": [{ "language": "en-US", "text": "Initial release" }]
}
```

2. Run the upload:
```bash
node "$SHIP_APP_DIR/scripts/google-play-upload.mjs" --upload ".ship-app-temp/upload-config.json"
```

**For UPDATE mode with no listing/image changes:**
```json
{
  "packageName": "<packageName>",
  "aabPath": "<signedAabPath>",
  "track": "production",
  "updateListings": false,
  "updateImages": false,
  "releaseNotes": [{ "language": "en-US", "text": "<releaseNotes>" }]
}
```

**If upload fails:**
- 409 Conflict: Another edit is in progress. Wait and retry.
- 403 Forbidden: Check service account permissions.
- 404 Not Found: App doesn't exist yet. Go back to Phase 6.
- Image rejected: Check dimensions and format. Re-generate if needed.

Set `"phase": 12`.

## Phase 13: Confirmation

Display a summary:
```
=== App Published Successfully! ===

Package:     com.example.myapp
Version:     1.0.0 (code: 1)
Track:       Production
Languages:   en-US, ka
Screenshots: 5 uploaded
Privacy:     https://username.github.io/myapp-privacy/

Timeline:    New apps take up to 7 days for initial review.
             Updates typically appear within a few hours.

Play Console: https://play.google.com/console/developers/app/<packageName>
```

**Cleanup:**
- If a dev server was started (check `devServerPid` in state), tell user: "A dev server is still running (PID: <pid>). Stop it with: `kill <pid>`"
- Remove temp files: `rm -rf .ship-app-temp`

---

## Rules

- NEVER skip the build or signing steps
- NEVER upload an unsigned AAB
- NEVER continue past a failed build — STOP and report the error
- NEVER use `--force` or destructive commands
- NEVER store passwords or API keys in plain text files in the project directory
- NEVER kill existing processes on ports — find an available port instead
- For UPDATE mode: ALWAYS warn about keystore matching
- Present generated content (listings, images, privacy policy) for user review BEFORE uploading
- If any Playwright automation fails, ALWAYS provide manual fallback instructions
- Save state to `.ship-app-temp/state.json` after each phase for crash recovery
