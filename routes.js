// routes.js - ULTIMATE FULL FIX VERSION

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
const activeSockets = global.activeSockets;
const requestLimits = global.requestLimits;

/* =========================================
   SANITIZE NUMBER
========================================= */

function sanitizeNumber(number = '') {

  return String(number)
    .replace(/[^0-9]/g, '');

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

  const clean = sanitizeNumber(number);

  const possible =
    normalizeNumber(clean);

  // SEARCH CONNECTIONS
  for (const key of activeConnections.keys()) {

    const keyClean =
      sanitizeNumber(key);

    if (
      possible.includes(key) ||
      keyClean === clean ||
      key.includes(clean) ||
      clean.includes(keyClean)
    ) {

      return key;

    }

  }

  // SEARCH SOCKETS
  for (const key of activeSockets.keys()) {

    const keyClean =
      sanitizeNumber(key);

    if (
      possible.includes(key) ||
      keyClean === clean ||
      key.includes(clean) ||
      clean.includes(keyClean)
    ) {

      return key;

    }

  }

  return clean;

}

/* =========================================
   RESET REQUEST LIMIT
========================================= */

function resetRequestLimit(number) {

  const clean =
    sanitizeNumber(number);

  requestLimits.delete(clean);

}

/* =========================================
   REQUEST LIMIT FIX
========================================= */

function canRequestCode(number) {

  const clean =
    sanitizeNumber(number);

  const now = Date.now();

  // NO LIMIT
  if (!requestLimits.has(clean)) {

    requestLimits.set(clean, {
      count: 1,
      firstRequest: now
    });

    return true;

  }

  const data =
    requestLimits.get(clean);

  // RESET AFTER 30 SECONDS
  if (
    now - data.firstRequest >
    30 * 1000
  ) {

    requestLimits.set(clean, {
      count: 1,
      firstRequest: now
    });

    return true;

  }

  // ALWAYS ALLOW
  data.count += 1;

  requestLimits.set(clean, data);

  return true;
}

/* =========================================
   CREATE SESSION
========================================= */

function createSession(number) {

  const clean =
    sanitizeNumber(number);

  const generatedCode =
    Math.floor(
      100000 + Math.random() * 900000
    ).toString();

  activeConnections.set(clean, {
    createdAt: Date.now(),
    status: 'connected',
    code: generatedCode
  });

  console.log(
    `✅ Session créée : ${clean}`
  );

  return generatedCode;
}

/* =========================================
   DELETE SESSION COMPLETELY
========================================= */

async function deleteSession(number) {

  try {

    const clean =
      sanitizeNumber(number);

    const foundKey =
      findSessionKey(clean);

    const finalKey =
      foundKey || clean;

    console.log(
      `🗑️ Suppression session : ${finalKey}`
    );

    /* =========================
       CLOSE SOCKET
    ========================= */

    try {

      const sock =
        activeSockets.get(finalKey) ||
        activeSockets.get(clean);

      if (sock) {

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

    activeSockets.delete(finalKey);
    activeSockets.delete(clean);

    activeConnections.delete(finalKey);
    activeConnections.delete(clean);

    /* =========================
       DELETE TMP FILES
    ========================= */

    try {

      const tmpPath =
        path.join(
          os.tmpdir(),
          'session_' + clean
        );

      if (
        fsExtra.existsSync(tmpPath)
      ) {

        await fsExtra.remove(tmpPath);

        console.log(
          '🧹 Temp supprimé'
        );

      }

    } catch (e) {
      console.log(e);
    }

    /* =========================
       DELETE SESSION FOLDER
    ========================= */

    try {

      const possiblePaths = [

        path.join(
          process.cwd(),
          'sessions',
          clean
        ),

        path.join(
          process.cwd(),
          'auth_info_baileys',
          clean
        ),

        path.join(
          process.cwd(),
          'session',
          clean
        )

      ];

      for (const sessionPath of possiblePaths) {

        if (
          fsExtra.existsSync(sessionPath)
        ) {

          await fsExtra.remove(sessionPath);

          console.log(
            `🧹 Session folder removed: ${sessionPath}`
          );

        }

      }

    } catch (e) {

      console.log(
        'DELETE SESSION FOLDER ERROR:',
        e
      );

    }

    /* =========================
       RESET LIMIT
    ========================= */

    resetRequestLimit(clean);

    console.log(
      `✅ Session supprimée : ${clean}`
    );

    return {
      ok: true,
      message:
        `Session ${clean} supprimée`
    };

  } catch (e) {

    console.log(
      'DELETE SESSION ERROR:',
      e
    );

    return {
      ok: false,
      error: e.message || e
    };

  }

}

/* =========================================
   CONNECT SESSION FIX
========================================= */

router.get(
  '/connect',
  async (req, res) => {

    try {

      const { number } =
        req.query;

      if (!number) {

        return res.status(400)
          .json({
            ok: false,
            error:
              'number required'
          });

      }

      const cleanNumber =
        sanitizeNumber(number);

      // ALWAYS ALLOW
      canRequestCode(cleanNumber);

      /* =========================
         FORCE DELETE OLD SESSION
      ========================= */

      await deleteSession(cleanNumber);

      /* =========================
         WAIT CLEANUP
      ========================= */

      await new Promise(resolve =>
        setTimeout(resolve, 2000)
      );

      /* =========================
         CREATE NEW SESSION
      ========================= */

      const generatedCode =
        createSession(cleanNumber);

      console.log(
        `♻️ Nouveau code généré : ${cleanNumber}`
      );

      return res.status(200)
        .json({
          ok: true,
          status: 'success',
          code: generatedCode,
          number: cleanNumber
        });

    } catch (err) {

      console.error(
        'CONNECT ERROR:',
        err
      );

      return res.status(500)
        .json({
          ok: false,
          error:
            err.message || err
        });

    }

  }
);

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
    botName: 'YOU-WEB-BOT',
    count: numbers.length,
    numbers,
    timestamp:
      new Date().toISOString()
  });

});

