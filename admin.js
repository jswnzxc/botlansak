const { 
  appendWatchlistPerson, 
  deletePerson, 
  updatePersonField, 
  isConfigured,
  loadAdminsFromSheet,
  addAdminInSheet,
  blockUserInSheet,
  loadBlockedUsersFromSheet,
  loadFollowersFromSheet
} = require('./sheets-writer');

// Admin LINE User IDs (ใส่ได้หลายคน) จาก ENV (เป็น Master Admin)
const ENV_ADMIN_IDS = (process.env.ADMIN_LINE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// Cache สำหรับ Admin IDs จาก Sheet
let sheetAdminCache = [];
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 นาที

/**
 * โหลดข้อมูลผู้ใช้พร้อมบทบาททั้งหมด (Cache)
 */
let userRoleCache = new Map();
async function refreshUserCache() {
  const followers = await loadFollowersFromSheet();
  const map = new Map();
  followers.forEach(u => map.set(u.userId, u.role));
  userRoleCache = map;
  lastCacheUpdate = Date.now();
  console.log(`👤 อัปเดต Cache บทบาทผู้ใช้: ${map.size} คน`);
}

/**
 * ตรวจว่าเป็น Admin หรือไม่ (รวมทั้ง Admin และ Master Admin)
 */
async function isAdmin(userId) {
  if (ENV_ADMIN_IDS.includes(userId)) return true;
  
  const now = Date.now();
  if (now - lastCacheUpdate > CACHE_TTL) await refreshUserCache();
  
  const role = userRoleCache.get(userId);
  if (role === 'admin' || role === 'adminmaster') return true;
  
  // เช็คจากหน้า "รายชื่อแอดมิน" (เดิม)
  const fromAdminSheet = await loadAdminsFromSheet();
  if (fromAdminSheet.includes(userId)) return true;

  return false;
}

/**
 * ตรวจว่าเป็น Master Admin หรือไม่ (มีสิทธิ์ลบ/แก้ไข/บล็อก/เพิ่มแอดมิน)
 */
async function isMasterAdmin(userId) {
  // 1. เช็คจาก ENV (Master สูงสุด)
  if (ENV_ADMIN_IDS.includes(userId)) return true;
  
  const now = Date.now();
  if (now - lastCacheUpdate > CACHE_TTL) await refreshUserCache();
  
  // 2. เช็คบทบาท adminmaster จาก Sheet
  const role = userRoleCache.get(userId);
  return role === 'adminmaster';
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
         text.startsWith('/broadcast-menu') ||
         text.startsWith('/สถิติ') ||
         text.startsWith('/สถานะ') ||
         text.startsWith('/ล้างcache') ||
         text.startsWith('/adminhelp') ||
         text.startsWith('/รายการสถานที่') ||
         text.startsWith('/whoami') ||
         text.startsWith('/เพิ่มแอดมิน') ||
         text.startsWith('/ดักไอพี') ||
         text.startsWith('/block') ||
         text.startsWith('/รายชื่อผู้ใช้');
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
      rank = 'นาย'; // เติม "นาย" เป็นค่าเริ่มต้นหากไม่ระบุยศ
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
  } else if (nameParts.length === 1) {
    rank = 'นาย'; // เติม "นาย" เป็นค่าเริ่มต้น
    firstName = nameParts[0];
    lastName = '-';
  }
  return { rank, firstName, lastName };
}

/**
 * Parse คำสั่ง /เพิ่ม
 */
