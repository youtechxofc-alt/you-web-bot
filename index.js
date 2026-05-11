// =========================
// 📦 IMPORTS
// =========================
const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const events = require('events');
const fsExtra = require('fs-extra');

require('./lib/globals')();

const pairRouter = require('./pair.js');
const routes = require('./routes');

// =========================
// 🚀 APP INIT
// =========================
const app = express();
const PORT = process.env.PORT || 2001;

events.EventEmitter.defaultMaxListeners = 500;

// =========================
// 🧠 GLOBAL SAFE INIT
// =========================
if (!global.security) global.security = {};
if (!global.antiBot) global.antiBot = {};
if (!global.userMsgCount) global.userMsgCount = {};
if (!global.userLastMsgTime) global.userLastMsgTime = {};
if (!global.mutedUsers) global.mutedUsers = {};
if (!global.lastJoinTime) global.lastJoinTime = {};
if (!global.lastMsgText) global.lastMsgText = "";
if (!global.lastMsgSender) global.lastMsgSender = "";

if (!global.activeSockets) {
  global.activeSockets = new Map();
}

if (!global.activeConnections) {
  global.activeConnections = new Map();
}

if (!global.requestLimits) {
  global.requestLimits = new Map();
}

if (!global.pendingPairs) {
  global.pendingPairs = new Set();
}

// =========================
// 🔥 SESSION FIX SYSTEM
// =========================

const SESSION_FOLDER = path.join(__dirname, "sessions");

function sanitizeNumber(num = "") {
  return String(num).replace(/[^0-9]/g, "");
}

/* =========================================
   FIND SOCKET
========================================= */

function findSocket(number) {
  const clean = sanitizeNumber(number);
  const possible = [
    clean,
    clean + '@s.whatsapp.net',
    clean + '@lid',
    clean + ':1@s.whatsapp.net'
  ];

  for (const [key, sock] of global.activeSockets.entries()) {
    const keyClean = sanitizeNumber(key);
    if (
      possible.includes(key) ||
      keyClean === clean ||
      key.includes(clean) ||
      clean.includes(keyClean)
    ) {
      return { key, sock };
    }
  }

  return null;
}

/* =========================================
   🔥 DELETE SESSION FULL FIX
========================================= */

async function deleteSession(number) {
  try {
    const sanitized = sanitizeNumber(number);
    if (!sanitized) return false;

    console.log(`🗑️ DELETE SESSION START : ${sanitized}`);

    // ── Close active socket ──
    try {
      const found = findSocket(sanitized);
      if (found?.sock) {
        const sock = found.sock;
        try { if (typeof sock.logout === 'function') await sock.logout().catch(() => {}); } catch {}
        try { sock.end?.(); }                    catch {}
        try { sock.ws?.close(); }                catch {}
        try { sock.ev?.removeAllListeners?.(); } catch {}
        console.log(`🔌 Socket closed : ${found.key}`);
      }
    } catch (e) {
      console.log('SOCKET CLOSE ERROR:', e);
    }

    // ── Delete globals ──
    global.activeSockets.delete(sanitized);
    global.activeConnections.delete(sanitized);
    global.requestLimits.delete(sanitized);
    if (global.pendingPairs) global.pendingPairs.delete(sanitized);

    for (const key of global.activeSockets.keys()) {
      if (sanitizeNumber(key) === sanitized) global.activeSockets.delete(key);
    }
    for (const key of global.activeConnections.keys()) {
      if (sanitizeNumber(key) === sanitized) global.activeConnections.delete(key);
    }

    // ── Delete session folders ──
    const possibleFolders = [
      path.join(SESSION_FOLDER, sanitized),
      path.join(__dirname, sanitized),
      path.join(__dirname, `session-${sanitized}`),
      path.join(__dirname, `auth_info_baileys_${sanitized}`),
      path.join(__dirname, 'auth_info_baileys', sanitized),
      path.join(process.cwd(), 'sessions', sanitized),
      path.join(process.cwd(), 'session', sanitized)
    ];

    for (const folder of possibleFolders) {
      try {
        if (fs.existsSync(folder)) {
          await fsExtra.remove(folder);
          console.log(`🧹 Deleted: ${folder}`);
        }
      } catch (e) {
        console.log('DELETE FOLDER ERROR:', e);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`✅ SESSION FULLY REMOVED : ${sanitized}`);
    return true;

  } catch (e) {
    console.log("DELETE SESSION ERROR:", e);
    return false;
  }
}

// =====================
// MIDDLEWARE
// =====================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// =====================
// ROUTES API
// =====================
app.use('/code', pairRouter);
app.use('/', routes);

// =====================
// PAGES HTML
// =====================

app.get('/pair', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'pair.html'));
});

