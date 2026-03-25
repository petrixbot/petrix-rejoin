#!/data/data/com.termux/files/usr/bin/bash

clear

INSTALL_DIR="$HOME/petrixbot"
FILE_REJOIN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js"
FILE_PACKAGES="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/package.json"
FILE_RUN="https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/run.sh"

echo ""
echo "[*] PetrixBot PTPT-X8 | Installer"
echo "======================================"
echo ""

# [0/7] Apply Android display settings
echo "[0/7] Applying Android display settings..."

# Rotate screen to portrait (user_rotation 1 = landscape, 0 = portrait)
settings put system user_rotation 1

# Disable auto-rotate
settings put system accelerometer_rotation 0

# Set smallest width to 720dp (requires ADB/root or WRITE_SETTINGS permission)
wm density 320 > /dev/null 2>&1
wm size reset > /dev/null 2>&1
settings put global development_settings_enabled 1 > /dev/null 2>&1

# Enable force activities to be resizable (Developer Options)
settings put global force_resizable_activities 1

# Enable non-resizable in multi window (Developer Options)
settings put global enable_non_resizable_multi_window 1

# [1/7] Check & install dependencies
echo "[1/7] Checking system dependencies..."
NEED_INSTALL=0
command -v node    > /dev/null 2>&1 || NEED_INSTALL=1
command -v wget    > /dev/null 2>&1 || NEED_INSTALL=1
command -v sqlite3 > /dev/null 2>&1 || NEED_INSTALL=1

if [ $NEED_INSTALL -eq 1 ]; then
  echo "[2/7] Refreshing package repositories..."
  pkg update -y -q > /dev/null 2>&1

  echo "[3/7] Installing required system packages..."
  pkg install -y nodejs sqlite wget -q > /dev/null 2>&1
else
  echo "[2/7] All system dependencies are already installed."
  echo "[3/7] Skipping system package installation."
fi

# [4/7] Create folder
echo "[4/7] Setting up installation directory..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# [5/7] Download package.json
echo "[5/7] Fetching project manifest..."
wget -q -O package.json "$FILE_PACKAGES"
if [ ! -f package.json ] || [ ! -s package.json ]; then
  echo "[ERROR] Failed to download package.json!"
  exit 1
fi

# [6/7] Install npm packages
echo "[6/7] Installing dependencies..."
npm install --silent > /dev/null 2>&1

# [7/7] Download files
echo "[7/7] Downloading bot files..."
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
echo "[*] PetrixBot PTPT-X8 | Installation Completed"
echo ""
echo "    Cara menjalankan:"
echo "    1. Tutup APK Termux terlebih dahulu!"
echo "       - (via Termux : ketik 'exit', lalu enter hingga termux tertutup)"
echo "       - (via Notif  : buka notif termux, lalu pilih EXIT)"
echo "    2. Buka APK Termux kembali"
echo "    3. Jalankan command:"
echo "       - 'petrixtool'   = Menjalankan bot"
echo "       - 'petrixupdate' = Update bot"
echo ""