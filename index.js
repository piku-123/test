const { spawn } = require("child_process");
const axios = require("axios");
const logger = require("./utils/log");

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const config = require('./config.json');

const app = express();
const port = process.env.PORT || 5000;

// ─── Password ───
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || "";

// ============== State ==============
let liveLogs = [];
let lastHeartbeat = 0;
let activeGroups = [];
let pendingActions = [];
let manuallyOff = false;

app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// ===================== AUTH =====================
function requireAuth(req, res, next) {
    if (!ADMIN_PASSWORD) return res.status(500).json({ error: "ADMIN_PASSWORD is not set." });
    const provided = req.headers['x-admin-password'] || req.body?.password || "";
    if (provided !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    next();
}

app.post('/api/login', (req, res) => {
    if (!ADMIN_PASSWORD) return res.status(500).json({ success: false, error: "ADMIN_PASSWORD is not set." });
    const { password } = req.body || {};
    if (password === ADMIN_PASSWORD) return res.json({ success: true });
    return res.status(401).json({ success: false, error: "Invalid password" });
});

// ===================== STATIC =====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '/index.html')));

// ===================== APPSTATE =====================
// MongoDB থেকে appstate পড়ার helper
async function getAppStateFromMongo() {
    try {
        const { connect: connectMongo, mongoose } = require('./includes/database');
        if (mongoose.connection.readyState !== 1) await connectMongo();
        const SystemConfig = mongoose.model('SystemConfig');
        const doc = await SystemConfig.findOne({}).lean();
        return (doc && doc.appState && doc.appState.length > 0) ? doc.appState : null;
    } catch (e) {
        logger("MongoDB appState read error: " + e.message, "[ AppState ]");
        return null;
    }
}

// MongoDB তে appstate save করার helper
async function saveAppStateToMongo(appStateData) {
    try {
        const { connect: connectMongo, mongoose } = require('./includes/database');
        if (mongoose.connection.readyState !== 1) await connectMongo();
        const SystemConfig = mongoose.model('SystemConfig');
        await SystemConfig.findOneAndUpdate(
            {},
            { $set: { appState: appStateData } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return true;
    } catch (e) {
        logger("MongoDB appState save error: " + e.message, "[ AppState ]");
        return false;
    }
}

app.get('/appstate', requireAuth, async (req, res) => {
    try {
        const data = await fse.readFile(path.join(__dirname, 'appstate.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch { res.status(500).json({ error: "Failed to read appstate.json" }); }
});

// AppState upload — file এ save করে + MongoDB তেও save করে
app.post('/appstate', requireAuth, async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return res.status(400).json({ error: "No data provided" });

        // Local file এ save
        await fse.writeFile(path.join(__dirname, 'appstate.json'), JSON.stringify(data, null, 4));

        // MongoDB তেও save (Render restart হলেও টিকে থাকবে)
        const mongoSaved = await saveAppStateToMongo(data);

        logger(`AppState uploaded & saved. MongoDB: ${mongoSaved ? 'OK' : 'FAILED'}`, "[ AppState ]");
        res.json({ success: true, mongoSaved });
    } catch (e) { res.status(500).json({ error: "Failed to write appstate: " + e.message }); }
});

// ===================== START BOT API =====================
// AppState upload এর পরে এই endpoint call করলে bot restart হয়
app.post('/api/start-bot', requireAuth, async (req, res) => {
    try {
        // appstate.json আছে কিনা চেক করো
        const appStatePath = path.join(__dirname, 'appstate.json');
        let hasAppState = false;
        try {
            const raw = fs.readFileSync(appStatePath, 'utf8');
            const parsed = JSON.parse(raw);
            hasAppState = Array.isArray(parsed) && parsed.length > 0;
        } catch {}

        // না থাকলে MongoDB থেকে নাও
        if (!hasAppState) {
            const mongoState = await getAppStateFromMongo();
            if (mongoState) {
                fs.writeFileSync(appStatePath, JSON.stringify(mongoState, null, 4), 'utf8');
                hasAppState = true;
                logger("AppState restored from MongoDB before start.", "[ AppState ]");
            }
        }

        if (!hasAppState) {
            return res.status(400).json({ success: false, error: "AppState নেই! আগে appstate upload করো।" });
        }

        manuallyOff = false;
        global.countRestart = 0;

        // আগের process kill করো
        if (botProcess && !botProcess.killed) {
            try { botProcess.kill(); } catch {}
            botProcess = null;
            await new Promise(r => setTimeout(r, 800));
        }

        startBot("Bot started via Start button from dashboard.");
        logger("Bot started via /api/start-bot", "[ Dashboard ]");
        res.json({ success: true, message: "Bot starting..." });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ===================== FB CREDENTIALS =====================
app.get('/api/fb-credentials', requireAuth, (req, res) => {
    try {
        const fcaPath = path.join(__dirname, 'fca-config.json');
        const fca = JSON.parse(fs.readFileSync(fcaPath, 'utf8'));
        res.json({
            email:        fca.credentials?.email || '',
            hasPassword:  !!(fca.credentials?.password),
            hasTwoFactor: !!(fca.credentials?.twofactor),
            autoLogin:    fca.autoLogin !== false
        });
    } catch (e) {
        res.status(500).json({ error: 'fca-config.json পড়া যাচ্ছে না: ' + e.message });
    }
});

app.post('/api/fb-credentials', requireAuth, (req, res) => {
    try {
        const { email, password, twofactor } = req.body || {};
        if (!email || !password) return res.status(400).json({ success: false, error: 'Email ও Password required' });

        const fcaPath = path.join(__dirname, 'fca-config.json');
        let fca = {};
        try { fca = JSON.parse(fs.readFileSync(fcaPath, 'utf8')); } catch {}

        if (!fca.credentials) fca.credentials = {};
        fca.credentials.email    = email.trim();
        fca.credentials.password = password;
        if (twofactor && twofactor.trim()) fca.credentials.twofactor = twofactor.trim();
        else delete fca.credentials.twofactor;
        fca.autoLogin = true;

        fs.writeFileSync(fcaPath, JSON.stringify(fca, null, 2), 'utf8');
        logger(`FB credentials updated for: ${email}`, "[ Dashboard ]");
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ===================== FB LOGIN NOW =====================
app.post('/api/fb-login-now', requireAuth, async (req, res) => {
    const { email, password, twofactor } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email ও Password দাও' });

    try {
        const login = require('@dongdev/fca-unofficial');
        logger(`FB login attempt for: ${email}`, '[ Dashboard ]');

        await new Promise((resolve, reject) => {
            login({ email, password, twoFactor: twofactor || undefined }, async (err, api) => {
                if (err) {
                    const msg = err instanceof Error ? err.message : JSON.stringify(err);
                    return reject(new Error(msg));
                }
                try {
                    const appState = api.getAppState();
                    const appStatePath = path.join(__dirname, 'appstate.json');
                    fs.writeFileSync(appStatePath, JSON.stringify(appState, null, 4), 'utf8');

                    // MongoDB তেও save করো
                    await saveAppStateToMongo(appState);

                    const fcaPath = path.join(__dirname, 'fca-config.json');
                    let fca = {};
                    try { fca = JSON.parse(fs.readFileSync(fcaPath, 'utf8')); } catch {}
                    if (!fca.credentials) fca.credentials = {};
                    fca.credentials.email    = email.trim();
                    fca.credentials.password = password;
                    if (twofactor) fca.credentials.twofactor = twofactor.trim();
                    fca.autoLogin = true;
                    fs.writeFileSync(fcaPath, JSON.stringify(fca, null, 2), 'utf8');

                    logger(`FB login success! ${appState.length} cookies saved to file + MongoDB.`, '[ Dashboard ]');
                    res.json({ success: true, cookieCount: appState.length });

                    setTimeout(() => {
                        manuallyOff = false;
                        global.countRestart = 0;
                        if (botProcess) { try { botProcess.kill(); } catch {} }
                        startBot('New appstate applied — bot restarting...');
                    }, 500);

                    resolve();
                } catch (saveErr) { reject(saveErr); }
            });
        });
    } catch (e) {
        logger(`FB login failed: ${e.message}`, '[ Dashboard ]');
        let userMsg = e.message;
        if (/wrong|incorrect|invalid.*password/i.test(userMsg)) userMsg = 'Password ভুল হয়েছে।';
        else if (/checkpoint|locked/i.test(userMsg)) userMsg = 'Account checkpoint এ আছে।';
        else if (/two.*factor|2fa/i.test(userMsg)) userMsg = '2FA code লাগবে।';
        else if (/network|timeout|ECONNRESET/i.test(userMsg)) userMsg = 'Network error। আবার চেষ্টা করো।';
        res.status(400).json({ success: false, error: userMsg });
    }
});

// ===================== CONFIG READ / WRITE =====================
app.get('/api/config', requireAuth, (req, res) => {
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
        res.json(cfg);
    } catch (e) { res.status(500).json({ error: 'Failed to read config.json' }); }
});

app.post('/api/config', requireAuth, (req, res) => {
    try {
        const cfgPath = path.join(__dirname, 'config.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        const body = req.body;

        if (body.BOTNAME    !== undefined) cfg.BOTNAME    = body.BOTNAME;
        if (body.PREFIX     !== undefined) cfg.PREFIX     = body.PREFIX;
        if (body.systemMode !== undefined) cfg.systemMode = body.systemMode;
        if (body.language   !== undefined) cfg.language   = body.language;
        if (body.autoCreateDB   !== undefined) cfg.autoCreateDB   = body.autoCreateDB;
        if (body.NOTIFICATION   !== undefined) cfg.NOTIFICATION   = body.NOTIFICATION;
        if (body.allowInbox     !== undefined) cfg.allowInbox     = body.allowInbox;
        if (body.autoClean      !== undefined) cfg.autoClean      = body.autoClean;
        if (Array.isArray(body.ADMINBOT))      cfg.ADMINBOT       = body.ADMINBOT;
        if (Array.isArray(body.mod))           cfg.mod            = body.mod;
        if (Array.isArray(body.commandDisabled)) cfg.commandDisabled = body.commandDisabled;
        if (Array.isArray(body.eventDisabled))   cfg.eventDisabled   = body.eventDisabled;

        if (body.DATABASE_MONGODB_URI !== undefined) {
            if (!cfg.DATABASE) cfg.DATABASE = {};
            cfg.DATABASE.MONGODB_URI = body.DATABASE_MONGODB_URI;
        }
        if (body.selfListen !== undefined) {
            if (!cfg.FCAOption) cfg.FCAOption = {};
            cfg.FCAOption.selfListen = body.selfListen;
            pendingActions.push({ type: 'set_selflisten', selfListen: body.selfListen, time: Date.now() });
        }

        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4), 'utf8');

        if (global.config) {
            for (const key of Object.keys(cfg)) global.config[key] = cfg[key];
        }
        try { fs.writeFileSync(cfgPath + '.temp', JSON.stringify(cfg, null, 4), 'utf8'); } catch {}

        pendingActions.push({ type: 'config_reload', config: cfg, time: Date.now() });
        if (body.PREFIX     !== undefined) pendingActions.push({ type: 'set_prefix',      prefix: body.PREFIX,     time: Date.now() });
        if (body.systemMode !== undefined) pendingActions.push({ type: 'set_system_mode', mode:   body.systemMode, time: Date.now() });
        if (body.ADMINBOT !== undefined || body.mod !== undefined) {
            pendingActions.push({ type: 'set_adminmod', ADMINBOT: cfg.ADMINBOT, mod: cfg.mod, time: Date.now() });
        }
        if (body.commandDisabled !== undefined) pendingActions.push({ type: 'toggle_command', commandDisabled: cfg.commandDisabled || [], time: Date.now() });
        if (body.eventDisabled   !== undefined) pendingActions.push({ type: 'toggle_event',   eventDisabled:   cfg.eventDisabled   || [], time: Date.now() });

        logger(`Config updated from dashboard.`, '[ Dashboard ]');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===================== LIVE LOGS =====================
app.post('/api/live-logs', (req, res) => {
    liveLogs.unshift(req.body);
    if (liveLogs.length > 100) liveLogs.pop();
    res.sendStatus(200);
});
app.get('/api/logs', (req, res) => res.json(liveLogs));

// ===================== HEARTBEAT / GROUPS =====================
app.post('/api/heartbeat', (req, res) => { lastHeartbeat = Date.now(); res.sendStatus(200); });

app.post('/api/groups-update', (req, res) => {
    if (Array.isArray(req.body?.groups)) activeGroups = req.body.groups;
    res.sendStatus(200);
});

app.get('/api/pending-actions', (req, res) => {
    const actions = pendingActions.splice(0, pendingActions.length);
    res.json(actions);
});

// ===================== SYSTEM STATS =====================
function getDiskInfoSync() {
    try {
        if (typeof fs.statfsSync === 'function') {
            const s = fs.statfsSync(__dirname);
            const total = Number(s.blocks) * Number(s.bsize);
            const free  = Number(s.bavail) * Number(s.bsize);
            const used  = total - free;
            return { total, used, free, percent: total ? +((used / total) * 100).toFixed(1) : 0, mount: '/' };
        }
    } catch {}
    return { total: 0, used: 0, free: 0, percent: 0, mount: '/' };
}

app.get('/api/system', (req, res) => {
    try {
        const totalMem = os.totalmem();
        const freeMem  = os.freemem();
        const usedMem  = totalMem - freeMem;
        res.json({
            ram: { total: totalMem, used: usedMem, free: freeMem, percent: totalMem ? +((usedMem / totalMem) * 100).toFixed(1) : 0 },
            disk: getDiskInfoSync(),
            uptime: os.uptime(),
            processUptime: process.uptime(),
            cpu: os.cpus()[0]?.model || 'Unknown',
            cores: os.cpus().length,
            loadavg: os.loadavg(),
            platform: `${os.type()} ${os.release()}`,
            arch: os.arch(),
            hostname: os.hostname()
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================== BOT STATS =====================
app.get('/api/bot-stats', (req, res) => {
    const alive = !!(botProcess && !botProcess.killed);
    const heartbeatFresh = (Date.now() - lastHeartbeat) < 45000;
    const connected = alive && heartbeatFresh && !manuallyOff;
    res.json({
        connected, manuallyOff, alive,
        status: connected ? 'Connected' : (manuallyOff ? 'Turned Off' : 'Disconnected'),
        lastHeartbeat,
        groups: activeGroups.length,
        activeGroups: activeGroups.length,
        restartCount: global.countRestart || 0,
        botUptime: connected && global.botStartTime ? Date.now() - global.botStartTime : 0
    });
});

// ===================== GROUPS LIST =====================
app.get('/api/groups', requireAuth, (req, res) => res.json(activeGroups));

app.post('/api/leave-group', requireAuth, (req, res) => {
    const { threadID } = req.body || {};
    if (!threadID) return res.status(400).json({ error: "threadID required" });
    pendingActions.push({ type: 'leave', threadID, time: Date.now() });
    activeGroups = activeGroups.filter(g => String(g.threadID) !== String(threadID));
    res.json({ success: true });
});

// ===================== POWER & RESTART =====================
app.post('/api/bot-power', requireAuth, (req, res) => {
    const { action } = req.body || {};
    if (action === 'off') {
        manuallyOff = true;
        global.countRestart = 5;
        if (botProcess) {
            pendingActions.push({ type: 'shutdown', time: Date.now() });
            setTimeout(() => { try { botProcess && botProcess.kill(); } catch {} }, 4000);
        }
        logger("Bot turned OFF from dashboard.", "[ Dashboard ]");
        return res.json({ success: true, manuallyOff: true });
    }
    if (action === 'on') {
        manuallyOff = false;
        global.countRestart = 0;
        const isDead = !botProcess || botProcess.killed || botProcess.exitCode !== null;
        if (isDead) {
            try { botProcess && botProcess.kill(); } catch {}
            botProcess = null;
            startBot("Bot turned ON from dashboard...");
        }
        logger("Bot turned ON from dashboard.", "[ Dashboard ]");
        return res.json({ success: true, manuallyOff: false, started: isDead });
    }
    return res.status(400).json({ error: "action must be 'on' or 'off'" });
});

app.post('/restart', requireAuth, (req, res) => {
    logger("Restart request received from web dashboard.", "[ Dashboard ]");
    manuallyOff = false;
    global.countRestart = 0;
    if (botProcess) {
        try { botProcess.kill(); } catch {}
        startBot("Bot is restarting from dashboard...");
    } else {
        startBot("Starting bot from dashboard...");
    }
    res.json({ success: true });
});

// ===================== START SERVER =====================
app.listen(port, '0.0.0.0', () => {
    logger(`Server is running on port ${port}...`, "[ Starting ]");
});

// ===================== BOT PROCESS =====================
global.countRestart = global.countRestart || 0;
let botProcess = null;

function startBot(message) {
    if (message) logger(message, "[ Starting ]");
    global.botStartTime = Date.now();

    botProcess = spawn("node", ["--trace-warnings", "Zeroex.js"], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true
    });

    botProcess.on("close", (codeExit) => {
        botProcess = null;
        if (manuallyOff) return;
        if (codeExit !== 0 && global.countRestart < 5) {
            global.countRestart += 1;
            logger(`Bot exited. Restarting... (${global.countRestart}/5)`, "[ Restarting ]");
            startBot();
        }
    });
}

// ===================== STARTUP: AppState MongoDB থেকে restore করো =====================
(async () => {
    const appStatePath = path.join(__dirname, 'appstate.json');
    let hasLocalAppState = false;

    try {
        const raw = fs.readFileSync(appStatePath, 'utf8');
        const parsed = JSON.parse(raw);
        hasLocalAppState = Array.isArray(parsed) && parsed.length > 0;
    } catch {}

    if (!hasLocalAppState) {
        logger("appstate.json নেই বা খালি — MongoDB থেকে restore করার চেষ্টা করছি...", "[ AppState ]");
        const mongoState = await getAppStateFromMongo();
        if (mongoState) {
            try {
                fs.writeFileSync(appStatePath, JSON.stringify(mongoState, null, 4), 'utf8');
                logger(`AppState MongoDB থেকে restore হয়েছে (${mongoState.length} cookies)।`, "[ AppState ]");
            } catch (e) {
                logger("AppState file লেখা যায়নি: " + e.message, "[ AppState ]");
            }
        } else {
            logger("MongoDB তেও AppState নেই। Dashboard থেকে upload করো।", "[ AppState ]");
        }
    }

    startBot();
})();
