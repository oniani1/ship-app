#!/bin/bash
set -e

INSTALL_DIR="$HOME/.ship-app"
COMMANDS_DIR="$HOME/.claude/commands"
AGENTS_DIR="$HOME/.claude/agents"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== ship-app installer ==="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is required. Install it from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js 18+ required. Current: $(node -v)"
    exit 1
fi

# Check for Claude Code
if [ ! -d "$HOME/.claude" ]; then
    echo "WARNING: ~/.claude directory not found. Is Claude Code installed?"
    echo "Install Claude Code first: https://claude.ai/code"
    exit 1
fi

# Verify source files exist
if [ ! -f "$SCRIPT_DIR/commands/ship-app.md" ]; then
    echo "ERROR: Source files not found. Run this from within the ship-app repo."
    echo "  git clone <repo-url>"
    echo "  cd ship-app && ./install.sh"
    exit 1
fi

# Install or update
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation..."
    # Backup config if it exists
    if [ -f "$INSTALL_DIR/config.json" ]; then
        cp "$INSTALL_DIR/config.json" /tmp/ship-app-config-backup.json
    fi
fi

# Copy all files to install directory
echo "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -r "$SCRIPT_DIR/commands" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/agents" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/scripts" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/templates" "$INSTALL_DIR/"

# Restore config backup if it existed
if [ -f /tmp/ship-app-config-backup.json ]; then
    cp /tmp/ship-app-config-backup.json "$INSTALL_DIR/config.json"
    rm /tmp/ship-app-config-backup.json
    echo "  Preserved existing config.json"
fi

# Install Node.js dependencies
echo ""
echo "Installing dependencies..."
cd "$INSTALL_DIR/scripts" && npm install --production

# Create Claude Code directories
mkdir -p "$COMMANDS_DIR"
mkdir -p "$AGENTS_DIR"

# Link or copy the skill file (symlink with copy fallback for WSL)
echo ""
echo "Linking skill file..."
ln -sf "$INSTALL_DIR/commands/ship-app.md" "$COMMANDS_DIR/ship-app.md" 2>/dev/null \
    || cp -f "$INSTALL_DIR/commands/ship-app.md" "$COMMANDS_DIR/ship-app.md"
echo "  Installed: $COMMANDS_DIR/ship-app.md"

# Link or copy agent files
echo "Linking agent files..."
for agent in "$INSTALL_DIR/agents/"*.md; do
    if [ -f "$agent" ]; then
        AGENT_NAME=$(basename "$agent")
        ln -sf "$agent" "$AGENTS_DIR/$AGENT_NAME" 2>/dev/null \
            || cp -f "$agent" "$AGENTS_DIR/$AGENT_NAME"
        echo "  Installed: $AGENTS_DIR/$AGENT_NAME"
    fi
done

echo ""
echo "=== Installation complete! ==="
echo ""
echo "Next steps:"
echo "  1. Open Claude Code"
echo "  2. Run /ship-app to get started"
echo "  3. First run will guide you through configuration (API keys, etc.)"
echo ""
echo "Configuration is stored in: ~/.ship-app/config.json"
echo "To reconfigure: node ~/.ship-app/scripts/config.mjs --init"
