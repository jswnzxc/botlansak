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
  buildAllRiskLocationsMenuFlex,
} = require('./flex');

// ── ระบบเสริม ──
const { 
  isAdmin, isMasterAdmin, isAdminCommand, refreshUserCache,
  extractName, parseAddCommand, parseDeleteCommand, parseEditCommand,
  parseAddAdminCommand, parseBlockCommand,
  buildAddConfirmFlex, buildDeleteConfirmFlex, buildEditConfirmFlex, 
  buildEditOptionsFlex,
  buildAddAdminConfirmFlex, buildBlockConfirmFlex,
  buildAdminHelpFlex, buildSuspectListFlex, buildUserListFlex, 
  setEditSession, getEditSession, clearEditSession,
  setAddSession, getAddSession, clearAddSession,
  ADMIN_IDS
} = require('./admin');
const { 
  appendWatchlistPerson, deletePerson, updatePersonField,
  trackUserInSheet, loadFollowersFromSheet,
  appendLocationRecord, blockUserInSheet, loadBlockedUsersFromSheet,
  isConfigured: isSheetConfigured,
  setUserReminderTime, getDueReminders
} = require('./sheets-writer');
const { broadcastToAll, broadcastToTarget, getStats, buildBroadcastResultFlex } = require('./broadcast');
const { askAI } = require('./ai');

// ===== Line SDK Config =====
const lineConfig = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});

// ระบบตรวจสอบการแจ้งเตือนจุดเสี่ยง (ตรวจสอบทุก 1 นาที)
setInterval(async () => {
  try {
    const dueReminders = await getDueReminders();
    for (const item of dueReminders) {
      try {
        await client.pushMessage({
          to: item.userId,
          messages: [{ type: 'text', text: '!!!!!อย่าลืมส่งรายงานจุดเสี่ยงนะครับ' }]
        });
        console.log(`🔔 Persistent Reminder sent to ${item.userId}`);
        // ส่งเสร็จแล้ว ลบเวลาแจ้งเตือนออก
        await setUserReminderTime(item.userId, '');
      } catch (err) {
        console.error(`❌ Failed to send persistent reminder to ${item.userId}:`, err.message);
        // ถ้าส่งไม่สำเร็จ (เช่น โดนบล็อก) ให้ลบเวลาออกเลยเพื่อไม่ให้ค้าง
        await setUserReminderTime(item.userId, '');
      }
    }
  } catch (err) {
    console.error('Error in reminder interval:', err.message);
  }
}, 60 * 1000);

const app = express();

// Session สำหรับรอรับชื่อค้นทะเบียนราษฎร์
const xapiWaitingUsers = new Map(); // userId -> true


