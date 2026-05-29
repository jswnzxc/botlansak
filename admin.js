const { 
  appendWatchlistPerson, 
  deletePerson, 
  updatePersonField, 
  isConfigured 
} = require('./sheets-writer');

// Admin LINE User IDs (ใส่ได้หลายคน)
const ADMIN_IDS = (process.env.ADMIN_LINE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * ตรวจว่าเป็น Admin หรือไม่
 */
function isAdmin(userId) {
  if (ADMIN_IDS.length === 0) return false; 
  return ADMIN_IDS.includes(userId);
}

/**
 * ตรวจว่าข้อความเป็นคำสั่ง Admin หรือไม่
 */
function isAdminCommand(text) {
  return text.startsWith('/เพิ่ม') ||
         text.startsWith('/ลบ') ||
         text.startsWith('/แก้ไข') ||
         text.startsWith('/รายชื่อ') ||
         text.startsWith('/broadcast') ||
         text.startsWith('/สถิติ') ||
         text.startsWith('/สถานะ') ||
         text.startsWith('/ล้างcache') ||
         text.startsWith('/adminhelp') ||
         text.startsWith('/whoami');
}

/**
 * แยก ยศ/ชื่อ/นามสกุล ออกจากข้อความ
 */
function extractName(fullName) {
  const nameParts = fullName.trim().split(/\s+/);
  let rank = '', firstName = '', lastName = '';
  const RANKS = ['นาย', 'นาง', 'นางสาว', 'น.ส.', 'ด.ช.', 'ด.ญ.',
                 'พล.ต.อ.', 'พล.ต.ท.', 'พล.ต.ต.', 'พ.ต.อ.', 'พ.ต.ท.', 'พ.ต.ต.',
                 'ร.ต.อ.', 'ร.ต.ท.', 'ร.ต.ต.', 'ส.ต.อ.', 'ส.ต.ท.', 'ส.ต.ต.',
                 'จ.ส.ต.', 'ด.ต.', 'ดาบตำรวจ', 'สิบตำรวจ',
                 'พล.ต.อ.หญิง', 'พล.ต.ท.หญิง', 'พล.ต.ต.หญิง', 'พ.ต.อ.หญิง', 'พ.ต.ท.หญิง', 'พ.ต.ต.หญิง',
                 'ร.ต.อ.หญิง', 'ร.ต.ท.หญิง', 'ร.ต.ต.หญิง', 'ส.ต.อ.หญิง', 'ส.ต.ท.หญิง', 'ส.ต.ต.หญิง',
                 'จ.ส.ต.หญิง', 'ด.ต.หญิง'];

  if (nameParts.length >= 2) {
    const foundRank = RANKS.find(r => nameParts[0] === r);
    if (foundRank) {
      rank = foundRank;
      firstName = nameParts[1];
      lastName = nameParts.slice(2).join(' ') || '-';
    } else {
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
  } else if (nameParts.length === 1) {
    firstName = nameParts[0];
  }
  return { rank, firstName, lastName };
}

/**
 * Parse คำสั่ง /เพิ่ม
 */
function parseAddCommand(text, userId) {
  const content = text.replace(/^\/เพิ่ม\s+/, '').trim();
  const parts = content.split('|').map(s => s.trim());
  const { rank, firstName, lastName } = extractName(parts[0]);

  if (!firstName) return null;

  return {
    rank, firstName, lastName,
    crime: parts[1] || '',
    status: parts[2] || 'เฝ้าระวัง',
    area: parts[3] || '',
    caseNo: parts[4] || '',
    addedBy: `Admin (${userId})`,
  };
}

/**
 * Parse คำสั่ง /ลบ
 * รูปแบบ: /ลบ [ยศ] ชื่อ นามสกุล
 */
function parseDeleteCommand(text) {
  const content = text.replace(/^\/ลบ\s+/, '').trim();
  const { firstName, lastName } = extractName(content);
  if (!firstName || !lastName || lastName === '-') return null;
  return { firstName, lastName };
}

/**
 * Parse คำสั่ง /แก้ไข
 * รูปแบบ: /แก้ไข [ยศ] ชื่อ นามสกุล | ฟิลด์ | ค่าใหม่
 */
function parseEditCommand(text) {
  const content = text.replace(/^\/แก้ไข\s+/, '').trim();
  const mainParts = content.split('|').map(s => s.trim());
  if (mainParts.length < 3) return null;

  const { firstName, lastName } = extractName(mainParts[0]);
  if (!firstName || !lastName || lastName === '-') return null;

  return {
    firstName,
    lastName,
    field: mainParts[1],
    newValue: mainParts[2]
  };
}

/**
 * สร้าง Flex Message ยืนยันการเพิ่ม
 */
function buildAddConfirmFlex(person, success, error) {
  if (!success) {
    return {
      type: 'flex',
      altText: '❌ เพิ่มไม่สำเร็จ',
      contents: {
        type: 'bubble', size: 'kilo',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
          contents: [
            { type: 'text', text: '❌ เพิ่มข้อมูลไม่สำเร็จ', color: '#cc3333', weight: 'bold' },
            { type: 'text', text: error || 'เกิดข้อผิดพลาด', color: '#888888', size: 'sm', wrap: true },
          ],
        },
      },
    };
  }

  return {
    type: 'flex',
    altText: `✅ เพิ่ม ${person.firstName} สำเร็จ`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1a5276', paddingAll: '14px',
        contents: [
          { type: 'text', text: '🔐 คำสั่ง Admin', color: '#aed6f1', size: 'xs' },
          { type: 'text', text: '✅ เพิ่มสำเร็จ', color: '#ffffff', size: 'md', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: [
          buildAdminRow('👤', 'ชื่อ', `${person.rank} ${person.firstName} ${person.lastName}`.trim()),
          buildAdminRow('📋', 'คดี', person.crime || '-'),
          buildAdminRow('🔴', 'สถานะ', person.status || '-'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '📊 บันทึกลง Sheets เรียบร้อย', color: '#27ae60', size: 'xs', align: 'center', margin: 'md' },
        ],
      },
    },
  };
}

/**
 * สร้าง Flex Message ยืนยันการลบ
 */
function buildDeleteConfirmFlex(person, success, message) {
  return {
    type: 'flex',
    altText: success ? `✅ ลบ ${person.firstName} สำเร็จ` : '❌ ลบไม่สำเร็จ',
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: [
          { type: 'text', text: success ? '✅ ลบข้อมูลสำเร็จ' : '❌ ลบไม่สำเร็จ', color: success ? '#27ae60' : '#cc3333', weight: 'bold' },
          { type: 'text', text: success ? `รายชื่อ ${person.firstName} ${person.lastName} ถูกลบแล้ว` : (message || 'เกิดข้อผิดพลาด'), color: '#555555', size: 'sm', wrap: true },
        ],
      },
    },
  };
}