function parseAddCommand(text, userId) {
  const content = text.replace(/^\/เพิ่ม\s*/, '').trim();
  
  // รองรับทั้งแบบดั้งเดิม (|) และแบบใหม่ (ขึ้นบรรทัดใหม่ตามแม่แบบ)
  let rank = '', firstName = '', lastName = '', crime = '', status = '', area = '', caseNo = '';

  if (content.includes('\n') || content.includes(':')) {
    // แบบใหม่: ใช้การค้นหาตามหัวข้อ
    const lines = content.split('\n');
    lines.forEach(line => {
      const parts = line.split(':');
      if (parts.length < 2) return;
      const key = parts[0].trim();
      const value = parts.slice(1).join(':').trim();

      if (key.includes('ชื่อ') || key.includes('นามสกุล')) {
        const names = extractName(value);
        rank = names.rank;
        firstName = names.firstName;
        lastName = names.lastName;
      } else if (key.includes('คดี')) {
        crime = value;
      } else if (key.includes('สถานะ')) {
        status = value;
      } else if (key.includes('พื้นที่')) {
        area = value;
      } else if (key.includes('หมายเลขคดี')) {
        caseNo = value;
      }
    });
  } else {
    // แบบดั้งเดิม: ยศ ชื่อ นามสกุล | คดี | สถานะ...
    const parts = content.split('|').map(s => s.trim());
    const names = extractName(parts[0]);
    rank = names.rank;
    firstName = names.firstName;
    lastName = names.lastName;
    crime = parts[1] || '';
    status = parts[2] || '';
    area = parts[3] || '';
    caseNo = parts[4] || '';
  }

  if (!firstName) return null;

  return {
    rank: (rank || '').trim() || '-',
    firstName: (firstName || '').trim(),
    lastName: (lastName || '').trim() || '-',
    crime: (crime || '').trim() || '-',
    status: (status || '').trim() || 'เฝ้าระวัง',
    area: (area || '').trim() || '-',
    caseNo: (caseNo || '').trim() || '-',
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
 * Parse คำสั่ง /block
 * รูปแบบ: /block [userId]
 */
function parseBlockCommand(text) {
  const targetUserId = text.replace(/^\/block\s+/, '').trim();
  if (!targetUserId || targetUserId === '/block') return null;
  return targetUserId;
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
 * Parse คำสั่ง /เพิ่มแอดมิน
 * รูปแบบ: /เพิ่มแอดมิน [userId] | [ชื่อเล่น/ชื่อจริง]
 */
function parseAddAdminCommand(text) {
  const content = text.replace(/^\/เพิ่มแอดมิน\s+/, '').trim();
  const parts = content.split('|').map(s => s.trim());
  if (parts.length < 2) return null;
  return {
    targetUserId: parts[0],
    displayName: parts[1]
  };
}

/**
 * สร้าง Flex Message ยืนยันการเพิ่ม Admin
 */
function buildAddAdminConfirmFlex(data, success, message) {
  return {
    type: 'flex',
    altText: success ? `✅ เพิ่ม Admin สำเร็จ` : '❌ เพิ่ม Admin ไม่สำเร็จ',
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: [
          { type: 'text', text: success ? '✅ เพิ่ม Admin สำเร็จ' : '❌ เพิ่ม Admin ไม่สำเร็จ', color: success ? '#27ae60' : '#cc3333', weight: 'bold' },
          { type: 'text', text: success ? `ผู้ใช้ "${data.displayName}" (${data.targetUserId}) ได้รับสิทธิ์ Admin แล้ว` : (message || 'เกิดข้อผิดพลาด'), color: '#555555', size: 'sm', wrap: true },
        ],
      },
    },
  };
}

/**
 * สร้าง Flex Message ยืนยันการปิดกั้น (Block)
 */
function buildBlockConfirmFlex(targetUserId, success, message) {
  return {
    type: 'flex',
    altText: success ? `✅ ปิดกั้นการใช้งานสำเร็จ` : '❌ ปิดกั้นไม่สำเร็จ',
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: [
          { type: 'text', text: success ? '✅ ปิดกั้นสำเร็จ' : '❌ ปิดกั้นไม่สำเร็จ', color: success ? '#27ae60' : '#cc3333', weight: 'bold' },
          { type: 'text', text: success ? `ผู้ใช้ ID: ${targetUserId} ถูกปิดกั้นการใช้งานแล้ว` : (message || 'เกิดข้อผิดพลาด'), color: '#555555', size: 'sm', wrap: true },
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
          buildHelpItem('📋 รายชื่อผู้ต้องหา', '/รายชื่อ', '#f0fff4', '#27ae60'),
          buildHelpItem('🗑️ ลบบุคคล', '/ลบ ชื่อ นามสกุล', '#fff5f5', '#c53030'),
          buildHelpItem('✏️ แก้ไขข้อมูล', '/แก้ไข ชื่อ นามสกุล | ฟิลด์ | ค่าใหม่', '#fffaf0', '#b45309'),
          buildHelpItem('📢 ส่งข้อความ', '/broadcast [ข้อความ] หรือ /broadcast @ชื่อ [ข้อความ]', '#fdf2f2', '#991b1b'),
          buildHelpItem('📋 ส่งแจ้งเตือน+เมนู', '/broadcast-menu [ข้อความ]', '#fdf2f2', '#991b1b'),
          buildHelpItem('📊 ดูระบบ', '/สถิติ, /สถานะ, /ล้างcache', '#f7fafc', '#4a5568'),
          buildHelpItem('🆔 ดู ID', '/whoami', '#fafafa', '#555555'),
          buildHelpItem('👑 เพิ่ม Admin', '/เพิ่มแอดมิน [userId] | [ชื่อ]', '#fff5f5', '#c53030'),
          buildHelpItem('🚫 ปิดกั้นผู้ใช้', '/block [userId]', '#fff5f5', '#c53030'),
          buildHelpItem('👥 รายชื่อผู้ใช้', '/รายชื่อผู้ใช้', '#f0f4ff', '#1a3a6e'),
          buildHelpItem('🌐 ดักไอพี', '/ดักไอพี', '#f0f4ff', '#1a3a6e'),
        ],
      },
    },
  };
}

/**
 * สร้าง Flex Message แสดงรายชื่อผู้ต้องหาทั้งหมด (สำหรับ Admin)
 */
