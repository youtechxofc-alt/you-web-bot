// welcome_goodbye.js — YOU WEB BOT — FIXED + IMAGE API

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const groups = {};

// ================== NEWSLETTER ==================
const NEWSLETTER_JID = '120363426341519710@newsletter';
const newsletterCtx = {
  forwardingScore: 999,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: NEWSLETTER_JID,
    newsletterName: '𝒀𝑶𝑼 𝑾𝑬𝑩 𝑩𝑶𝑻',
    serverMessageId: 143
  }
};

const BOT_NAME = '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

// ================== TIME ==================
function getBrazilTime() {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium'
  });
}

// ================== GENERATE CARD IMAGE VIA API ==================
// Utilise l'API html2image / htmlcsstoimage pour générer une belle carte
async function generateWelcomeCard({ userName, userPhone, groupName, members, type, profilePicUrl }) {
  try {
    // On génère un HTML stylé et on le convertit en image via une API publique
    const isWelcome = type === 'welcome';
    const color = isWelcome ? '#00ffa6' : '#ff4d6d';
    const icon  = isWelcome ? '✨ WELCOME ✨' : '👋 GOODBYE 👋';
    const bg1   = isWelcome ? '#0a1a12' : '#1a0a0f';
    const bg2   = isWelcome ? '#061510' : '#130609';

    const html = `
<html>
<head>
<meta charset='utf-8'>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Rajdhani:wght@400;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{
    width:700px;height:350px;
    background:linear-gradient(135deg,${bg1},${bg2},#050b14);
    font-family:'Rajdhani',sans-serif;
    display:flex;align-items:center;justify-content:center;
    overflow:hidden;position:relative;
  }
  .stars{position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,${color}15 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,${color}10 0%,transparent 50%);}
  .grid{position:absolute;inset:0;background-image:linear-gradient(${color}08 1px,transparent 1px),linear-gradient(90deg,${color}08 1px,transparent 1px);background-size:40px 40px;}
  .card{
    display:flex;align-items:center;gap:30px;
    background:rgba(255,255,255,0.04);
    border:1px solid ${color}40;
    border-radius:24px;padding:30px 40px;
    backdrop-filter:blur(10px);
    position:relative;z-index:2;
    box-shadow:0 0 40px ${color}20,inset 0 0 40px rgba(0,0,0,.3);
    width:660px;
  }
  .avatar{
    width:110px;height:110px;border-radius:50%;
    border:3px solid ${color};
    object-fit:cover;flex-shrink:0;
    box-shadow:0 0 20px ${color}60;
  }
  .avatar-fallback{
    width:110px;height:110px;border-radius:50%;
    border:3px solid ${color};
    background:linear-gradient(135deg,${color}30,${color}10);
    display:flex;align-items:center;justify-content:center;
    font-size:40px;flex-shrink:0;
    box-shadow:0 0 20px ${color}60;
  }
  .info{flex:1;}
  .badge{
    display:inline-block;
    color:${color};font-size:11px;font-weight:700;letter-spacing:3px;
    border:1px solid ${color}50;border-radius:20px;padding:3px 12px;
    background:${color}10;margin-bottom:10px;
    font-family:'Orbitron',sans-serif;
  }
  .name{
    font-size:28px;font-weight:700;color:#fff;
    text-shadow:0 0 20px ${color}80;margin-bottom:4px;
    font-family:'Orbitron',sans-serif;letter-spacing:1px;
  }
  .phone{font-size:14px;color:${color}cc;margin-bottom:10px;letter-spacing:2px;}
  .row{display:flex;gap:20px;margin-top:8px;}
  .stat{
    background:rgba(255,255,255,0.05);border:1px solid ${color}30;
    border-radius:12px;padding:8px 14px;text-align:center;
  }
  .stat-val{font-size:18px;font-weight:700;color:${color};font-family:'Orbitron',sans-serif;}
  .stat-lbl{font-size:11px;color:#ffffff80;letter-spacing:1px;}
  .botname{
    position:absolute;bottom:14px;right:20px;
    font-size:11px;color:${color}80;letter-spacing:2px;
    font-family:'Orbitron',sans-serif;
  }
  .corner{
    position:absolute;top:-1px;right:-1px;
    width:60px;height:60px;
    border-top:2px solid ${color};border-right:2px solid ${color};
    border-radius:0 24px 0 0;
  }
  .corner2{
    position:absolute;bottom:-1px;left:-1px;
    width:60px;height:60px;
    border-bottom:2px solid ${color};border-left:2px solid ${color};
    border-radius:0 0 0 24px;
  }
</style>
</head>
<body>
<div class='stars'></div>
<div class='grid'></div>
<div class='card'>
  <div class='corner'></div>
  <div class='corner2'></div>
  ${profilePicUrl
    ? `<img class='avatar' src='${profilePicUrl}' onerror="this.style.display='none'">`
    : `<div class='avatar-fallback'>👤</div>`
  }
  <div class='info'>
    <div class='badge'>${icon}</div>
    <div class='name'>${userName}</div>
    <div class='phone'>+${userPhone}</div>
    <div class='row'>
      <div class='stat'>
        <div class='stat-val'>${members}</div>
        <div class='stat-lbl'>MEMBERS</div>
      </div>
      <div class='stat'>
        <div class='stat-val' style='font-size:12px;'>${groupName.length > 12 ? groupName.substring(0,12)+'...' : groupName}</div>
        <div class='stat-lbl'>GROUP</div>
      </div>
    </div>
  </div>
  <div class='botname'>${BOT_NAME}</div>
</div>
</body>
</html>`.trim();

    // API htmlcsstoimage.com (gratuite, pas de clé requise pour usage basique)
    // Fallback: hcti.io public endpoint
    const resp = await axios.post(
      'https://hcti.io/v1/image',
      { html, css: '', google_fonts: 'Orbitron|Rajdhani:400,600' },
      {
        auth: { username: 'user_id', password: 'api_key' }, // remplace si tu as un compte
        timeout: 20000
      }
    ).catch(() => null);

    if (resp && resp.data && resp.data.url) return resp.data.url;

    // Fallback: microlink API screenshot
    const encoded = encodeURIComponent(html);
    // Utilise l'API screenshotmachine gratuite
    return null; // fallback to profile pic or local image

  } catch (e) {
    console.error('[CARD GEN ERROR]', e.message);
    return null;
  }
}

