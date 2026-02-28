import { execSync, execFileSync } from 'child_process';
import { request } from 'undici';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

const TERMUX_ENV = {
    ...process.env,
    PATH: '/data/data/com.termux/files/usr/bin:/system/bin:/system/xbin'
};

if (process.getuid && process.getuid() !== 0) {
    try {
        execFileSync('su', ['-c', `${process.execPath} ${process.argv[1]}`],
            { stdio: 'inherit', env: TERMUX_ENV }
        );
    } catch { }
    process.exit(0);
}

// Global Variabels
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


// Packages
const packageName = 'com.roblox.client';
const packageActivity = 'com.roblox.client.ActivityProtocolLaunch';
const packageAction = 'android.intent.action.VIEW';


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


// Delta Version
function delta_currentVersion() {
    try {
        const installed = execSync(`pm list packages ${packageName}`, { encoding: 'utf8' }).trim();
        if (!installed.includes(packageName)) return 'Not installed';

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


// Roblox function LocalData
function roblox_getCookie() {
    const dbPath = '/data/data/com.roblox.client/app_webview/Default/Cookies';

    try {
        const result = execSync(
            `sqlite3 ${dbPath} "SELECT value FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com' LIMIT 1;"`
        ).toString().trim();
        return result || null;
    } catch (err) {
        return null;
    }
}

function roblox_setCookie(newCookie) {
    const dbPath = '/data/data/com.roblox.client/app_webview/Default/Cookies';

    try {
        execSync('am force-stop com.roblox.client');

        const escapedCookie = newCookie.replace(/'/g, "''");
        const now = (Date.now() * 1000).toString();

        const exists = execSync(
            `sqlite3 ${dbPath} "SELECT COUNT(*) FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com';"`
        ).toString().trim();

        if (exists === '1') {
            execSync(`sqlite3 ${dbPath} "UPDATE cookies SET value='${escapedCookie}', last_access_utc=${now} WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com';"`);
        } else {
            execSync(`sqlite3 ${dbPath} "INSERT INTO cookies (creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, last_access_utc, has_expires, is_persistent, priority, samesite, source_scheme, source_port, is_same_party) VALUES (${now}, '.roblox.com', '', '.ROBLOSECURITY', '${escapedCookie}', '', '/', 14362699149000000, 1, 1, ${now}, 1, 1, 1, -1, 2, 443, 0);"`);
        }

        const checkCookie = execSync(
            `sqlite3 ${dbPath} "SELECT value FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com' LIMIT 1;"`
        ).toString().trim();

        return checkCookie === newCookie;
    } catch (err) {
        console.log('Error:', err.message);
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
        execSync(`am start -n ${packageName}/${packageActivity} -a ${packageAction} -d "${PRIVATE_SERVERLINK}" --activity-clear-top`);
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


// Initializing Rejoin & Accept
async function init_RejoinAccept() {
    // Get Roblox Cookie
    console.log(chalk.gray('\n⏳ Getting Roblox cookies...'));
    USER_COOKIE = roblox_getCookie();
    if (USER_COOKIE) {
        console.log(chalk.green("✅ Roblox cookies founded"));
    } else {
        console.log(chalk.red("❌ Roblox cookies not found"));
        await delay(3000);
        return menu_main();
    }

    // Get Roblox Data
    console.log(chalk.gray('⏳ Getting Roblox user data...'));
    const dataUser = roblox_getData();
    if (dataUser) {
        USER_USERNAME = dataUser.Username;
        USER_ID = dataUser.UserId;
        USER_DISPLAYNAME = dataUser.DisplayName;
        console.log(chalk.green("✅ Roblox user data founded"));
    } else {
        console.log(chalk.red("❌ Roblox user data not found"));
        await delay(3000);
        return menu_main();
    }

    // Get private server
    console.log(chalk.gray('⏳ Getting own private server...'));
    MAP_PLACEID = "121864768012064"
    const privateServer = await roblox_privateServer(USER_COOKIE, USER_ID, MAP_PLACEID);
    if (privateServer) {
        PRIVATE_GAMEID = privateServer.gameId;
        PRIVATE_SERVERID = privateServer.vipServerId;
        PRIVATE_PLAYING = privateServer.playing;
        console.log(chalk.green("✅ Own private server founded"));
    } else {
        console.log(chalk.red("❌ Failed to get own private server"));
        await delay(3000);
        return menu_main();
    }

    // Get private server details
    console.log(chalk.gray('⏳ Getting private server details...'));
    const privateServerDetails = await roblox_privateServerDetails(USER_COOKIE, PRIVATE_SERVERID);
    if (privateServerDetails) {
        PRIVATE_ROOMNAME = privateServerDetails.privateRoomName;
        MAP_GAMENAME = privateServerDetails.privateGameName;
        PRIVATE_SERVERLINK = privateServerDetails.privateLink;
        console.log(chalk.green("✅ Private server details founded"));
    } else {
        console.log(chalk.red("❌ Failed to get private server details"));
        await delay(3000);
        return menu_main();
    }

    // Get presence user
    console.log(chalk.gray('⏳ Getting user presence...'));
    const presenceUser = await roblox_presence(USER_COOKIE, USER_ID);
    if (presenceUser) {
        USER_GAMEID = presenceUser.gameId;
        console.log(chalk.green("✅ User presence founded"));
    } else {
        console.log(chalk.red("❌ Failed to get user presence"));
        await delay(3000);
        return menu_main();
    }

    // Goto Menu Rejoin
    await delay(1000);
    return menu_RejoinAccept();
}

// Start Automation Rejoin & Accept
async function start_RejoinAccept() {
    console.clear();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 - Automation Rejoin & Accept Connection]"));
    console.log(chalk.gray('- Press ESC to stop and back to Main Menu\n'));

    const CHECK_INTERVAL = 60 * 1000;
    const REJOIN_DELAY = 15 * 1000;
    const FAILED_DELAY = 5 * 1000;

    let stopRequested = false;

    // Setup raw input untuk deteksi ESC
    const readline = await import('readline');
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    const escHandler = (str, key) => {
        if (key && key.name === 'escape') {
            stopRequested = true;
            console.log(chalk.gray('\n⏹️ Stop requested...'));
        }
    };
    process.stdin.on('keypress', escHandler);

    const interruptibleDelay = (ms) => {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (stopRequested) { clearInterval(interval); resolve(); }
            }, 200);
            setTimeout(() => { clearInterval(interval); resolve(); }, ms);
        });
    };

    while (!stopRequested) {
        // Auto Accept Friend
        if (STATUS_ACCEPT) {
            const pendingIds = await roblox_friendsRequest(USER_COOKIE);
            if (pendingIds.length > 0) {
                for (const id of pendingIds) {
                    if (stopRequested) break;
                    const accepted = await roblox_acceptFriend(USER_COOKIE, id);
                    if (accepted) {
                        console.log(chalk.green(`[${formatDate(Date.now())}] ✅ Accepted friend: ${id}`));
                    } else {
                        console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to accept: ${id}`));
                    }
                    await interruptibleDelay(1000);
                }
            }
        }

        // Checking stopRequested
        if (stopRequested) break;

        // Auto Rejoin
        if (STATUS_REJOIN) {
            const refreshed = await roblox_privateServer(USER_COOKIE, USER_ID, MAP_PLACEID);
            if (refreshed?.gameId) {
                PRIVATE_GAMEID = refreshed.gameId;
            } else {
                console.log(chalk.yellow(`[${formatDate(Date.now())}] ⏳ No players in private server — Joining...`));
                const opened = roblox_open(PRIVATE_SERVERLINK);
                if (opened) {
                    console.log(chalk.green(`[${formatDate(Date.now())}] ✅ Opened Roblox — waiting ${REJOIN_DELAY / 1000}s...`));
                    await interruptibleDelay(REJOIN_DELAY);
                } else {
                    console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to open Roblox — waiting ${FAILED_DELAY / 1000}s...`));
                    await interruptibleDelay(FAILED_DELAY);
                }
                continue;
            }

            // Checking stopRequested
            if (stopRequested) break;

            const presence = await roblox_presence(USER_COOKIE, USER_ID);
            if (!presence) {
                const PRESENCE_DELAY = refreshed?.gameId ? CHECK_INTERVAL : FAILED_DELAY;
                console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to get presence — retrying in ${PRESENCE_DELAY / 1000}s...`));
                await interruptibleDelay(PRESENCE_DELAY);
                continue;
            }

            const isInGame = presence.userPresenceType === 2;
            const isCorrectPlace = presence.rootPlaceId?.toString() === MAP_PLACEID?.toString();
            const isCorrectServer = presence.gameId === PRIVATE_GAMEID;

            if (!isInGame || !isCorrectPlace || !isCorrectServer) {
                let reason = '';
                if (!isInGame) reason = 'Not in-game';
                else if (!isCorrectPlace) reason = 'Wrong game';
                else if (!isCorrectServer) reason = 'Wrong server instance';

                console.log(chalk.yellow(`[${formatDate(Date.now())}] ⏳ ${reason} — Rejoining...`));

                const opened = roblox_open(PRIVATE_SERVERLINK);
                if (opened) {
                    console.log(chalk.green(`[${formatDate(Date.now())}] ✅ Opened Roblox — waiting ${REJOIN_DELAY / 1000}s...`));
                    await interruptibleDelay(REJOIN_DELAY);
                } else {
                    console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to open Roblox — waiting ${FAILED_DELAY / 1000}s...`));
                    await interruptibleDelay(FAILED_DELAY);
                    continue;
                }
            }
        }

        await interruptibleDelay(CHECK_INTERVAL);
    }

    process.stdin.removeListener('keypress', escHandler);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);

    console.log(chalk.gray('\nBack to main menu...'));
    await delay(1000);
    return menu_RejoinAccept();
}

