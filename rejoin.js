import { execSync, execFileSync } from 'child_process';
import { request } from 'undici';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

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

let EXTERNAL_GAMEID = null;
let EXTERNAL_LINKCODE = null;
let EXTERNAL_SERVERLINK = null;


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

function clearScreen() {
    process.stdout.write('\x1bc');
}


// Delta Version
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
        execSync('su -c "am force-stop com.roblox.client"', { env: TERMUX_ENV });

        const escapedCookie = newCookie.replace(/'/g, "''");
        const now = (Date.now() * 1000).toString();

        const exists = execSync(
            `sqlite3 ${dbPath} "SELECT COUNT(*) FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com';"`,
            { encoding: 'utf8', env: TERMUX_ENV }
        ).toString().trim();

        if (exists === '1') {
            execSync(`sqlite3 ${dbPath} "UPDATE cookies SET value='${escapedCookie}', last_access_utc=${now} WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com';"`,
                { encoding: 'utf8', env: TERMUX_ENV });
        } else {
            execSync(`sqlite3 ${dbPath} "INSERT INTO cookies (creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, last_access_utc, has_expires, is_persistent, priority, samesite, source_scheme, source_port, is_same_party) VALUES (${now}, '.roblox.com', '', '.ROBLOSECURITY', '${escapedCookie}', '', '/', 14362699149000000, 1, 1, ${now}, 1, 1, 1, -1, 2, 443, 0);"`,
                { encoding: 'utf8', env: TERMUX_ENV });
        }

        const checkCookie = execSync(
            `sqlite3 ${dbPath} "SELECT value FROM cookies WHERE name='.ROBLOSECURITY' AND host_key='.roblox.com' LIMIT 1;"`,
            { encoding: 'utf8', env: TERMUX_ENV }
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
    console.log(chalk.inverse("[PetrixBot PTPT-X8 | Updating Roblox Delta]"));

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

        // Step 1: Undici download
        console.log(chalk.gray(`📥 Downloading ${fileName}...`));
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
                    console.log(chalk.green(`✅ Downloaded (${(fileSize / 1024 / 1024).toFixed(1)} MB)`));
                    downloadSuccess = true;
                }
            }
        } catch (_) { }

        // Step 2: Browser download
        if (!downloadSuccess) {
            execSync(`am start -a android.intent.action.VIEW -d "${downloadUrl}"`, { env: TERMUX_ENV });

            const browserDownloadPath = `/storage/emulated/0/Download/${fileName}`;
            let waited = 0;
            const maxWait = 5 * 60 * 1000; // 5 menit
            while (waited < maxWait) {
                waited += 1000;

                // Cek di folder petrixbot/downloads/
                if (fs.existsSync(savePath) && fs.statSync(savePath).size > 1024 * 1024) {
                    console.log(chalk.green(`✅ ${fileName} Downloaded (${(fs.statSync(savePath).size / 1024 / 1024).toFixed(1)} MB)`));
                    downloadSuccess = true;
                    break;
                }

                // Cek di folder Download browser
                if (fs.existsSync(browserDownloadPath) && fs.statSync(browserDownloadPath).size > 1024 * 1024) {
                    fs.copyFileSync(browserDownloadPath, savePath);
                    fs.unlinkSync(browserDownloadPath);
                    console.log(chalk.green(`✅ ${fileName} Downloaded (${(fs.statSync(savePath).size / 1024 / 1024).toFixed(1)} MB)`));
                    downloadSuccess = true;
                    break;
                }

                process.stdout.write(chalk.gray(`\r⏳ Waiting for the file download to complete... ${Math.floor(waited / 1000)}s`));
                await delay(1000);
            }

            if (!downloadSuccess) throw new Error('Timeout: file not found after 5 minutes');
        }

        // Step 3: Install
        console.log(chalk.gray(`🛠️ Installing ${fileName}...`));
        execSync(`pm install -r -g '${savePath}'`, { stdio: 'pipe', env: TERMUX_ENV });

        console.log(chalk.green(`✅ Success Installing Roblox Delta ${version}!`));
    } catch (err) {
        console.log(chalk.red('❌ Error: ' + err.message));
    }

    console.log(chalk.gray('\nBack to main menu...'));
    await delay(2000);
    return menu_main();
}

