#!/data/data/com.termux/files/usr/bin/bash

clear

INSTALL_DIR="$HOME/petrixbot"
FILE_REJOIN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js"
FILE_PACKAGES="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/package.json"
FILE_RUN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/run.sh"

echo ""
echo "  PetrixBot PTPT-X8 | Installer"
echo "======================================"
echo ""

# [1/6] Check & install dependencies
echo "[1/6] Checking system dependencies..."
NEED_INSTALL=0
command -v node    > /dev/null 2>&1 || NEED_INSTALL=1
command -v wget    > /dev/null 2>&1 || NEED_INSTALL=1
command -v sqlite3 > /dev/null 2>&1 || NEED_INSTALL=1

if [ $NEED_INSTALL -eq 1 ]; then
  echo "[1/6] Refreshing package repositories..."
  pkg update -y -q > /dev/null 2>&1

  echo "[2/6] Installing required system packages..."
  pkg install -y nodejs sqlite wget -q > /dev/null 2>&1
else
  echo "[1/6] All system dependencies are already installed."
  echo "[2/6] Skipping system package installation."
fi

# [3/6] Create folder
echo "[3/6] Setting up installation directory..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# [4/6] Download package.json
echo "[4/6] Fetching project manifest..."
wget -q -O package.json "$FILE_PACKAGES"
if [ ! -f package.json ] || [ ! -s package.json ]; then
  echo "[ERROR] Failed to download package.json!"
  exit 1
fi

# [5/6] Install npm packages
echo "[5/6] Installing dependencies..."
npm install --silent > /dev/null 2>&1

# [6/6] Download files
echo "[6/6] Downloading bot files..."
wget -q -O "$INSTALL_DIR/rejoin.js" "$FILE_REJOIN"
if [ ! -f "$INSTALL_DIR/rejoin.js" ] || [ ! -s "$INSTALL_DIR/rejoin.js" ]; then
  echo "[ERROR] Failed to download rejoin.js!"
  exit 1
fi

wget -q -O "$HOME/run.sh" "$FILE_RUN"
if [ ! -f "$HOME/run.sh" ] || [ ! -s "$HOME/run.sh" ]; then
  echo "[ERROR] Failed to download run.sh!"
  exit 1
fi
chmod +x "$HOME/run.sh"

# Tambah alias
touch ~/.bashrc 2>/dev/null
grep -q "alias petrixtool="   ~/.bashrc || echo "alias petrixtool='bash ~/run.sh'" >> ~/.bashrc
grep -q "alias petrixupdate=" ~/.bashrc || echo "alias petrixupdate='rm -rf ~/petrixbot && rm -f ~/run.sh && wget -qO- https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/install.sh | bash'" >> ~/.bashrc
source ~/.bashrc 2>/dev/null

echo ""
echo "======================================"
echo "  PetrixBot PTPT-X8 | Installation Completed"
echo ""
echo "  Cara menjalankan:"
echo "  1. Tutup APK Termux terlebih dahulu!"
echo "     - (via Termux : ketik 'exit', lalu enter hingga termux tertutup)"
echo "     - (via Notif  : buka notif termux, lalu pilih EXIT)"
echo "  2. Buka APK Termux kembali"
echo "  3. Jalankan command:"
echo "     - 'petrixtool'   = Menjalankan bot"
echo "     - 'petrixupdate' = Update bot"
echo ""