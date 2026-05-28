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
  buildFuelStationFlex,
  buildAllCommandsFlex,
  buildQuickAddFlex,
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
  loadFollowersFromSheet,
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
        
        // ส่งข้อความต้อนรับพร้อมรายการคำสั่ง
        const welcomeText = `👋 สวัสดีครับ ${profile.displayName}!\nขอบคุณที่ติดตาม Bot สายตรวจภูธรลานสัก\n\n📌 นี่คือรายการคำสั่งที่คุณสามารถใช้งานได้ครับ:`;
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            { type: 'text', text: welcomeText },
            buildAllCommandsFlex(isAdmin(userId))
          ]
        });
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

  // รองรับทั้ง Message และ Postback (สำหรับปุ่มกดบางประเภท)
  if (event.type !== 'message' && event.type !== 'postback') return;

  // ดึงข้อความจาก event
  let userText = '';
  if (event.type === 'message' && event.message.type === 'text') {
    userText = event.message.text.trim();
  } else if (event.type === 'postback') {
    userText = event.postback.data.trim();
  }

  if (!userText) return;

  const replyToken = event.replyToken;
  const isGroup    = event.source.type === 'group' || event.source.type === 'room';

  console.log(`📩 [${event.source.type}] From: ${userId || 'unknown'} Text: "${userText}"`);

  // ─────────────────────────────────────────────────────────
  // [Extreme Silence] กรองข้อความสำหรับแชทกลุ่ม
  // ─────────────────────────────────────────────────────────
  if (isGroup) {
    const isExplicitAdmin = userText.startsWith('/');
    const isExplicitSearch = userText.startsWith('ค้นหา') || userText.startsWith('ตรวจสอบ');
    const isPhone = /^(0[0-9]{8,9})$/.test(userText.replace(/\D/g, ''));
    const isMentionBot = userText.includes('บอท') || userText.toLowerCase().includes('bot');
    const isMainKeywords = [
      'ทำเนียบบุคลากร', 'ทำเนียบผู้นำตำบล', 'ผู้นำตำบล', 
      'บุคลากร', 'ตำรวจ', 'เว็บไซต์', 'ข้อมูลสถานี', 
      'เมนู', 'สวัสดี', 'เริ่ม', 'help', 'รีเฟรช'
    ].some(k => userText === k || userText.startsWith(k + ' '));

    // ถ้าไม่ตรงตามเงื่อนไขเป๊ะๆ นี้ "ห้ามตอบเด็ดขาด" ในกลุ่ม
    if (!isExplicitAdmin && !isExplicitSearch && !isPhone && !isMentionBot && !isMainKeywords) {
      return; 
    }
  }

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
      const [suspects, personnel, leaders, followers] = await Promise.all([
        fetchAllData(), 
        fetchPersonnel(), 
        fetchLeaders(),
        loadFollowersFromSheet()
      ]);
      const statusText = `📊 ระบบ: ${isSheetConfigured() ? '✅ พร้อม' : '⚠️ ไม่พร้อม'}\n👮 บุคลากร: ${personnel.length}\n🏘️ ผู้นำ: ${leaders.length}\n🔍 ผู้ต้องหา: ${suspects.length}\n👥 ผู้ติดตาม: ${followers.length} (ถาวร)`;
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
      const args = userText.replace('/เพิ่ม', '').trim();
      if (!args) return replyMessage(replyToken, buildQuickAddFlex());

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
  // [2] คำสั่งทั่วไป / ค้นหา
  // ─────────────────────────────────────────────────────────
  
  if (userText.includes('ทำเนียบบุคลากร') || userText === 'ตำรวจ') {
    return replyMessage(replyToken, buildPersonnelMenuFlex());
  }
  
  if (userText.includes('ทำเนียบผู้นำตำบล') || userText === 'ผู้นำตำบล') {
    return replyMessage(replyToken, buildVillageLeaderMenuFlex());
  }

  const greetingWords = ['สวัสดี','hello','hi','หวัดดี','เริ่ม','เมนู','help','วิธีใช้'];
  if (greetingWords.some(w => userText.toLowerCase().includes(w))) {
    return replyMessage(replyToken, buildWelcomeFlex());
  }

  if (userText.includes('เว็บไซต์')) return replyMessage(replyToken, buildWebsiteFlex());
  if (userText.includes('ข้อมูลสถานี')) return replyMessage(replyToken, buildStationFlex());
  if (userText.includes('คำนวณปริมาณน้ำมัน')) return replyText(replyToken, '⛽ คำนวณปริมาณน้ำมัน 5 ปั๊มกรุณาส่งข้อมูลมาให้เพื่อคำนวณ');
  
  // คำสั่งทั้งหมด
  if (userText === '/คำสั่ง') {
    return replyMessage(replyToken, buildAllCommandsFlex(isAdmin(userId)));
  }

  // เบอร์โทรศัพท์ปั๊มน้ำมัน
  const fuelKeywords = ['/เบอร์โทรน้ำมัน', '/เบอร์ปั๊ม', '/เบอร์น้ำมัน'];
  if (fuelKeywords.some(k => userText.startsWith(k))) {
    return replyMessage(replyToken, buildFuelStationFlex());
  }

  if (userText.includes('แจ้งเหตุ')) return replyText(replyToken, '🚨 แจ้งเหตุฉุกเฉิน โทร 191 หรือแอป Police I Lert U');
  if (userText.includes('ติดต่อ')) return replyText(replyToken, '📞 ฉุกเฉิน: 191\n📱 สายตรวจ: 056-559-xxx');

  // ค้นหาเบอร์โทร
  if (/^(0[0-9]{8,9})$/.test(userText.replace(/\D/g, ''))) {
    const results = await searchByPhone(userText);
    if (results.length === 0) return replyMessage(replyToken, buildNotFoundFlex(userText));
    return replyMessage(replyToken, buildCarouselFlex(results, userText, isAdmin(userId)));
  }

  // 2.5 ระบบค้นหา
  if (userText.length >= 2) {
    if (userText === 'ค้นหาชื่อ') {
      return replyText(replyToken, '🔍 พิมพ์ชื่อ-นามสกุล หรือยศที่ต้องการค้นหาได้เลยครับ');
    }

    // ตรวจสอบว่าเป็นการค้นหาแบบระบุหมวดหมู่หรือไม่
    const isPersonnelSearch = userText.startsWith('บุคลากร');
    const isLeaderSearch    = userText.startsWith('ผู้นำตำบล');
    
    // ดึงเฉพาะคำที่จะใช้ค้นหาจริงๆ ออกมา (ลบคำสั่ง ค้นหา/บุคลากร/ผู้นำตำบล ออก)
    const searchQuery = userText.replace(/^(ค้นหา|บุคลากร|ผู้นำตำบล)\s*/, '').trim();
    
    console.log(`🔍 กำลังค้นหาคำว่า: "${searchQuery}" (จากประโยค: "${userText}")`);
    
    let results = await searchByName(searchQuery);
    // [แก้ไข] กรองผลลัพธ์: ถ้าเลือกจากเมนูให้กรองเข้มงวด แต่ถ้า "ค้นหา" เองให้หาจากทุกหน้า
    if (isPersonnelSearch) {
      results = results.filter(p => p.sheetType === 'personnel');
    } else if (isLeaderSearch) {
      results = results.filter(p => p.sheetType === 'leader');
    } else {
      // กรณีพิมพ์ "ค้นหา [ชื่อ]" หรือพิมพ์ชื่อคนตรงๆ (ในแชทส่วนตัว) 
      // จะไม่กรองทิ้ง และปล่อยให้เห็นข้อมูลจากทุกหน้า (ผู้ต้องหา + ตำรวจ + ผู้นำ)
    }

    if (results.length > 0) {
      // ... แสดงผล ...
      if (results.length === 1) {
        const p = results[0];
        const card = p.sheetType === 'personnel' ? buildPersonnelCardFlex(p) : p.sheetType === 'leader' ? buildLeaderCardFlex(p) : buildResultFlex(p, isAdmin(userId)).contents;
        return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${p.fullName}`, contents: card });
      }
      return replyMessage(replyToken, buildCarouselFlex(results, userText, isAdmin(userId)));
    }

    return replyMessage(replyToken, buildNotFoundFlex(userText));
  }
}

// ===== Helpers =====
async function replyMessage(token, msg) { return client.replyMessage({ replyToken: token, messages: [msg] }); }
async function replyText(token, text) { return client.replyMessage({ replyToken: token, messages: [{ type: 'text', text }] }); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚔 Server Running on Port ${PORT}`));