// Menu: Inject AutoExec Delta
async function menu_InjectAutoExec() {
    const folderPath = '/storage/emulated/0/Delta/Autoexecute/';

    clearScreen();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 | Add autoexecute Roblox Delta]"));
    console.log(chalk.gray("- Leave blank to use default link.\n"));

    const { linkFile } = await prompts({
        type: 'text',
        name: 'linkFile',
        message: 'Script Link?',
        initial: 'http://ezweystock.petrix.id/priv8/webhook'
    });

    const finalLink = linkFile?.trim() || 'http://ezweystock.petrix.id/priv8/webhook';
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
    await delay(2000);
    return menu_main();
}

// Menu: Inject Cookie
async function menu_InjectCookie() {
    clearScreen();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 | Roblox Login - Inject Cookie]"));
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
        await delay(2000);
        return menu_main();
    };

    // Inject cookie
    const success = roblox_setCookie(cookie.value);
    if (success) {
        console.log(chalk.green('✅ Cookie injected successfully!'));
    } else {
        console.log(chalk.red('❌ Failed to inject cookie, try again.'));
        process.exit(0);
    }

    console.log(chalk.gray("\nBack to main menu..."));
    await delay(2000);
    return menu_main();
}


// Menu: Accept All Friends
async function menu_AcceptAllFriends() {
    if (!USER_COOKIE) {
        console.log(chalk.gray('\n⏳ Getting Roblox cookies...'));
        USER_COOKIE = roblox_getCookie();
        if (!USER_COOKIE) {
            console.log(chalk.red('❌ Roblox cookies not found'));
            await delay(5000);
            return menu_main();
        }
        console.log(chalk.green('✅ Roblox cookies found'));
    }

    if (!USER_ID || !USER_USERNAME || !USER_DISPLAYNAME) {
        console.log(chalk.gray('⏳ Getting Roblox user data...'));
        const dataUser = roblox_getData();
        if (dataUser) {
            USER_USERNAME = dataUser.Username;
            USER_ID = dataUser.UserId;
            USER_DISPLAYNAME = dataUser.DisplayName;
            console.log(chalk.green("✅ Roblox user data founded"));
        } else {
            console.log(chalk.red('❌ Roblox user data not found'));
            await delay(5000);
            return menu_main();
        }
    }

    clearScreen();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 | Accept All Connections]"));
    console.log(chalk.gray('- Ketik "stop" + Enter  ATAU  tekan Ctrl+C untuk berhenti\n'));
    console.log(chalk.bold("\nRoblox Information"));
    console.log(`- User ID      : ${chalk.yellow(USER_ID)}`);
    console.log(`- Username     : ${chalk.yellow("@" + USER_USERNAME)}`);
    console.log(`- Display Name : ${chalk.yellow(USER_DISPLAYNAME)}`);

    const CHECK_INTERVAL = 30 * 1000;
    let stopRequested = false;

    const sigintHandler = () => {
        stopRequested = true;
        console.log(chalk.gray('\n⏹️ Ctrl+C diterima, menghentikan automation...'));
    };
    process.once('SIGINT', sigintHandler);

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
        if (line.trim().toLowerCase() === 'stop') {
            stopRequested = true;
            console.log(chalk.gray('\n⏹️ Stop diterima, menghentikan automation...'));
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

    console.log(chalk.gray(`\n[${formatDate(Date.now())}] 🔄 Starting auto accept connections`));
    while (!stopRequested) {
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

        if (stopRequested) break;
        await interruptibleDelay(CHECK_INTERVAL);
    }

    cleanup();
    console.log(chalk.gray('\nBack to menu...'));
    await delay(2000);
    return menu_AcceptAllFriends();
}

