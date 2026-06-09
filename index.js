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

// ─── Password: env থেকে নাও, না থাকলে config.json থেকে ───
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
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ error: "ADMIN_PASSWORD is not set." });
    }
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
app.get('/appstate', requireAuth, async (req, res) => {
    try {
        const data = await fse.readFile(path.join(__dirname, 'appstate.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch { res.status(500).json({ error: "Failed to read appstate.json" }); }
});

app.post('/appstate', requireAuth, async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return res.status(400).json({ error: "No data provided" });
        await fse.writeFile(path.join(__dirname, 'appstate.json'), JSON.stringify(data, null, 4));
        res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to write appstate.json" }); }
});

// ===================== FB CREDENTIALS (fca-config.json) =====================

// GET — masked হয়ে দেখাবে, password কখনো expose হবে না
app.get('/api/fb-credentials', requireAuth, (req, res) => {
    try {
        const fcaPath = path.join(__dirname, 'fca-config.json');
        const fca = JSON.parse(fs.readFileSync(fcaPath, 'utf8'));
        res.json({
            email:       fca.credentials?.email || '',
            hasPassword: !!(fca.credentials?.password),
            hasTwoFactor:!!(fca.credentials?.twofactor),
            autoLogin:   fca.autoLogin !== false
        });
    } catch (e) {
        res.status(500).json({ error: 'fca-config.json পড়া যাচ্ছে না: ' + e.message });
    }
});

// POST — credentials save করবে, তারপর bot restart করলে FCA auto-login করবে
// Login সফল হলে FCA নিজেই appstate.json generate করে — cookie auto-ready হয়
app.post('/api/fb-credentials', requireAuth, (req, res) => {
    try {
        const { email, password, twofactor } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email ও Password required' });
        }

        const fcaPath = path.join(__dirname, 'fca-config.json');
        let fca = {};
        try { fca = JSON.parse(fs.readFileSync(fcaPath, 'utf8')); } catch {}

        // Credentials update করো
        if (!fca.credentials) fca.credentials = {};
        fca.credentials.email    = email.trim();
        fca.credentials.password = password;
        if (twofactor && twofactor.trim()) {
            fca.credentials.twofactor = twofactor.trim();
        } else {
            delete fca.credentials.twofactor;
        }

        // autoLogin ON রাখো — এটা না থাকলে FCA credentials ব্যবহার করবে না
        fca.autoLogin = true;

        fs.writeFileSync(fcaPath, JSON.stringify(fca, null, 2), 'utf8');

        logger(`FB credentials updated for: ${email}`, "[ Dashboard ]");
        res.json({ success: true });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ===================== FB LOGIN NOW (Server-side real login) =====================
// Email/password নিয়ে server থেকে FCA দিয়ে real Facebook login করে
// Cookie বের করে appstate.json এ save করে → bot auto-restart হয়
app.post('/api/fb-login-now', requireAuth, async (req, res) => {
    const { email, password, twofactor } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email ও Password দাও' });
    }

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
                    // Cookie বের করো
                    const appState = api.getAppState();
                    const appStatePath = path.join(__dirname, 'appstate.json');

                    // appstate.json এ save করো
                    fs.writeFileSync(appStatePath, JSON.stringify(appState, null, 4), 'utf8');

                    // fca-config.json এও credentials save করো (future restart এর জন্য)
                    const fcaPath = path.join(__dirname, 'fca-config.json');
                    let fca = {};
                    try { fca = JSON.parse(fs.readFileSync(fcaPath, 'utf8')); } catch {}
                    if (!fca.credentials) fca.credentials = {};
                    fca.credentials.email    = email.trim();
                    fca.credentials.password = password;
                    if (twofactor) fca.credentials.twofactor = twofactor.trim();
                    fca.autoLogin = true;
                    fs.writeFileSync(fcaPath, JSON.stringify(fca, null, 2), 'utf8');

                    logger(`FB login success! ${appState.length} cookies saved.`, '[ Dashboard ]');

                    res.json({ success: true, cookieCount: appState.length });

                    // Bot restart করো নতুন appstate দিয়ে
                    setTimeout(() => {
                        manuallyOff = false;
                        global.countRestart = 0;
                        if (botProcess) { try { botProcess.kill(); } catch {} }
                        startBot('New appstate applied — bot restarting...');
                    }, 500);

                    resolve();
                } catch (saveErr) {
                    reject(saveErr);
                }
            });
        });

    } catch (e) {
        logger(`FB login failed: ${e.message}`, '[ Dashboard ]');
        // Error message বাংলায় বুঝিয়ে দাও
        let userMsg = e.message;
        if (/wrong|incorrect|invalid.*password/i.test(userMsg)) userMsg = 'Password ভুল হয়েছে।';
        else if (/checkpoint|locked/i.test(userMsg)) userMsg = 'Account checkpoint এ আছে। Facebook app থেকে verify করো।';
        else if (/two.*factor|2fa/i.test(userMsg)) userMsg = '2FA code লাগবে। Secret key দাও।';
        else if (/network|timeout|ECONNRESET/i.test(userMsg)) userMsg = 'Network error। আবার চেষ্টা করো।';

        res.status(400).json({ success: false, error: userMsg });
    }
});

