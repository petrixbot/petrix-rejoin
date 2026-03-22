import { execSync, execFileSync, spawn } from 'child_process';
import { request } from 'undici';
import Tesseract from 'tesseract.js';
import Jimp from 'jimp';
import enquirer from 'enquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import logUpdate from 'log-update';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!fs.existsSync(path.join(__dirname, 'image'))) {
    fs.mkdirSync(path.join(__dirname, 'image'));
}

const TERMUX_ENV = {
    ...process.env,
    PATH: '/data/data/com.termux/files/usr/bin:/data/data/com.termux/files/usr/local/bin:/system/bin:/system/xbin'
};

if (process.getuid && process.getuid() !== 0) {
    try {
        execFileSync('su', ['-c', `${process.execPath} ${process.argv[1]}`],
            { stdio: 'inherit', env: TERMUX_ENV }
        );
    } catch { }
    process.exit(0);
}

// Global Chace Variabels
let USER_COOKIE = null;
let USER_CSRFTOKEN = null;
let USER_ID = null;
let USER_USERNAME = null;
let USER_DISPLAYNAME = null;
let USER_GAMEID = null;

let MAP_GAMENAME = null;
let MAP_PLACEID = null;

let PRIVATE_ROOMNAME = null;
let PRIVATE_SERVERID = null;
let PRIVATE_PLAYING = 0;
let PRIVATE_GAMEID = null;
let PRIVATE_SERVERLINK = null;

let STATUS_REJOIN = false;
let STATUS_ACCEPT = false;

let EXTERNAL_GAMEID = null;
let EXTERNAL_LINKCODE = null;
let EXTERNAL_SERVERLINK = null;

let _cachedBounds = null;
let _cachedCropSize = null;


// Packages
const packageName = 'com.roblox.client';
const packageActivity = 'com.roblox.client.ActivityProtocolLaunch';
const packageAction = 'android.intent.action.VIEW';

// Image Path
const IMAGE_FULL_PATH = path.join(__dirname, 'image', 'ss-full.png');
const IMAGE_CROP_PATH = path.join(__dirname, 'image', 'ss-crop.png');


// Helper Functions
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/\./g, ':');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkRootDevice() {
    if (process.getuid) return process.getuid() === 0;
    return false;
}

function clearScreen() {
    process.stdout.write('\x1bc');
}

// ─── Logger Helpers ───────────────────────────────────────────────
function printHeader(title, subtitle = null) {
    const content = subtitle
        ? `${chalk.bold.cyan(title)}\n${chalk.gray(subtitle)}`
        : chalk.bold.cyan(title);
    console.log(boxen(content, {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'cyan',
        margin: { bottom: 1 }
    }));
}

const log = {
    info: (msg) => console.log(`  ${chalk.cyan('~')}  ${chalk.gray(msg)}`),
    ok: (msg) => console.log(`  ${chalk.green('✔')}  ${chalk.green(msg)}`),
    err: (msg) => console.log(`  ${chalk.red('✘')}  ${chalk.red(msg)}`),
    warn: (msg) => console.log(`  ${chalk.yellow('!')}  ${chalk.yellow(msg)}`),
    back: (msg) => console.log(`\n  ${chalk.gray('←')}  ${chalk.gray(msg)}`),
    detail: (label, value) => console.log(`  ${chalk.gray(label.padEnd(16))}${value}`),
    divider: (title) => console.log(`\n  ${chalk.bold(title)}`),
    time: (type, msg) => {
        const ts = chalk.gray(formatDate(Date.now()));
        const icons = { ok: chalk.green('✔'), err: chalk.red('✘'), warn: chalk.yellow('!'), info: chalk.cyan('~') };
        console.log(`  ${icons[type] || icons.info}  ${ts}  ${msg}`);
    },
    waiting: (msg) => logUpdate(`  ${chalk.cyan('⠋')}  ${chalk.gray(msg)}`),
    doneWaiting: () => logUpdate.done(),
};

function get_WindowBounds(forceRefresh = false) {
    if (_cachedBounds && !forceRefresh) return _cachedBounds;
    try {
        const output = execSync(
            `dumpsys window windows | grep -A 10 "${packageName}"`,
            { encoding: 'utf8', timeout: 5000, env: TERMUX_ENV, stdio: 'pipe' }
        );
        const patterns = [
            /mFrame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/,
            /bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/,
            /mWindowFrames.*?mFrame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/s,
        ];
        for (const pattern of patterns) {
            const match = output.match(pattern);
            if (match) {
                _cachedBounds = {
                    left: parseInt(match[1]),
                    top: parseInt(match[2]),
                    width: parseInt(match[3]) - parseInt(match[1]),
                    height: parseInt(match[4]) - parseInt(match[2]),
                };
                return _cachedBounds;
            }
        }
    } catch (e) { }
    return null;
}

async function get_Screenshoot() {
    const SDCARD_FULL = '/sdcard/ss-full.png';

    const [, bounds] = await Promise.all([
        new Promise(resolve => {
            execSync(
                `screencap -p ${SDCARD_FULL} && cp ${SDCARD_FULL} ${IMAGE_FULL_PATH} && chmod 644 ${IMAGE_FULL_PATH} && rm ${SDCARD_FULL}`,
                { env: TERMUX_ENV, stdio: 'pipe' }
            );
            resolve();
        }),
        Promise.resolve(get_WindowBounds(true))
    ]);

    const image = await Jimp.read(IMAGE_FULL_PATH);
    const fullW = image.getWidth();
    const fullH = image.getHeight();

    const validBounds = bounds && bounds.width > 0 && bounds.width < fullW;
    const x = validBounds ? bounds.left : Math.floor(fullW / 2);
    const y = validBounds ? bounds.top : 0;
    const w = validBounds ? bounds.width : Math.floor(fullW / 2);
    const h = validBounds ? bounds.height : fullH;

    _cachedCropSize = { w, h };
    await image.crop(x, y, w, h).writeAsync(IMAGE_CROP_PATH);
}

function tap_screen(text) {
    const bounds = _cachedBounds;
    const offsetX = bounds ? bounds.left : 0;
    const offsetY = bounds ? bounds.top : 0;
    const cropW = _cachedCropSize ? _cachedCropSize.w : 635;
    const cropH = _cachedCropSize ? _cachedCropSize.h : 720;

    const positions = {
        'textarea': { x: 0.85, y: 0.38 },
        'button_continue': { x: 0.85, y: 0.51 },
        'button_key': { x: 0.85, y: 0.63 }
    };

    const pos = positions[text.toLowerCase()];
    if (!pos) return false;

    const tapX = Math.floor(cropW * pos.x) + offsetX;
    const tapY = Math.floor(cropH * pos.y) + offsetY;
    execSync(
        `input tap ${tapX} ${tapY}`,
        { env: TERMUX_ENV, stdio: 'pipe' }
    );
    return true;
}


