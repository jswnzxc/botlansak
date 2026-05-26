// ============================================================
//  index.js  — Line Bot Server หลัก สายตรวจภูธรลานสัก
//  รองรับ: แชทส่วนตัว, แชทกลุ่ม, ระบบ Admin, และ Gemini AI
// ============================================================

require('dotenv').config();
const line    = require('@line/bot-sdk');
const express = require('express');
const { searchByName, searchByPhone, fetchAllData, fetchPersonnel, fetchLeaders, clearCache, caches } = require('./database');
const {
  buildResultFlex, buildCarouselFlex, buildNotFoundFlex, buildWelcomeFlex, buildStationFlex,
  buildWebsiteFlex, buildPersonnelMenuFlex, buildPersonnelCardFlex, buildPersonnelCarouselFlex,
  buildVillageLeaderMenuFlex, buildLeaderCardFlex, buildLeaderCarouselFlex,
} = require('./flex');

// ── ระบบเสริม ──
const { 
  isAdmin, isAdminCommand, 
  parseAddCommand, parseDeleteCommand, parseEditCommand,
  buildAddConfirmFlex, buildDeleteConfirmFlex, buildEditConfirmFlex, 
  buildAdminHelpFlex, ADMIN_IDS
} = require('./admin');
const { 
  appendWatchlistPerson, deletePerson, updatePersonField,
  isConfigured: isSheetConfigured 
} = require('./sheets-writer');
const { trackUser, broadcastToAll, getStats, buildBroadcastResultFlex } = require('./broadcast');
const { askAI } = require('./ai');

// ===== Line SDK Config =====
const lineConfig = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});

const app = express();

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.sendStatus(200))
    .catch(err => {
      console.error('Webhook error:', err);
      res.sendStatus(500);
    });
});

app.get('/', (_, res) => res.send('✅ Bot-Score ลานสัก Online'));

