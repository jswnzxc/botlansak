// ============================================================
//  database.js  — ดึงข้อมูลจาก Google Sheets
// ============================================================
//
//  วิธีตั้งค่า Google Sheets:
//  1. สร้าง Spreadsheet ใหม่
//  2. ตั้งชื่อแถวแรก (Row 1) ดังนี้ (ตามลำดับ):
//     A1: ยศ  |  B1: ชื่อ  |  C1: นามสกุล  |  D1: คดี  |  E1: สถานะ  |  F1: พื้นที่  |  G1: หมายเลขคดี  |  H1: วันที่บันทึก
//  3. กด Share → Anyone with the link → Viewer
//  4. คัดลอก Spreadsheet ID จาก URL ใส่ใน .env
//
// ============================================================

require('dotenv').config();
const axios = require('axios');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ── ชื่อ Sheet แต่ละแผ่น (ตรงกับ tab ใน Google Sheets) ──
const SHEET_PERSONNEL   = 'บุคลากร สภ.';   // ทำเนียบบุคลากร
const SHEET_SUSPECTS    = 'ผู้ต้องหา';      // ข้อมูลผู้ต้องหา/หมายจับ
const SHEET_LEADERS     = 'ผู้นำตำบล';      // ทำเนียบผู้นำตำบล
const SHEET_NAME = SHEET_SUSPECTS;           // default sheet สำหรับ fetchAllData()

// Cache แยกแต่ละ sheet
const CACHE_DURATION = 5 * 60 * 1000; // 5 นาที
let caches = {};

/**
 * ดึงข้อมูล sheet ใดก็ได้ (ระบุ sheetName)
 * Row 1 = Title รวม (ข้าม), Row 2 = Header (ข้าม), Row 3+ = ข้อมูลจริง
 */
