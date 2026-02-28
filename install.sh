#!/data/data/com.termux/files/usr/bin/bash

INSTALL_DIR="$HOME/petrixbot"
SCRIPT_URL="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js"

echo ""
echo "======================================"
echo "  PetrixBot PTPT-X8 - Installer"
echo "======================================"
echo ""

# Update & install dependencies Termux
echo "[1/5] Updating package list..."
pkg update -y -q > /dev/null 2>&1

# Installing modules
echo "[2/5] Installing modules..."
pkg install -y nodejs sqlite wget -q > /dev/null 2>&1

# Creating folder
echo "[3/5] Creating folder directory..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Install node packages
echo "[4/5] Installing packages..."
printf '{\n  "name": "petrixbot",\n  "version": "1.0.0",\n  "type": "module",\n  "dependencies": {\n    "chalk": "^5.3.0",\n    "prompts": "^2.4.2",\n    "undici": "^6.19.8"\n  }\n}\n' > package.json
npm install --silent > /dev/null 2>&1

# Download rejoin.js from github
echo "[5/5] Downloading file rejoin..."
wget -q -O rejoin.js "$SCRIPT_URL"

if [ ! -f rejoin.js ] || [ ! -s rejoin.js ]; then
  echo ""
  echo "[ERROR] Failed download file rejoin!"
  exit 1
fi

# Shortcut run
printf '#!/data/data/com.termux/files/usr/bin/bash\ncd "$HOME/petrixbot"\nsu -c "PATH=/data/data/com.termux/files/usr/bin:/system/bin:/system/xbin /data/data/com.termux/files/usr/bin/node /data/data/com.termux/files/home/petrixbot/rejoin.js"\n' > "$HOME/run.sh"
chmod +x "$HOME/run.sh"

echo ""
echo "======================================"
echo "  PetrixBot PTPT-X8"
echo "  - Installation Complete!"
echo ""
echo "  Run the bot with:"
echo "  - bash ~/run.sh"
echo "======================================"
echo ""