// Menu: Remove All Friends
async function menu_RemoveAllFriends() {
    if (!USER_COOKIE) {
        console.log(chalk.gray('\n⏳ Getting Roblox cookies...'));
        USER_COOKIE = roblox_getCookie();
        if (!USER_COOKIE) {
            console.log(chalk.red('❌ Roblox cookies not found'));
            await delay(5000);
            return menu_main();
        }
        console.log(chalk.green('✅ Roblox cookies found'));
    }

    if (!USER_ID || !USER_USERNAME || !USER_DISPLAYNAME) {
        const dataUser = roblox_getData();
        if (dataUser) {
            USER_USERNAME = dataUser.Username;
            USER_ID = dataUser.UserId;
            USER_DISPLAYNAME = dataUser.DisplayName;
        } else {
            console.log(chalk.red('❌ Roblox user data not found'));
            await delay(5000);
            return menu_main();
        }
    }

    clearScreen();
    console.log(chalk.inverse('[PetrixBot PTPT-X8 | Remove All Connections]'));
    console.log(chalk.bold('\nRoblox Information'));
    console.log(`- User ID      : ${chalk.yellow(USER_ID)}`);
    console.log(`- Username     : ${chalk.yellow('@' + USER_USERNAME)}`);
    console.log(`- Display Name : ${chalk.yellow(USER_DISPLAYNAME)}\n`);

    console.log(chalk.gray(`\n[${formatDate(Date.now())}] 🔄 Starting auto remove connections\n`));
    const friends = await roblox_getFriends(USER_COOKIE, USER_ID);

    if (!friends || friends.length === 0) {
        console.log(chalk.yellow(`\n[${formatDate(Date.now())}] ⚠️ No connections found!`));
        console.log(chalk.gray('\nBack to main menu...'));
        await delay(5000);
        return menu_main();
    }

    for (let i = 0; i < friends.length; i++) {
        const friend = friends[i];
        const removed = await roblox_removeFriend(USER_COOKIE, friend.id);
        if (removed) {
            console.log(chalk.green(`[${i + 1}/${friends.length}] ✅ Removed: ${friend.id} (@${friend.name})`));
        } else {
            console.log(chalk.red(`[${i + 1}/${friends.length}] ❌ Failed : ${friend.id} (@${friend.name})`));
        }
        await delay(1000);
    }

    console.log(chalk.gray('\nBack to main menu...'));
    await delay(2000);
    return menu_main();
}


// Menu: Rejoin 1
async function init_Rejoin1() {
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
    MAP_PLACEID = "121864768012064";
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
    return menu_Rejoin1();
}

async function menu_Rejoin1() {
    while (true) {
        clearScreen();
        console.log(chalk.inverse("[PetrixBot PTPT-X8 | Setting Rejoin Internal Server]"));

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
            await start_Rejoin1();
        }
        else break;
    }

    console.log(chalk.gray("\nBack to main menu..."));
    await delay(1000);
    return menu_main();
}

async function start_Rejoin1() {
    clearScreen();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 | Automation Rejoin Internal Server]"));
    console.log(chalk.gray('- Ketik "stop" + Enter  ATAU  tekan Ctrl+C untuk berhenti\n'));

    const CHECK_INTERVAL = 30 * 1000;
    const REJOIN_DELAY = 30 * 1000;
    const FAILED_DELAY = 5 * 1000;

    let stopRequested = false;

    // Stop via Ctrl+C
    const sigintHandler = () => {
        stopRequested = true;
        console.log(chalk.gray('\n⏹️ Ctrl+C diterima, menghentikan automation...'));
    };
    process.once('SIGINT', sigintHandler);

    // Stop via ketik "stop" + Enter
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
        if (line.trim().toLowerCase() === 'stop') {
            stopRequested = true;
            console.log(chalk.gray('\n⏹️ Stop diterima, menghentikan automation...'));
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

    cleanup();
    console.log(chalk.gray('\nBack to main menu...'));
    await delay(1000);
    return menu_Rejoin1();
}