// Delta function
function delta_currentVersion() {
    try {
        const installed = execSync(`pm list packages ${packageName}`, { encoding: 'utf8' }).trim();
        if (!installed.includes(packageName)) return 'Not Installed';

        const output = execSync(`pm dump ${packageName}`, { encoding: 'utf8' });
        const match = output.match(/versionName=([^\s]+)/);
        return match ? match[1] : 'Version not found';
    } catch (err) {
        return '(Error: ' + err.message + ')';
    }
}

async function delta_newVersion() {
    try {
        const { statusCode, body } = await request('https://delta.filenetwork.vip/get_files.php', {
            method: 'GET',
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
            }
        });

        if (statusCode === 200) {
            const response = await body.json();
            const latestApk = response.latest_apk[0];
            if (!latestApk) return 'Version not found';

            const match = latestApk.name.match(/Delta-([\d.]+?)(?:-\d+)?\.apk/);
            const version = match ? match[1] : 'Version not found';
            return version;
        }

        return 'Version not found';
    } catch (err) {
        return '(Error: ' + err.message + ')';
    }
}

async function delta_getUrl() {
    const browsers = [
        'com.android.chrome',
        'org.mozilla.firefox',
        'com.microsoft.emmx',
        'com.opera.browser',
        'com.android.browser'
    ];

    for (let i = 0; i < 8; i++) {
        for (const browser of browsers) {
            try {
                const activity = execSync(
                    `dumpsys activity activities | grep -A 5 "${browser}"`,
                    { encoding: 'utf8', timeout: 3000, env: TERMUX_ENV, stdio: 'pipe' }
                );
                const urlMatch = activity.match(/https?:\/\/auth\.platorelay\.com\/a\?d=[^\s"'<>]+/);
                if (urlMatch) {
                    await delay(1000);
                    for (const pkg of browsers) {
                        try {
                            const pid = execSync(`pidof ${pkg}`, { encoding: 'utf8', env: TERMUX_ENV, stdio: 'pipe' }).trim();
                            if (pid) execSync(`kill -9 ${pid}`, { env: TERMUX_ENV, stdio: 'pipe' });
                        } catch (e) { }
                    }
                    return urlMatch[0];
                }
            } catch (e) { }
        }
        await delay(500);
    }

    return null;
}

async function delta_getKey(link) {
    try {
        const { statusCode, body } = await request('https://azure48.xyz/api/bypass', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'referer': 'https://azure48.xyz/bypass',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({ url: link }),
            bodyTimeout: 60000,
            headersTimeout: 60000
        });

        if (statusCode === 200) {
            const response = await body.json();
            return response.result;
        }
        return null;
    } catch (err) {
        return null;
    }
}

async function delta_detectUI() {
    await get_Screenshoot();

    const { data } = await Tesseract.recognize(IMAGE_CROP_PATH, 'eng', { logger: () => { } });
    const deltaui_texts = ['Enter key', 'KEY_example', 'Continue'];
    const deltaui_detected = deltaui_texts.every(target => {
        const regex = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return regex.test(data.text);
    });

    if (deltaui_detected) {
        log.time('warn', 'Need Delta-Key...');
    } else {
        log.time('ok', 'No need Delta-Key!');
        return false;
    }

    log.time('info', 'Attempting to retrieve url Platorelay...');
    const hasReceiveKey = /receive\s*key/i.test(data.text);
    if (hasReceiveKey) {
        tap_screen('button_key');
        await delay(2000);
        tap_screen('button_key');
    } else {
        tap_screen('button_key');
    }

    const platorelay_url = await delta_getUrl();
    if (platorelay_url) {
        log.time('ok', 'Success retrieve url Platorelay...');
    } else {
        log.time('err', 'Failed to retrieve url Platorelay!');
        return false;
    }

    log.time('info', 'Bypassing Platorelay key system...');
    const delta_key = await delta_getKey(platorelay_url);
    if (delta_key) {
        log.time('ok', `Platorelay bypassed: ${chalk.yellow(delta_key)}`);
    } else {
        log.time('err', 'Failed to bypass Platorelay key system!');
        return false;
    }

    await delay(3000);
    log.time('info', 'Submitting Delta-Key...');
    tap_screen('textarea');
    await delay(1000);
    execSync(`input text '${delta_key}'`, { env: TERMUX_ENV });
    await delay(1000);
    tap_screen('button_continue');
    log.time('ok', 'Key submitted successfully!');
    return true;
}


// Roblox function LocalData
function roblox_getCookie() {
    const dbPath = '/data/data/com.roblox.client/app_webview/Default/Cookies';

    try {
        const result = execSync(
            `sqlite3 ${dbPath} "SELECT value FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com' LIMIT 1;"`,
            { encoding: 'utf8', env: TERMUX_ENV }
        ).trim();
        return result || null;
    } catch (err) {
        return null;
    }
}

function roblox_setCookie(newCookie) {
    const dbPath = '/data/data/com.roblox.client/app_webview/Default/Cookies';

    try {
        const escapedCookie = newCookie.replace(/'/g, "''");
        const now = (Date.now() * 1000).toString();

        const exists = execSync(
            `sqlite3 ${dbPath} "SELECT COUNT(*) FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com';"`,
            { encoding: 'utf8', env: TERMUX_ENV }
        ).toString().trim();

        if (exists === '1') {
            execSync(`sqlite3 ${dbPath} "UPDATE cookies SET value='${escapedCookie}', last_access_utc=${now}, last_update_utc=${now} WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com';"`,
                { encoding: 'utf8', env: TERMUX_ENV });
        } else {
            execSync(`sqlite3 ${dbPath} "INSERT INTO cookies (creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, last_access_utc, has_expires, is_persistent, priority, samesite, source_scheme, source_port, last_update_utc, source_type, has_cross_site_ancestor) VALUES (${now}, '.roblox.com', '', '.ROBLOSECURITY', '${escapedCookie}', '', '/', 14362699149000000, 1, 1, ${now}, 1, 1, 1, -1, 2, 443, ${now}, 0, 0);"`,
                { encoding: 'utf8', env: TERMUX_ENV });
        }

        const checkCookie = execSync(
            `sqlite3 ${dbPath} "SELECT value FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com' LIMIT 1;"`,
            { encoding: 'utf8', env: TERMUX_ENV }
        ).toString().trim();

        return checkCookie === newCookie;
    } catch (err) {
        log.err('Error: ' + err.message);
        return false;
    }
}

function roblox_getData() {
    const filePath = '/data/data/com.roblox.client/files/appData/LocalStorage/appStorage.json';

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);

        return {
            Username: data.Username ?? null,
            UserId: data.UserId ?? null,
            DisplayName: data.DisplayName ?? null
        };
    } catch (err) {
        return null;
    }
}

