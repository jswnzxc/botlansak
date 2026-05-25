// ============================================================
//  admin.js  — ระบบคำสั่งลับ Admin
//  คำสั่งที่ใช้งานได้:
//
//  /เพิ่ม <ยศ> <ชื่อ> <นามสกุล> | <คดี> | <สถานะ> | <พื้นที่> | <หมายเลขคดี>
//  /broadcast <ข้อความ>
//  /สถิติ
//  /adminhelp
// ============================================================

require('dotenv').config();
const { appendWatchlistPerson, isConfigured } = require('./sheets-writer');

// Admin LINE User IDs (ใส่ได้หลายคน)
// วิธีหา userId: ดูจาก console log เมื่อ Admin ส่งข้อความครั้งแรก
// หรือใช้ /whoami เพื่อให้บอทตอบ userId กลับมา
const ADMIN_IDS = (process.env.ADMIN_LINE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// รหัสลับ (optional) — ถ้าตั้งใน .env จะต้องพิมพ์รหัสก่อนคำสั่ง
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

/**
 * ตรวจว่าเป็น Admin หรือไม่
 */
function isAdmin(userId) {
  if (ADMIN_IDS.length === 0) return false; // ยังไม่ตั้งค่า Admin
  return ADMIN_IDS.includes(userId);
}

/**
 * ตรวจว่าข้อความเป็นคำสั่ง Admin หรือไม่
 */
function isAdminCommand(text) {
  return text.startsWith('/เพิ่ม') ||
         text.startsWith('/broadcast') ||
         text.startsWith('/สถิติ') ||
         text.startsWith('/adminhelp') ||
         text.startsWith('/whoami');
}

/**
 * Parse คำสั่ง /เพิ่ม
 * รูปแบบ: /เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ | พื้นที่ | หมายเลขคดี
 * ตัวอย่าง: /เพิ่ม นาย สมชาย ใจร้าย | ยาเสพติด | เฝ้าระวัง | ลานสัก | อ.123/67
 */
function parseAddCommand(text, userId) {
  // ตัด "/เพิ่ม " ออก
  const content = text.replace(/^\/เพิ่ม\s+/, '').trim();
  const parts = content.split('|').map(s => s.trim());

  // ส่วนแรก: "ยศ ชื่อ นามสกุล" แยกด้วย space
  const nameParts = (parts[0] || '').trim().split(/\s+/);

  let rank = '', firstName = '', lastName = '';

  // ยศที่รู้จัก
  const RANKS = ['นาย', 'นาง', 'น.ส.', 'ด.ช.', 'ด.ญ.', 'พ.ต.อ.', 'พ.ต.ท.', 'พ.ต.ต.',
                 'ร.ต.อ.', 'ร.ต.ท.', 'ร.ต.ต.', 'ส.ต.อ.', 'ส.ต.ท.', 'ส.ต.ต.',
                 'จ.ส.ต.', 'ดาบตำรวจ', 'สิบตำรวจ'];

  if (nameParts.length >= 2) {
    // ถ้าคำแรกเป็นยศ ให้แยกออกมา
    if (RANKS.includes(nameParts[0])) {
      rank = nameParts[0];
      firstName = nameParts[1];
      lastName = nameParts.slice(2).join(' ') || '-'; // ถ้าไม่มีนามสกุลให้ใส่ขีด
    } else {
      // ถ้าคำแรกไม่ใชยศ ให้เป็นชื่อเลย
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
  } else if (nameParts.length === 1) {
    firstName = nameParts[0];
  } else {
    return null; // ข้อมูลไม่ครบ
  }

  return {
    rank,
    firstName,
    lastName,
    crime:     parts[1] || '',
    status:    parts[2] || 'เฝ้าระวัง',
    area:      parts[3] || '',
    caseNo:    parts[4] || '',
    addedBy:   `Admin (${userId})`,
  };
}

/**
 * สร้าง Flex Message ยืนยันการเพิ่มบุคคล
 */
function buildAddConfirmFlex(person, success, error) {
  if (!success) {
    return {
      type: 'flex',
      altText: '❌ เพิ่มไม่สำเร็จ',
      contents: {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          spacing: 'sm',
          contents: [
            { type: 'text', text: '❌ เพิ่มข้อมูลไม่สำเร็จ', color: '#cc3333', weight: 'bold', size: 'md' },
            { type: 'text', text: error || 'เกิดข้อผิดพลาด', color: '#888888', size: 'sm', wrap: true, margin: 'sm' },
          ],
        },
      },
    };
  }

  return {
    type: 'flex',
    altText: `✅ เพิ่ม ${person.firstName} ${person.lastName} สำเร็จ`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1a5276',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '🔐 คำสั่ง Admin', color: '#aed6f1', size: 'xs' },
          { type: 'text', text: '✅ เพิ่มบุคคลเฝ้าระวังสำเร็จ', color: '#ffffff', size: 'md', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          buildAdminRow('👤', 'ชื่อ',          `${person.rank} ${person.firstName} ${person.lastName}`.trim()),
          buildAdminRow('📋', 'คดี',           person.crime   || '-'),
          buildAdminRow('🔴', 'สถานะ',         person.status  || '-'),
          buildAdminRow('📍', 'พื้นที่',       person.area    || '-'),
          buildAdminRow('🔢', 'หมายเลขคดี',   person.caseNo  || '-'),
          { type: 'separator', margin: 'md', color: '#eeeeee' },
          {
            type: 'text',
            text: '📊 ข้อมูลถูกบันทึกลง Google Sheets แล้ว',
            color: '#27ae60',
            size: 'xs',
            margin: 'md',
            align: 'center',
          },
        ],
      },
    },
  };
}