// Menu: Rejoin 2
async function init_Rejoin2() {
    clearScreen();
    console.log(chalk.inverse("[PTPT-X8 Tools - Auto Rejoin External Server]"));

    // Get Roblox Cookie
    if (!USER_COOKIE) {
        console.log(chalk.gray('\n⏳ Getting Roblox cookies...'));
        USER_COOKIE = roblox_getCookie();
        if (USER_COOKIE) {
            console.log(chalk.green("✅ Roblox cookies founded"));
        } else {
            console.log(chalk.red("❌ Roblox cookies not found"));
            await delay(5000);
            return menu_main();
        }
    }

    // Get Roblox Data
    if (!USER_ID) {
        console.log(chalk.gray('⏳ Getting Roblox user data...'));
        const dataUser = roblox_getData();
        if (dataUser) {
            USER_USERNAME = dataUser.Username;
            USER_ID = dataUser.UserId;
            USER_DISPLAYNAME = dataUser.DisplayName;
            console.log(chalk.green("✅ Roblox user data founded"));
        } else {
            console.log(chalk.red("❌ Roblox user data not found"));
            await delay(5000);
            return menu_main();
        }
    }

    // Input link dari user
    const { inputLink } = await prompts({
        type: 'text',
        name: 'inputLink',
        message: 'URL Private Server:',
        validate: value => {
            if (!value?.trim()) return '❌ URL cannot be empty';
            if (!value.includes('roblox.com')) return '❌ URL must contain roblox.com';
            if (value.trim().toLowerCase() === 'exit') return true;
            return true;
        }
    });

    if (!inputLink?.trim() || inputLink.trim().toLowerCase() === 'exit') {
        console.log(chalk.gray('\nBack to main menu...'));
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
            // Format: /games/PLACEID?privateServerLinkCode=XXXX
            EXTERNAL_LINKCODE = linkCode;
            EXTERNAL_SERVERLINK = inputLink.trim();
        } else if (shareCode && shareType?.toLowerCase() === 'server') {
            // Format: /share?code=XXXX&type=Server
            EXTERNAL_LINKCODE = shareCode;
            EXTERNAL_SERVERLINK = inputLink.trim();
        } else {
            console.log(chalk.red('❌ Invalid URL format.'));
            await delay(5000);
            return menu_main();
        }
    } catch (err) {
        console.log(chalk.red('❌ Invalid URL: ' + err.message));
        await delay(5000);
        return menu_main();
    }

    // Get presence user
    console.log(chalk.gray('⏳ Getting user presence...'));
    MAP_GAMENAME = "Fish It";
    MAP_PLACEID = "121864768012064";
    const presenceUser = await roblox_presence(USER_COOKIE, USER_ID);
    if (presenceUser) {
        USER_GAMEID = presenceUser.gameId;
        console.log(chalk.green("✅ User presence founded"));
    } else {
        console.log(chalk.red("❌ Failed to get user presence"));
        await delay(3000);
        return menu_main();
    }

    await delay(1000);
    return menu_Rejoin2();
}

async function menu_Rejoin2() {
    while (true) {
        clearScreen();
        console.log(chalk.inverse("[PetrixBot PTPT-X8 | Setting Rejoin External Server]"));

        console.log(chalk.bold("\nRoblox Information"));
        console.log(`- User ID        : ${chalk.yellow(USER_ID)}`);
        console.log(`- Username       : ${chalk.yellow("@" + USER_USERNAME)}`);
        console.log(`- Display Name   : ${chalk.yellow(USER_DISPLAYNAME)}`);
        console.log(`- Status         : ${USER_GAMEID ? chalk.green("Playing") : chalk.red("Not Playing")}`);

        console.log(chalk.bold("\nExternal Server"));
        console.log(`- Map            : ${chalk.yellow(MAP_GAMENAME)} (${chalk.yellow(MAP_PLACEID)})`);
        console.log(`- Link Code      : ${chalk.yellow(EXTERNAL_LINKCODE)}`);
        console.log(`- Server Link    : ${chalk.yellow(EXTERNAL_SERVERLINK)}`);

        console.log(chalk.bold("\nStatus Automation"));
        console.log(`- Rejoin Server  : ${STATUS_REJOIN ? chalk.green("Enabled") : chalk.red("Disabled")}`);
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
            await start_Rejoin2();
        }
        else break;
    }

    console.log(chalk.gray("\nBack to main menu..."));
    await delay(1000);
    return menu_main();
}