function roblox_open(PRIVATE_SERVERLINK) {
    try {
        const urlObj = new URL(PRIVATE_SERVERLINK);
        let deepLink;

        // Format: /games/1234567890?privateServerLinkCode=xxxx
        const gamesMatch = urlObj.pathname.match(/\/games\/(\d+)/);
        const linkCode = urlObj.searchParams.get('privateServerLinkCode');
        if (gamesMatch && linkCode) {
            const placeID = gamesMatch[1];
            deepLink = `roblox://placeID=${placeID}&linkCode=${linkCode}`;
        } else {
            // Format: /share?code=xxxx&type=Server
            const codeValue = urlObj.searchParams.get('code');
            deepLink = `roblox://navigation/share_links?type=Server&code=${codeValue}`;
        }

        execSync(`am start -n ${packageName}/${packageActivity} -a ${packageAction} -d "${deepLink}" --activity-clear-top`);
        return true;
    } catch (err) {
        return false;
    }
}


// Roblox functions API
async function roblox_getCsrfToken(cookie) {
    try {
        const { statusCode, headers } = await request('https://friends.roproxy.com/v1/users/1/request-friendship', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                'cookie': '.ROBLOSECURITY=' + cookie
            }
        });

        // Roblox kirim token saat 403
        if (statusCode === 403) {
            return headers['x-csrf-token'] || null;
        }

        return null;
    } catch (err) {
        return null;
    }
}

async function roblox_presence(cookie, userId) {
    try {
        const { statusCode, headers, body } = await request('https://presence.roproxy.com/v1/presence/users', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': '.ROBLOSECURITY=' + cookie,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                "userIds": [userId]
            })
        });

        if (statusCode !== 200) return null;

        const response = await body.json();
        return {
            userPresenceType: response.userPresences[0].userPresenceType,
            rootPlaceId: response.userPresences[0].rootPlaceId,
            gameId: response.userPresences[0].gameId
        };
    } catch (err) {
        return null;
    }
}

async function roblox_privateServer(cookie, userId, rootPlaceId) {
    try {
        const { statusCode, headers, body } = await request('https://games.roproxy.com/v1/games/' + rootPlaceId + '/private-servers', {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': '.ROBLOSECURITY=' + cookie,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36'
            }
        });

        if (statusCode !== 200) return null;

        const response = await body.json();
        if (!response.data || response.data.length === 0) return null;

        const server = response.data.find(s => s.owner && s.owner.id === Number(userId));
        if (!server) return null;

        return {
            gameId: server.id || null,
            vipServerId: server.vipServerId,
            playerList: server.players || [],
            playing: server.playing || 0
        };
    } catch (err) {
        return null;
    }
}

async function roblox_privateServerDetails(cookie, vipServerId) {
    try {
        const { statusCode, headers, body } = await request('https://games.roproxy.com/v1/vip-servers/' + vipServerId, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': '.ROBLOSECURITY=' + cookie,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36'
            }
        });

        if (statusCode !== 200) return null;

        const response = await body.json();
        return {
            privateRoomName: response.name,
            privateGameName: response.game.name,
            privateLink: response.link
        }
    } catch (err) {
        return null;
    }
}

async function roblox_friendsRequest(cookie) {
    try {
        const { statusCode, headers, body } = await request('https://friends.roproxy.com/v1/my/friends/requests?limit=25', {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': '.ROBLOSECURITY=' + cookie,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36'
            }
        });

        if (statusCode !== 200) return [];

        const response = await body.json();
        if (!response.data || response.data.length === 0) return [];

        const ids = response.data.map(req => req.id);
        return ids;
    } catch (err) {
        return [];
    }
}

async function roblox_getFriends(cookie, userId) {
    try {
        const { statusCode, body } = await request(`https://friends.roproxy.com/v1/users/${userId}/friends?userSort=StatusFrequents`, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': '.ROBLOSECURITY=' + cookie,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
            }
        });

        if (statusCode !== 200) return [];

        const response = await body.json();
        return response.data || [];
    } catch (err) {
        return [];
    }
}

async function roblox_acceptFriend(cookie, targetUserId, retryCount = 0) {
    if (retryCount >= 3) return false;

    try {
        if (!USER_CSRFTOKEN) USER_CSRFTOKEN = await roblox_getCsrfToken(cookie);

        const { statusCode, headers } = await request('https://friends.roproxy.com/v1/users/' + targetUserId + '/accept-friend-request', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': '.ROBLOSECURITY=' + cookie,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
                'x-csrf-token': USER_CSRFTOKEN
            }
        });

        if (statusCode === 403) {
            const newToken = headers['x-csrf-token'];
            if (!newToken) return false;

            USER_CSRFTOKEN = newToken;
            return await roblox_acceptFriend(cookie, targetUserId, retryCount + 1);
        }

        return statusCode === 200;
    } catch (err) {
        return false;
    }
}

async function roblox_removeFriend(cookie, friendId, retryCount = 0) {
    if (retryCount >= 3) return false;

    try {
        if (!USER_CSRFTOKEN) USER_CSRFTOKEN = await roblox_getCsrfToken(cookie);

        const { statusCode, headers } = await request(`https://friends.roproxy.com/v1/users/${friendId}/unfriend`, {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'cookie': '.ROBLOSECURITY=' + cookie,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                'x-csrf-token': USER_CSRFTOKEN
            }
        });

        if (statusCode === 403) {
            const newToken = headers['x-csrf-token'];
            if (!newToken) return false;
            USER_CSRFTOKEN = newToken;
            return await roblox_removeFriend(cookie, friendId, retryCount + 1);
        }

        return statusCode === 200;
    } catch (err) {
        return false;
    }
}


