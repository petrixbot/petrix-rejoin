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
cat > package.json << 'EOF'
{
  "name": "petrixbot",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "chalk": "^5.3.0",
    "prompts": "^2.4.2",
    "sqlite3": "^5.1.7",
    "undici": "^6.19.8"
  }
}
EOF

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
cat > "$HOME/run.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/petrixbot"
node rejoin.js
EOF
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