// QR routes
app.get('/qr', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'qr.html'));
});
app.get('/qr-page', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'qr.html'));
});

// Routes principales
app.use('/code', pairRouter);
app.use('/', routes);

app.get('/delete', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'delete.html'));
});

app.get('/logs', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'logs.html'));
});

app.get('/disconnect', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dashboard_static', 'disconnect.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'main.html'));
});

// =====================
// DASHBOARD
// =====================
app.use(
  '/dashboard',
  express.static(path.join(__dirname, 'dashboard_static'))
);

// =====================
// AUTH
// =====================
function requireAdminPass(req, res, next) {
  const pass = req.headers['x-admin-pass'] || req.body?.adminPass;
  if (pass === 'adminowner') return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// =====================
// 🔥 DELETE SESSION API
// =====================
app.post('/api/session/delete', requireAdminPass, async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });

    const sanitized = sanitizeNumber(number);
    console.log(`🗑️ DELETE API : ${sanitized}`);
    await deleteSession(sanitized);

    return res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================
// 🔥 RESET SESSION API
// =====================
app.post('/api/session/reset', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: "number required" });

    const sanitized = sanitizeNumber(number);
    await deleteSession(sanitized);
    console.log(`♻️ RESET DONE : ${sanitized}`);

    return res.json({ ok: true, message: "Session reset successful. Generate new code now." });
  } catch (e) {
    console.log("RESET API ERROR:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// =====================
// 🔥 AUTO SESSION CLEANER
// =====================
setInterval(async () => {
  try {
    for (const [key, data] of global.activeConnections.entries()) {
      if (
        data?.createdAt &&
        Date.now() - data.createdAt > 10 * 60 * 1000
      ) {
        console.log(`🧹 AUTO CLEAN : ${key}`);
        await deleteSession(key);
      }
    }
  } catch (e) {
    console.log('AUTO CLEAN ERROR:', e);
  }
}, 5 * 60 * 1000);

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
  console.log(`
╭───────────────╮
│ YOU WEB BOT
│ Running: http://localhost:${PORT}
│ QR: /qr
│ PAIR: /pair
│ DISCONNECT: /disconnect
│ LOGS: /logs
│ DASH: /dashboard
╰───────────────╯
`);
});

// =====================
// GROUP EVENTS
// =====================
const { handleParticipantUpdate } = require('./welcome_goodbye');

function bindGroupEvents(sock) {
  // ✅ FIX: pair.js already registers group-participants.update via
  // registerGroupParticipantListener(). bindGroupEvents is kept for
  // backward compatibility but does NOT register a second listener
  // to avoid welcome/goodbye messages being sent twice.
  /*
  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleParticipantUpdate(sock, update.id, update);
    } catch (err) {
      console.log('GROUP EVENT ERROR:', err);
    }
  });
  */
}

module.exports.bindGroupEvents = bindGroupEvents;

