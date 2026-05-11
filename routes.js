// routes.js - ULTIMATE FULL FIX VERSION + LOGS DASHBOARD

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fsExtra = require('fs-extra');

const router = express.Router();

/* =========================================
   GLOBAL ACTIVE CONNECTIONS
========================================= */

if (!global.activeConnections) {
  global.activeConnections = new Map();
}

if (!global.activeSockets) {
  global.activeSockets = new Map();
}

if (!global.requestLimits) {
  global.requestLimits = new Map();
}

const activeConnections = global.activeConnections;
const activeSockets     = global.activeSockets;
const requestLimits     = global.requestLimits;

/* =========================================
   📋 SYSTÈME DE LOGS EN MÉMOIRE
========================================= */

if (!global.botLogs)    global.botLogs    = [];
if (!global.logCounter) global.logCounter = 0;

const MAX_LOG_ENTRIES = 500;

global.pushLog = function(text, level = 'INF') {
  global.logCounter++;
  global.botLogs.push({
    id:    global.logCounter,
    text:  String(text),
    level: level,   // INF | WRN | ERR | SUC | SYS
    time:  Date.now()
  });
  if (global.botLogs.length > MAX_LOG_ENTRIES) {
    global.botLogs.shift();
  }
};

// ── Intercepte console.log / error / warn ──────────
const _origLog   = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn  = console.warn.bind(console);

console.log = (...args) => {
  const text = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ');
  global.pushLog(text, 'INF');
  _origLog(...args);
};

console.error = (...args) => {
  const text = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ');
  global.pushLog(text, 'ERR');
  _origError(...args);
};

console.warn = (...args) => {
  const text = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ');
  global.pushLog(text, 'WRN');
  _origWarn(...args);
};

/* =========================================
   SANITIZE NUMBER
========================================= */

function sanitizeNumber(number = '') {
  return String(number).replace(/[^0-9]/g, '');
}

/* =========================================
   NORMALIZE NUMBER
========================================= */

function normalizeNumber(number = '') {
  const clean = sanitizeNumber(number);
  return [
    clean,
    clean + '@s.whatsapp.net',
    clean + '@lid',
    clean + ':1@s.whatsapp.net'
  ];
}

/* =========================================
   FIND SESSION KEY
========================================= */

function findSessionKey(number) {
  const clean    = sanitizeNumber(number);
  const possible = normalizeNumber(clean);

  for (const key of activeConnections.keys()) {
    const keyClean = sanitizeNumber(key);
    if (
      possible.includes(key) ||
      keyClean === clean ||
      key.includes(clean) ||
      clean.includes(keyClean)
    ) return key;
  }

  for (const key of activeSockets.keys()) {
    const keyClean = sanitizeNumber(key);
    if (
      possible.includes(key) ||
      keyClean === clean ||
      key.includes(clean) ||
      clean.includes(keyClean)
    ) return key;
  }

  return clean;
}

/* =========================================
   RESET REQUEST LIMIT
========================================= */

function resetRequestLimit(number) {
  requestLimits.delete(sanitizeNumber(number));
}

/* =========================================
   REQUEST LIMIT FIX
========================================= */

function canRequestCode(number) {
  const clean = sanitizeNumber(number);
  const now   = Date.now();

  if (!requestLimits.has(clean)) {
    requestLimits.set(clean, { count: 1, firstRequest: now });
    return true;
  }

  const data = requestLimits.get(clean);

  if (now - data.firstRequest > 30 * 1000) {
    requestLimits.set(clean, { count: 1, firstRequest: now });
    return true;
  }

  data.count += 1;
  requestLimits.set(clean, data);
  return true;
}

/* =========================================
   DELETE SESSION COMPLETELY
========================================= */