/**
 * สร้าง Flex Message ยืนยันการแก้ไข
 */
function buildEditConfirmFlex(data, success, message) {
  return {
    type: 'flex',
    altText: success ? `✅ แก้ไขสำเร็จ` : '❌ แก้ไขไม่สำเร็จ',
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: [
          { type: 'text', text: success ? '✅ แก้ไขสำเร็จ' : '❌ แก้ไขไม่สำเร็จ', color: success ? '#27ae60' : '#cc3333', weight: 'bold' },
          { type: 'text', text: success ? `แก้ไข "${data.field}" เป็น "${data.newValue}" แล้ว` : (message || 'เกิดข้อผิดพลาด'), color: '#555555', size: 'sm', wrap: true },
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
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1a3a6e', paddingAll: '16px',
        contents: [
          { type: 'text', text: '🔐 ระบบจัดการหลังบ้าน', color: '#a8c4e8', size: 'sm' },
          { type: 'text', text: 'สายตรวจภูธรลานสัก', color: '#ffffff', size: 'lg', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        contents: [
          buildHelpItem('➕ เพิ่มบุคคล', '/เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ | พื้นที่ | หมายเลขคดี', '#f0f4ff', '#1a3a6e'),
          buildHelpItem('🗑️ ลบบุคคล', '/ลบ ชื่อ นามสกุล', '#fff5f5', '#c53030'),
          buildHelpItem('✏️ แก้ไขข้อมูล', '/แก้ไข ชื่อ นามสกุล | ฟิลด์ | ค่าใหม่', '#fffaf0', '#b45309'),
          buildHelpItem('📊 ดูระบบ', '/สถิติ, /สถานะ, /ล้างcache', '#f7fafc', '#4a5568'),
          buildHelpItem('🆔 ดู ID', '/whoami', '#fafafa', '#555555'),
        ],
      },
    },
  };
}

function buildHelpItem(title, cmd, bgColor, titleColor) {
  return {
    type: 'box', layout: 'vertical', backgroundColor: bgColor, cornerRadius: '8px', paddingAll: '10px', margin: 'sm',
    contents: [
      { type: 'text', text: title, color: titleColor, weight: 'bold', size: 'xs' },
      { type: 'text', text: cmd, color: '#444444', size: 'xxs', wrap: true, margin: 'xs' },
    ],
  };
}

function buildAdminRow(icon, label, value) {
  return {
    type: 'box', layout: 'horizontal', paddingAll: '4px',
    contents: [
      { type: 'text', text: icon, size: 'sm', flex: 0 },
      { type: 'text', text: label, color: '#888888', size: 'sm', flex: 3, margin: 'sm' },
      { type: 'text', text: value, color: '#333333', size: 'sm', weight: 'bold', flex: 5, wrap: true, align: 'end' },
    ],
  };
}

module.exports = {
  isAdmin,
  isAdminCommand,
  parseAddCommand,
  parseDeleteCommand,
  parseEditCommand,
  appendWatchlistPerson,
  deletePerson,
  updatePersonField,
  buildAddConfirmFlex,
  buildDeleteConfirmFlex,
  buildEditConfirmFlex,
  buildAdminHelpFlex,
  ADMIN_IDS,
};