// Menu: Update Roblox Delta
async function menu_UpdateRobloxDelta() {
    console.clear();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 - Updating Roblox Delta]"));

    try {
        console.log(chalk.gray('\n⏳ Getting Latest Roblox Delta...'));

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
        if (!latestApk) return console.log(chalk.red('❌ No APK found'));

        const fileName = latestApk.name;
        const match = fileName.match(/Delta-([\d.]+?)(?:-\d+)?\.apk/);
        const version = match ? match[1] : 'Unknown';
        const downloadUrl = `https://delta.filenetwork.vip/file/${fileName}`;

        //console.log(chalk.gray(`📦 Latest version : ${version}`));
        //console.log(chalk.gray(`📄 File           : ${fileName}`));

        const savePath = path.join('/data/data/com.termux/files/home/petrixbot/downloads', fileName);
        fs.mkdirSync(path.dirname(savePath), { recursive: true });

        console.log(chalk.gray(`📥 Downloading Roblox Delta ${version}...`));
        execSync(
            `wget \
            -q --show-progress \
            --header='User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' \
            --header='Referer: https://delta.filenetwork.vip/android.html' \
            --header='Accept: application/octet-stream,*/*' \
            --header='Accept-Language: en-US,en;q=0.9' \
            --header='Connection: keep-alive' \
            -O '${savePath}' '${downloadUrl}'`,
            { stdio: 'inherit', env: TERMUX_ENV }
        );

        // Step 3: Install
        console.log(chalk.gray(`🛠️ Installing ${fileName}...`));
        execSync(`pm install -r -g '${savePath}'`, { stdio: 'pipe', env: TERMUX_ENV });

        console.log(chalk.green(`✅ Success Installing Roblox Delta ${version}!`));
    } catch (err) {
        console.log(chalk.red('❌ Error: ' + err.message));
    }

    console.log(chalk.gray('\nBack to main menu...'));
    await delay(1000);
    return menu_main();
}