// =====================
// 🔥 MESSAGE HANDLER
// =====================
global.__messageHandler = async (sock, m) => {
  try {
    const sender       = m.sender;
    const from         = m.chat;
    const now          = Date.now();
    const isGroup      = from.endsWith('@g.us');
    const senderJid    = sender;
    const participants = m.participants || [];
    const pushname     = m.pushName || "";

    // =========================
    // 🎴 ANTISTICKER
    // =========================
    if (
      global.antistickerGroups?.has(from) &&
      m.message?.stickerMessage
    ) {
      try {
        await sock.sendMessage(from, { delete: m.key });
        if (isGroup) {
          await sock.sendMessage(from, {
            text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🎴 *𝐀𝐍𝐓𝐈𝐒𝐓𝐈𝐂𝐊𝐄𝐑*\n│ ⚠️ @${senderJid.split('@')[0]} retiré\n│ pour envoi de sticker !\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
            mentions: [senderJid]
          });
          await sock.groupParticipantsUpdate(from, [senderJid], 'remove');
        }
      } catch (e) {
        console.log('[ANTISTICKER LISTENER ERROR]', e);
      }
      return;
    }

    // =========================
    // 🛡️ ANTISPAM
    // =========================
    if (global.antispamGroups?.has(from) && isGroup) {
      try {
        if (!global.spamTracker) global.spamTracker = new Map();

        const key    = `${from}_${senderJid}`;
        const record = global.spamTracker.get(key) || { count: 0, start: now };

        if (now - record.start > 5000) {
          record.count = 0;
          record.start = now;
        }

        record.count++;
        global.spamTracker.set(key, record);

        if (record.count >= 5) {
          await sock.sendMessage(from, { delete: m.key });
          await sock.sendMessage(from, {
            text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🛡️ *𝐀𝐍𝐓𝐈𝐒𝐏𝐀𝐌*\n│ ⚠️ @${senderJid.split('@')[0]} a été retiré\n│ du groupe pour spam !\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
            mentions: [senderJid]
          });
          await sock.groupParticipantsUpdate(from, [senderJid], 'remove');
          global.spamTracker.delete(key);
          return;
        }
      } catch (e) {
        console.log('[ANTISPAM LISTENER ERROR]', e);
      }
    }

    // =========================
    // 🤖 CHATBOT
    // =========================
    if (
      global.chatbotGroups?.[from] &&
      isGroup &&
      !m.key?.fromMe
    ) {
      try {
        const userText =
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text || "";

        if (userText && userText.trim().length > 0) {
          await sock.sendPresenceUpdate('composing', from);

          const reply = `Merci pour ton message ! 😊\nNotre équipe reviendra vers toi bientôt.\n\n_Propulsé par YOU WEB BOT_`;

          await sock.sendPresenceUpdate('paused', from);

          await sock.sendMessage(from, {
            text: `🤖 ${reply}`
          }, { quoted: m });

          return;
        }
      } catch (e) {
        console.log('[CHATBOT LISTENER ERROR]', e);
      }
    }

    // =========================
    // 🛡️ SECURITY SYSTEM
    // =========================
    if (global.security?.[from]) {
      const isAdmin = participants?.find(p => p.id === sender)?.admin;
      const isOwner = false;

      if (isAdmin || isOwner) return;

      global.userMsgCount[sender]    = (global.userMsgCount[sender] || 0) + 1;
      const lastTime                  = global.userLastMsgTime[sender] || now;
      const timeDiff                  = now - lastTime;

      if (timeDiff > 10000) global.userMsgCount[sender] = 1;
      global.userLastMsgTime[sender] = now;

      const msg =
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text || "";

      let spamScore = 0;

      if (global.lastMsgText === msg && global.lastMsgSender === sender) spamScore += 2;
      global.lastMsgText   = msg;
      global.lastMsgSender = sender;

      if (global.userMsgCount[sender] > 5) spamScore += 2;
      if (timeDiff < 1500)                 spamScore += 2;
      if (
        msg.includes("http") ||
        msg.includes("wa.me") ||
        msg.includes("t.me")
      ) spamScore += 2;

      // AUTO MUTE
      if (spamScore >= 3) {
        global.mutedUsers[sender] = Date.now() + 60000;
        await sock.sendMessage(from, {
          text: `🔇 AUTO-MUTE\n@${sender.split("@")[0]}\nSpam détecté`,
          mentions: [sender]
        });
        return;
      }

      // BLOCK MUTED
      if (
        global.mutedUsers[sender] &&
        Date.now() < global.mutedUsers[sender]
      ) {
        await sock.sendMessage(from, { delete: m.key });
        return;
      } else {
        delete global.mutedUsers[sender];
      }
    }

  } catch (e) {
    console.log("HANDLER ERROR:", e);
  }
};

// =====================
// EXPORT
// =====================
module.exports = app;