async function fetchSheet(sheetName) {
  const now = Date.now();
  const c = caches[sheetName];
  if (c && c.data.length > 0 && now - c.timestamp < CACHE_DURATION) {
    return c.data;
  }

  try {
    const encodedSheet = encodeURIComponent(sheetName);
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedSheet}`;
    const response = await axios.get(url, { timeout: 10000 });
    const rows = parseCSV(response.data);

    // ข้าม 2 แถวแรก: row[0]=Title รวม, row[1]=Header
    const dataRows = rows.slice(2);
    let data = [];

    if (sheetName === SHEET_PERSONNEL) {
      // ── บุคลากร สภ. ──
      // A=ยศ  B=ชื่อ  C=นามสกุล  D=ตำแหน่ง  E=ฝ่าย/งาน  F=โทรศัพท์  G=อีเมล  H=วันที่บันทึก
      data = dataRows.map(row => ({
        rank:       (row[0] || '').trim(),  // ยศ
        firstName:  (row[1] || '').trim(),  // ชื่อ
        lastName:   (row[2] || '').trim(),  // นามสกุล
        position:   (row[3] || '').trim(),  // ตำแหน่ง
        area:       (row[4] || '').trim(),  // ฝ่าย/งาน  ← ใช้ filter บุคลากรตามฝ่าย
        phone:      (row[5] || '').trim(),  // โทรศัพท์
        email:      (row[6] || '').trim(),  // อีเมล
        date:       (row[7] || '').trim(),  // วันที่บันทึก
        fullName:   `${(row[0]||'').trim()} ${(row[1]||'').trim()} ${(row[2]||'').trim()}`.trim(),
        sheetType:  'personnel',
      })).filter(p => p.firstName);

    } else if (sheetName === SHEET_LEADERS) {
      // ── ผู้นำตำบล ── (ตาม Sheet จริง)
      // A=ยศ/คำนำหน้า  B=ชื่อ  C=นามสกุล  D=ตำแหน่ง  E=ตำบล/พื้นที่  F=โทรศัพท์  G=หมู่ที่  H=วาระ/วันที่
      data = dataRows.map(row => ({
        rank:       (row[0] || '').trim(),  // นาย / นาง / น.ส. ฯลฯ
        firstName:  (row[1] || '').trim(),  // ชื่อ
        lastName:   (row[2] || '').trim(),  // นามสกุล
        position:   (row[3] || '').trim(),  // กำนัน / ผู้ใหญ่บ้าน
        area:       (row[4] || '').trim(),  // ตำบล/พื้นที่ ← ใช้ filter (เช่น "ลานสัก", "น้ำรอบ")
        phone:      (row[5] || '').trim(),  // โทรศัพท์
        village:    (row[6] || '').trim(),  // หมู่ที่ (ตัวเลข)
        date:       (row[7] || '').trim(),  // วาระ/วันที่
        fullName:   `${(row[0]||'').trim()} ${(row[1]||'').trim()} ${(row[2]||'').trim()}`.trim(),
        sheetType:  'leader',
      })).filter(p => p.firstName);

    } else {
      // ── ผู้ต้องหา (default) ──
      // A=ยศ  B=ชื่อ  C=นามสกุล  D=คดี  E=สถานะ  F=พื้นที่  G=หมายเลขคดี  H=วันที่บันทึก
      data = dataRows.map(row => ({
        rank:      (row[0] || '').trim(),
        firstName: (row[1] || '').trim(),
        lastName:  (row[2] || '').trim(),
        crime:     (row[3] || '').trim(),
        status:    (row[4] || '').trim(),
        area:      (row[5] || '').trim(),
        caseNo:    (row[6] || '').trim(),
        date:      (row[7] || '').trim(),
        fullName:  `${(row[0]||'').trim()} ${(row[1]||'').trim()} ${(row[2]||'').trim()}`.trim(),
        sheetType: 'suspect',
      })).filter(p => p.firstName);
    }

    caches[sheetName] = { data, timestamp: now };
    console.log(`✅ [${sheetName}] โหลดสำเร็จ: ${data.length} รายการ`);
    return data;
  } catch (err) {
    console.error(`❌ โหลด [${sheetName}] ล้มเหลว:`, err.message);
    return caches[sheetName]?.data || [];
  }
}

/**
 * fetchAllData — ดึง sheet ผู้ต้องหา (default, ใช้กับ searchByName)
 */
async function fetchAllData() {
  return fetchSheet(SHEET_SUSPECTS);
}

/**
 * ดึงข้อมูลบุคลากร สภ.
 */
async function fetchPersonnel() {
  return fetchSheet(SHEET_PERSONNEL);
}

/**
 * ดึงข้อมูลผู้นำตำบล
 */
async function fetchLeaders() {
  return fetchSheet(SHEET_LEADERS);
}

/**
 * ค้นหาชื่อ — ค้นหาใน 3 Sheet พร้อมกัน (ผู้ต้องหา + บุคลากร + ผู้นำตำบล)
 */
async function searchByName(query) {
  // โหลดทั้ง 3 sheet พร้อมกัน
  const [suspects, personnel, leaders] = await Promise.all([
    fetchAllData(),
    fetchPersonnel(),
    fetchLeaders(),
  ]);

  const q = query.replace(/\s+/g, '').toLowerCase();

  function match(p) {
    const full = (p.fullName || '').replace(/\s+/g, '').toLowerCase();
    const name = ((p.firstName || '') + (p.lastName || '')).replace(/\s+/g, '').toLowerCase();
    // ค้นได้ทั้งชื่อ, ยศ, ตำแหน่ง, หมู่บ้าน
    const pos  = (p.position || p.rank || '').replace(/\s+/g, '').toLowerCase();
    const vill = (p.village  || p.area || '').replace(/\s+/g, '').toLowerCase();
    return full.includes(q) || name.includes(q) || pos.includes(q) || vill.includes(q);
  }

  return [
    ...suspects.filter(match),
    ...personnel.filter(match),
    ...leaders.filter(match),
  ];
}

/**
 * Parse CSV string เป็น Array 2 มิติ (รองรับ comma ในค่าที่ถูก quote)
 */
function parseCSV(text) {
  return text.split('\n').map(line => {
    const row = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; }
      else if (c === ',' && !inQuote) { row.push(cur); cur = ''; }
      else { cur += c; }
    }
    row.push(cur);
    return row.map(v => v.replace(/^"|"$/g, '').trim());
  });
}

/**
 * ล้าง Cache ทั้งหมด
 */
function clearCache() {
  caches = {};
}

/**
 * ค้นหาด้วยเบอร์โทรศัพท์ — ค้นใน 3 Sheet พร้อมกัน
 * รองรับทั้ง 0812345678 / 081-234-5678 / 081 234 5678
 */
async function searchByPhone(query) {
  const [suspects, personnel, leaders] = await Promise.all([
    fetchAllData(),
    fetchPersonnel(),
    fetchLeaders(),
  ]);

  // normalize เบอร์: เอาแค่ตัวเลข
  const q = query.replace(/\D/g, '');

  function matchPhone(p) {
    const phone = (p.phone || '').replace(/\D/g, '');
    return phone && phone.includes(q);
  }

  return [
    ...suspects.filter(matchPhone),
    ...personnel.filter(matchPhone),
    ...leaders.filter(matchPhone),
  ];
}

module.exports = { searchByName, searchByPhone, fetchAllData, fetchPersonnel, fetchLeaders, clearCache };