// Menu: Inject Cookie
async function menu_InjectCookie() {
    console.clear();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 - Roblox Login (Cookie)]"));
    console.log(chalk.gray("- Type 'exit' to back Main Menu."));
    console.log(chalk.gray('- Cookie must start with "_|WARNING:-DO-NOT-SHARE-THIS..."\n'));

    const cookie = await prompts({
        type: "text",
        name: "value",
        message: "Roblox Cookie?",
        validate: value => value.trim() === ''
            ? 'Cookie cannot be empty!'
            : !value.includes('_|WARNING') && value !== 'exit'
                ? 'Invalid cookie! Must start with "_|WARNING:-DO-NOT-SHARE-THIS..."'
                : true
    });

    if (!cookie.value || cookie.value === 'exit') {
        console.log(chalk.gray("\nBack to main menu..."));
        await delay(3000);
        return;
    };

    // Inject cookie
    const success = roblox_setCookie(cookie.value);
    if (success) {
        console.log(chalk.green('✅ Cookie injected successfully!'));
    } else {
        console.log(chalk.red('❌ Failed to inject cookie, try again.'));
    }

    console.log(chalk.gray("\nBack to main menu..."));
    await delay(1000);
    return menu_main();
}

// Menu: Inject AutoExec Delta
async function menu_InjectAutoExec() {
    const folderPath = '/storage/emulated/0/Delta/Autoexecute/';

    console.clear();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 - Inject AutoExec]"));
    console.log(chalk.gray("- Leave blank to use default link.\n"));

    const { linkFile } = await prompts({
        type: 'text',
        name: 'linkFile',
        message: 'Script Link?',
        initial: 'http://119.28.112.162:6666/webhook.lua'
    });

    const finalLink = linkFile?.trim() || 'http://119.28.112.162:6666/webhook.lua';
    const luaContent = `loadstring(game:HttpGet("${finalLink}"))()`;
    const filePath = path.join(folderPath, 'petrixbot.lua');

    try {
        fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(filePath, luaContent, 'utf8');
        console.log(chalk.green(`\n✅ AutoExec file created!`));
        console.log(chalk.gray(`📄 Path : ${filePath}`));
        console.log(chalk.gray(`🔗 Link : ${finalLink}`));
    } catch (err) {
        console.log(chalk.red('❌ Failed to create file: ' + err.message));
    }

    console.log(chalk.gray('\nBack to main menu...'));
    await delay(1000);
    return menu_main();
}