function buildSuspectListFlex(suspects) {
  const items = suspects.slice(0, 20).map(s => ({
    type: 'box', layout: 'horizontal', paddingAll: '8px', margin: 'sm', backgroundColor: '#f8f9fa', cornerRadius: '8px',
    contents: [
      {
        type: 'box', layout: 'vertical', flex: 4,
        contents: [
          { type: 'text', text: `${s.rank} ${s.firstName} ${s.lastName}`.trim(), weight: 'bold', size: 'sm', wrap: true },
          { type: 'text', text: s.crime || '-', color: '#888888', size: 'xs', wrap: true },
        ],
      },
      {
        type: 'box', layout: 'vertical', flex: 2, justifyContent: 'center',
        contents: [
          { 
            type: 'text', text: s.status || 'เฝ้าระวัง', 
            color: s.status === 'มีหมายจับ' ? '#cc3333' : '#e67e22', 
            size: 'xs', weight: 'bold', align: 'end' 
          },
        ],
      },
    ],
    action: {
      type: 'message',
      label: 'ดูรายละเอียด',
      text: `ค้นหา ${s.firstName} ${s.lastName}`
    }
  }));

  if (suspects.length === 0) {
    items.push({ type: 'text', text: 'ไม่พบข้อมูลผู้ต้องหา', align: 'center', margin: 'md', color: '#888888' });
  } else if (suspects.length > 20) {
    items.push({ type: 'text', text: `... และอีก ${suspects.length - 20} รายการ`, align: 'center', margin: 'md', color: '#aaaaaa', size: 'xs' });
  }

  return {
    type: 'flex',
    altText: '📋 รายชื่อผู้ต้องหา/เฝ้าระวัง',
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1a5276', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📋 รายชื่อผู้ต้องหา/เฝ้าระวัง', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: `ทั้งหมด ${suspects.length} รายการ`, color: '#aed6f1', size: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: items,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '8px',
        contents: [
          { type: 'text', text: 'แตะที่รายชื่อเพื่อดูรายละเอียด', size: 'xxs', color: '#aaaaaa', align: 'center' }
        ]
      }
    },
  };
}

/**
 * สร้าง Flex Message แสดงรายชื่อผู้ใช้ทั้งหมด (สำหรับ Admin)
 */
function buildUserListFlex(users) {
  const items = users.slice(-20).reverse().map(u => ({
    type: 'box', layout: 'horizontal', paddingAll: '8px', margin: 'sm', backgroundColor: '#f8f9fa', cornerRadius: '8px',
    contents: [
      {
        type: 'box', layout: 'vertical', flex: 4,
        contents: [
          { type: 'text', text: u.displayName || 'ไม่ระบุชื่อ', weight: 'bold', size: 'sm', wrap: true },
          { type: 'text', text: `ID: ${u.userId}`, color: '#888888', size: 'xxs', wrap: true },
        ],
      },
      {
        type: 'box', layout: 'vertical', flex: 1, justifyContent: 'center',
        contents: [
          { 
            type: 'text', text: 'บล็อก', 
            color: '#cc3333', 
            size: 'xs', weight: 'bold', align: 'end',
            action: {
              type: 'message',
              label: 'บล็อก',
              text: `/block ${u.userId}`
            }
          },
        ],
      },
    ],
  }));

  if (users.length === 0) {
    items.push({ type: 'text', text: 'ไม่พบข้อมูลผู้ใช้งาน', align: 'center', margin: 'md', color: '#888888' });
  }

  return {
    type: 'flex',
    altText: '👥 รายชื่อผู้ใช้งานบอท',
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1a3a6e', paddingAll: '16px',
        contents: [
          { type: 'text', text: '👥 รายชื่อผู้ใช้งานบอท', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: `ทั้งหมด ${users.length} รายการ (แสดง 20 ล่าสุด)`, color: '#a8c4e8', size: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: items,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '8px',
        contents: [
          { type: 'text', text: 'กด "บล็อก" เพื่อปิดกั้นการใช้งานรายบุคคล', size: 'xxs', color: '#aaaaaa', align: 'center' }
        ]
      }
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
  isMasterAdmin,
  isAdminCommand,
  refreshUserCache,
  parseAddCommand,
  parseDeleteCommand,
  parseEditCommand,
  parseAddAdminCommand,
  parseBlockCommand,
  appendWatchlistPerson,
  deletePerson,
  updatePersonField,
  addAdminInSheet,
  blockUserInSheet,
  loadBlockedUsersFromSheet,
  buildAddConfirmFlex,
  buildDeleteConfirmFlex,
  buildEditConfirmFlex,
  buildAddAdminConfirmFlex,
  buildBlockConfirmFlex,
  buildUserListFlex,
  buildAdminHelpFlex,
  buildSuspectListFlex,
  ADMIN_IDS: ENV_ADMIN_IDS,
};