async function start_Rejoin2() {
    clearScreen();
    console.log(chalk.inverse("[PetrixBot PTPT-X8 | Automation Rejoin External Server]"));
    console.log(chalk.gray('- Ketik "stop" + Enter  ATAU  tekan Ctrl+C untuk berhenti\n'));

    const CHECK_INTERVAL = 30 * 1000;
    const REJOIN_DELAY = 30 * 1000;
    const FAILED_DELAY = 5 * 1000;

    let stopRequested = false;

    const sigintHandler = () => {
        stopRequested = true;
        console.log(chalk.gray('\n⏹️ Ctrl+C diterima, menghentikan automation...'));
    };
    process.once('SIGINT', sigintHandler);

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
        if (line.trim().toLowerCase() === 'stop') {
            stopRequested = true;
            console.log(chalk.gray('\n⏹️ Stop diterima, menghentikan automation...'));
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

        if (stopRequested) break;

        // Auto Rejoin External
        if (STATUS_REJOIN) {
            if (!EXTERNAL_GAMEID) {
                console.log(chalk.yellow(`[${formatDate(Date.now())}] ⏳ First Launch — Joining...`));
                const opened = roblox_open(EXTERNAL_SERVERLINK);
                if (opened) {
                    console.log(chalk.green(`[${formatDate(Date.now())}] ✅ Opened Roblox — waiting ${REJOIN_DELAY / 1000}s...`));
                    await interruptibleDelay(REJOIN_DELAY);
                } else {
                    console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to open Roblox — waiting ${FAILED_DELAY / 1000}s...`));
                    await interruptibleDelay(FAILED_DELAY);
                    continue;
                }

                const firstPresence = await roblox_presence(USER_COOKIE, USER_ID);
                if (!firstPresence || !firstPresence.gameId) {
                    console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to detect gameId — retrying...`));
                    await interruptibleDelay(FAILED_DELAY);
                    continue;
                }

                EXTERNAL_GAMEID = firstPresence.gameId;
                await interruptibleDelay(3000);
            }

            // Checking stopRequested
            if (stopRequested) break;

            const presence = await roblox_presence(USER_COOKIE, USER_ID);
            if (!presence) {
                console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to get presence — retrying in ${FAILED_DELAY / 1000}s...`));
                await interruptibleDelay(FAILED_DELAY);
                continue;
            }

            const isInGame = presence.userPresenceType === 2;
            const isCorrectPlace = presence.rootPlaceId?.toString() === MAP_PLACEID?.toString();
            const isCorrectServer = presence.gameId === EXTERNAL_GAMEID;

            if (!isInGame || !isCorrectPlace || !isCorrectServer) {
                EXTERNAL_GAMEID = null;
                let reason = '';
                if (!isInGame) reason = 'Not in-game';
                else if (!isCorrectPlace) reason = 'Wrong game';
                else if (!isCorrectServer) reason = 'Wrong server instance';
                console.log(chalk.yellow(`[${formatDate(Date.now())}] ⏳ ${reason} — Rejoining...`));

                const opened = roblox_open(EXTERNAL_SERVERLINK);
                if (opened) {
                    console.log(chalk.green(`[${formatDate(Date.now())}] ✅ Opened Roblox — waiting ${REJOIN_DELAY / 1000}s...`));
                    await interruptibleDelay(REJOIN_DELAY);
                } else {
                    console.log(chalk.red(`[${formatDate(Date.now())}] ❌ Failed to open Roblox — waiting ${FAILED_DELAY / 1000}s...`));
                    await interruptibleDelay(FAILED_DELAY);
                }
                continue;
            }
        }

        await interruptibleDelay(CHECK_INTERVAL);
    }

    cleanup();
    console.log(chalk.gray('\nBack to menu...'));
    await delay(1000);
    return start_Rejoin2();
}


// Menu: Main
async function menu_main() {
    const oldVersion = delta_currentVersion()
    const newVersion = await delta_newVersion()

    clearScreen();
    console.log(chalk.inverse("[PTPT-X8 Tools - By PetrixBot]"));

    console.log(chalk.bold("\nRoblox Delta Version"));
    console.log(`📱 Version Installed : ${chalk.yellow(oldVersion)}`);
    console.log(`📱 Version Latest    : ${chalk.yellow(newVersion)}\n`);

    const { option } = await prompts({
        type: "select",
        name: "option",
        message: "Choose Menu:",
        choices: [
            { title: 'Delta  - Install / Update', value: 'delta_update' },
            { title: 'Delta  - Add file autoexec', value: 'delta_autexec' },
            { title: 'Roblox - Login (via Inject Cookies)', value: 'login_cookie' },
            { title: 'Roblox - Accept all connections', value: 'accept_friends' },
            { title: 'Roblox - Remove all connections', value: 'remove_friends' },
            { title: 'Roblox - Auto Rejoin (another ps)', value: 'rejoin_2' },
            { title: 'Roblox - Auto Rejoin (own ps)', value: 'rejoin_1' },
            { title: 'Exit', value: 'exit' }
        ],
        initial: 0
    });

    if (option === 'delta_update') await menu_UpdateRobloxDelta();
    else if (option === 'delta_autexec') await menu_InjectAutoExec();
    else if (option === 'login_cookie') await menu_InjectCookie();
    else if (option === 'remove_friends') await menu_RemoveAllFriends();
    else if (option === 'accept_friends') await menu_AcceptAllFriends();
    else if (option === 'rejoin_1') await init_Rejoin1();
    else if (option === 'rejoin_2') await init_Rejoin2();
    else {
        console.log(chalk.red("\nExiting..."));
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
    console.log(chalk.gray("⏳ Checking status rooting device..."));
    const deviceRoot = checkRootDevice();
    if (deviceRoot) {
        console.log(chalk.green("✅ Device rooted!"));
        await delay(1000);
        await menu_main();
    } else {
        console.log(chalk.red("❌ Device not root! Please enable root first before use!"));
        process.exit(0);
    }
})();