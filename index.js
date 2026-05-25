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
const { isAdmin, isAdminCommand, parseAddCommand, buildAddConfirmFlex, buildAdminHelpFlex } = require('./admin');
const { appendWatchlistPerson, isConfigured: isSheetConfigured } = require('./sheets-writer');
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
        // ส่งข้อความต้อนรับ
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
    // /whoami — ใครก็ดูได้ (ไม่ต้อง admin) สำหรับตั้งค่า ADMIN_LINE_IDS
    if (userText === '/whoami') {
      return replyText(replyToken,
        `🆔 LINE User ID ของคุณ:\n${userId}\n\n` +
        `📝 วิธีตั้งค่าเป็น Admin:\nใส่ค่านี้ใน .env ที่บรรทัด:\nADMIN_LINE_IDS=${userId}`
      );
    }

    // ตรวจสอบสิทธิ์ Admin
    if (!isAdmin(userId)) {
      return replyText(replyToken, '🔒 คุณไม่มีสิทธิ์ใช้คำสั่งนี้ครับ');
    }

    // /adminhelp — แสดงคู่มือ
    if (userText === '/adminhelp') {
      return replyMessage(replyToken, buildAdminHelpFlex());
    }

    // /สถิติ — ดูจำนวนข้อมูล
    if (userText === '/สถิติ') {
      const [suspects, personnel, leaders] = await Promise.all([
        fetchAllData(), fetchPersonnel(), fetchLeaders(),
      ]);
      const stats = getStats();
      
      let writeStatus = isSheetConfigured() ? '✅ พร้อม' : '⚠️ ยังไม่ตั้งค่า';
      if (!isSheetConfigured()) {
        const missing = [];
        if (!process.env.GOOGLE_CLIENT_EMAIL) missing.push('EMAIL');
        if (!process.env.GOOGLE_PRIVATE_KEY) missing.push('KEY');
        if (!process.env.SPREADSHEET_ID) missing.push('SHEET_ID');
        writeStatus += ` (ขาด: ${missing.join(', ')})`;
      }

      return replyText(replyToken,
        `📊 สถิติข้อมูลระบบ\n\n` +
        `👮 บุคลากร สภ.: ${personnel.length} คน\n` +
        `🏘️ ผู้นำตำบล: ${leaders.length} คน\n` +
        `🔍 ผู้ต้องหา/เฝ้าระวัง: ${suspects.length} รายการ\n\n` +
        `👥 ผู้ติดตาม Bot: ${stats.total} คน\n` +
        `⚙️ Write API: ${writeStatus}`
      );
    }

    // /broadcast <ข้อความ>
    if (userText.startsWith('/broadcast ')) {
      const broadcastText = userText.replace(/^\/broadcast\s+/, '').trim();
      if (!broadcastText) {
        return replyText(replyToken, '❌ กรุณาใส่ข้อความที่ต้องการส่งครับ\nตัวอย่าง: /broadcast ⚠️ แจ้งเตือนด่วน!');
      }

      // ส่งก่อน reply ทันที เพื่อไม่ให้ timeout
      await replyText(replyToken, `📤 กำลังส่ง Broadcast...\nข้อความ: "${broadcastText}"`);

      // ส่งจริงๆ ทีหลัง
      const result = await broadcastToAll(client, broadcastText);

      // Push ผลกลับหา Admin
      if (userId) {
        await client.pushMessage({
          to: userId,
          messages: [buildBroadcastResultFlex(result, broadcastText)],
        });
      }
      return;
    }

    // /เพิ่ม — เพิ่มบุคคลเฝ้าระวัง
    if (userText.startsWith('/เพิ่ม')) {
      if (!isSheetConfigured()) {
        return replyText(replyToken,
          '⚠️ ยังไม่ได้ตั้งค่า Google Service Account\n\n' +
          'กรุณาเพิ่มตัวแปรต่อไปนี้ใน .env:\n' +
          'GOOGLE_CLIENT_EMAIL=...\n' +
          'GOOGLE_PRIVATE_KEY=...\n' +
          'GOOGLE_PROJECT_ID=...\n\n' +
          'ดูวิธีตั้งค่าในไฟล์ sheets-writer.js'
        );
      }

      const person = parseAddCommand(userText, userId);
      if (!person) {
        return replyText(replyToken,
          '❌ รูปแบบไม่ถูกต้องครับ\n\n' +
          'รูปแบบ:\n/เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ | พื้นที่ | หมายเลขคดี\n\n' +
          'ตัวอย่าง:\n/เพิ่ม นาย สมชาย ใจร้าย | ยาเสพติด | เฝ้าระวัง | ลานสัก | อ.123/67'
        );
      }

      try {
        await appendWatchlistPerson(person);
        clearCache(); // ล้าง cache เพื่อให้ค้นหาเจอทันที
        return replyMessage(replyToken, buildAddConfirmFlex(person, true));
      } catch (err) {
        console.error('เพิ่มข้อมูลล้มเหลว:', err.message);
        return replyMessage(replyToken, buildAddConfirmFlex(person, false, err.message));
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 1. คำทักทาย / เมนูหลัก
  // ─────────────────────────────────────────────────────────
  if (isGreeting(userText) || matchKeyword(userText, ['เมนู', 'เมนูหลัก', 'help', 'ช่วยด้วย', 'วิธีใช้'])) {
    return replyMessage(replyToken, buildWelcomeFlex());
  }

  // ─────────────────────────────────────────────────────────
  // 2. ทำเนียบบุคลากร สภ.
  // ─────────────────────────────────────────────────────────
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
    console.log(`🔍 [บุคลากร] keyword="${department}" → พบ ${filtered.length} คน`);
    return replyMessage(replyToken, buildPersonnelCarouselFlex(filtered, department));
  }

  // ─────────────────────────────────────────────────────────
  // 3. ทำเนียบผู้นำตำบล
  // ─────────────────────────────────────────────────────────
  if (userText.startsWith('ผู้นำตำบล ')) {
    const subdistrict   = userText.replace('ผู้นำตำบล ', '').trim();
    const allLeaders    = await fetchLeaders();
    const subdistrictKey = subdistrict.replace(/^ตำบล/, '').replace(/\s+/g, '');
    const filtered = allLeaders.filter(p => {
      const areaVal    = (p.area    || '').replace(/^ตำบล/, '').replace(/\s+/g, '');
      const villageVal = (p.village || '').replace(/\s+/g, '');
      return areaVal.includes(subdistrictKey) || subdistrictKey.includes(areaVal) ||
             villageVal.includes(subdistrictKey) || (p.area || '').includes(subdistrict);
    });
    console.log(`🔍 [ผู้นำตำบล] "${subdistrict}" → พบ ${filtered.length} คน`);
    return replyMessage(replyToken, buildLeaderCarouselFlex(filtered, subdistrict));
  }

  if (matchKeyword(userText, ['ทำเนียบผู้นำตำบล', 'ผู้นำตำบล', 'กำนัน', 'ผู้ใหญ่บ้าน'])) {
    return replyMessage(replyToken, buildVillageLeaderMenuFlex());
  }

  // ─────────────────────────────────────────────────────────
  // 4-5. เมนูอื่นๆ
  // ─────────────────────────────────────────────────────────
  if (matchKeyword(userText, ['เว็บไซต์', 'website', 'web', 'เว็บ'])) {
    return replyMessage(replyToken, buildWebsiteFlex());
  }

  if (matchKeyword(userText, ['ข้อมูลสถานี', 'สถานี', 'ที่ตั้ง', 'ที่อยู่'])) {
    return replyMessage(replyToken, buildStationFlex());
  }

  if (matchKeyword(userText, ['แจ้งเหตุ', 'ร้องทุกข์', 'แจ้งความ'])) {
    return replyText(replyToken,
      '🚨 แจ้งเหตุฉุกเฉิน โทร 191\n' +
      '📞 สายตรวจ: 056-559-xxx\n' +
      'หรือแจ้งผ่านแอป Police I Lert U\n\n' +
      'เจ้าหน้าที่รับแจ้งตลอด 24 ชั่วโมงครับ'
    );
  }

  if (matchKeyword(userText, ['ติดต่อ', 'โทรหา', 'เบอร์โทร'])) {
    return replyText(replyToken,
      '📞 ช่องทางติดต่อสายตรวจภูธรลานสัก\n\n' +
      '🚨 ฉุกเฉิน: 191\n' +
      '📱 สายตรวจ: 056-559-xxx\n' +
      '💬 Line OA: @lansak_police\n' +
      '📘 Facebook: สายตรวจภูธรลานสัก'
    );
  }

  if (matchKeyword(userText, ['ตรวจสอบหมายจับ', 'หมายจับ', 'หมาย'])) {
    return replyText(replyToken,
      '📋 ตรวจสอบหมายจับ\n\n' +
      'กรุณาพิมพ์ชื่อ-สกุลที่ต้องการตรวจสอบ\n' +
      'ตัวอย่าง: "สมชาย ใจดี"\n\n' +
      'ระบบจะค้นหาในฐานข้อมูลให้ทันทีครับ'
    );
  }

  if (matchKeyword(userText, ['รีเฟรช', 'โหลดใหม่', 'refresh', 'reload'])) {
    clearCache();
    return replyText(replyToken, '🔄 ล้าง Cache เรียบร้อย ข้อมูลจะถูกโหลดใหม่จาก Google Sheets ครับ');
  }

  if (matchKeyword(userText, ['ค้นหาชื่อ', 'ค้นหา'])) {
    return replyText(replyToken, '🔍 กรุณาพิมพ์ชื่อ-นามสกุล หรือยศที่ต้องการค้นหาได้เลยครับ\n\nตัวอย่าง: "นนทนการ" หรือ "ส.ต.ต. สมชาย"');
  }

  // ─────────────────────────────────────────────────────────
  // 6. ค้นหาด้วยเบอร์โทรศัพท์
  // ─────────────────────────────────────────────────────────
  if (isPhoneNumber(userText)) {
    const results = await searchByPhone(userText);
    console.log(`📞 ค้นหาเบอร์: "${userText}" → พบ ${results.length} รายการ`);
    if (results.length === 0) return replyMessage(replyToken, buildNotFoundFlex(userText));
    if (results.length === 1) {
      const p = results[0];
      const card = p.sheetType === 'personnel' ? buildPersonnelCardFlex(p)
                 : p.sheetType === 'leader'    ? buildLeaderCardFlex(p)
                 : buildResultFlex(p).contents;
      return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${p.fullName}`, contents: card });
    }
    return replyMessage(replyToken, buildCarouselFlex(results, userText));
  }

  // ─────────────────────────────────────────────────────────
  // 7. ค้นหาชื่อ (default)
  // ─────────────────────────────────────────────────────────
  if (userText.length >= 2) {
    const results = await searchByName(userText);
    if (results.length === 0) return replyMessage(replyToken, buildNotFoundFlex(userText));
    if (results.length === 1) {
      const card = results[0].sheetType === 'personnel' ? buildPersonnelCardFlex(results[0])
                 : results[0].sheetType === 'leader'    ? buildLeaderCardFlex(results[0])
                 : buildResultFlex(results[0]).contents;
      return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${results[0].fullName}`, contents: card });
    }
    return replyMessage(replyToken, buildCarouselFlex(results, userText));
  }

  return replyText(replyToken, 'กรุณาพิมพ์ชื่ออย่างน้อย 2 ตัวอักษรครับ 🙏');
}

