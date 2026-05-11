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

// =========================
// 🔥 SESSION FIX SYSTEM
// =========================

const SESSION_FOLDER =
  path.join(__dirname, "sessions");

function sanitizeNumber(num = "") {

  return String(num)
    .replace(/[^0-9]/g, "");

}

/* =========================================
   FIND SOCKET
========================================= */

function findSocket(number) {

  const clean =
    sanitizeNumber(number);

  const possible = [
    clean,
    clean + '@s.whatsapp.net',
    clean + '@lid',
    clean + ':1@s.whatsapp.net'
  ];

  for (const [key, sock] of global.activeSockets.entries()) {

    const keyClean =
      sanitizeNumber(key);

    if (
      possible.includes(key) ||
      keyClean === clean ||
      key.includes(clean) ||
      clean.includes(keyClean)
    ) {

      return {
        key,
        sock
      };

    }

  }

  return null;
}

/* =========================================
   🔥 DELETE SESSION FULL FIX
========================================= */

async function deleteSession(number) {

  try {

    const sanitized =
      sanitizeNumber(number);

    if (!sanitized)
      return false;

    console.log(
      `🗑️ DELETE SESSION START : ${sanitized}`
    );

    /* =========================
       CLOSE ACTIVE SOCKET
    ========================= */

    try {

      const found =
        findSocket(sanitized);

      if (found?.sock) {

        const sock =
          found.sock;

        try {

          if (
            typeof sock.logout ===
            'function'
          ) {

            await sock.logout()
              .catch(() => {});

          }

        } catch {}

        try {

          sock.end?.();

        } catch {}

        try {

          sock.ws?.close();

        } catch {}

        try {

          sock.ev?.removeAllListeners?.();

        } catch {}

        console.log(
          `🔌 Socket closed : ${found.key}`
        );

      }

    } catch (e) {

      console.log(
        'SOCKET CLOSE ERROR:',
        e
      );

    }

    /* =========================
       DELETE GLOBALS
    ========================= */

    global.activeSockets.delete(sanitized);
    global.activeConnections.delete(sanitized);
    global.requestLimits.delete(sanitized);

    for (const key of global.activeSockets.keys()) {

      if (
        sanitizeNumber(key) ===
        sanitized
      ) {

        global.activeSockets.delete(key);

      }

    }

    for (const key of global.activeConnections.keys()) {

      if (
        sanitizeNumber(key) ===
        sanitized
      ) {

        global.activeConnections.delete(key);

      }

    }

    /* =========================
       DELETE SESSION FOLDERS
    ========================= */

    const possibleFolders = [

      path.join(
        SESSION_FOLDER,
        sanitized
      ),

      path.join(
        __dirname,
        sanitized
      ),

      path.join(
        __dirname,
        `session-${sanitized}`
      ),

      path.join(
        __dirname,
        `auth_info_baileys_${sanitized}`
      ),

      path.join(
        __dirname,
        'auth_info_baileys',
        sanitized
      ),

      path.join(
        process.cwd(),
        'sessions',
        sanitized
      ),

      path.join(
        process.cwd(),
        'session',
        sanitized
      )

    ];

    for (const folder of possibleFolders) {

      try {

        if (
          fs.existsSync(folder)
        ) {

          await fsExtra.remove(folder);

          console.log(
            `🧹 Deleted: ${folder}`
          );

        }

      } catch (e) {

        console.log(
          'DELETE FOLDER ERROR:',
          e
        );

      }

    }

    /* =========================
       WAIT CLEANUP
    ========================= */

    await new Promise(resolve =>
      setTimeout(resolve, 2000)
    );

    console.log(
      `✅ SESSION FULLY REMOVED : ${sanitized}`
    );

    return true;

  } catch (e) {

    console.log(
      "DELETE SESSION ERROR:",
      e
    );

    return false;

  }

}

// =====================
// MIDDLEWARE
// =====================
app.use(bodyParser.json());

app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

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

  res.sendFile(
    path.resolve(__dirname, 'pair.html')
  );

});

app.get('/qr', (req, res) => {

  res.sendFile(
    path.resolve(__dirname, 'qr.html')
  );

});

app.get('/delete', (req, res) => {

  res.sendFile(
    path.resolve(__dirname, 'delete.html')
  );

});

app.get('/disconnect', (req, res) => {

  res.sendFile(
    path.resolve(
      __dirname,
      'dashboard_static',
      'disconnect.html'
    )
  );

});

app.get('/', (req, res) => {

  res.sendFile(
    path.resolve(__dirname, 'main.html')
  );

});

// =====================
// DASHBOARD
// =====================
app.use(
  '/dashboard',
  express.static(
    path.join(
      __dirname,
      'dashboard_static'
    )
  )
);

// =====================
// AUTH
// =====================
function requireAdminPass(
  req,
  res,
  next
) {

  const pass =
    req.headers['x-admin-pass'] ||
    req.body?.adminPass;

  if (pass === 'adminowner') {

    return next();

  }

  return res.status(401).json({
    ok: false,
    error: 'Unauthorized'
  });

}