/**
 * สร้าง Flex Message คำแนะนำการใช้ Admin
 */
function buildAdminHelpFlex() {
  return {
    type: 'flex',
    altText: '🔐 คู่มือคำสั่ง Admin',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1a3a6e',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🔐 คำสั่ง Admin', color: '#a8c4e8', size: 'sm' },
          { type: 'text', text: 'สายตรวจภูธรลานสัก', color: '#ffffff', size: 'lg', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'md',
        contents: [
          // เพิ่มบุคคล
          {
            type: 'box', layout: 'vertical',
            backgroundColor: '#f0f4ff', cornerRadius: '8px', paddingAll: '12px',
            contents: [
              { type: 'text', text: '➕ เพิ่มบุคคลเฝ้าระวัง', color: '#1a3a6e', weight: 'bold', size: 'sm' },
              {
                type: 'text',
                text: '/เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ | พื้นที่ | หมายเลขคดี',
                color: '#555555', size: 'xs', wrap: true, margin: 'sm',
              },
              {
                type: 'text',
                text: 'ตัวอย่าง:\n/เพิ่ม นาย สมชาย ใจร้าย | ยาเสพติด | เฝ้าระวัง | ลานสัก | อ.123/67',
                color: '#27ae60', size: 'xs', wrap: true, margin: 'sm',
              },
            ],
          },
          // broadcast
          {
            type: 'box', layout: 'vertical',
            backgroundColor: '#fff8e1', cornerRadius: '8px', paddingAll: '12px',
            contents: [
              { type: 'text', text: '📢 แจ้งเตือนทุกคน', color: '#b45309', weight: 'bold', size: 'sm' },
              {
                type: 'text',
                text: '/broadcast ข้อความที่ต้องการส่ง',
                color: '#555555', size: 'xs', wrap: true, margin: 'sm',
              },
              {
                type: 'text',
                text: 'ตัวอย่าง:\n/broadcast ⚠️ แจ้งเตือนด่วน! มีหมายจับใหม่ 3 ราย',
                color: '#b45309', size: 'xs', wrap: true, margin: 'sm',
              },
            ],
          },
          // สถิติ
          {
            type: 'box', layout: 'vertical',
            backgroundColor: '#f0fdf4', cornerRadius: '8px', paddingAll: '12px',
            contents: [
              { type: 'text', text: '📊 ดูสถิติข้อมูล', color: '#1d6a4a', weight: 'bold', size: 'sm' },
              { type: 'text', text: '/สถิติ — ดูจำนวนข้อมูลใน Sheet', color: '#555555', size: 'xs', margin: 'sm' },
            ],
          },
          // whoami
          {
            type: 'box', layout: 'vertical',
            backgroundColor: '#fafafa', cornerRadius: '8px', paddingAll: '12px',
            contents: [
              { type: 'text', text: '🆔 ดู User ID', color: '#555555', weight: 'bold', size: 'sm' },
              { type: 'text', text: '/whoami — ดู LINE User ID ของคุณ', color: '#888888', size: 'xs', margin: 'sm' },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical',
        backgroundColor: '#f7f8fa', paddingAll: '10px',
        contents: [
          { type: 'text', text: '⚠️ คำสั่งเหล่านี้ใช้ได้เฉพาะ Admin เท่านั้น', color: '#cc4444', size: 'xs', align: 'center', wrap: true },
        ],
      },
    },
  };
}

function buildAdminRow(icon, label, value) {
  return {
    type: 'box', layout: 'horizontal', paddingAll: '4px',
    contents: [
      { type: 'text', text: icon,  size: 'sm', flex: 0 },
      { type: 'text', text: label, color: '#888888', size: 'sm', flex: 3, margin: 'sm' },
      { type: 'text', text: value, color: '#333333', size: 'sm', weight: 'bold', flex: 5, wrap: true, align: 'end' },
    ],
  };
}

module.exports = {
  isAdmin,
  isAdminCommand,
  parseAddCommand,
  appendWatchlistPerson,
  buildAddConfirmFlex,
  buildAdminHelpFlex,
  ADMIN_IDS,
};