/* =========================================
   PING
========================================= */

router.get('/ping', (req, res) => {

  res.status(200).json({
    status: 'active',
    botName: 'YOU-WEB-BOT',
    activeSessions:
      activeSockets.size
  });

});

/* =========================================
   API ACTIVE
========================================= */

router.get(
  '/api/active',
  async (req, res) => {

    try {

      const sessions = [
        ...new Set([
          ...activeConnections.keys(),
          ...activeSockets.keys()
        ])
      ];

      res.json({
        ok: true,
        active: sessions,
        count: sessions.length
      });

    } catch (err) {

      res.status(500).json({
        ok: false,
        error:
          err.message || err
      });

    }

  }
);

/* =========================================
   API SESSIONS
========================================= */

router.get(
  '/api/sessions',
  async (req, res) => {

    try {

      const sessions = [
        ...new Set([
          ...activeConnections.keys(),
          ...activeSockets.keys()
        ])
      ];

      res.json({
        ok: true,
        sessions
      });

    } catch (err) {

      res.status(500).json({
        ok: false,
        error:
          err.message || err
      });

    }

  }
);

/* =========================================
   DELETE SESSION API
========================================= */

router.post(
  '/api/session/delete',
  async (req, res) => {

    try {

      const { number } =
        req.body;

      if (!number) {

        return res.status(400)
          .json({
            ok: false,
            error:
              'number required'
          });

      }

      const result =
        await deleteSession(number);

      res.json(result);

    } catch (err) {

      res.status(500)
        .json({
          ok: false,
          error:
            err.message || err
        });

    }

  }
);

/* =========================================
   STATIC FILES
========================================= */

router.use(
  '/dashboard/static',
  express.static(
    path.join(
      process.cwd(),
      'dashboard_static'
    )
  )
);

/* =========================================
   SEND PAGE
========================================= */

function sendPage(res, file) {

  const filePath =
    path.join(
      process.cwd(),
      'dashboard_static',
      file
    );

  if (!fs.existsSync(filePath)) {

    return res.status(404)
      .send(
        `File not found: ${file}`
      );

  }

  res.sendFile(filePath);
}

/* =========================================
   DASHBOARD PAGES
========================================= */

router.get('/dashboard', (req, res) => {
  sendPage(res, 'index.html');
});

router.get('/disconnect', (req, res) => {
  sendPage(res, 'disconnect.html');
});

router.get('/dashboard/newsletters', (req, res) => {
  sendPage(res, 'newsletters.html');
});

router.get('/dashboard/admins', (req, res) => {
  sendPage(res, 'admins.html');
});

router.get('/dashboard/sessions', (req, res) => {
  sendPage(res, 'sessions.html');
});

router.get('/dashboard/active', (req, res) => {
  sendPage(res, 'active.html');
});

router.get('/dashboard/reconnect', (req, res) => {
  sendPage(res, 'reconnect.html');
});

/* =========================================
   EXPORT
========================================= */

module.exports = router;