// =====================
// 🔥 DELETE SESSION API
// =====================
app.post(
  '/api/session/delete',
  requireAdminPass,
  async (req, res) => {

    try {

      const { number } =
        req.body;

      if (!number) {

        return res.status(400).json({
          ok: false,
          error: 'number required'
        });

      }

      const sanitized =
        sanitizeNumber(number);

      console.log(
        `🗑️ DELETE API : ${sanitized}`
      );

      await deleteSession(sanitized);

      return res.json({
        ok: true,
        message:
          `Session ${sanitized} removed`
      });

    } catch (err) {

      return res.status(500).json({
        ok: false,
        error:
          err.message
      });

    }

  }
);

// =====================
// 🔥 RESET SESSION API
// =====================
app.post(
  '/api/session/reset',
  async (req, res) => {

    try {

      const { number } =
        req.body;

      if (!number) {

        return res.status(400).json({
          ok: false,
          error:
            "number required"
        });

      }

      const sanitized =
        sanitizeNumber(number);

      await deleteSession(sanitized);

      console.log(
        `♻️ RESET DONE : ${sanitized}`
      );

      return res.json({
        ok: true,
        message:
          "Session reset successful. Generate new code now."
      });

    } catch (e) {

      console.log(
        "RESET API ERROR:",
        e
      );

      return res.status(500).json({
        ok: false,
        error:
          e.message
      });

    }

  }
);

// =====================
// 🔥 AUTO SESSION CLEANER
// =====================

setInterval(async () => {

  try {

    for (const [
      key,
      data
    ] of global.activeConnections.entries()) {

      if (
        data?.createdAt &&
        Date.now() - data.createdAt >
        10 * 60 * 1000
      ) {

        console.log(
          `🧹 AUTO CLEAN : ${key}`
        );

        await deleteSession(key);

      }

    }

  } catch (e) {

    console.log(
      'AUTO CLEAN ERROR:',
      e
    );

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
│ DASH: /dashboard
╰───────────────╯
`);

});

// =====================
// GROUP EVENTS
// =====================
const {
  handleParticipantUpdate
} = require('./welcome_goodbye');

function bindGroupEvents(sock) {

  sock.ev.on(
    'group-participants.update',
    async (update) => {

      try {

        await handleParticipantUpdate(
          sock,
          update.id,
          update
        );

      } catch (err) {

        console.log(
          'GROUP EVENT ERROR:',
          err
        );

      }

    }
  );

}

module.exports.bindGroupEvents =
  bindGroupEvents;

// =====================
// 🔥 MESSAGE HANDLER
// =====================
global.__messageHandler =
  async (sock, m) => {

    try {

      const sender = m.sender;
      const now = Date.now();

      const participants =
        m.participants || [];

      const isOwner = false;

      const pushname =
        m.pushName || "";

      // =========================
      // 🛡️ SECURITY SYSTEM
      // =========================
      if (global.security?.[m.chat]) {

        const isAdmin =
          participants?.find(
            p => p.id === sender
          )?.admin;

        if (isAdmin || isOwner)
          return;

        global.userMsgCount[sender] =
          (
            global.userMsgCount[sender]
            || 0
          ) + 1;

        const lastTime =
          global.userLastMsgTime[sender]
          || now;

        const timeDiff =
          now - lastTime;

        if (timeDiff > 10000) {

          global.userMsgCount[sender] = 1;

        }

        global.userLastMsgTime[sender] =
          now;

        const msg =
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          "";

        let spamScore = 0;

        if (
          global.lastMsgText === msg &&
          global.lastMsgSender === sender
        ) {

          spamScore += 2;

        }

        global.lastMsgText = msg;
        global.lastMsgSender = sender;

        if (
          global.userMsgCount[sender] > 5
        ) {

          spamScore += 2;

        }

        if (timeDiff < 1500) {

          spamScore += 2;

        }

        if (
          msg.includes("http") ||
          msg.includes("wa.me") ||
          msg.includes("t.me")
        ) {

          spamScore += 2;

        }

        // AUTO MUTE
        if (spamScore >= 3) {

          global.mutedUsers[sender] =
            Date.now() + 60000;

          await sock.sendMessage(
            m.chat,
            {
              text:
                `🔇 AUTO-MUTE\n@${sender.split("@")[0]}\nSpam détecté`,
              mentions: [sender]
            }
          );

          return;

        }

        // BLOCK MUTED
        if (
          global.mutedUsers[sender] &&
          Date.now() <
          global.mutedUsers[sender]
        ) {

          await sock.sendMessage(
            m.chat,
            {
              delete: m.key
            }
          );

          return;

        } else {

          delete global.mutedUsers[sender];

        }

      }

    } catch (e) {

      console.log(
        "HANDLER ERROR:",
        e
      );

    }

  };

// =====================
// EXPORT
// =====================
module.exports = app;
