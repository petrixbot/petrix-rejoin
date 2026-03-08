#!/data/data/com.termux/files/usr/bin/bash

clear

INSTALL_DIR="$HOME/petrixbot"
FILE_REJOIN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js"
FILE_PACKAGES="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/package.json"
FILE_RUN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/run.sh"

echo ""
echo "  PetrixBot PTPT-X8 - Installer"
echo "======================================"
echo ""

echo "[1/6] Updating package list..."
pkg update -y -q > /dev/null 2>&1

echo "[2/6] Installing modules..."
pkg install -y nodejs sqlite wget -q > /dev/null 2>&1

echo "[3/6] Creating folder directory..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "[4/6] Downloading package.json..."
wget -q -O package.json "$FILE_PACKAGES"
if [ ! -f package.json ] || [ ! -s package.json ]; then
  echo "[ERROR] Error downloading package.json!"
  exit 1
fi

echo "[5/6] Installing packages..."
npm install --silent > /dev/null 2>&1

echo "[6/6] Downloading files..."
wget -q -O "$INSTALL_DIR/rejoin.js" "$FILE_REJOIN"
if [ ! -f "$INSTALL_DIR/rejoin.js" ] || [ ! -s "$INSTALL_DIR/rejoin.js" ]; then
  echo "[ERROR] Error downloading rejoin.js!"
  exit 1
fi

wget -q -O "$HOME/run.sh" "$FILE_RUN"
if [ ! -f "$HOME/run.sh" ] || [ ! -s "$HOME/run.sh" ]; then
  echo "[ERROR] Error downloading run.sh!"
  exit 1
fi
chmod +x "$HOME/run.sh"

# Tambah alias petrixtool
touch ~/.bashrc 2>/dev/null
grep -q "alias petrixtool=" ~/.bashrc || echo "alias petrixtool='bash ~/run.sh'" >> ~/.bashrc
source ~/.bashrc 2>/dev/null

echo ""
echo "======================================"
echo "  Instalasi selesai!"
echo ""
echo "  Cara menjalankan BOT:"
echo "  1. Tutup Termux terlebih dahulu"
echo "     - (via Termux: ketik 'exit' lalu enter hingga termux ketutup)"
echo "     - (via Notif : buka notif termux, lalu pilih EXIT)"
echo "  2. Buka termux kembali"
echo "     - ketik 'petrixtool' dan enter"
echo ""