// ===== Event Handler หลัก =====
async function handleEvent(event) {
  const userId   = event.source?.userId;
  const groupId  = event.source?.groupId;
  const roomId   = event.source?.roomId;
  const sourceId = groupId || roomId || userId; // ID สำหรับส่งข้อความกลับ

  // ── เมื่อบอตถูกดึงเข้ากลุ่ม ──
  if (event.type === 'join') {
    return replyText(event.replyToken, '👮 สวัสดีครับ! ผมบอตผู้ช่วยสายตรวจภูธรลานสัก พร้อมให้บริการในกลุ่มนี้แล้วครับ\n\n📌 พิมพ์ "เมนู" เพื่อดูสิ่งที่ผมทำได้ครับ');
  }

  // ── ติดตาม Follow Event ──
  if (event.type === 'follow') {
    if (userId) {
      try {
        const profile = await client.getProfile(userId);
        trackUser(userId, profile.displayName);
        await replyText(event.replyToken, `👋 สวัสดีครับ ${profile.displayName}!\nขอบคุณที่ติดตาม Bot สายตรวจภูธรลานสัก\n\nพิมพ์ "สวัสดี" เพื่อเริ่มใช้งานครับ 🙏`);
      } catch (err) { console.error('Follow error:', err); }
    }
    return;
  }

  if (event.type === 'unfollow') {
    if (userId) {
      const { removeFollower } = require('./broadcast');
      removeFollower(userId);
    }
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userText   = event.message.text.trim();
  const replyToken = event.replyToken;

  console.log(`📩 [${event.source.type}] From: ${userId || 'unknown'} Text: "${userText}"`);

  // บันทึกผู้ใช้
  if (userId) {
    try {
      const profile = await client.getProfile(userId);
      trackUser(userId, profile.displayName);
    } catch { trackUser(userId, ''); }
  }

  // ─────────────────────────────────────────────────────────
  // [1] คำสั่ง Admin
  // ─────────────────────────────────────────────────────────
  if (isAdminCommand(userText)) {
    if (userText === '/whoami') return replyText(replyToken, `🆔 User ID: ${userId}`);
    if (!isAdmin(userId)) return replyText(replyToken, '🔒 เฉพาะ Admin เท่านั้นครับ');

    if (userText === '/adminhelp') return replyMessage(replyToken, buildAdminHelpFlex());
    if (userText === '/ล้างcache') { clearCache(); return replyText(replyToken, '🔄 ล้าง Cache เรียบร้อยครับ'); }
    
    if (userText === '/สถิติ' || userText === '/สถานะ') {
      const [suspects, personnel, leaders] = await Promise.all([fetchAllData(), fetchPersonnel(), fetchLeaders()]);
      const stats = getStats();
      const statusText = `📊 ระบบ: ${isSheetConfigured() ? '✅ พร้อม' : '⚠️ ไม่พร้อม'}\n👮 บุคลากร: ${personnel.length}\n🏘️ ผู้นำ: ${leaders.length}\n🔍 ผู้ต้องหา: ${suspects.length}\n👥 ผู้ติดตาม: ${stats.total}`;
      return replyText(replyToken, statusText);
    }

    if (userText.startsWith('/ลบ ')) {
      const person = parseDeleteCommand(userText);
      if (!person) return replyText(replyToken, '❌ รูปแบบ: /ลบ ชื่อ นามสกุล');
      const result = await deletePerson(person.firstName, person.lastName);
      if (result.success) clearCache();
      return replyMessage(replyToken, buildDeleteConfirmFlex(person, result.success, result.message));
    }

    if (userText.startsWith('/แก้ไข ')) {
      const editData = parseEditCommand(userText);
      if (!editData) return replyText(replyToken, '❌ รูปแบบ: /แก้ไข ชื่อ นามสกุล | ฟิลด์ | ค่าใหม่');
      const result = await updatePersonField(editData.firstName, editData.lastName, editData.field, editData.newValue);
      if (result.success) clearCache();
      return replyMessage(replyToken, buildEditConfirmFlex(editData, result.success, result.message));
    }

    if (userText.startsWith('/เพิ่ม')) {
      const person = parseAddCommand(userText, userId);
      if (!person) return replyText(replyToken, '❌ รูปแบบ: /เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ...');
      try {
        await appendWatchlistPerson(person);
        clearCache();
        return replyMessage(replyToken, buildAddConfirmFlex(person, true));
      } catch (err) { return replyMessage(replyToken, buildAddConfirmFlex(person, false, err.message)); }
    }

    if (userText.startsWith('/broadcast ')) {
      const msg = userText.replace('/broadcast ', '').trim();
      await replyText(replyToken, '📤 กำลังส่งข้อความ...');
      const res = await broadcastToAll(client, msg);
      return client.pushMessage({ to: userId, messages: [buildBroadcastResultFlex(res, msg)] });
    }
  }

  // ─────────────────────────────────────────────────────────
  // [2] คำสั่งทั่วไป / ค้นหา (ลำดับความสำคัญ: คำสั่งเฉพาะ > ทักทาย > ค้นหา)
  // ─────────────────────────────────────────────────────────
  
  // 2.1 เมนูเฉพาะทาง (ตรวจสอบก่อนทักทาย)
  if (userText === 'ทำเนียบบุคลากร' || userText === 'ตำรวจ') {
    return replyMessage(replyToken, buildPersonnelMenuFlex());
  }
  
  if (userText === 'ทำเนียบผู้นำตำบล' || userText === 'ผู้นำตำบล') {
    return replyMessage(replyToken, buildVillageLeaderMenuFlex());
  }

  // 2.2 คำสั่งทักทาย / เมนูหลัก (ใช้ matches แบบเป๊ะขึ้น)
  const greetingWords = ['สวัสดี','hello','hi','หวัดดี','เริ่ม','เมนู','help','วิธีใช้'];
  if (greetingWords.includes(userText.toLowerCase())) {
    return replyMessage(replyToken, buildWelcomeFlex());
  }

  // 2.3 บริการอื่นๆ
  if (userText === 'เว็บไซต์') return replyMessage(replyToken, buildWebsiteFlex());
  if (userText === 'ข้อมูลสถานี') return replyMessage(replyToken, buildStationFlex());

  // 2.4 ค้นหาด้วยเบอร์โทร (ตรวจรูปแบบตัวเลข)
  if (isPhoneNumber(userText)) {
    const results = await searchByPhone(userText);
    if (results.length === 0) return replyMessage(replyToken, buildNotFoundFlex(userText));
    return replyMessage(replyToken, buildCarouselFlex(results, userText));
  }

  // 2.5 ค้นหาด้วยชื่อ (ระบบเดิม + AI Fallback)
  if (userText.length >= 2) {
    // กรณีเป็นคำสั่งย่อย (เช่น "บุคลากร งานสืบสวน" หรือ "ผู้นำตำบล ลานสัก") 
    // ให้ข้ามไปใช้ระบบค้นหาปกติ
    const results = await searchByName(userText);
    if (results.length > 0) {
      if (results.length === 1) {
        const p = results[0];
        const card = p.sheetType === 'personnel' ? buildPersonnelCardFlex(p) : p.sheetType === 'leader' ? buildLeaderCardFlex(p) : buildResultFlex(p).contents;
        return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${p.fullName}`, contents: card });
      }
      return replyMessage(replyToken, buildCarouselFlex(results, userText));
    }

    // ถ้าไม่เจอชื่อ ให้ AI ช่วยตอบ
    if (process.env.GEMINI_API_KEY) {
      try {
        // ดึงข้อมูลสรุป (เช็คความปลอดภัยของข้อมูลก่อนส่ง)
        const suspectsData  = caches['ผู้ต้องหา']?.data || [];
        const personnelData = caches['บุคลากร สภ.']?.data || [];
        const context = `รายชื่อตัวอย่าง: ${suspectsData.slice(0,5).map(p=>p.firstName).join(',')}\nรายชื่อตำรวจ: ${personnelData.slice(0,5).map(p=>p.firstName).join(',')}`;
        
        await replyText(replyToken, '🤖 กำลังประมวลผลคำตอบจากฐานข้อมูล...');
        const aiResponse = await askAI(userText, context);
        
        if (aiResponse) {
          return await client.pushMessage({ 
            to: sourceId, 
            messages: [{ type: 'text', text: aiResponse }] 
          });
        }
      } catch (aiErr) {
        console.error('AI Processing Error:', aiErr);
      }
    }
    return replyMessage(replyToken, buildNotFoundFlex(userText));
  }
}

// ===== Helpers =====
function isPhoneNumber(t) { return /^(0[0-9]{8,9})$/.test(t.replace(/\D/g, '')); }
async function replyMessage(token, msg) { return client.replyMessage({ replyToken: token, messages: [msg] }); }
async function replyText(token, text) { return client.replyMessage({ replyToken: token, messages: [{ type: 'text', text }] }); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚔 Server Running on Port ${PORT}`));