async function deleteSession(number) {
  try {
    const clean    = sanitizeNumber(number);
    const foundKey = findSessionKey(clean);
    const finalKey = foundKey || clean;

    global.pushLog(`🗑️ Suppression session : ${finalKey}`, 'WRN');

    // ── Close socket ──
    try {
      const sock =
        activeSockets.get(finalKey) ||
        activeSockets.get(clean);

      if (sock) {
        try { if (typeof sock.logout === 'function') await sock.logout().catch(() => {}); } catch {}
        try { sock.end?.(); }                catch {}
        try { sock.ws?.close(); }            catch {}
        try { sock.ev?.removeAllListeners?.(); } catch {}
      }
    } catch (e) {
      global.pushLog('SOCKET CLOSE ERROR: ' + e.message, 'ERR');
    }

    // ── Delete globals ──
    activeSockets.delete(finalKey);
    activeSockets.delete(clean);
    activeConnections.delete(finalKey);
    activeConnections.delete(clean);

    // ── Delete tmp ──
    try {
      const tmpPath = path.join(os.tmpdir(), 'session_' + clean);
      if (fsExtra.existsSync(tmpPath)) {
        await fsExtra.remove(tmpPath);
        global.pushLog('🧹 Temp supprimé', 'SYS');
      }
    } catch (e) { global.pushLog(e.message, 'ERR'); }

    // ── Delete session folders ──
    try {
      const possiblePaths = [
        path.join(process.cwd(), 'sessions',          clean),
        path.join(process.cwd(), 'auth_info_baileys', clean),
        path.join(process.cwd(), 'session',           clean)
      ];
      for (const p of possiblePaths) {
        if (fsExtra.existsSync(p)) {
          await fsExtra.remove(p);
          global.pushLog(`🧹 Session folder removed: ${p}`, 'SYS');
        }
      }
    } catch (e) {
      global.pushLog('DELETE SESSION FOLDER ERROR: ' + e.message, 'ERR');
    }

    resetRequestLimit(clean);
    if (global.pendingPairs) global.pendingPairs.delete(clean);

    global.pushLog(`✅ Session supprimée : ${clean}`, 'SUC');
    return { ok: true, message: `Session ${clean} supprimée` };

  } catch (e) {
    global.pushLog('DELETE SESSION ERROR: ' + e.message, 'ERR');
    return { ok: false, error: e.message || e };
  }
}

/* =========================================
   🔥 CONNECT SESSION — REAL BAILEYS PAIRING
========================================= */

router.get('/connect', async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });

    const cleanNumber = sanitizeNumber(number);
    canRequestCode(cleanNumber);

    // ── Delete existing session first ──
    await deleteSession(cleanNumber);
    await new Promise(resolve => setTimeout(resolve, 1500));

    // ── Require Baileys ──
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion
    } = require('@ryuu-reinzz/baileys');

    const sessionDir = path.join(process.cwd(), 'sessions', cleanNumber);
    await fsExtra.ensureDir(sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: require('pino')({ level: 'silent' }),
      browser: ['YOU-WEB-BOT', 'Chrome', '1.0.0'],
      // Mandatory for pairing code
      mobile: false,
    });

    // ── Store socket ──
    activeSockets.set(cleanNumber, sock);
    activeConnections.set(cleanNumber, {
      createdAt: Date.now(),
      status: 'pairing',
    });

    // ── Request pairing code ──
    // Must wait for socket to be ready before requesting
    let pairingCode = null;
    let pairingError = null;

    await new Promise((resolve, reject) => {
      // Timeout after 15 seconds
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: impossible d\'obtenir le code de pairing'));
      }, 15000);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'open') {
          clearTimeout(timeout);
          global.pushLog(`✅ Connecté : ${cleanNumber}`, 'SUC');
          activeConnections.set(cleanNumber, {
            createdAt: Date.now(),
            status: 'connected',
          });
          resolve();
        }

        if (connection === 'close') {
          clearTimeout(timeout);
          const reason = lastDisconnect?.error?.output?.statusCode;
          global.pushLog(`🔴 Connexion fermée (${reason}) : ${cleanNumber}`, 'WRN');

          if (reason === DisconnectReason.loggedOut) {
            await deleteSession(cleanNumber);
          }
          reject(new Error('Connection closed: ' + reason));
        }
      });

      sock.ev.on('creds.update', saveCreds);

      // Request pairing code once socket is registered
      // Baileys requires a small delay before requesting the code
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(cleanNumber);
          pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
          clearTimeout(timeout);
          global.pushLog(`🔑 Code de pairing généré : ${cleanNumber}`, 'SUC');
          resolve();
        } catch (err) {
          pairingError = err.message;
          clearTimeout(timeout);
          reject(new Error('requestPairingCode failed: ' + err.message));
        }
      }, 3000);
    }).catch(err => {
      pairingError = err.message;
    });

    if (pairingCode) {
      return res.status(200).json({
        ok:     true,
        status: 'success',
        code:   pairingCode,
        number: cleanNumber
      });
    } else {
      // Clean up on failure
      await deleteSession(cleanNumber);
      return res.status(500).json({
        ok:    false,
        error: pairingError || 'Impossible de générer le code de pairing'
      });
    }

  } catch (err) {
    global.pushLog('CONNECT ERROR: ' + err.message, 'ERR');
    return res.status(500).json({ ok: false, error: err.message || err });
  }
});