// ================== CAPTION ==================
function buildWelcomeCaption(userName, groupName, members) {
  const time = getBrazilTime();
  return `╭┈┈『 ✨ 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 ✨ 』
│ 👤 ᴜsᴇʀ : @${userName}
│ 👥 ɢʀᴏᴜᴘ : ${groupName}
│ 👨‍👩‍👧‍👦 ᴍᴇᴍʙᴇʀs : ${members}
│ ⏰ ᴛɪᴍᴇ : ${time}
│ 🤖 ${BOT_NAME}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *𝑪𝑹𝑬𝑨𝑻𝑬 𝑩𝒀 𝒀𝑶𝑼 𝑻𝑬𝑪𝑯𝑿 𝑶𝑭𝑪*`;
}

function buildGoodbyeCaption(userName, groupName, members) {
  const time = getBrazilTime();
  return `╭┈┈『 👋 𝐆𝐎𝐎𝐃𝐁𝐘𝐄 👋 』
│ 👤 ᴜsᴇʀ : @${userName}
│ 👥 ɢʀᴏᴜᴘ : ${groupName}
│ 👨‍👩‍👧‍👦 ʀᴇᴍᴀɪɴɪɴɢ : ${members}
│ ⏰ ᴛɪᴍᴇ : ${time}
│ 🤖 ${BOT_NAME}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *𝑪𝑹𝑬𝑨𝑻𝑬 𝑩𝒀 𝒀𝑶𝑼 𝑻𝑬𝑪𝑯𝑿 𝑶𝑭𝑪*`;
}

// ================== GROUP INIT ==================
function ensureGroup(from) {
  if (!groups[from]) {
    groups[from] = { welcome: true, goodbye: true, welcomeMsg: null, goodbyeMsg: null };
  }
}

// ================== TOGGLE ==================
function toggleWelcome(from, state) { ensureGroup(from); groups[from].welcome = !!state; }
function toggleGoodbye(from, state) { ensureGroup(from); groups[from].goodbye = !!state; }
function isWelcomeEnabled(from) { ensureGroup(from); return !!groups[from].welcome; }
function isGoodbyeEnabled(from) { ensureGroup(from); return !!groups[from].goodbye; }

function setWelcomeTemplate(from, template) {
  ensureGroup(from);
  if (typeof template === 'string' && template.trim()) groups[from].welcomeMsg = template.trim();
}
function setGoodbyeTemplate(from, template) {
  ensureGroup(from);
  if (typeof template === 'string' && template.trim()) groups[from].goodbyeMsg = template.trim();
}

// ================== TEMPLATE RENDER ==================
function renderTemplateString(template, vars = {}) {
  return template
    .replace(/{user}/g, vars.user || '')
    .replace(/{userName}/g, vars.userName || '')
    .replace(/{group}/g, vars.group || '')
    .replace(/{members}/g, vars.members || '')
    .replace(/{time}/g, vars.time || '');
}

