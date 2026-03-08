#!/data/data/com.termux/files/usr/bin/bash

# Update rejoin.js
wget -q -O ~/petrixbot/rejoin.js https://raw.githubusercontent.com/petrixbot/petrix-rejoin/refs/heads/main/rejoin.js

# Run rejoin.js
cd ~/petrixbot
node rejoin.js