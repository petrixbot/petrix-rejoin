#!/data/data/com.termux/files/usr/bin/bash

clear

# Update rejoin.js
wget -q -O ~/petrixbot/rejoin.js.tmp https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js
if [ -s ~/petrixbot/rejoin.js.tmp ]; then
    mv ~/petrixbot/rejoin.js.tmp ~/petrixbot/rejoin.js
fi

# Run rejoin.js
cd "$HOME/petrixbot"
su -c "PATH=/data/data/com.termux/files/usr/bin:/system/bin:/system/xbin /data/data/com.termux/files/usr/bin/node /data/data/com.termux/files/home/petrixbot/rejoin.js"