// ===== Helper Functions =====
function isGreeting(text) {
  return ['สวัสดี','hello','hi','หวัดดี','ดีครับ','ดีค่ะ','start'].some(g => text.toLowerCase().includes(g));
}
function isPhoneNumber(text) {
  const digits = text.replace(/[\s\-\+]/g, '');
  return /^(0[0-9]{8,9}|66[0-9]{8,9})$/.test(digits);
}
function matchKeyword(text, keywords) {
  return keywords.some(kw => text.includes(kw));
}
async function replyMessage(replyToken, flexMsg) {
  return client.replyMessage({ replyToken, messages: [flexMsg] });
}
async function replyText(replyToken, text) {
  return client.replyMessage({ replyToken, messages: [{ type: 'text', text }] });
}

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n🚔 Bot-Score สายตรวจภูธรลานสัก เริ่มทำงานแล้ว!`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`🔐 Admin IDs: ${process.env.ADMIN_LINE_IDS || '⚠️  ยังไม่ตั้งค่า (พิมพ์ /whoami ใน LINE เพื่อดู ID)'}`);
  console.log(`📝 Sheets Write: ${isSheetConfigured() ? '✅ พร้อม' : '⚠️  ยังไม่ตั้งค่า GOOGLE_CLIENT_EMAIL'}\n`);

  try {
    const data = await fetchAllData();
    console.log(`📊 โหลดข้อมูลแล้ว: ${data.length} รายการ`);
  } catch (e) {
    console.warn('⚠️  ยังเชื่อมต่อ Google Sheets ไม่ได้ — ตรวจสอบ SPREADSHEET_ID');
  }
});