// Menu: Rejoin & Accept
async function menu_RejoinAccept() {
    while (true) {
        console.clear();
        console.log(chalk.inverse("[PTPT-X8 Tools - Setting Rejoin & Accept Connection]"));

        console.log(chalk.bold("\nRoblox Information"));
        console.log(`- User ID        : ${chalk.yellow(USER_ID)}`);
        console.log(`- Username       : ${chalk.yellow("@" + USER_USERNAME)}`);
        console.log(`- Display Name   : ${chalk.yellow(USER_DISPLAYNAME)}`);
        console.log(`- Status         : ${USER_GAMEID ? chalk.green("Playing") : chalk.red("Not Playing")}`);
        console.log(`- Game ID        : ${USER_GAMEID ? chalk.yellow(USER_GAMEID) : chalk.red("-")}`);

        console.log(chalk.bold("\nPrivate Server"));
        console.log(`- Map            : ${chalk.yellow(MAP_GAMENAME)} (${chalk.yellow(MAP_PLACEID)})`);
        console.log(`- Name           : ${chalk.yellow(PRIVATE_ROOMNAME)} (${chalk.yellow(PRIVATE_SERVERID)})`);
        console.log(`- Players        : ${chalk.yellow(PRIVATE_PLAYING + "/20")}`);
        console.log(`- Server Game ID : ${PRIVATE_GAMEID ? chalk.yellow(PRIVATE_GAMEID) : chalk.red("-")}`);
        console.log(`- Server Link    : ${chalk.yellow(PRIVATE_SERVERLINK)}`);

        console.log(chalk.bold("\nStatus Automation"));
        console.log(`- Rejoin         : ${STATUS_REJOIN ? chalk.green("Enabled") : chalk.red("Disabled")}`);
        console.log(`- Acc Connection : ${STATUS_ACCEPT ? chalk.green("Enabled") : chalk.red("Disabled")}`);
        console.log();

        const { option } = await prompts({
            type: "select",
            name: "option",
            message: "Choose Menu:",
            choices: [
                { title: STATUS_REJOIN ? '[Disable] Rejoin' : '[Enable] Rejoin', value: 'rejoin' },
                { title: STATUS_ACCEPT ? '[Disable] Acc Friend' : '[Enable] Acc Friend', value: 'accept' },
                { title: 'Start Automation', value: 'start' },
                { title: 'Back', value: 'back' }
            ],
            initial: 0
        });

        if (option === 'rejoin') STATUS_REJOIN = !STATUS_REJOIN;
        else if (option === 'accept') STATUS_ACCEPT = !STATUS_ACCEPT;
        else if (option === 'start') {
            console.log(chalk.green("Starting automation..."));
            await delay(3000);
            await start_RejoinAccept();
        }
        else break;
    }

    console.log(chalk.gray("\nBack to main menu..."));
    await delay(1000);
    return menu_main();
}

// Menu: Main
async function menu_main() {
    const oldVersion = delta_currentVersion()
    const newVersion = await delta_newVersion()

    console.clear();
    console.log(chalk.inverse("[PTPT-X8 Tools - By PetrixBot]"));

    console.log(chalk.bold("\nRoblox Delta Version"));
    console.log(`📱 Installed       : ${chalk.yellow(oldVersion)}`);
    console.log(`📱 Latest Official : ${chalk.yellow(newVersion)}\n`);

    const { option } = await prompts({
        type: "select",
        name: "option",
        message: "Choose Menu:",
        choices: [
            { title: 'Install / Update Roblox Delta', value: 'update' },
            { title: 'Login Roblox (via Cookie)', value: 'inject' },
            { title: 'Add File Autoexecute (via Loadstring)', value: 'exec' },
            { title: 'Auto Rejoin & Accept Friend', value: 'rejoin_accept' },
            { title: 'Exit', value: 'exit' }
        ],
        initial: 0
    });

    if (option === 'update') await menu_UpdateRobloxDelta();
    else if (option === 'inject') await menu_InjectCookie();
    else if (option === 'exec') await menu_InjectAutoExec();
    else if (option === 'rejoin_accept') await init_RejoinAccept();
    else {
        console.log(chalk.red("\nExiting..."));
        process.exit(0);
    }
}

// Initialize Bot
(async function () {
    console.clear();
    console.log(chalk.gray("⏳ Checking status rooting device..."));
    const deviceRoot = checkRootDevice();
    if (deviceRoot) {
        console.log(chalk.green("✅ Device rooted!"));
    } else {
        console.log(chalk.red("❌ Device not root! Please enable root first before use!"));
        process.exit(0);
    }

    // Goto Main Menu
    await delay(1000);
    await menu_main();
})();