app.use(express.static('public'));

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  // เก็บ Base URL ไว้ใช้ส่งรูปภาพ
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
  try {
    const userId   = event.source?.userId;
    const groupId  = event.source?.groupId;
    const roomId   = event.source?.roomId;
    const sourceId = groupId || roomId || userId; 
    const replyToken = event.replyToken;
    const isGroup    = event.source.type === 'group' || event.source.type === 'room';

    // ── ตรวจสอบการปิดกั้น (Block) ──
    if (userId) {
      const blockedUsers = await loadBlockedUsersFromSheet();
      if (blockedUsers.includes(userId)) {
        console.log(`🚫 Ignore message from blocked user: ${userId}`);
        return; 
      }
    }

    // ── เมื่อบอตถูกดึงเข้ากลุ่ม ──
    if (event.type === 'join') {
      return replyText(replyToken, '👮 สวัสดีครับ! ผมบอตผู้ช่วยสายตรวจภูธรลานสัก พร้อมให้บริการในกลุ่มนี้แล้วครับ\n\n📌 พิมพ์ "เมนู" เพื่อดูสิ่งที่ผมทำได้ครับ');
    }

    // ── ติดตาม Follow Event ──
    if (event.type === 'follow') {
      if (userId) {
        try {
          const profile = await client.getProfile(userId);
          const displayName = profile.displayName || 'ไม่ระบุชื่อ';
          const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
          
          await trackUserInSheet(userId, displayName);
          
          // แจ้งเตือน Master Admin ทุกคน (จาก ENV และ Sheets)
          try {
            const followers = await loadFollowersFromSheet();
            const sheetMasters = followers.filter(u => u.role === 'adminmaster').map(u => u.userId);
            const envMasters = (process.env.ADMIN_LINE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
            
            // รวมรายชื่อ Master Admin ทั้งหมด และใส่ ID สำรองหากไม่มีข้อมูลใน ENV
            const fallbackMaster = 'Ufa63dfbbf9007b97d94aced0528efb8c';
            const allMasters = [...new Set([...envMasters, ...sheetMasters, fallbackMaster])];

            if (allMasters.length > 0) {
              const adminNotifyText = `🔔 มีสมาชิกใหม่เข้ามาใช้งานบอทสายตรวจ AI\n\n👤 ชื่อ: ${displayName}\n🆔 User ID: ${userId}\n📅 วันที่เข้า: ${now}`;
              for (const masterId of allMasters) {
                try {
                  await client.pushMessage({
                    to: masterId,
                    messages: [{ type: 'text', text: adminNotifyText }]
                  });
                } catch (err) { console.error(`Notify admin ${masterId} error:`, err.message); }
              }
            }
          } catch (err) { console.error('Error fetching masters for notification:', err.message); }

          const welcomeText = `👋 สวัสดีครับคุณ ${displayName}!\nยินดีต้อนรับสู่ระบบสายตรวจภูธรลานสักครับ\n\nนี่คือรายการคำสั่งทั้งหมดที่ท่านสามารถใช้งานได้ในตอนนี้ครับ:`;
          const prText = `📢 ประชาสัมพันธ์การใช้งาน LINE BOT สถานีตำรวจภูธรลานสัก\n\nเพื่อเพิ่มประสิทธิภาพในการปฏิบัติงาน การสืบค้นข้อมูล และการสื่อสารภายในหน่วยงาน สถานีตำรวจภูธรลานสัก ได้พัฒนาระบบ LINE BOT สำหรับอำนวยความสะดวกแก่เจ้าหน้าที่ โดยสามารถใช้งานได้ทั้งผ่านเมนู และการพิมพ์ข้อความค้นหาโดยตรง\n\n━━━━━━━━━━━━━━\n🔍 ระบบค้นหาข้อมูล\n━━━━━━━━━━━━━━\n\nผู้ใช้งานสามารถพิมพ์ข้อความเพื่อค้นหาได้ทันที โดยไม่จำเป็นต้องกดเมนูทุกครั้ง\n\n✅ ค้นหาข้อมูลบุคคล\n• พิมพ์ชื่อ\n• พิมพ์นามสกุล\n• พิมพ์ชื่อ-นามสกุล\n• พิมพ์ยศพร้อมชื่อ\n\nตัวอย่าง\n• สมชาย\n• ใจดี\n• สมชาย ใจดี\n• ร.ต.อ. สมชาย ใจดี\n\n✅ ค้นหาด้วยหมายเลขโทรศัพท์\nสามารถพิมพ์หมายเลขโทรศัพท์ได้โดยตรง\n\nตัวอย่าง\n• 0812345678\n\nระบบจะแสดงข้อมูลที่เกี่ยวข้อง พร้อมรายละเอียดเพิ่มเติมตามฐานข้อมูล\n\n✅ ค้นหาด้วยนามเรียกขาน\nสามารถค้นหาชื่อเจ้าหน้าที่ตำรวจได้จากนามเรียกขาน\n\nตัวอย่าง\n• ลานสัก 2127\n• ลานสัก 211\n• ลานสัก 41\n\nระบบจะแสดงชื่อ-นามสกุล ตำแหน่ง และข้อมูลที่เกี่ยวข้อง\n\n✅ ค้นหาทำเนียบบุคลากร\nสามารถค้นหารายชื่อเจ้าหน้าที่ตามฝ่ายงานได้\n\nตัวอย่าง\n• งานป้องกันปราบปราม\n• งานสืบสวน\n• งานสอบสวน\n• งานอำนวยการ\n• งานจราจร\n\n✅ ค้นหาผู้นำชุมชน\nสามารถค้นหารายชื่อกำนัน ผู้ใหญ่บ้าน และผู้นำชุมชนตามพื้นที่รับผิดชอบ\n\nตัวอย่าง\n• ตำบลลานสัก\n• ตำบลระบำ\n• ตำบลน้ำรอบ\n\n━━━━━━━━━━━━━━\n👮 ระบบจัดการสำหรับเจ้าหน้าที่\n━━━━━━━━━━━━━━\n\nสำหรับผู้ได้รับสิทธิ์ใช้งานระดับผู้ดูแล\n\n• เพิ่ม แก้ไข หรือลบข้อมูลในระบบ\n• ตรวจสอบรายชื่อผู้ใช้งาน\n• จัดการสิทธิ์การเข้าถึงข้อมูล\n• ดูสถิติข้อมูลภายในระบบ\n• อัปเดตข้อมูลล่าสุดจากฐานข้อมูลด้วยคำสั่ง /ล้างcache\n\n━━━━━━━━━━━━━━\n📍 ระบบจุดเสี่ยงและตรวจการณ์\n━━━━━━━━━━━━━━\n\n• ขอรับ QR Code จุดตรวจ\n• ระบบแจ้งเตือนการส่งรายงานผลปฏิบัติงาน\n• รองรับการส่งพิกัด Location\n• บันทึกข้อมูลการตรวจจุดเสี่ยงเข้าสู่ระบบ\n\n━━━━━━━━━━━━━━\n📢 ระบบประชาสัมพันธ์และ AI\n━━━━━━━━━━━━━━\n\n• รับข่าวสารและประกาศจากสถานีตำรวจ\n• ส่งข้อความประชาสัมพันธ์ถึงผู้ใช้งาน\n• ระบบ AI Assistant ช่วยตอบคำถามเบื้องต้น\n• รวมเบอร์โทรศัพท์สำคัญและลิงก์ระบบงานต่าง ๆ\n\n━━━━━━━━━━━━━━\n🔒 ระบบความปลอดภัย\n━━━━━━━━━━━━━━\n\n• แบ่งสิทธิ์การใช้งานตามระดับผู้ใช้\n• ตรวจสอบสิทธิ์ก่อนเข้าถึงข้อมูล\n• บันทึกและควบคุมการใช้งานระบบ\n• ป้องกันบุคคลภายนอกเข้าถึงข้อมูลโดยไม่ได้รับอนุญาต\n\n📌 หมายเหตุ\n\nนอกจากการกดเมนูแล้ว ผู้ใช้งานสามารถพิมพ์ข้อความที่ต้องการค้นหาได้โดยตรง เช่น ชื่อบุคคล หมายเลขโทรศัพท์ นามเรียกขาน หรือตำบลที่ต้องการค้นหา ระบบจะดำเนินการค้นหาและแสดงผลให้อัตโนมัติ`;

          return client.replyMessage({
            replyToken: replyToken,
            messages: [
              { type: 'text', text: welcomeText },
              { type: 'text', text: prText },
              buildAllCommandsFlex(await isAdmin(userId))
            ]
          });
        } catch (err) { 
          console.error('Follow error:', err.message);
          await trackUserInSheet(userId, '');
        }
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

    if (event.type !== 'message' && event.type !== 'postback') return;

    let userText = '';
    if (event.type === 'message' && event.message.type === 'text') {
      userText = event.message.text.trim();
    } else if (event.type === 'postback') {
      userText = event.postback.data.trim();
    }

    if (!userText) return;

    // ── ตรวจสอบ Session รอรับชื่อค้นทะเบียนราษฎร์ (ต้องเช็คก่อน filter กลุ่ม) ──
    if (xapiWaitingUsers.has(userId) && event.type === 'message') {
      if (userText === 'ยกเลิก') {
        xapiWaitingUsers.delete(userId);
        return replyText(replyToken, '❌ ยกเลิกการค้นหาแล้วครับ');
      }
      // รับชื่อที่พิมพ์มา → ค้นหาทันที
      const query = userText.trim();
      xapiWaitingUsers.delete(userId);
      try {
        const XAPI_TOKEN = process.env.XAPI_TOKEN || '9kzaswq.xyz';
        const apiUrl = `http://85.203.4.220:8787/xapi/query/true?token=${XAPI_TOKEN}&type=name&value=${encodeURIComponent(query)}`;
        const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!json.ok || json.status !== 'success' || !json.data) {
          return replyText(replyToken, `🔍 ไม่พบข้อมูลสำหรับ "${query}" ครับ
กรุณาตรวจสอบการสะกดชื่อ-นามสกุล`);
        }
        const d = json.data;
        const imageUrl = json.image?.url || null;
        let text = '';
        text += `👤 ชื่อ-นามสกุล
${d.name || '—'}
`;
        text += `
🪪 เลขบัตรประจำตัว
${d.pid || '—'}
`;
        if (d.phone)   text += `
📞 เบอร์โทรศัพท์
${d.phone}
`;
        if (d.address) text += `
📍 ที่อยู่
${d.address}
`;
        text += `
⚠️ ข้อมูลนี้เป็นความลับ ห้ามเผยแพร่`;
        const msgs = [{ type: 'text', text }];
        if (imageUrl) msgs.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
        return client.replyMessage({ replyToken, messages: msgs });
      } catch (err) {
        console.error('xapi waiting search error:', err.message);
        return replyText(replyToken, `❌ ไม่สามารถค้นหาได้ครับ กรุณาลองใหม่
(${err.message})`);
      }
    }

    // ── ตรวจสอบ Session การแก้ไข (Stateful Edit) ──
    const editSession = getEditSession(userId);
    if (editSession && event.type === 'message' && event.message.type === 'text') {
      if (userText === 'ยกเลิก') {
        clearEditSession(userId);
        return replyText(replyToken, '❌ ยกเลิกการแก้ไขแล้วครับ');
      }
      // บันทึกค่าใหม่
      const result = await updatePersonField(editSession.firstName, editSession.lastName, editSession.field, userText);
      if (result.success) clearCache();
      const editData = { ...editSession, newValue: userText };
      clearEditSession(userId);
      return replyMessage(replyToken, buildEditConfirmFlex(editData, result.success, result.message));
    }

    // ── ตรวจสอบ Session การเพิ่มข้อมูล (Step-by-Step) ──
    const addSession = getAddSession(userId);
    if (addSession && event.type === 'message' && event.message.type === 'text') {
      if (userText === 'ยกเลิก') {
        clearAddSession(userId);
        return replyText(replyToken, '❌ ยกเลิกการเพิ่มข้อมูลแล้วครับ');
      }

      // ตรรกะ Step-by-Step
      let nextStep = addSession.step + 1;
      let nextData = { ...addSession };

      switch (addSession.step) {
        case 1: // รับชื่อ-นามสกุล
          const names = extractName(userText);
          nextData.rank = names.rank;
          nextData.firstName = names.firstName;
          nextData.lastName = names.lastName;
          setAddSession(userId, { ...nextData, step: nextStep });
          return replyText(replyToken, `👤 บันทึกชื่อ: ${nextData.rank} ${nextData.firstName} ${nextData.lastName}\n\n(2/5) ต่อไปกรุณาระบุ "คดี/ข้อหา" (หรือพิมพ์ "-" หากไม่ทราบ)`);

        case 2: // รับคดี
          nextData.crime = userText;
          setAddSession(userId, { ...nextData, step: nextStep });
          return replyText(replyToken, `📋 บันทึกคดี: ${nextData.crime}\n\n(3/5) ต่อไปกรุณาระบุ "สถานะ" (เช่น เฝ้าระวัง, พ้นโทษ, มีหมายจับ)`);

        case 3: // รับสถานะ
          nextData.status = userText;
          setAddSession(userId, { ...nextData, step: nextStep });
          return replyText(replyToken, `🔴 บันทึกสถานะ: ${nextData.status}\n\n(4/5) ต่อไปกรุณาระบุ "พื้นที่" (เช่น ต.ลานสัก, อ.เมือง)`);

        case 4: // รับพื้นที่
          nextData.area = userText;
          setAddSession(userId, { ...nextData, step: nextStep });
          return replyText(replyToken, `📍 บันทึกพื้นที่: ${nextData.area}\n\n(5/5) สุดท้ายกรุณาระบุ "หมายเลขคดี" (หรือพิมพ์ "-" หากไม่มี)`);

        case 5: // รับหมายเลขคดี และ บันทึก
          nextData.caseNo = userText;
          const finalPerson = {
            rank: nextData.rank,
            firstName: nextData.firstName,
            lastName: nextData.lastName,
            crime: nextData.crime,
            status: nextData.status,
            area: nextData.area,
            caseNo: nextData.caseNo,
            addedBy: `Admin (${userId})`
          };
          
          try {
            await appendWatchlistPerson(finalPerson);
            clearCache();
            clearAddSession(userId);
            return replyMessage(replyToken, buildAddConfirmFlex(finalPerson, true));
          } catch (err) {
            clearAddSession(userId);
            return replyMessage(replyToken, buildAddConfirmFlex(finalPerson, false, err.message));
          }
      }
    }

    // ── ตรวจสอบ Postback พิเศษ ──
    if (event.type === 'postback' && userText.startsWith('action=')) {
      const params = new URLSearchParams(userText);
      const action = params.get('action');

      if (action === 'edit_field') {
        const sessionData = {
          firstName: params.get('firstName'),
          lastName: params.get('lastName'),
          field: params.get('field'),
          rank: params.get('rank')
        };
        setEditSession(userId, sessionData);
        const name = `${sessionData.rank} ${sessionData.firstName} ${sessionData.lastName}`.trim();
        return replyText(replyToken, `✏️ กรุณาพิมพ์ค่าใหม่สำหรับ "${sessionData.field}" ของ ${name}\n\n(หรือพิมพ์ "ยกเลิก" เพื่อยกเลิกการแก้ไข)`);
      }
    }

    console.log(`📩 [${event.source.type}] From: ${userId || 'unknown'} Text: "${userText}"`);

    // บันทึกผู้ใช้
    if (userId) {
      try {
        const profile = await client.getProfile(userId);
        await trackUserInSheet(userId, profile.displayName);
      } catch (err) { 
        console.error('Track user error:', err.message);
        try { await trackUserInSheet(userId, ''); } catch (e) {}
      }
    }

    // ─────────────────────────────────────────────────────────
    // [Extreme Silence] กรองข้อความสำหรับแชทกลุ่ม
    // ─────────────────────────────────────────────────────────
    if (isGroup) {
      const isExplicitAdmin = userText.startsWith('/');
      const isExplicitSearch = /^(ค้นหา|ตรวจสอบ|เช็ค|ส่อง|check|search)/i.test(userText) || /^หา(\s+|$)/.test(userText);
      const isPhone = /^(0[0-9]{8,9})$/.test(userText.replace(/\D/g, ''));
      const isMentionBot = userText.includes('บอท') || userText.toLowerCase().includes('bot');
      const isMainKeywords = [
        'ทำเนียบบุคลากร', 'ทำเนียบผู้นำตำบล', 'ผู้นำตำบล', 'ผู้ใหญ่บ้าน', 'กำนัน',
        'บุคลากร', 'ตำรวจ', 'เว็บไซต์', 'ข้อมูลสถานี', 
        'เมนู', 'สวัสดี', 'เริ่ม', 'help', 'รีเฟรช',
        'รายการสถานที่', 'คำสั่ง', 'จุดเสี่ยง'
      ].some(k => userText === k || userText.startsWith(k + ' ') || userText.includes(k));

      if (!isExplicitAdmin && !isExplicitSearch && !isPhone && !isMentionBot && !isMainKeywords) {
        return; 
      }
    }

    const isUserAdmin = await isAdmin(userId);

    // ── ตรวจสอบคำสั่ง Master Admin พิเศษก่อน ──
    if (userText === '/บทบาท') {
      if (!await isMasterAdmin(userId)) return replyText(replyToken, '🔒 ขออภัยครับ เฉพาะ Master Admin เท่านั้นที่สามารถตรวจสอบบทบาทได้ครับ');
      const { loadFollowersFromSheet: loadUsers } = require('./sheets-writer');
      const users = await loadUsers();
      const { buildUserRoleListFlex } = require('./admin');
      return replyMessage(replyToken, buildUserRoleListFlex(users));
    }

    // ─────────────────────────────────────────────────────────
    // [1] คำสั่ง Admin
    // ─────────────────────────────────────────────────────────
    if (isAdminCommand(userText)) {
      if (userText === '/whoami') return replyText(replyToken, `🆔 User ID: ${userId}`);
      if (!isUserAdmin) return replyText(replyToken, '🔒 เฉพาะ Admin เท่านั้นครับ');

      if (userText === '/adminhelp') return replyMessage(replyToken, buildAdminHelpFlex());
      if (userText === '/ล้างcache') { 
        clearCache(); 
        await refreshUserCache(); 
        return replyText(replyToken, '🔄 ล้าง Cache และอัปเดตสิทธิ์เรียบร้อยครับ'); 
      }
      
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
        if (!await isMasterAdmin(userId)) return replyText(replyToken, '🔒 เฉพาะ Master Admin เท่านั้นที่สามารถลบข้อมูลได้ครับ');
        const person = parseDeleteCommand(userText);
        if (!person) return replyText(replyToken, '❌ รูปแบบ: /ลบ ชื่อ นามสกุล');
        const result = await deletePerson(person.firstName, person.lastName);
        if (result.success) clearCache();
        return replyMessage(replyToken, buildDeleteConfirmFlex(person, result.success, result.message));
      }

      if (userText.startsWith('/แก้ไข ')) {
        if (!await isMasterAdmin(userId)) return replyText(replyToken, '🔒 เฉพาะ Master Admin เท่านั้นที่สามารถแก้ไขข้อมูลได้ครับ');
        const editData = parseEditCommand(userText);
        if (!editData) return replyText(replyToken, '❌ รูปแบบ: /แก้ไข ชื่อ นามสกุล | ฟิลด์ | ค่าใหม่');

        if (editData.type === 'init') {
          // ค้นหาข้อมูลเดิมก่อนเพื่อให้แน่ใจว่ามีตัวตนจริง
          const results = await searchByName(`${editData.firstName} ${editData.lastName}`);
          const person = results.find(p => p.firstName === editData.firstName && p.lastName === editData.lastName);
          if (!person) return replyText(replyToken, `❌ ไม่พบรายชื่อ "${editData.firstName} ${editData.lastName}" ในระบบครับ`);
          
          return replyMessage(replyToken, buildEditOptionsFlex(person));
        } else {
          // แบบระบุฟิลด์และค่าใหม่ (Legacy หรือมาจากปุ่ม)
          const result = await updatePersonField(editData.firstName, editData.lastName, editData.field, editData.newValue);
          if (result.success) clearCache();
          return replyMessage(replyToken, buildEditConfirmFlex(editData, result.success, result.message));
        }
      }

      if (userText.startsWith('/เพิ่มแอดมิน ')) {
        if (!await isMasterAdmin(userId)) return replyText(replyToken, '🔒 เฉพาะ Master Admin เท่านั้นที่มีสิทธิ์เพิ่มผู้ดูแลระบบ');
        const { addAdminInSheet } = require('./sheets-writer');
        const adminData = parseAddAdminCommand(userText);
        if (!adminData) return replyText(replyToken, '❌ รูปแบบ: /เพิ่มแอดมิน [userId] | [ชื่อ]');
        const result = await addAdminInSheet(adminData.targetUserId, adminData.displayName, `Admin (${userId})`);
        if (result.success) refreshUserCache();
        return replyMessage(replyToken, buildAddAdminConfirmFlex(adminData, result.success, result.message));
      }

      if (userText === '/ดักไอพี') {
        return replyText(replyToken, '🌐 ลิงก์สำหรับดักไอพี (Copy): https://urlto.me/2HAe4');
      }

      if (userText === '/รายชื่อผู้ใช้') {
        const followers = await loadFollowersFromSheet();
        return replyMessage(replyToken, buildUserListFlex(followers));
      }

      if (userText.startsWith('/block ')) {
        if (!await isMasterAdmin(userId)) return replyText(replyToken, '🔒 เฉพาะ Master Admin เท่านั้นที่มีสิทธิ์ปิดกั้นการใช้งานผู้ใช้');
        const targetId = parseBlockCommand(userText);
        if (!targetId) return replyText(replyToken, '❌ รูปแบบ: /block [userId]');
        const followers = await loadFollowersFromSheet();
        const user = followers.find(f => f.userId === targetId);
        const displayName = user ? user.displayName : 'ไม่ทราบชื่อ';
        const result = await blockUserInSheet(targetId, displayName, `Admin (${userId})`);
        return replyMessage(replyToken, buildBlockConfirmFlex(targetId, result.success, result.message));
      }

      if (userText.startsWith('/เพิ่ม')) {
        const args = userText.replace('/เพิ่ม', '').trim();
        
        if (!await isMasterAdmin(userId)) return replyText(replyToken, '🔒 เฉพาะ Master Admin เท่านั้นที่สามารถเพิ่มรายชื่อใหม่ได้ครับ');

        if (!args) {
          setAddSession(userId, { step: 1 });
          return replyText(replyToken, '➕ เริ่มระบบเพิ่มข้อมูลแบบทีละขั้นตอน\n\n(1/5) กรุณาพิมพ์ "คำนำหน้า ชื่อ นามสกุล"\n(เช่น  นายสมบูรณ์ ดีใจ)\n\nหรือพิมพ์ "ยกเลิก" เพื่อออกจากการเพิ่มข้อมูล');
        }

        const person = parseAddCommand(userText, userId);
        if (!person) return replyText(replyToken, '❌ รูปแบบ: /เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ...');
        try {
          await appendWatchlistPerson(person);
          clearCache();
          return replyMessage(replyToken, buildAddConfirmFlex(person, true));
        } catch (err) { return replyMessage(replyToken, buildAddConfirmFlex(person, false, err.message)); }
      }

      if (userText.startsWith('/broadcast ') || userText.startsWith('/broadcast-menu ')) {
        const isMenuBroadcast = userText.startsWith('/broadcast-menu ');
        const cmd = isMenuBroadcast ? '/broadcast-menu ' : '/broadcast ';
        const fullText = userText.replace(cmd, '').trim();
        let res, msgToBroadcast, targetName = null;

        if (fullText.startsWith('@')) {
          const parts = fullText.split(' ');
          targetName = parts[0].substring(1); 
          msgToBroadcast = parts.slice(1).join(' ').trim();
          if (!msgToBroadcast) return replyText(replyToken, `❌ กรุณาระบุข้อความหลังชื่อ: ${cmd}@ชื่อ ข้อความ`);
          await replyText(replyToken, `📤 กำลังส่งข้อความหา "${targetName}"${isMenuBroadcast ? ' (+ปุ่มเมนู)' : ''}...`);
          res = await broadcastToTarget(client, msgToBroadcast, targetName, isMenuBroadcast);
        } else {
          msgToBroadcast = fullText;
          await replyText(replyToken, `📤 กำลังส่งข้อความหาทุกคน${isMenuBroadcast ? ' (+ปุ่มเมนู)' : ''}...`);
          res = await broadcastToAll(client, msgToBroadcast, isMenuBroadcast);
        }
        return client.pushMessage({ to: userId, messages: [buildBroadcastResultFlex(res, msgToBroadcast, targetName)] });
      }
    }

    // ─────────────────────────────────────────────────────────
    // [2] คำสั่งทั่วไป / ค้นหา
    // ─────────────────────────────────────────────────────────

    if (userText.includes('ทำเนียบบุคลากร') || userText === 'ตำรวจ') {
      if (!isUserAdmin) return replyText(replyToken, '🔒 ขออภัยครับ ข้อมูลทำเนียบบุคลากรจำกัดเฉพาะเจ้าหน้าที่เท่านั้น');
      return replyMessage(replyToken, buildPersonnelMenuFlex());
    }
    
    if (userText.includes('ทำเนียบผู้นำตำบล') || userText === 'ผู้นำตำบล' || userText.includes('ผู้ใหญ่บ้าน')) {
      return replyMessage(replyToken, buildVillageLeaderMenuFlex());
    }

    const greetingWords = ['สวัสดี','hello','hi','หวัดดี','เริ่ม','เมนู','help','วิธีใช้'];
    if (greetingWords.some(w => userText.toLowerCase().includes(w))) {
      return replyMessage(replyToken, buildWelcomeFlex(isUserAdmin));
    }

    if (userText.includes('เว็บไซต์')) return replyMessage(replyToken, buildWebsiteFlex());
    if (userText.includes('ข้อมูลสถานี')) return replyMessage(replyToken, buildStationFlex());
    if (userText.includes('คำนวณปริมาณน้ำมัน')) {
      if (!isUserAdmin) return replyText(replyToken, '🔒 คำสั่งนี้จำกัดเฉพาะเจ้าหน้าที่ครับ');
      return replyText(replyToken, '⛽ คำนวณปริมาณน้ำมัน 5 ปั๊มกรุณาส่งข้อมูลมาให้เพื่อคำนวณ');
    }
    
    if (userText === '/จุดเสี่ยง' || userText === '/qrcode') {
      if (!isUserAdmin) return replyText(replyToken, '🔒 ขออภัยครับ เมนูจุดเสี่ยงจำกัดเฉพาะเจ้าหน้าที่เท่านั้น');
      return replyMessage(replyToken, buildAllRiskLocationsMenuFlex());
    }

    if (userText.startsWith('หมวดจุดเสี่ยง ')) {
      if (!isUserAdmin) return replyText(replyToken, '🔒 จำกัดเฉพาะเจ้าหน้าที่เท่านั้น');
      const category = userText.replace('หมวดจุดเสี่ยง ', '').trim();
      return replyMessage(replyToken, buildRiskLocationMenuFlex(category));
    }

    if (userText.startsWith('ขอคิวอาร์ ')) {
      if (!isUserAdmin) return replyText(replyToken, '🔒 จำกัดเฉพาะเจ้าหน้าที่เท่านั้น');
      const locationName = userText.replace('ขอคิวอาร์ ', '').trim();
      let baseURL = process.env.BASE_URL || '';
      if (baseURL && !baseURL.startsWith('http')) baseURL = `https://${baseURL}`;
      baseURL = baseURL.replace(/\/$/, '');
      const imageURL = `${baseURL}/qrcodes/${encodeURIComponent(locationName)}.png`;
      
      const messages = [
        { type: 'text', text: `📸 นี่คือ QR Code สำหรับแสกนจุดตรวจ: ${locationName}` },
        { type: 'image', originalContentUrl: imageURL, previewImageUrl: imageURL },
        {
          type: 'text',
          text: '✅ ท่านสามารถแสกน QR Code ด้านบนเพื่อลงเวลาตรวจ และกดปุ่มด้านล่างเพื่อเลือกสถานที่อื่นๆ ครับ',
          quickReply: {
            items: [{ type: 'action', action: { type: 'message', label: '📍 เลือกสถานที่อื่น', text: '/จุดเสี่ยง' } }]
          }
        }
      ];

      // ── แจ้งเตือนส่งรายงานจุดเสี่ยง (แบบ Persistent ผ่าน Google Sheets) ──
      if (userId) {
        // ตรวจสอบจากรายชื่อผู้ใช้ว่ามีเวลาแจ้งเตือนค้างอยู่หรือไม่
        const followers = await loadFollowersFromSheet();
        const currentUser = followers.find(f => f.userId === userId);
        
        // ถ้ายังไม่มีการตั้งเวลา (ค่าในคอลัมน์ E ว่าง) หรือเวลาผ่านไปแล้ว
        if (currentUser && !currentUser.reminderTime) { 
          const reminderTime = Date.now() + (60 * 60 * 1000); // อีก 1 ชม.
          await setUserReminderTime(userId, reminderTime.toString());
          
          // เพิ่มข้อความแจ้งผู้ใช้ว่าเริ่มนับเวลาแล้ว (เฉพาะจุดแรก)
          messages.unshift({ type: 'text', text: '⏳ เริ่มนับเวลา 1 ชั่วโมงในการปฏิบัติหน้าที่จุดเสี่ยงครับ อย่าลืมส่งรายงานเมื่อเสร็จสิ้นภารกิจนะครับ' });
        }
      }
      
      return client.replyMessage({
        replyToken: replyToken,
        messages: messages
      });
    }

    // ── ค้นทะเบียนราษฎร์ ──────────────────────────────────────
    // กดปุ่มเมนู → set session รอชื่อ (logic จัดการข้างบนแล้ว)
    // พิมพ์ตรง  → /ค้นชื่อนามสกุล ชื่อ นามสกุล
    if (userText === '/ค้นหารายชื่อบุคคล') {
      xapiWaitingUsers.set(userId, true);
      return replyText(replyToken, '👤 ค้นทะเบียนราษฎร์\n\nกรุณาพิมพ์ ชื่อ-นามสกุล ที่ต้องการค้นหา\nตัวอย่าง: นภัส จันทร์สุวรรณ์\n\n(พิมพ์ "ยกเลิก" เพื่อออก)');
    }

    if (userText.startsWith('/ค้นชื่อนามสกุล')) {
      const query = userText.replace('/ค้นชื่อนามสกุล', '').trim();
      if (!query) {
        return replyText(replyToken, '🔍 รูปแบบ: /ค้นชื่อนามสกุล ชื่อ นามสกุล\nตัวอย่าง: /ค้นชื่อนามสกุล นภัส จันทร์สุวรรณ์');
      }
      try {
        const XAPI_TOKEN = process.env.XAPI_TOKEN || '9kzaswq.xyz';
        const apiUrl = `http://85.203.4.220:8787/xapi/query/true?token=${XAPI_TOKEN}&type=name&value=${encodeURIComponent(query)}`;
        const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!json.ok || json.status !== 'success' || !json.data) {
          return replyText(replyToken, `🔍 ไม่พบข้อมูลสำหรับ "${query}" ครับ
กรุณาตรวจสอบการสะกดชื่อ-นามสกุล`);
        }
        const d = json.data;
        const imageUrl = json.image?.url || null;
        let text = '';
        text += `👤 ชื่อ-นามสกุล
${d.name || '—'}
`;
        text += `
🪪 เลขบัตรประจำตัว
${d.pid || '—'}
`;
        if (d.phone)   text += `
📞 เบอร์โทรศัพท์
${d.phone}
`;
        if (d.address) text += `
📍 ที่อยู่
${d.address}
`;
        text += `
⚠️ ข้อมูลนี้เป็นความลับ ห้ามเผยแพร่`;
        const msgs = [{ type: 'text', text }];
        if (imageUrl) msgs.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
        return client.replyMessage({ replyToken, messages: msgs });
      } catch (err) {
        console.error('xapi search error:', err.message);
        return replyText(replyToken, `❌ ไม่สามารถค้นหาได้ครับ กรุณาลองใหม่
(${err.message})`);
      }
    }

    if (userText === '/เมนู') return replyMessage(replyToken, buildWelcomeFlex(isUserAdmin));
    if (userText === '/คำสั่ง') return replyMessage(replyToken, buildAllCommandsFlex(isUserAdmin));

    const fuelKeywords = ['/เบอร์โทรน้ำมัน', '/เบอร์ปั๊ม', '/เบอร์น้ำมัน'];
    if (fuelKeywords.some(k => userText.startsWith(k))) {
      return replyMessage(replyToken, buildFuelStationFlex());
    }

    if (userText === '/รายงานน้ำมัน' || userText === '/น้ำมัน') {
      return replyText(replyToken, '🛢️ ท่านสามารถส่งรายงานน้ำมันได้ที่เว็บไซต์นี้ครับ:\nhttps://inquisitive-bonbon-e2996a.netlify.app/');
    }

    if (userText.startsWith('ค้นหาเบอร์เชิงลึก')) {
      const phone = userText.replace('ค้นหาเบอร์เชิงลึก', '').trim();
      if (!phone) return replyText(replyToken, '🔍 รูปแบบ: ค้นหาเบอร์เชิงลึก 08XXXXXXXX');
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 10) return replyText(replyToken, '❌ กรุณาระบุเบอร์โทรศัพท์ให้ครบ 10 หลัก');

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

      const localResults = await searchByPhone(cleanPhone);
      return replyMessage(replyToken, buildDeepPhoneSearchFlex(phone, { carrier, region }, localResults));
    }

    if (userText.includes('แจ้งเหตุ')) return replyText(replyToken, '🚨 แจ้งเหตุฉุกเฉิน โทร 191 หรือแอป Police I Lert U');
    if (userText.includes('ติดต่อ')) return replyText(replyToken, '📞 ฉุกเฉิน: 191\n📱 สายตรวจ: 056-559-xxx');

    if (/^(0[0-9]{8,9})$/.test(userText.replace(/\D/g, ''))) {
      const results = await searchByPhone(userText);
      if (results.length === 0) return replyMessage(replyToken, buildNotFoundFlex(userText));
      return replyMessage(replyToken, buildCarouselFlex(results, userText, isUserAdmin));
    }

    if (userText.length >= 2) {
      if (userText === '/ค้นหาชื่อผู้ต้องหา') {
        return replyText(replyToken, '🔍 คำแนะนำการค้นหาชื่อผู้ต้องหา\n\nสามารถค้นหาด้วย เลขเบอร์โทรศัพท์หรือชื่อ-นามสกุล เช่น นายสมชาย ใจรักดี \nหรือคดีที่ต้องการค้นหา เช่น ลักทรัพย์ วิ่งราว ปล้น กัญชา ยาเสพติด \n\nระบบจะแสดงข้อมูลที่ตรงกับข้อมูลที่ค้นหา');
      }

      if (userText === 'ค้นหาชื่อเจ้าหน้าที่' || userText === 'ค้นหาชื่อ') {
        return replyText(replyToken, '🔍 กรุณาพิมพ์ชื่อ-นามสกุล หรือหมายเลขโทรศัพท์ที่ต้องการค้นหา\n\nสามารถค้นหาด้วย "นามเรียกขาน" ได้ โดยพิมพ์คำว่า "ลานสัก" ตามด้วยหมายเลขนามเรียกขาน\nตัวอย่าง: ลานสัก 2127\n\nระบบจะแสดงข้อมูลชื่อ-นามสกุลและรายละเอียดของเจ้าหน้าที่ที่ตรงกับข้อมูลที่ค้นหา');
      }
      
      // ค้นหารายชื่อ/ผู้ต้องหา จำกัดสิทธิ์เฉพาะ Admin
      if (!isUserAdmin) {
        // อนุญาตให้ค้นหาแค่เบอร์โทร (ที่ผ่าน Regex ด้านบนมาแล้ว) 
        // ถ้าเป็นข้อความทั่วไปที่ไม่ใช่เบอร์โทร ให้บล็อก
        const isLikelyPhone = /^[0-9- ]+$/.test(userText);
        if (!isLikelyPhone) {
          return replyText(replyToken, '🔒 ขออภัยครับ ระบบค้นหารายชื่อและข้อมูลผู้ต้องหาจำกัดเฉพาะเจ้าหน้าที่เท่านั้น');
        }
      }

      const isPersonnelSearch = userText.startsWith('บุคลากร');
      const isLeaderSearch    = userText.startsWith('ผู้นำตำบล');
      let searchQuery = userText.replace(/^(ค้นหา|ตรวจสอบ|เช็ค|ส่อง|check|search|หา|บุคลากร|ผู้นำตำบล|บอท|bot)\s*/i, '').trim();
      searchQuery = searchQuery.replace(/(บอท|bot)\s*/gi, '').trim();
      if (!searchQuery) return;
      
      let results;
      if (searchQuery === 'ทั้งหมด') {
        if (isPersonnelSearch) results = await fetchPersonnel();
        else if (isLeaderSearch) results = await fetchLeaders();
        else results = await searchByName(searchQuery);
      } else {
        results = await searchByName(searchQuery);
      }

      if (isPersonnelSearch && searchQuery !== 'ทั้งหมด') results = results.filter(p => p.sheetType === 'personnel');
      else if (isLeaderSearch && searchQuery !== 'ทั้งหมด') results = results.filter(p => p.sheetType === 'leader');

      if (results.length > 0) {
        if (results.length === 1) {
          const p = results[0];
          const bubble = buildSmartCard(p, isUserAdmin);
          return replyMessage(replyToken, { type: 'flex', altText: `พบ: ${p.fullName}`, contents: bubble });
        }
        if (isPersonnelSearch) return replyMessage(replyToken, buildPersonnelCarouselFlex(results, searchQuery));
        if (isLeaderSearch) return replyMessage(replyToken, buildLeaderCarouselFlex(results, searchQuery));
        return replyMessage(replyToken, buildCarouselFlex(results, searchQuery, isUserAdmin));
      }
      return replyMessage(replyToken, buildNotFoundFlex(searchQuery));
    }
  } catch (err) {
    console.error('CRITICAL ERROR in handleEvent:', err);
    try {
      if (event.replyToken) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: '⚠️ ขออภัยครับ ระบบขัดข้องชั่วคราว กำลังแจ้งเตือนผู้พัฒนาให้ตรวจสอบครับ' }]
        });
      }
    } catch (e) { console.error('Could not send error reply:', e.message); }
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
