// ============================================================
//  index.js  — Line Bot Server หลัก สายตรวจภูธรลานสัก
//  [อัพเดท] เพิ่มระบบ Admin คำสั่งลับ + Broadcast
// ============================================================

require('dotenv').config();
const line    = require('@line/bot-sdk');
const express = require('express');
const { searchByName, searchByPhone, fetchAllData, fetchPersonnel, fetchLeaders, clearCache } = require('./database');
const {
  buildResultFlex, buildCarouselFlex, buildNotFoundFlex, buildWelcomeFlex, buildStationFlex,
  buildWebsiteFlex, buildPersonnelMenuFlex, buildPersonnelCardFlex, buildPersonnelCarouselFlex,
  buildVillageLeaderMenuFlex, buildLeaderCardFlex, buildLeaderCarouselFlex,
} = require('./flex');

// ── ระบบใหม่ ──
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

// ===== Line SDK Config =====
const lineConfig = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});

// ===== Express Setup =====
const app = express();

app.post(
  '/webhook',
  line.middleware(lineConfig),
  (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
      .then(() => res.sendStatus(200))
      .catch(err => {
        console.error('Webhook error:', err);
        res.sendStatus(500);
      });
  }
);

app.get('/', (_, res) => res.send('✅ Bot-Score ลานสัก กำลังทำงาน'));

