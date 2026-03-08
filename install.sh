#!/data/data/com.termux/files/usr/bin/bash

INSTALL_DIR="$HOME/petrixbot"
FILE_REJOIN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js"
FILE_PACKAGES="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/package.json"
FILE_RUN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/run.sh"

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

# Download package.json dari GitHub
echo "[4/6] Downloading package.json..."
wget -q -O package.json "$FILE_PACKAGES"
if [ ! -f package.json ] || [ ! -s package.json ]; then
  echo "[ERROR] Gagal download package.json!"
  exit 1
fi

# Install npm packages
echo "[5/6] Installing packages..."
npm install --silent

# Download rejoin.js dan run.sh dari GitHub
echo "[6/6] Downloading files..."

wget -q -O "$INSTALL_DIR/rejoin.js" "$FILE_REJOIN"
if [ ! -f "$INSTALL_DIR/rejoin.js" ] || [ ! -s "$INSTALL_DIR/rejoin.js" ]; then
  echo "[ERROR] Gagal download rejoin.js!"
  exit 1
fi

wget -q -O "$HOME/run.sh" "$FILE_RUN"
if [ ! -f "$HOME/run.sh" ] || [ ! -s "$HOME/run.sh" ]; then
  echo "[ERROR] Gagal download run.sh!"
  exit 1
fi
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