/* =========================================
   ACTIVE SESSIONS
========================================= */

router.get('/active', (req, res) => {
  const numbers = [
    ...new Set([
      ...activeConnections.keys(),
      ...activeSockets.keys()
    ])
  ];
  res.status(200).json({
    botName:   'YOU-WEB-BOT',
    count:     numbers.length,
    numbers,
    timestamp: new Date().toISOString()
  });
});

/* =========================================
   PING
========================================= */

router.get('/ping', (req, res) => {
  res.status(200).json({
    status:         'active',
    botName:        'YOU-WEB-BOT',
    activeSessions: activeSockets.size
  });
});

/* =========================================
   API ACTIVE
========================================= */

router.get('/api/active', async (req, res) => {
  try {
    const sessions = [
      ...new Set([
        ...activeConnections.keys(),
        ...activeSockets.keys()
      ])
    ];
    res.json({ ok: true, active: sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

/* =========================================
   ✅ API SESSIONS — REAL DATA
========================================= */

router.get('/api/sessions', async (req, res) => {
  try {
    const seen     = new Set();
    const sessions = [];

    // Depuis activeConnections (données riches)
    for (const [key, data] of activeConnections.entries()) {
      const num = sanitizeNumber(key);
      if (seen.has(num)) continue;
      seen.add(num);
      sessions.push({
        number:      num,
        jid:         num + '@s.whatsapp.net',
        connectedAt: data?.createdAt || null,
        status:      data?.status    || 'connected'
      });
    }

    // Fallback depuis activeSockets
    for (const [key] of activeSockets.entries()) {
      const num = sanitizeNumber(key);
      if (seen.has(num)) continue;
      seen.add(num);
      sessions.push({
        number:      num,
        jid:         key,
        connectedAt: null,
        status:      'online'
      });
    }

    res.json({
      ok:       true,
      total:    sessions.length,
      sessions: sessions
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

/* =========================================
   ✅ API LOGS — REAL DATA
========================================= */

router.get('/api/logs', (req, res) => {
  try {
    const since = parseInt(req.query.since) || 0;
    const logs  = (global.botLogs || []).filter(l => l.id > since);
    res.json({ ok: true, logs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================
   DELETE SESSION API
========================================= */

router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const result = await deleteSession(number);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

/* =========================================
   STATIC FILES
========================================= */

router.use(
  '/dashboard/static',
  express.static(path.join(process.cwd(), 'dashboard_static'))
);

/* =========================================
   SEND PAGE
========================================= */

function sendPage(res, file) {
  const filePath = path.join(process.cwd(), 'dashboard_static', file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send(`File not found: ${file}`);
  }
  res.sendFile(filePath);
}

/* =========================================
   DASHBOARD PAGES
========================================= */

router.get('/dashboard',               (req, res) => sendPage(res, 'index.html'));
router.get('/disconnect',              (req, res) => sendPage(res, 'disconnect.html'));
router.get('/dashboard/newsletters',   (req, res) => sendPage(res, 'newsletters.html'));
router.get('/dashboard/admins',        (req, res) => sendPage(res, 'admins.html'));
router.get('/dashboard/sessions',      (req, res) => sendPage(res, 'sessions.html'));
router.get('/dashboard/active',        (req, res) => sendPage(res, 'active.html'));
router.get('/dashboard/reconnect',     (req, res) => sendPage(res, 'reconnect.html'));

/* =========================================
   EXPORT
========================================= */

module.exports = router;