// ===================== CONFIG READ / WRITE =====================
app.get('/api/config', requireAuth, (req, res) => {
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
        res.json(cfg);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read config.json' });
    }
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
        if (body.autoCreateDB  !== undefined) cfg.autoCreateDB  = body.autoCreateDB;
        if (body.NOTIFICATION  !== undefined) cfg.NOTIFICATION  = body.NOTIFICATION;
        if (body.allowInbox    !== undefined) cfg.allowInbox    = body.allowInbox;
        if (body.autoClean     !== undefined) cfg.autoClean     = body.autoClean;
        if (Array.isArray(body.ADMINBOT))     cfg.ADMINBOT      = body.ADMINBOT;
        if (Array.isArray(body.mod))          cfg.mod           = body.mod;
        if (Array.isArray(body.commandDisabled)) cfg.commandDisabled = body.commandDisabled;
        if (Array.isArray(body.eventDisabled))    cfg.eventDisabled    = body.eventDisabled;

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

        // ── Live reload: global.config deep sync ──
        if (global.config) {
            for (const key of Object.keys(cfg)) {
                global.config[key] = cfg[key];
            }
        }

        // .temp update
        try { fs.writeFileSync(cfgPath + '.temp', JSON.stringify(cfg, null, 4), 'utf8'); } catch {}

        // ── Pending actions → bot এ live apply হবে ──
        // 1. Full config reload
        pendingActions.push({ type: 'config_reload', config: cfg, time: Date.now() });

        // 2. PREFIX — বট এর global.config.PREFIX update
        if (body.PREFIX !== undefined) {
            pendingActions.push({ type: 'set_prefix', prefix: body.PREFIX, time: Date.now() });
        }

        // 3. systemMode
        if (body.systemMode !== undefined) {
            pendingActions.push({ type: 'set_system_mode', mode: body.systemMode, time: Date.now() });
        }

        // 4. Admin/Mod — global.config.ADMINBOT + global.config.mod update
        if (body.ADMINBOT !== undefined || body.mod !== undefined) {
            pendingActions.push({
                type: 'set_adminmod',
                ADMINBOT: cfg.ADMINBOT,
                mod: cfg.mod,
                time: Date.now()
            });
        }

        // 5. commandDisabled — global.client.commands Map থেকে load/unload
        if (body.commandDisabled !== undefined) {
            pendingActions.push({
                type: 'toggle_command',
                commandDisabled: cfg.commandDisabled || [],
                time: Date.now()
            });
        }

        // 6. eventDisabled — global.client.events Map থেকে load/unload
        if (body.eventDisabled !== undefined) {
            pendingActions.push({
                type: 'toggle_event',
                eventDisabled: cfg.eventDisabled || [],
                time: Date.now()
            });
        }

        logger(`Config updated from dashboard.`, '[ Dashboard ]');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

startBot();