// Menu: Update Roblox Delta
async function menu_UpdateRobloxDelta() {
    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Updating Roblox Delta');

    try {
        log.info('Getting Latest Roblox Delta...');

        const { statusCode, body } = await request('https://delta.filenetwork.vip/get_files.php', {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                'Referer': 'https://delta.filenetwork.vip/android.html',
                'Accept': 'application/json'
            },
            maxRedirections: 5
        });

        const data = JSON.parse(await body.text());
        const latestApk = data.latest_apk[0];
        if (!latestApk) return log.err('No APK found');

        const fileName = latestApk.name;
        const match = fileName.match(/Delta-([\d.]+?)(?:-\d+)?\.apk/);
        const version = match ? match[1] : 'Unknown';
        const downloadUrl = `https://delta.filenetwork.vip/file/${fileName}`;

        const savePath = path.join('/data/data/com.termux/files/home/petrixbot/downloads', fileName);
        fs.mkdirSync(path.dirname(savePath), { recursive: true });

        // Step 1: Undici download
        log.info(`Downloading ${fileName}...`);
        let downloadSuccess = false;

        try {
            const dlRes = await request(downloadUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                    'Referer': 'https://delta.filenetwork.vip/android.html',
                    'Accept': 'application/octet-stream,*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Connection': 'keep-alive',
                    'Origin': 'https://delta.filenetwork.vip'
                },
                maxRedirections: 10
            });

            if (dlRes.statusCode === 200) {
                const fileStream = fs.createWriteStream(savePath);
                await new Promise((resolve, reject) => {
                    dlRes.body.pipe(fileStream);
                    dlRes.body.on('error', reject);
                    fileStream.on('finish', resolve);
                });

                const fileSize = fs.statSync(savePath).size;
                if (fileSize > 0) {
                    log.ok(`Downloaded (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
                    downloadSuccess = true;
                }
            }
        } catch (_) { }

        // Step 2: Browser download
        if (!downloadSuccess) {
            execSync(`am start -a android.intent.action.VIEW -d "${downloadUrl}"`, { env: TERMUX_ENV });

            const browserDownloadPath = `/storage/emulated/0/Download/${fileName}`;
            let waited = 0;
            const maxWait = 5 * 60 * 1000;
            while (waited < maxWait) {
                waited += 1000;

                if (fs.existsSync(savePath) && fs.statSync(savePath).size > 1024 * 1024) {
                    log.doneWaiting();
                    log.ok(`${fileName} Downloaded (${(fs.statSync(savePath).size / 1024 / 1024).toFixed(1)} MB)`);
                    downloadSuccess = true;
                    break;
                }

                if (fs.existsSync(browserDownloadPath) && fs.statSync(browserDownloadPath).size > 1024 * 1024) {
                    fs.copyFileSync(browserDownloadPath, savePath);
                    fs.unlinkSync(browserDownloadPath);
                    log.doneWaiting();
                    log.ok(`${fileName} Downloaded (${(fs.statSync(savePath).size / 1024 / 1024).toFixed(1)} MB)`);
                    downloadSuccess = true;
                    break;
                }

                log.waiting(`Waiting for download to complete... ${Math.floor(waited / 1000)}s`);
                await delay(1000);
            }

            if (!downloadSuccess) throw new Error('Timeout: file not found after 5 minutes');
        }

        // Step 3: Install
        log.info(`Installing ${fileName}...`);
        execSync(`pm install -r -g '${savePath}'`, { stdio: 'pipe', env: TERMUX_ENV });

        log.ok(`Success Installing Roblox Delta ${version}!`);
    } catch (err) {
        log.err('Error: ' + err.message);
    }

    log.back('Back to main menu...');
    await delay(2000);
    return menu_main();
}

// Menu: Inject AutoExec Delta
async function menu_InjectAutoExec() {
    const folderPath = '/storage/emulated/0/Delta/Autoexecute/';

    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Add autoexecute Roblox Delta');
    log.info('Ketik "exit" untuk kembali ke menu utama.\n');

    const { linkFile } = await enquirer.prompt({
        type: 'input',
        name: 'linkFile',
        message: 'Script Link?',
        validate: value => {
            if (!value?.trim()) return '❌ URL cannot be empty';
            return true;
        }
    });

    if (linkFile.trim().toLowerCase() === 'exit') {
        log.back('Back to main menu...');
        await delay(3000);
        return menu_main();
    }

    const finalLink = linkFile.trim().toLowerCase() === 'ezweystock' ? 'http://ezweystock.petrix.id/priv8/webhook' : linkFile.trim();
    const luaContent = `loadstring(game:HttpGet("${finalLink}"))()`;
    const filePath = path.join(folderPath, 'petrixbot.lua');

    try {
        fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(filePath, luaContent, 'utf8');
        log.ok('AutoExec file created!');
        log.detail('Path :', chalk.gray(filePath));
        log.detail('Link :', chalk.cyan(finalLink));
    } catch (err) {
        log.err('Failed to create file: ' + err.message);
    }

    log.back('Back to main menu...');
    await delay(2000);
    return menu_main();
}

// Menu: Inject Cookie
async function menu_InjectCookie() {
    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Roblox Login — Inject Cookie');
    log.info('Ketik "exit" untuk kembali ke menu utama.');
    log.info('Cookie harus diawali dengan "_|WARNING:-DO-NOT-SHARE-THIS..."\n');

    const { cookie } = await enquirer.prompt({
        type: 'input',
        name: 'cookie',
        message: "Roblox Cookie?",
        validate: value => {
            if (!value) return '❌ Cookie cannot be empty';
            if (value.toLowerCase() === 'exit') return true;
            if (!value.includes('_|WARNING')) return '❌ Invalid cookie! Must start with "_|WARNING:-DO-NOT-SHARE-THIS..."';
            return true;
        }
    });

    if (cookie.toLowerCase() === 'exit') {
        log.back('Back to main menu...');
        await delay(3000);
        return menu_main();
    }

    // Inject cookie
    const success = roblox_setCookie(cookie);
    if (success) {
        log.ok('Cookie injected successfully!');
    } else {
        log.err('Failed to inject cookie, try again.');
        process.exit(0);
    }

    log.back('Back to main menu...');
    await delay(2000);
    return menu_main();
}


// Menu: Accept All Friends
async function menu_AcceptAllFriends() {
    if (!USER_COOKIE) {
        log.info('Getting Roblox cookies...');
        USER_COOKIE = roblox_getCookie();
        if (!USER_COOKIE) {
            log.err('Roblox cookies not found');
            await delay(5000);
            return menu_main();
        }
        log.ok('Roblox cookies found');
    }

    if (!USER_ID || !USER_USERNAME || !USER_DISPLAYNAME) {
        log.info('Getting Roblox user data...');
        const dataUser = roblox_getData();
        if (dataUser) {
            USER_USERNAME = dataUser.Username;
            USER_ID = dataUser.UserId;
            USER_DISPLAYNAME = dataUser.DisplayName;
            log.ok('Roblox user data founded');
        } else {
            log.err('Roblox user data not found');
            await delay(5000);
            return menu_main();
        }
    }

    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Accept All Connections');
    log.info('Ketik "stop" + Enter  ATAU  tekan Ctrl+C untuk berhenti\n');
    log.divider('Roblox Information');
    log.detail('User ID      :', chalk.yellow(USER_ID));
    log.detail('Username     :', chalk.yellow('@' + USER_USERNAME));
    log.detail('Display Name :', chalk.yellow(USER_DISPLAYNAME));
    console.log();

    const CHECK_INTERVAL = 30 * 1000;
    let stopRequested = false;

    const sigintHandler = () => {
        stopRequested = true;
        log.warn('Ctrl+C diterima, menghentikan automation...');
    };
    process.once('SIGINT', sigintHandler);

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
        if (line.trim().toLowerCase() === 'stop') {
            stopRequested = true;
            log.warn('Stop diterima, menghentikan automation...');
        }
    });

    const cleanup = () => {
        process.removeListener('SIGINT', sigintHandler);
        rl.close();
    };

    const interruptibleDelay = (ms) => {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (stopRequested) { clearInterval(interval); resolve(); }
            }, 200);
            setTimeout(() => { clearInterval(interval); resolve(); }, ms);
        });
    };

    log.time('info', 'Starting auto accept connections');
    while (!stopRequested) {
        const pendingIds = await roblox_friendsRequest(USER_COOKIE);
        if (pendingIds.length > 0) {
            for (const id of pendingIds) {
                if (stopRequested) break;
                const accepted = await roblox_acceptFriend(USER_COOKIE, id);
                if (accepted) {
                    log.time('ok', `Accepted friend: ${chalk.yellow(id)}`);
                } else {
                    log.time('err', `Failed to accept: ${chalk.yellow(id)}`);
                }
                await interruptibleDelay(1000);
            }
        }

        if (stopRequested) break;
        await interruptibleDelay(CHECK_INTERVAL);
    }

    cleanup();
    log.back('Back to menu...');
    await delay(2000);
    return menu_AcceptAllFriends();
}

// Menu: Remove All Friends
async function menu_RemoveAllFriends() {
    if (!USER_COOKIE) {
        log.info('Getting Roblox cookies...');
        USER_COOKIE = roblox_getCookie();
        if (!USER_COOKIE) {
            log.err('Roblox cookies not found');
            await delay(5000);
            return menu_main();
        }
        log.ok('Roblox cookies found');
    }

    if (!USER_ID || !USER_USERNAME || !USER_DISPLAYNAME) {
        const dataUser = roblox_getData();
        if (dataUser) {
            USER_USERNAME = dataUser.Username;
            USER_ID = dataUser.UserId;
            USER_DISPLAYNAME = dataUser.DisplayName;
        } else {
            log.err('Roblox user data not found');
            await delay(5000);
            return menu_main();
        }
    }

    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Remove All Connections');
    log.divider('Roblox Information');
    log.detail('User ID      :', chalk.yellow(USER_ID));
    log.detail('Username     :', chalk.yellow('@' + USER_USERNAME));
    log.detail('Display Name :', chalk.yellow(USER_DISPLAYNAME));
    console.log();

    log.time('info', 'Starting auto remove connections');
    const friends = await roblox_getFriends(USER_COOKIE, USER_ID);

    if (!friends || friends.length === 0) {
        log.time('warn', 'No connections found!');
        log.back('Back to main menu...');
        await delay(5000);
        return menu_main();
    }

    for (let i = 0; i < friends.length; i++) {
        const friend = friends[i];
        const removed = await roblox_removeFriend(USER_COOKIE, friend.id);
        const progress = chalk.gray(`[${i + 1}/${friends.length}]`);
        if (removed) {
            log.time('ok', `${progress} Removed: ${chalk.yellow(friend.id)} (@${friend.name})`);
        } else {
            log.time('err', `${progress} Failed : ${chalk.yellow(friend.id)} (@${friend.name})`);
        }
        await delay(1000);
    }

    log.back('Back to main menu...');
    await delay(2000);
    return menu_main();
}


// Menu: Rejoin 1
async function init_Rejoin1() {
    // Get Roblox Cookie
    log.info('Getting Roblox cookies...');
    USER_COOKIE = roblox_getCookie();
    if (USER_COOKIE) {
        log.ok('Roblox cookies founded');
    } else {
        log.err('Roblox cookies not found');
        await delay(3000);
        return menu_main();
    }

    // Get Roblox Data
    log.info('Getting Roblox user data...');
    const dataUser = roblox_getData();
    if (dataUser) {
        USER_USERNAME = dataUser.Username;
        USER_ID = dataUser.UserId;
        USER_DISPLAYNAME = dataUser.DisplayName;
        log.ok('Roblox user data founded');
    } else {
        log.err('Roblox user data not found');
        await delay(3000);
        return menu_main();
    }

    // Get private server
    log.info('Getting own private server...');
    MAP_PLACEID = "121864768012064";
    const privateServer = await roblox_privateServer(USER_COOKIE, USER_ID, MAP_PLACEID);
    if (privateServer) {
        PRIVATE_GAMEID = privateServer.gameId;
        PRIVATE_SERVERID = privateServer.vipServerId;
        PRIVATE_PLAYING = privateServer.playing;
        log.ok('Own private server founded');
    } else {
        log.err('Failed to get own private server');
        await delay(3000);
        return menu_main();
    }

    // Get private server details
    log.info('Getting private server details...');
    const privateServerDetails = await roblox_privateServerDetails(USER_COOKIE, PRIVATE_SERVERID);
    if (privateServerDetails) {
        PRIVATE_ROOMNAME = privateServerDetails.privateRoomName;
        MAP_GAMENAME = privateServerDetails.privateGameName;
        PRIVATE_SERVERLINK = privateServerDetails.privateLink;
        log.ok('Private server details founded');
    } else {
        log.err('Failed to get private server details');
        await delay(3000);
        return menu_main();
    }

    // Get presence user
    log.info('Getting user presence...');
    const presenceUser = await roblox_presence(USER_COOKIE, USER_ID);
    if (presenceUser) {
        USER_GAMEID = presenceUser.gameId;
        log.ok('User presence founded');
    } else {
        log.err('Failed to get user presence');
        await delay(3000);
        return menu_main();
    }

    // Goto Menu Rejoin
    await delay(1000);
    return menu_Rejoin1();
}

async function menu_Rejoin1() {
    while (true) {
        clearScreen();
        printHeader('PetrixBot PTPT-X8', 'Setting Rejoin Internal Server');

        log.divider('Roblox Information');
        log.detail('User ID        :', chalk.yellow(USER_ID));
        log.detail('Username       :', chalk.yellow('@' + USER_USERNAME));
        log.detail('Display Name   :', chalk.yellow(USER_DISPLAYNAME));
        log.detail('Status         :', USER_GAMEID ? chalk.green('Playing') : chalk.red('Not Playing'));
        log.detail('Game ID        :', USER_GAMEID ? chalk.yellow(USER_GAMEID) : chalk.red('-'));

        log.divider('Private Server');
        log.detail('Map            :', `${chalk.yellow(MAP_GAMENAME)} ${chalk.gray('(' + MAP_PLACEID + ')')}`);
        log.detail('Name           :', `${chalk.yellow(PRIVATE_ROOMNAME)} ${chalk.gray('(' + PRIVATE_SERVERID + ')')}`);
        log.detail('Players        :', chalk.yellow(PRIVATE_PLAYING + '/20'));
        log.detail('Server Game ID :', PRIVATE_GAMEID ? chalk.yellow(PRIVATE_GAMEID) : chalk.red('-'));
        log.detail('Server Link    :', chalk.yellow(PRIVATE_SERVERLINK));

        log.divider('Status Automation');
        log.detail('Rejoin         :', STATUS_REJOIN ? chalk.green('Enabled') : chalk.red('Disabled'));
        log.detail('Acc Connection :', STATUS_ACCEPT ? chalk.green('Enabled') : chalk.red('Disabled'));
        console.log();

        const { option } = await enquirer.prompt({
            type: "select",
            name: "option",
            message: "Choose Menu:",
            choices: [
                { name: STATUS_REJOIN ? '[Disable] Rejoin' : '[Enable] Rejoin', value: 'rejoin' },
                { name: STATUS_ACCEPT ? '[Disable] Acc Friend' : '[Enable] Acc Friend', value: 'accept' },
                { name: 'Start Automation', value: 'start' },
                { name: 'Back', value: 'back' }
            ],
            result(name) { return this.choices.find(c => c.name === name)?.value ?? name; }
        });

        const selectedValue1 = option;
        if (selectedValue1 === 'rejoin') STATUS_REJOIN = !STATUS_REJOIN;
        else if (selectedValue1 === 'accept') STATUS_ACCEPT = !STATUS_ACCEPT;
        else if (selectedValue1 === 'start') {
            log.ok('Starting automation...');
            await delay(3000);
            await start_Rejoin1();
        }
        else break;
    }

    log.back('Back to main menu...');
    await delay(1000);
    return menu_main();
}

async function start_Rejoin1() {
    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Automation Rejoin Internal Server');
    log.info('Ketik "stop" + Enter  ATAU  tekan Ctrl+C untuk berhenti\n');

    const CHECK_INTERVAL = 30 * 1000;
    const REJOIN_DELAY = 30 * 1000;
    const FAILED_DELAY = 5 * 1000;

    let stopRequested = false;

    // Stop via Ctrl+C
    const sigintHandler = () => {
        stopRequested = true;
        log.warn('Ctrl+C diterima, menghentikan automation...');
    };
    process.once('SIGINT', sigintHandler);

    // Stop via ketik "stop" + Enter
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
        if (line.trim().toLowerCase() === 'stop') {
            stopRequested = true;
            log.warn('Stop diterima, menghentikan automation...');
        }
    });

    const cleanup = () => {
        process.removeListener('SIGINT', sigintHandler);
        rl.close();
    };

    const interruptibleDelay = (ms) => {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (stopRequested) { clearInterval(interval); resolve(); }
            }, 200);
            setTimeout(() => { clearInterval(interval); resolve(); }, ms);
        });
    };

    let firstLaunch = true;
    let reason = 'First Launch';
    while (!stopRequested) {
        // Auto Accept Friend
        if (STATUS_ACCEPT) {
            const pendingIds = await roblox_friendsRequest(USER_COOKIE);
            if (pendingIds.length > 0) {
                for (const id of pendingIds) {
                    if (stopRequested) break;
                    const accepted = await roblox_acceptFriend(USER_COOKIE, id);
                    if (accepted) {
                        log.time('ok', `Accepted friend: ${chalk.yellow(id)}`);
                    } else {
                        log.time('err', `Failed to accept: ${chalk.yellow(id)}`);
                    }
                    await interruptibleDelay(1000);
                }
            }
        }

        // Checking stopRequested
        if (stopRequested) break;

        // Auto Rejoin
        if (STATUS_REJOIN) {
            if (firstLaunch || !PRIVATE_GAMEID) {
                log.time('warn', `${reason} — ${reason === 'First Launch' ? 'Joining' : 'Rejoining'}...`);
                const opened = roblox_open(PRIVATE_SERVERLINK);
                if (opened) {
                    log.time('ok', `Opened Roblox — waiting ${REJOIN_DELAY / 1000}s...`);
                    await interruptibleDelay(REJOIN_DELAY);
                    await delta_detectUI();
                } else {
                    log.time('err', `Failed to open Roblox — waiting ${FAILED_DELAY / 1000}s...`);
                    await interruptibleDelay(FAILED_DELAY);
                    continue;
                }

                const firstPresence = await roblox_presence(USER_COOKIE, USER_ID);
                if (!firstPresence || !firstPresence.gameId) {
                    log.time('err', 'Failed to detect gameId — retrying...');
                    await interruptibleDelay(FAILED_DELAY);
                    continue;
                }

                firstLaunch = false;
                PRIVATE_GAMEID = firstPresence.gameId;
                await interruptibleDelay(CHECK_INTERVAL);
                continue;
            }

            // Checking stopRequested
            if (stopRequested) break;

            const refreshed = await roblox_privateServer(USER_COOKIE, USER_ID, MAP_PLACEID);
            if (refreshed?.gameId) {
                PRIVATE_GAMEID = refreshed.gameId;
            }

            const presence = await roblox_presence(USER_COOKIE, USER_ID);
            if (!presence) {
                const PRESENCE_DELAY = refreshed?.gameId ? CHECK_INTERVAL : FAILED_DELAY;
                log.time('err', `Failed to get presence — retrying in ${PRESENCE_DELAY / 1000}s...`);
                await interruptibleDelay(PRESENCE_DELAY);
                continue;
            }

            const isInGame = presence.userPresenceType === 2;
            const isCorrectPlace = presence.rootPlaceId?.toString() === MAP_PLACEID?.toString();
            const isCorrectServer = presence.gameId === PRIVATE_GAMEID;

            if (!isInGame || !isCorrectPlace || !isCorrectServer) {
                PRIVATE_GAMEID = null;
                if (!isInGame) reason = 'Not in-game';
                else if (!isCorrectPlace) reason = 'Wrong game';
                else if (!isCorrectServer) reason = 'Wrong server instance';
                continue;
            }
        }

        await interruptibleDelay(CHECK_INTERVAL);
    }

    cleanup();
    log.back('Back to menu...');
    await delay(1000);
    return menu_Rejoin1();
}


// Menu: Rejoin 2
async function init_Rejoin2() {
    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Auto Rejoin External Server');
    log.info('Ketik "exit" untuk kembali ke menu utama.\n');

    // Get Roblox Cookie
    if (!USER_COOKIE) {
        log.info('Getting Roblox cookies...');
        USER_COOKIE = roblox_getCookie();
        if (USER_COOKIE) {
            log.ok('Roblox cookies founded');
        } else {
            log.err('Roblox cookies not found');
            await delay(5000);
            return menu_main();
        }
    }

    // Get Roblox Data
    if (!USER_ID) {
        log.info('Getting Roblox user data...');
        const dataUser = roblox_getData();
        if (dataUser) {
            USER_USERNAME = dataUser.Username;
            USER_ID = dataUser.UserId;
            USER_DISPLAYNAME = dataUser.DisplayName;
            log.ok('Roblox user data founded');
        } else {
            log.err('Roblox user data not found');
            await delay(5000);
            return menu_main();
        }
    }

    // Input link dari user
    const { inputLink } = await enquirer.prompt({
        type: 'input',
        name: 'inputLink',
        message: 'URL Private Server:',
        validate: value => {
            if (!value?.trim()) return '❌ URL cannot be empty';
            if (value.trim().toLowerCase() === 'exit') return true;
            if (!value.includes('roblox.com')) return '❌ URL must contain roblox.com';
            return true;
        }
    });

    if (!inputLink?.trim() || inputLink.trim().toLowerCase() === 'exit') {
        log.back('Back to main menu...');
        await delay(3000);
        return menu_main();
    }

    // Parse Link
    try {
        const urlObj = new URL(inputLink.trim());
        const gamesMatch = urlObj.pathname.match(/\/games\/(\d+)/);
        const linkCode = urlObj.searchParams.get('privateServerLinkCode');
        const shareCode = urlObj.searchParams.get('code');
        const shareType = urlObj.searchParams.get('type');

        if (gamesMatch && linkCode) {
            EXTERNAL_LINKCODE = linkCode;
            EXTERNAL_SERVERLINK = inputLink.trim();
        } else if (shareCode && shareType?.toLowerCase() === 'server') {
            EXTERNAL_LINKCODE = shareCode;
            EXTERNAL_SERVERLINK = inputLink.trim();
        } else {
            log.err('Invalid URL format.');
            await delay(5000);
            return menu_main();
        }
    } catch (err) {
        log.err('Invalid URL: ' + err.message);
        await delay(5000);
        return menu_main();
    }

    // Get presence user
    log.info('Getting user presence...');
    MAP_GAMENAME = "Fish It";
    MAP_PLACEID = "121864768012064";
    const presenceUser = await roblox_presence(USER_COOKIE, USER_ID);
    if (presenceUser) {
        USER_GAMEID = presenceUser.gameId;
        log.ok('User presence founded');
    } else {
        log.err('Failed to get user presence');
        await delay(3000);
        return menu_main();
    }

    await delay(1000);
    return menu_Rejoin2();
}

async function menu_Rejoin2() {
    while (true) {
        clearScreen();
        printHeader('PetrixBot PTPT-X8', 'Setting Rejoin External Server');

        log.divider('Roblox Information');
        log.detail('User ID        :', chalk.yellow(USER_ID));
        log.detail('Username       :', chalk.yellow('@' + USER_USERNAME));
        log.detail('Display Name   :', chalk.yellow(USER_DISPLAYNAME));
        log.detail('Status         :', USER_GAMEID ? chalk.green('Playing') : chalk.red('Not Playing'));

        log.divider('External Server');
        log.detail('Map            :', `${chalk.yellow(MAP_GAMENAME)} ${chalk.gray('(' + MAP_PLACEID + ')')}`);
        log.detail('Link Code      :', chalk.yellow(EXTERNAL_LINKCODE));
        log.detail('Server Link    :', chalk.yellow(EXTERNAL_SERVERLINK));

        log.divider('Status Automation');
        log.detail('Rejoin Server  :', STATUS_REJOIN ? chalk.green('Enabled') : chalk.red('Disabled'));
        log.detail('Acc Connection :', STATUS_ACCEPT ? chalk.green('Enabled') : chalk.red('Disabled'));
        console.log();

        const { option } = await enquirer.prompt({
            type: "select",
            name: "option",
            message: "Choose Menu:",
            choices: [
                { name: STATUS_REJOIN ? '[Disable] Rejoin' : '[Enable] Rejoin', value: 'rejoin' },
                { name: STATUS_ACCEPT ? '[Disable] Acc Friend' : '[Enable] Acc Friend', value: 'accept' },
                { name: 'Start Automation', value: 'start' },
                { name: 'Back', value: 'back' }
            ],
            result(name) { return this.choices.find(c => c.name === name)?.value ?? name; }
        });

        const selectedValue2 = option;
        if (selectedValue2 === 'rejoin') STATUS_REJOIN = !STATUS_REJOIN;
        else if (selectedValue2 === 'accept') STATUS_ACCEPT = !STATUS_ACCEPT;
        else if (selectedValue2 === 'start') {
            log.ok('Starting automation...');
            await delay(3000);
            await start_Rejoin2();
        }
        else break;
    }

    log.back('Back to main menu...');
    await delay(1000);
    return menu_main();
}

async function start_Rejoin2() {
    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Automation Rejoin External Server');
    log.info('Ketik "stop" + Enter  ATAU  tekan Ctrl+C untuk berhenti\n');

    const CHECK_INTERVAL = 30 * 1000;
    const REJOIN_DELAY = 30 * 1000;
    const FAILED_DELAY = 5 * 1000;

    let stopRequested = false;

    const sigintHandler = () => {
        stopRequested = true;
        log.warn('Ctrl+C diterima, menghentikan automation...');
    };
    process.once('SIGINT', sigintHandler);

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
        if (line.trim().toLowerCase() === 'stop') {
            stopRequested = true;
            log.warn('Stop diterima, menghentikan automation...');
        }
    });

    const cleanup = () => {
        process.removeListener('SIGINT', sigintHandler);
        rl.close();
    };

    const interruptibleDelay = (ms) => {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (stopRequested) { clearInterval(interval); resolve(); }
            }, 200);
            setTimeout(() => { clearInterval(interval); resolve(); }, ms);
        });
    };

    let reason = 'First Launch';
    while (!stopRequested) {
        // Auto Accept Friend
        if (STATUS_ACCEPT) {
            const pendingIds = await roblox_friendsRequest(USER_COOKIE);
            if (pendingIds.length > 0) {
                for (const id of pendingIds) {
                    if (stopRequested) break;
                    const accepted = await roblox_acceptFriend(USER_COOKIE, id);
                    if (accepted) {
                        log.time('ok', `Accepted friend: ${chalk.yellow(id)}`);
                    } else {
                        log.time('err', `Failed to accept: ${chalk.yellow(id)}`);
                    }
                    await interruptibleDelay(1000);
                }
            }
        }

        if (stopRequested) break;

        // Auto Rejoin External
        if (STATUS_REJOIN) {
            if (!EXTERNAL_GAMEID) {
                log.time('warn', `${reason} — ${reason === 'First Launch' ? 'Joining' : 'Rejoining'}...`);
                const opened = roblox_open(EXTERNAL_SERVERLINK);
                if (opened) {
                    log.time('ok', `Opened Roblox — waiting ${REJOIN_DELAY / 1000}s...`);
                    await interruptibleDelay(REJOIN_DELAY);
                    await delta_detectUI();
                } else {
                    log.time('err', `Failed to open Roblox — waiting ${FAILED_DELAY / 1000}s...`);
                    await interruptibleDelay(FAILED_DELAY);
                    continue;
                }

                const firstPresence = await roblox_presence(USER_COOKIE, USER_ID);
                if (!firstPresence || !firstPresence.gameId) {
                    log.time('err', 'Failed to detect gameId — retrying...');
                    await interruptibleDelay(FAILED_DELAY);
                    continue;
                }

                EXTERNAL_GAMEID = firstPresence.gameId;
                await interruptibleDelay(CHECK_INTERVAL);
                continue;
            }

            // Checking stopRequested
            if (stopRequested) break;

            const presence = await roblox_presence(USER_COOKIE, USER_ID);
            if (!presence) {
                log.time('err', `Failed to get presence — retrying in ${FAILED_DELAY / 1000}s...`);
                await interruptibleDelay(FAILED_DELAY);
                continue;
            }

            const isInGame = presence.userPresenceType === 2;
            const isCorrectPlace = presence.rootPlaceId?.toString() === MAP_PLACEID?.toString();
            const isCorrectServer = presence.gameId === EXTERNAL_GAMEID;

            if (!isInGame || !isCorrectPlace || !isCorrectServer) {
                EXTERNAL_GAMEID = null;
                if (!isInGame) reason = 'Not in-game';
                else if (!isCorrectPlace) reason = 'Wrong game';
                else if (!isCorrectServer) reason = 'Wrong server instance';
                continue;
            }
        }

        await interruptibleDelay(CHECK_INTERVAL);
    }

    cleanup();
    log.back('Back to menu...');
    await delay(1000);
    return start_Rejoin2();
}


// Menu: Main
async function menu_main() {
    const oldVersion = delta_currentVersion()
    const newVersion = await delta_newVersion()

    clearScreen();
    printHeader('PetrixBot PTPT-X8', 'Roblox Tools  ·  v1.4.0');

    log.divider('Roblox Delta Version');
    log.detail('Installed :', chalk.yellow(oldVersion));
    log.detail('Latest    :', chalk.yellow(newVersion));
    console.log();

    const { option } = await enquirer.prompt({
        type: "select",
        name: "option",
        message: "Choose Menu:",
        choices: [
            { name: 'Delta  - Install / Update', value: 'delta_update' },
            { name: 'Delta  - Add file autoexec', value: 'delta_autexec' },
            { name: 'Roblox - Login (via Inject Cookies)', value: 'login_cookie' },
            { name: 'Roblox - Accept all connections', value: 'accept_friends' },
            { name: 'Roblox - Remove all connections', value: 'remove_friends' },
            { name: 'Roblox - Auto Rejoin (another ps)', value: 'rejoin_2' },
            { name: 'Roblox - Auto Rejoin (own ps)', value: 'rejoin_1' },
            { name: 'Exit', value: 'exit' }
        ],
        result(name) { return this.choices.find(c => c.name === name)?.value ?? name; }
    });

    const selectedMain = option;
    if (selectedMain === 'delta_update') await menu_UpdateRobloxDelta();
    else if (selectedMain === 'delta_autexec') await menu_InjectAutoExec();
    else if (selectedMain === 'login_cookie') await menu_InjectCookie();
    else if (selectedMain === 'remove_friends') await menu_RemoveAllFriends();
    else if (selectedMain === 'accept_friends') await menu_AcceptAllFriends();
    else if (selectedMain === 'rejoin_1') await init_Rejoin1();
    else if (selectedMain === 'rejoin_2') await init_Rejoin2();
    else {
        log.back('Exiting...');
        process.exit(0);
    }
}

// Initialize Bot
(async function () {
    clearScreen();

    // Force landscape orientation
    execSync('settings put system user_rotation 1', { env: TERMUX_ENV });
    execSync('settings put system accelerometer_rotation 0', { env: TERMUX_ENV });

    // Checking status root
    log.info('Checking status rooting device...');
    const deviceRoot = checkRootDevice();
    if (deviceRoot) {
        log.ok('Device rooted!');
        await delay(1000);
        await menu_main();
    } else {
        log.err('Device not root! Please enable root first before use!');
        process.exit(0);
    }
})();