// Debug endpoint
app.get('/debug', async (_, res) => {
  try {
    const suspects  = await fetchAllData();
    const personnel = await fetchPersonnel();
    const leaders   = await fetchLeaders();
    const stats     = getStats();
    res.json({
      spreadsheetId: process.env.SPREADSHEET_ID ? '✅ มี' : '❌ ไม่มี',
      sheetWriteAPI: isSheetConfigured() ? '✅ ตั้งค่าแล้ว' : '⚠️ ยังไม่ตั้งค่า (ไม่สามารถเขียน Sheets ได้)',
      adminIds: process.env.ADMIN_LINE_IDS ? '✅ มี' : '⚠️ ยังไม่ตั้งค่า',
      followers: stats.total,
      sheets: {
        ผู้ต้องหา:  { count: suspects.length,  sample: suspects.slice(0,2)  },
        บุคลากร:   { count: personnel.length,  sample: personnel.slice(0,2) },
        ผู้นำตำบล: { count: leaders.length,    sample: leaders.slice(0,2)   },
      }
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ===== Event Handler หลัก =====
async function handleEvent(event) {

  // ── ติดตาม Follow/Unfollow Event ──
  if (event.type === 'follow') {
    const userId = event.source?.userId;
    if (userId) {
      try {
        const profile = await client.getProfile(userId);
        const isNew = trackUser(userId, profile.displayName);
        console.log(`👋 Follow: ${profile.displayName} (${userId}) ${isNew ? '[ใหม่]' : '[กลับมา]'}`);
        await client.pushMessage({
          to: userId,
          messages: [{
            type: 'text',
            text: `👋 สวัสดีครับ ${profile.displayName}!\nขอบคุณที่ติดตาม Bot สายตรวจภูธรลานสัก\n\nพิมพ์ "สวัสดี" หรือ "เมนู" เพื่อดูคำสั่งทั้งหมดครับ 🙏`,
          }],
        });
      } catch (err) {
        console.error('Follow event error:', err.message);
      }
    }
    return;
  }

  if (event.type === 'unfollow') {
    const userId = event.source?.userId;
    if (userId) {
      const { removeFollower } = require('./broadcast');
      removeFollower(userId);
      console.log(`👋 Unfollow: ${userId}`);
    }
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userText   = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId     = event.source?.userId;

  console.log(`📩 ได้รับ: "${userText}" จาก ${userId}`);

  // ── บันทึก userId ทุกครั้งที่ส่งข้อความ ──
  if (userId) {
    try {
      const profile = await client.getProfile(userId);
      trackUser(userId, profile.displayName);
    } catch {
      trackUser(userId, '');
    }
  }

  // ─────────────────────────────────────────────────────────
  // [ใหม่] คำสั่ง Admin — ต้องผ่านการตรวจ isAdmin ก่อน
  // ─────────────────────────────────────────────────────────
  if (isAdminCommand(userText)) {
    if (userText === '/whoami') {
      return replyText(replyToken, `🆔 LINE User ID:\n${userId}\n\nADMIN_LINE_IDS=${userId}`);
    }

    if (!isAdmin(userId)) return replyText(replyToken, '🔒 คุณไม่มีสิทธิ์ครับ');

    if (userText === '/adminhelp') return replyMessage(replyToken, buildAdminHelpFlex());

    if (userText === '/สถิติ') {
      const [suspects, personnel, leaders] = await Promise.all([fetchAllData(), fetchPersonnel(), fetchLeaders()]);
      const stats = getStats();
      let writeStatus = isSheetConfigured() ? '✅ พร้อม' : '⚠️ ยังไม่ตั้งค่า';
      return replyText(replyToken, `📊 สถิติข้อมูลระบบ\n\n👮 บุคลากร: ${personnel.length}\n🏘️ ผู้นำ: ${leaders.length}\n🔍 ผู้ต้องหา: ${suspects.length}\n👥 ผู้ติดตาม: ${stats.total}\n⚙️ Write API: ${writeStatus}`);
    }

    if (userText === '/สถานะ') {
      const statusText = `🖥️ System Status\n\n🌐 Node: ${process.version}\n💾 Mem: ${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB\n⏱️ Uptime: ${Math.round(process.uptime()/60)} mins\n🆔 Admin: ${ADMIN_IDS.length} IDs`;
      return replyText(replyToken, statusText);
    }

    if (userText === '/ล้างcache') {
      clearCache();
      return replyText(replyToken, '🔄 ล้าง Cache เรียบร้อย ข้อมูลจะถูกโหลดใหม่ทันทีครับ');
    }

    if (userText.startsWith('/ลบ ')) {
      const person = parseDeleteCommand(userText);
      if (!person) return replyText(replyToken, '❌ รูปแบบ: /ลบ ชื่อ นามสกุล');
      try {
        const result = await deletePerson(person.firstName, person.lastName);
        if (result.success) clearCache();
        return replyMessage(replyToken, buildDeleteConfirmFlex(person, result.success, result.message));
      } catch (err) {
        return replyMessage(replyToken, buildDeleteConfirmFlex(person, false, err.message));
      }
    }

    if (userText.startsWith('/แก้ไข ')) {
      const editData = parseEditCommand(userText);
      if (!editData) return replyText(replyToken, '❌ รูปแบบ: /แก้ไข ชื่อ นามสกุล | ฟิลด์ | ค่าใหม่');
      try {
        const result = await updatePersonField(editData.firstName, editData.lastName, editData.field, editData.newValue);
        if (result.success) clearCache();
        return replyMessage(replyToken, buildEditConfirmFlex(editData, result.success, result.message));
      } catch (err) {
        return replyMessage(replyToken, buildEditConfirmFlex(editData, false, err.message));
      }
    }

    if (userText === '/รายชื่อ') {
      const suspects = await fetchAllData();
      if (suspects.length === 0) return replyText(replyToken, 'ไม่พบข้อมูล');
      const list = suspects.slice(0, 50).map((p, i) => `${i+1}. ${p.rank}${p.firstName} ${p.lastName}`).join('\n');
      return replyText(replyToken, `📋 รายชื่อ (50 คนล่าสุด):\n\n${list}`);
    }

    if (userText.startsWith('/broadcast ')) {
      const broadcastText = userText.replace(/^\/broadcast\s+/, '').trim();
      if (!broadcastText) return replyText(replyToken, '❌ ใส่ข้อความด้วย');
      await replyText(replyToken, `📤 กำลังส่ง Broadcast...`);
      const result = await broadcastToAll(client, broadcastText);
      if (userId) await client.pushMessage({ to: userId, messages: [buildBroadcastResultFlex(result, broadcastText)] });
      return;
    }

    if (userText.startsWith('/เพิ่ม')) {
      if (!isSheetConfigured()) return replyText(replyToken, '⚠️ ยังไม่ตั้งค่า Google API');
      const person = parseAddCommand(userText, userId);
      if (!person) return replyText(replyToken, '❌ รูปแบบ: /เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ | พื้นที่ | หมายเลขคดี');
      try {
        await appendWatchlistPerson(person);
        clearCache();
        return replyMessage(replyToken, buildAddConfirmFlex(person, true));
      } catch (err) {
        return replyMessage(replyToken, buildAddConfirmFlex(person, false, err.message));
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // คำสั่งผู้ใช้ทั่วไป (Search, Menu, etc.)
  // ─────────────────────────────────────────────────────────
  if (isGreeting(userText) || matchKeyword(userText, ['เมนู', 'เมนูหลัก', 'help', 'ช่วยด้วย', 'วิธีใช้'])) {
    return replyMessage(replyToken, buildWelcomeFlex());
  }

  if (matchKeyword(userText, ['ทำเนียบบุคลากร', 'บุคลากร สภ', 'บุคลากรสภ'])) {
    return replyMessage(replyToken, buildPersonnelMenuFlex());
  }

  if (userText.startsWith('บุคลากร ')) {
    const department = userText.replace('บุคลากร ', '').trim();
    const allPersonnel = await fetchPersonnel();
    let filtered = allPersonnel.filter(p => (p.area || '') === department);
    if (filtered.length === 0) {
      const deptKey = department.replace(/^(งาน|ฝ่าย)/, '').replace(/\s+/g, '');
      filtered = allPersonnel.filter(p => {
        const areaVal = (p.area || '').replace(/^(งาน|ฝ่าย)/, '').replace(/\s+/g, '');
        return areaVal.includes(deptKey) || (p.position || '').includes(deptKey);
      });
    }
    return replyMessage(replyToken, buildPersonnelCarouselFlex(filtered, department));
  }

  if (userText.startsWith('ผู้นำตำบล ')) {
    const subdistrict   = userText.replace('ผู้นำตำบล ', '').trim();
    const allLeaders    = await fetchLeaders();
    const subdistrictKey = subdistrict.replace(/^ตำบล/, '').replace(/\s+/g, '');
    const filtered = allLeaders.filter(p => {
      const areaVal    = (p.area    || '').replace(/^ตำบล/, '').replace(/\s+/g, '');
      const villageVal = (p.village || '').replace(/\s+/g, '');
      return areaVal.includes(subdistrictKey) || subdistrictKey.includes(areaVal) || villageVal.includes(subdistrictKey) || (p.area || '').includes(subdistrict);
    });
    return replyMessage(replyToken, buildLeaderCarouselFlex(filtered, subdistrict));
  }

  if (matchKeyword(userText, ['ทำเนียบผู้นำตำบล', 'ผู้นำตำบล', 'กำนัน', 'ผู้ใหญ่บ้าน'])) {
    return replyMessage(replyToken, buildVillageLeaderMenuFlex());
  }

  if (matchKeyword(userText, ['เว็บไซต์', 'website', 'web', 'เว็บ'])) return replyMessage(replyToken, buildWebsiteFlex());
  if (matchKeyword(userText, ['ข้อมูลสถานี', 'สถานี', 'ที่ตั้ง', 'ที่อยู่'])) return replyMessage(replyToken, buildStationFlex());
  if (matchKeyword(userText, ['แจ้งเหตุ', 'ร้องทุกข์', 'แจ้งความ'])) return replyText(replyToken, '🚨 แจ้งเหตุฉุกเฉิน โทร 191 หรือแอป Police I Lert U');
  if (matchKeyword(userText, ['ติดต่อ', 'โทรหา', 'เบอร์โทร'])) return replyText(replyToken, '📞 ฉุกเฉิน: 191\n📱 สายตรวจ: 056-559-xxx');
  if (matchKeyword(userText, ['ตรวจสอบหมายจับ', 'หมายจับ', 'หมาย'])) return replyText(replyToken, '📋 พิมพ์ชื่อ-สกุลที่ต้องการตรวจสอบได้เลยครับ');
  if (matchKeyword(userText, ['รีเฟรช', 'โหลดใหม่', 'refresh', 'reload'])) {
    clearCache();
    return replyText(replyToken, '🔄 รีเฟรชข้อมูลเรียบร้อยครับ');
  }
  if (matchKeyword(userText, ['ค้นหาชื่อ', 'ค้นหา'])) return replyText(replyToken, '🔍 พิมพ์ชื่อ-นามสกุล หรือยศที่ต้องการค้นหาได้เลยครับ');

  if (isPhoneNumber(userText)) {
    const results = await searchByPhone(userText);
    if (results.length === 0) return replyMessage(replyToken, buildNotFoundFlex(userText));
    if (results.length === 1) {
      const p = results[0];
      const card = p.sheetType === 'personnel' ? buildPersonnelCardFlex(p) : p.sheetType === 'leader' ? buildLeaderCardFlex(p) : buildResultFlex(p).contents;
      return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${p.fullName}`, contents: card });
    }
    return replyMessage(replyToken, buildCarouselFlex(results, userText));
  }

const { askAI } = require('./ai');

// ... (ภายใน handleEvent หลังจากการค้นหาชื่อไม่เจอ) ...

  if (userText.length >= 2) {
    const results = await searchByName(userText);
    
    // ── ถ้าเจอผลลัพธ์ ให้ใช้ระบบค้นหาเดิม ──
    if (results.length > 0) {
      if (results.length === 1) {
        const card = results[0].sheetType === 'personnel' ? buildPersonnelCardFlex(results[0]) : results[0].sheetType === 'leader' ? buildLeaderCardFlex(results[0]) : buildResultFlex(results[0]).contents;
        return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${results[0].fullName}`, contents: card });
      }
      return replyMessage(replyToken, buildCarouselFlex(results, userText));
    }

    // ── ถ้าไม่เจอผลลัพธ์ (หรือถามเป็นประโยค) ให้ส่งให้ AI ตอบ ──
    if (process.env.GEMINI_API_KEY) {
      // ดึงข้อมูลจาก Cache ที่มีอยู่แล้ว (ถ้ามี) แทนการ fetch ใหม่ทั้งหมด
      const suspects  = caches['ผู้ต้องหา']?.data || [];
      const personnel = caches['บุคลากร สภ.']?.data || [];
      const leaders   = caches['ผู้นำตำบล']?.data || [];
      
      // ส่งข้อมูลสรุปที่กระชับขึ้นเพื่อให้ AI ประมวลผลเร็วขึ้น
      const context = 
        `บุคคลเฝ้าระวัง: ${suspects.slice(0,15).map(p => `${p.firstName}(${p.crime})`).join(', ')}\n` +
        `ตำรวจ: ${personnel.slice(0,15).map(p => `${p.firstName}(${p.area})`).join(', ')}\n` +
        `ผู้นำ: ${leaders.slice(0,10).map(p => `${p.firstName}(${p.area})`).join(', ')}`;

      // ส่งข้อความแจ้งผู้ใช้ทันที (Perceived Speed)
      await replyText(replyToken, '🤖 กำลังประมวลผลคำตอบจากฐานข้อมูล...');
      
      const aiResponse = await askAI(userText, context);
      if (aiResponse) {
        // ใช้ pushMessage แทน reply เพราะ replyToken อาจจะหมดอายุถ้า AI คิดนาน
        await client.pushMessage({
          to: userId,
          messages: [{ type: 'text', text: aiResponse }]
        });
        return;
      }
    }

    return replyMessage(replyToken, buildNotFoundFlex(userText));
  }

  return replyText(replyToken, 'กรุณาพิมพ์ชื่ออย่างน้อย 2 ตัวอักษรครับ 🙏');
}

// ===== Helpers =====
function isGreeting(text) { return ['สวัสดี','hello','hi','หวัดดี','ดีครับ','ดีค่ะ','start'].some(g => text.toLowerCase().includes(g)); }
function isPhoneNumber(text) { const digits = text.replace(/[\s\-\+]/g, ''); return /^(0[0-9]{8,9}|66[0-9]{8,9})$/.test(digits); }
function matchKeyword(text, keywords) { return keywords.some(kw => text.includes(kw)); }
async function replyMessage(replyToken, flexMsg) { return client.replyMessage({ replyToken, messages: [flexMsg] }); }
async function replyText(replyToken, text) { return client.replyMessage({ replyToken, messages: [{ type: 'text', text }] }); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚔 Bot Running on Port: ${PORT}`);
  try { await fetchAllData(); console.log('📊 Sheets Connected'); } catch (e) { console.warn('⚠️ Sheets Connection Error'); }
});