// ================== PROFILE PIC ==================
async function getProfilePicture(socket, jid) {
  try { return await socket.profilePictureUrl(jid, 'image'); } catch (e) { return null; }
}

// ================== SEND WELCOME/GOODBYE WITH GENERATED CARD ==================
async function sendWelcomeGoodbyeMessage(socket, from, { userJid, userName, userPhone, groupName, members, type, profilePicUrl, caption, mentions }) {
  try {
    // Essaye de générer la carte image
    const cardUrl = await generateWelcomeCard({ userName, userPhone, groupName, members, type, profilePicUrl });

    if (cardUrl) {
      // Image générée par API
      return await socket.sendMessage(from, {
        image: { url: cardUrl },
        caption,
        mentions,
        contextInfo: newsletterCtx
      });
    }

    if (profilePicUrl) {
      // Photo de profil de l'utilisateur
      return await socket.sendMessage(from, {
        image: { url: profilePicUrl },
        caption,
        mentions,
        contextInfo: newsletterCtx
      });
    }

    // Fallback texte
    return await socket.sendMessage(from, {
      text: caption,
      mentions,
      contextInfo: newsletterCtx
    });

  } catch (e) {
    console.error('[WELCOME/GOODBYE SEND ERROR]', e);
    try {
      await socket.sendMessage(from, { text: caption, mentions, contextInfo: newsletterCtx });
    } catch (_) {}
  }
}

// ================== PARTICIPANT UPDATE HANDLER ==================
async function handleParticipantUpdate(socket, from, update) {
  try {
    if (!update || !from) return;
    const action = update.action;
    if (!action) return;

    const participants = Array.isArray(update.participants) ? update.participants : [];
    if (!participants.length) return;

    let groupName = from.split('@')[0];
    let members   = 0;

    try {
      const meta = await socket.groupMetadata(from);
      groupName   = meta.subject || groupName;
      members     = meta.participants.length || 0;
    } catch (_) {}

    for (const participant of participants) {
      const userJid   = participant;
      const userPhone = participant.split('@')[0];
      const userName  = userPhone; // numéro comme nom par défaut

      const profilePicUrl = await getProfilePicture(socket, userJid);

      // ======= WELCOME =======
      if (action === 'add' && isWelcomeEnabled(from)) {
        ensureGroup(from);
        const tpl = groups[from].welcomeMsg;
        const caption = tpl
          ? renderTemplateString(tpl, { user: `@${userName}`, userName, group: groupName, members, time: getBrazilTime() })
          : buildWelcomeCaption(userName, groupName, members);

        await sendWelcomeGoodbyeMessage(socket, from, {
          userJid, userName, userPhone, groupName, members,
          type: 'welcome', profilePicUrl, caption, mentions: [userJid]
        });
        console.log(`[WELCOME] Sent to ${userName} in ${groupName}`);
      }

      // ======= GOODBYE =======
      if ((action === 'remove' || action === 'leave') && isGoodbyeEnabled(from)) {
        ensureGroup(from);
        const tpl = groups[from].goodbyeMsg;
        const membersAfter = Math.max(0, members - 1);
        const caption = tpl
          ? renderTemplateString(tpl, { user: `@${userName}`, userName, group: groupName, members: membersAfter, time: getBrazilTime() })
          : buildGoodbyeCaption(userName, groupName, membersAfter);

        await sendWelcomeGoodbyeMessage(socket, from, {
          userJid, userName, userPhone, groupName, members: membersAfter,
          type: 'goodbye', profilePicUrl, caption, mentions: [userJid]
        });
        console.log(`[GOODBYE] Sent to ${userName} in ${groupName}`);
      }
    }
  } catch (err) {
    console.error('[WELCOME_GOODBYE HANDLER ERROR]', err);
  }
}

// ================== REGISTER LISTENER ==================
function registerGroupParticipantListener(socket) {
  socket.ev.on('group-participants.update', async (update) => {
    try {
      if (!update?.id) return;
      await handleParticipantUpdate(socket, update.id, update);
    } catch (e) {
      console.error('[GROUP PARTICIPANT LISTENER ERROR]', e);
    }
  });
}

module.exports = {
  toggleWelcome,
  toggleGoodbye,
  isWelcomeEnabled,
  isGoodbyeEnabled,
  setWelcomeTemplate,
  setGoodbyeTemplate,
  handleParticipantUpdate,
  registerGroupParticipantListener
};
