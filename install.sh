#!/data/data/com.termux/files/usr/bin/bash

# ============================================
#   PetrixBot PTPT-X8 - Installer for Termux
# ============================================

INSTALL_DIR="$HOME/petrixbot"
SCRIPT_URL="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js"

echo ""
echo "======================================"
echo "  PetrixBot PTPT-X8 - Installer"
echo "======================================"
echo ""

# Update & install dependencies Termux
echo "[1/6] Updating package list..."
pkg update -y -q

echo "[2/6] Installing modules..."
pkg install -y nodejs sqlite wget -q

# Buat folder instalasi
echo "[3/6] Creating folder directory..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Buat package.json (wajib untuk ES Module)
echo "[4/6] Creating package.json..."
printf '{\n  "name": "petrixbot",\n  "version": "1.0.0",\n  "type": "module",\n  "dependencies": {\n    "chalk": "^5.3.0",\n    "prompts": "^2.4.2",\n    "undici": "^6.19.8"\n  }\n}\n' > package.json

# Install npm packages
echo "[5/6] Installing packages..."
npm install --silent

# Download script dari GitHub
echo "[6/6] Downloading file rejoin.js..."
wget -q -O rejoin.js "$SCRIPT_URL"

if [ ! -f rejoin.js ] || [ ! -s rejoin.js ]; then
  echo ""
  echo "[ERROR] Gagal download rejoin.js!"
  exit 1
fi

# Buat shortcut run
printf '#!/data/data/com.termux/files/usr/bin/bash\ncd "$HOME/petrixbot"\nsu -c "/data/data/com.termux/files/usr/bin/node /data/data/com.termux/files/home/petrixbot/rejoin.js"\n' > "$HOME/run.sh"
chmod +x "$HOME/run.sh"

echo ""
echo "======================================"
echo "  Instalasi selesai!"
echo ""
echo "  Jalankan bot dengan:"
echo "    bash ~/run.sh"
echo ""
echo "  Atau langsung:"
echo "    cd ~/petrixbot && node rejoin.js"
echo "======================================"
echo ""