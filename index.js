// ============================================================
//  index.js  — Line Bot Server หลัก สายตรวจภูธรลานสัก
//  รองรับ: แชทส่วนตัว, แชทกลุ่ม, ระบบ Admin, และ Gemini AI
// ============================================================

require('dotenv').config();
const line    = require('@line/bot-sdk');
const express = require('express');
const { searchByName, searchByPhone, fetchAllData, fetchPersonnel, fetchLeaders, fetchLocations, clearCache, caches } = require('./database');
const {
  buildResultFlex, buildCarouselFlex, buildNotFoundFlex, buildWelcomeFlex, buildStationFlex,
  buildWebsiteFlex, buildPersonnelMenuFlex, buildPersonnelCardFlex, buildPersonnelCarouselFlex,
  buildVillageLeaderMenuFlex, buildLeaderCardFlex, buildLeaderCarouselFlex,
  buildFuelStationFlex,
  buildAllCommandsFlex,
  buildQuickAddFlex,
  buildDeepPhoneSearchFlex,
  buildSmartCard,
  buildLocationListFlex,
  buildRiskCategoryMenuFlex,
  buildRiskLocationMenuFlex,
} = require('./flex');

// ── ระบบเสริม ──
const { 
  isAdmin, isAdminCommand, 
  parseAddCommand, parseDeleteCommand, parseEditCommand,
  buildAddConfirmFlex, buildDeleteConfirmFlex, buildEditConfirmFlex, 
  buildAdminHelpFlex, buildSuspectListFlex, ADMIN_IDS
} = require('./admin');
const { 
  appendWatchlistPerson, deletePerson, updatePersonField,
  trackUserInSheet, loadFollowersFromSheet,
  appendLocationRecord,
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
app.use(express.static('public'));

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  // เก็บ Base URL ไว้ใช้ส่งรูปภาพ (ปรับปรุงให้รองรับ HTTPS บน Railway/Heroku)
  if (!process.env.BASE_URL) {
    const host = req.get('host');
    const protocol = (req.get('x-forwarded-proto') || req.protocol);
    process.env.BASE_URL = `${protocol}://${host}`;
    console.log(`🌐 Auto-detected BASE_URL: ${process.env.BASE_URL}`);
  }
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
  const replyToken = event.replyToken;
  const isGroup    = event.source.type === 'group' || event.source.type === 'room';

  // ── เมื่อบอตถูกดึงเข้ากลุ่ม ──
  if (event.type === 'join') {
    return replyText(replyToken, '👮 สวัสดีครับ! ผมบอตผู้ช่วยสายตรวจภูธรลานสัก พร้อมให้บริการในกลุ่มนี้แล้วครับ\n\n📌 พิมพ์ "เมนู" เพื่อดูสิ่งที่ผมทำได้ครับ');
  }

  // ── ติดตาม Follow Event ──
  if (event.type === 'follow') {
    if (userId) {
      try {
        const profile = await client.getProfile(userId);
        trackUser(userId, profile.displayName);
        
        // ส่งข้อความต้อนรับพร้อมรายการคำสั่งทั้งหมด
        const welcomeText = `👋 สวัสดีครับคุณ ${profile.displayName}!\nยินดีต้อนรับสู่ระบบสายตรวจภูธรลานสักครับ\n\nนี่คือรายการคำสั่งทั้งหมดที่ท่านสามารถใช้งานได้ในตอนนี้ครับ:`;
        
        return client.replyMessage({
          replyToken: replyToken,
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

  if (event.type === 'message' && event.message.type === 'location') {
    const loc = event.message;
    let userName = 'ไม่ระบุชื่อ';
    try {
      const profile = await client.getProfile(userId);
      userName = profile.displayName;
    } catch (err) { console.error('Get profile error:', err.message); }

    try {
      await appendLocationRecord(loc, userName);
      return replyText(replyToken, `📍 บันทึกสถานที่เรียบร้อยแล้วครับ\n🏠 ${loc.address || loc.title || 'ไม่ระบุที่อยู่'}\n👮 ผู้บันทึก: ${userName}\n⚖️ สถานะ: รอดำเนินการ`);
    } catch (err) {
      console.error('Location record error:', err.message);
      return replyText(replyToken, '❌ ไม่สามารถบันทึกสถานที่ได้ในขณะนี้');
    }
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

  console.log(`📩 [${event.source.type}] From: ${userId || 'unknown'} Text: "${userText}"`);

  // ─────────────────────────────────────────────────────────
  // [Extreme Silence] กรองข้อความสำหรับแชทกลุ่ม
  // ─────────────────────────────────────────────────────────
  if (isGroup) {
    const isExplicitAdmin = userText.startsWith('/');
    const isExplicitSearch = /^(ค้นหา|ตรวจสอบ|เช็ค|ส่อง|check|search)/i.test(userText) || /^หา(\s+|$)/.test(userText);
    const isPhone = /^(0[0-9]{8,9})$/.test(userText.replace(/\D/g, ''));
    const isMentionBot = userText.includes('บอท') || userText.toLowerCase().includes('bot');
    const isMainKeywords = [
      'ทำเนียบบุคลากร', 'ทำเนียบผู้นำตำบล', 'ผู้นำตำบล', 
      'บุคลากร', 'ตำรวจ', 'เว็บไซต์', 'ข้อมูลสถานี', 
      'เมนู', 'สวัสดี', 'เริ่ม', 'help', 'รีเฟรช',
      'รายการสถานที่'
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
    
    if (userText === '/รายชื่อ') {
      const suspects = await fetchAllData();
      return replyMessage(replyToken, buildSuspectListFlex(suspects));
    }

    if (userText === '/รายการสถานที่') {
      try {
        const locations = await fetchLocations();
        return replyMessage(replyToken, buildLocationListFlex(locations));
      } catch (err) {
        console.error('Fetch locations error:', err.message);
        return replyText(replyToken, '❌ ไม่สามารถดึงข้อมูลสถานที่ได้ในขณะนี้');
      }
    }

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
  
  if (userText.includes('ทำเนียบผู้นำตำบล') || userText === 'ผู้นำตำบล' || userText.includes('ผู้ใหญ่บ้าน')) {
    return replyMessage(replyToken, buildVillageLeaderMenuFlex());
  }

  const greetingWords = ['สวัสดี','hello','hi','หวัดดี','เริ่ม','เมนู','help','วิธีใช้'];
  if (greetingWords.some(w => userText.toLowerCase().includes(w))) {
    return replyMessage(replyToken, buildWelcomeFlex());
  }

  if (userText.includes('เว็บไซต์')) return replyMessage(replyToken, buildWebsiteFlex());
  if (userText.includes('ข้อมูลสถานี')) return replyMessage(replyToken, buildStationFlex());
  if (userText.includes('คำนวณปริมาณน้ำมัน')) return replyText(replyToken, '⛽ คำนวณปริมาณน้ำมัน 5 ปั๊มกรุณาส่งข้อมูลมาให้เพื่อคำนวณ');
  
  // ── ระบบจุดเสี่ยง / QR Code ──
  if (userText === '/จุดเสี่ยง' || userText === '/qrcode') {
    return replyMessage(replyToken, buildRiskCategoryMenuFlex());
  }

  if (userText.startsWith('หมวดจุดเสี่ยง ')) {
    const category = userText.replace('หมวดจุดเสี่ยง ', '').trim();
    return replyMessage(replyToken, buildRiskLocationMenuFlex(category));
  }

  if (userText.startsWith('ขอคิวอาร์ ')) {
    const locationName = userText.replace('ขอคิวอาร์ ', '').trim();
    const baseURL = process.env.BASE_URL || '';
    const imageURL = `${baseURL}/qrcodes/${encodeURIComponent(locationName)}.png`;
    
    console.log(`📸 ส่ง QR Code: ${locationName} -> ${imageURL}`);
    
    return client.replyMessage({
      replyToken: replyToken,
      messages: [
        { type: 'text', text: `📸 นี่คือ QR Code สำหรับ: ${locationName}` },
        {
          type: 'image',
          originalContentUrl: imageURL,
          previewImageUrl:     imageURL
        }
      ]
    });
  }

  // คำสั่งทั้งหมด
  if (userText === '/คำสั่ง') {
    return replyMessage(replyToken, buildAllCommandsFlex(isAdmin(userId)));
  }

  // เบอร์โทรศัพท์ปั๊มน้ำมัน
  const fuelKeywords = ['/เบอร์โทรน้ำมัน', '/เบอร์ปั๊ม', '/เบอร์น้ำมัน'];
  if (fuelKeywords.some(k => userText.startsWith(k))) {
    return replyMessage(replyToken, buildFuelStationFlex());
  }

  // ระบบค้นหาเบอร์เชิงลึก (OSINT)
  if (userText.startsWith('ค้นหาเบอร์เชิงลึก')) {
    const phone = userText.replace('ค้นหาเบอร์เชิงลึก', '').trim();
    if (!phone) return replyText(replyToken, '🔍 รูปแบบ: ค้นหาเบอร์เชิงลึก 08XXXXXXXX');

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return replyText(replyToken, '❌ กรุณาระบุเบอร์โทรศัพท์ให้ครบ 10 หลัก');

    // วิเคราะห์เครือข่ายเบื้องต้น (Prefix Analysis)
    let carrier = 'ไม่ทราบเครือข่าย', region = 'ทั่วประเทศ (Mobile)';
    const prefix3 = cleanPhone.slice(0, 3);
    
    if (['081', '082', '080', '084', '085', '089', '092', '093', '097', '098'].includes(prefix3)) carrier = 'AIS';
    else if (['086', '088', '090', '091', '095', '096'].includes(prefix3)) carrier = 'TrueMove H / DTAC';
    else if (['083', '087', '061', '062', '063', '064', '065'].includes(prefix3)) carrier = 'DTAC / TrueMove H';
    else if (['087', '061'].includes(prefix3)) carrier = 'DTAC';
    else if (prefix3 === '066') carrier = 'TrueMove H';
    else if (prefix3.startsWith('02')) { carrier = 'TOT / True / TT&T'; region = 'กรุงเทพและปริมณฑล'; }
    else if (prefix3.startsWith('05')) { carrier = 'TOT / TT&T'; region = 'ภาคเหนือ'; }
    else if (prefix3.startsWith('04')) { carrier = 'TOT / TT&T'; region = 'ภาคตะวันออกเฉียงเหนือ'; }
    else if (prefix3.startsWith('03')) { carrier = 'TOT / TT&T'; region = 'ภาคกลาง / ตะวันออก / ตะวันตก'; }
    else if (prefix3.startsWith('07')) { carrier = 'TOT / TT&T'; region = 'ภาคใต้'; }

    // ค้นหาในฐานข้อมูลเราด้วย
    const localResults = await searchByPhone(cleanPhone);
    
    return replyMessage(replyToken, buildDeepPhoneSearchFlex(phone, { carrier, region }, localResults));
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
    
    // ดึงเฉพาะคำที่จะใช้ค้นหาจริงๆ ออกมา (ลบคำสั่ง/คำเรียกบอทออก)
    let searchQuery = userText.replace(/^(ค้นหา|ตรวจสอบ|เช็ค|ส่อง|check|search|หา|บุคลากร|ผู้นำตำบล|บอท|bot)\s*/i, '').trim();
    // ถ้ายังติดคำว่า "บอท" หรือ "bot" ที่อื่นในประโยค (เช่น "บอท ค้นหา รัตติ") ให้ลบออกอีกรอบ
    searchQuery = searchQuery.replace(/(บอท|bot)\s*/gi, '').trim();
    
    console.log(`🔍 กำลังค้นหาคำว่า: "${searchQuery}" (จากประโยค: "${userText}")`);
    
    if (!searchQuery) return; // ถ้าไม่มีคำค้นหาเลย ไม่ต้องทำอะไร
    
    let results;
    if (searchQuery === 'ทั้งหมด') {
      if (isPersonnelSearch) results = await fetchPersonnel();
      else if (isLeaderSearch) results = await fetchLeaders();
      else results = await searchByName(searchQuery);
    } else {
      results = await searchByName(searchQuery);
    }

    // [แก้ไข] กรองผลลัพธ์: ถ้าเลือกจากเมนูให้กรองเข้มงวด แต่ถ้า "ค้นหา" เองให้หาจากทุกหน้า
    if (isPersonnelSearch && searchQuery !== 'ทั้งหมด') {
      results = results.filter(p => p.sheetType === 'personnel');
    } else if (isLeaderSearch && searchQuery !== 'ทั้งหมด') {
      results = results.filter(p => p.sheetType === 'leader');
    }

    if (results.length > 0) {
      // ... แสดงผล ...
      if (results.length === 1) {
        const p = results[0];
        const bubble = buildSmartCard(p, isAdmin(userId));
        return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${p.fullName}`, contents: bubble });
      }

      // ใช้ builder เฉพาะทางถ้าเลือกจากเมนู (เพื่อให้ altText และการแสดงผลตรงหมวดหมู่)
      if (isPersonnelSearch) {
        return replyMessage(replyToken, buildPersonnelCarouselFlex(results, searchQuery));
      }
      if (isLeaderSearch) {
        return replyMessage(replyToken, buildLeaderCarouselFlex(results, searchQuery));
      }

      return replyMessage(replyToken, buildCarouselFlex(results, searchQuery, isAdmin(userId)));
    }

    return replyMessage(replyToken, buildNotFoundFlex(searchQuery));
  }
}

// ===== Helpers =====
async function replyMessage(token, msg) { 
  const messages = Array.isArray(msg) ? msg : [msg];
  return client.replyMessage({ replyToken: token, messages }); 
}
async function replyText(token, text) { return client.replyMessage({ replyToken: token, messages: [{ type: 'text', text }] }); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚔 Server Running on Port ${PORT}`));