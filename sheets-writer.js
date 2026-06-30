require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Sheet ที่จะเขียน (ตรงกับ tab ใน Google Sheets)
const SHEET_WATCHLIST = 'ผู้ต้องหา';
const SHEET_USERS     = 'รายชื่อผู้ใช้'; // แผ่นงานใหม่สำหรับเก็บ ID คนใช้บอท
const SHEET_LOCATIONS = 'บันทึกสถานที่'; // แผ่นงานสำหรับบันทึกสถานที่
const SHEET_ADMINS    = 'รายชื่อแอดมิน'; // แผ่นงานสำหรับเก็บ ID แอดมิน
const SHEET_BLOCKED   = 'รายชื่อผู้ใช้ที่ถูกปิดกั้น'; // แผ่นงานสำหรับเก็บ ID คนที่โดนบล็อก
const SHEET_VERIFY    = 'รหัสยืนยันตัวตน'; // แผ่นงานสำหรับจัดการรหัสยืนยันตัวตน
const SHEET_PERSONNEL = 'บุคลากร สภ.';   // ทำเนียบบุคลากร (เพื่อเพิ่มรายชื่อเมื่อยืนยันสำเร็จ)

// รายการรหัสยืนยันตัวตนทั้งหมด (นามเรียกขาน ลานสัก)
const VALID_AUTH_CODES = new Set([
  'ลานสัก 1','ลานสัก 2','ลานสัก 3','ลานสัก 4',
  'ลานสัก 21','ลานสัก 211','ลานสัก 212','ลานสัก 213','ลานสัก 214',
  'ลานสัก 215','ลานสัก 216','ลานสัก 217','ลานสัก 218','ลานสัก 219',
  'ลานสัก 220','ลานสัก 221','ลานสัก 222','ลานสัก 223',
  'ลานสัก 2111','ลานสัก 2112','ลานสัก 2113','ลานสัก 2114','ลานสัก 2115',
  'ลานสัก 2116','ลานสัก 2117','ลานสัก 2118','ลานสัก 2119','ลานสัก 2120',
  'ลานสัก 2121','ลานสัก 2122','ลานสัก 2123','ลานสัก 2124','ลานสัก 2125',
  'ลานสัก 2126','ลานสัก 2127',
  'ลานสัก 41','ลานสัก 411','ลานสัก 412','ลานสัก 4111','ลานสัก 413','ลานสัก 4112',
  'ลานสัก 5','ลานสัก 51','ลานสัก 52','ลานสัก 511','ลานสัก 512','ลานสัก 513','ลานสัก 514',
  'ลานสัก 31','ลานสัก 311','ลานสัก 313','ลานสัก 315','ลานสัก 316','ลานสัก 317','ลานสัก 314',
  'ลานสัก 3111','ลานสัก 3112','ลานสัก 3113','ลานสัก 3114','ลานสัก 3115','ลานสัก 3116','ลานสัก 3117',
  'ลานสัก 6111','ลานสัก 6112','ลานสัก 6113',
]);

/**
 * ตรวจสอบว่ารหัสยืนยันตัวตนถูกต้องและยังไม่ถูกใช้
 * คืนค่า: { valid: bool, alreadyUsed: bool, usedBy: string|null }
 */
async function checkAuthCode(code) {
  const normalizedCode = code.trim();

  // ตรวจสอบว่าเป็นรหัสที่อยู่ในระบบหรือไม่
  if (!VALID_AUTH_CODES.has(normalizedCode)) {
    return { valid: false, alreadyUsed: false, usedBy: null };
  }

  // ตรวจสอบว่าถูกใช้ไปแล้วหรือยัง (จาก Google Sheet)
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_VERIFY}!A:C`,
    });
    const rows = response.data.values || [];
    // A: รหัส, B: userId ที่ใช้, C: วันที่ใช้
    const usedRow = rows.find(row => (row[0] || '').trim() === normalizedCode);
    if (usedRow && usedRow[1]) {
      return { valid: true, alreadyUsed: true, usedBy: usedRow[1] };
    }
    return { valid: true, alreadyUsed: false, usedBy: null };
  } catch (err) {
    console.error('Error checking auth code:', err.message);
    return { valid: true, alreadyUsed: false, usedBy: null }; // ถ้าเช็คไม่ได้ ให้ผ่านไปก่อน
  }
}

/**
 * ใช้รหัสยืนยันตัวตน — บันทึกว่า userId นี้ใช้รหัสนี้ไปแล้ว
 * และอัปเดตสิทธิ์ผู้ใช้เป็น admin ใน SHEET_USERS
 */
async function consumeAuthCode(code, userId, displayName) {
  const sheets = getSheetsClient();
  const normalizedCode = code.trim();
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  try {
    // 1. ตรวจว่ารหัสนี้มีแถวใน Sheet แล้วหรือยัง
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_VERIFY}!A:C`,
    });
    const rows = response.data.values || [];
    const existingRowIdx = rows.findIndex(row => (row[0] || '').trim() === normalizedCode);

    if (existingRowIdx !== -1) {
      // อัปเดตแถวที่มีอยู่แล้ว
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_VERIFY}!B${existingRowIdx + 1}:E${existingRowIdx + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[userId, displayName || '', now, 'บุคคลที่ได้รับการยืนยันตัวตน']] },
      });
    } else {
      // เพิ่มแถวใหม่
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_VERIFY}!A:E`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[normalizedCode, userId, displayName || '', now, 'บุคคลที่ได้รับการยืนยันตัวตน']] },
      });
    }

    // 2. อัปเดตสิทธิ์ผู้ใช้เป็น admin ใน SHEET_USERS
    await updateUserRoleInSheet(userId, 'admin');

    // 3. เพิ่มลงหน้า "รายชื่อแอดมิน" ด้วย
    await addAdminInSheet(userId, displayName, `รหัสยืนยัน: ${normalizedCode}`);

    return { success: true };
  } catch (err) {
    console.error('Error consuming auth code:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * หมายเหตุ: เดิมมีฟังก์ชัน addPersonnelFromVerify() สำหรับเพิ่มรายชื่อเข้า Sheet "บุคลากร สภ."
 * อัตโนมัติเมื่อยืนยันตัวตนสำเร็จ — ปัจจุบันถูกตัดออกแล้วตามคำขอ
 * ข้อมูลผู้ยืนยันตัวตน (รหัส, userId, displayName, วันเวลา) จะถูกบันทึกไว้ที่
 * Sheet "รหัสยืนยันตัวตน" (SHEET_VERIFY) ผ่านฟังก์ชัน consumeAuthCode() เท่านั้น
 * การเพิ่มชื่อเข้า "บุคลากร สภ." ให้แอดมินทำผ่านเมนูจัดการ/กรอกมือแทน
 */

/**
 * บันทึกสถานที่ลง Google Sheets
 * ปรับปรุง: ให้ลำดับคอลัมน์ตรงกับหน้า "ผู้ต้องหา" เพื่อความสม่ำเสมอ
 * A: ยศ(ว่าง), B: ชื่อสถานที่, C: ที่อยู่, D: Lat, E: Long, F: ผู้บันทึก, G: สถานะ, H: วันที่/เวลา
 */
async function appendLocationRecord(locationData, userName) {
  const sheets = getSheetsClient();
  const now = new Date();
  const dateTimeStr = now.toLocaleString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Bangkok',
  });

  const row = [
    dateTimeStr,                      // A: วัน/เวลา
    locationData.title || 'สถานที่ไม่มีชื่อ', // B: ชื่อสถานที่
    locationData.address || '-',      // C: ที่อยู่
    locationData.latitude.toString(), // D: Latitude
    locationData.longitude.toString(),// E: Longitude
    userName || 'Unknown',            // F: ผู้บันทึก
    'รอดำเนินการ',                     // G: รายงานเหตุ
    'LINE Bot'                        // H: ระบบที่บันทึก
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_LOCATIONS}!A:H`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return { success: true, row };
}

/**
 * สร้าง Google Sheets client ด้วย Service Account
 */
function getSheetsClient() {
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || process.env.GGOOGLE_PRIVATE_KEY || '';
  
  // 1. จัดการเรื่อง \n ที่อาจจะถูกแก้เป็นตัวอักษรธรรมดา
  privateKey = privateKey.replace(/\\n/g, '\n');
  
  // 2. ลบช่องว่างส่วนเกินที่อาจจะติดมาจากการก๊อปปี้
  privateKey = privateKey.trim();

  // 3. ตรวจสอบและแก้ไข Header/Footer (ต้องมีช่องว่าง "PRIVATE KEY")
  if (privateKey.includes('BEGINPRIVATEKEY')) {
    privateKey = privateKey.replace('BEGINPRIVATEKEY', 'BEGIN PRIVATE KEY');
  }
  if (privateKey.includes('ENDPRIVATEKEY')) {
    privateKey = privateKey.replace('ENDPRIVATEKEY', 'END PRIVATE KEY');
  }

  // 4. ถ้าไม่มี Header/Footer เลย ให้เติมให้
  if (privateKey && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}`;
  }
  if (privateKey && !privateKey.includes('-----END PRIVATE KEY-----')) {
    privateKey = `${privateKey}\n-----END PRIVATE KEY-----\n`;
  }

  const credentials = {
    type: 'service_account',
    project_id:               process.env.GOOGLE_PROJECT_ID,
    private_key_id:           process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key:              privateKey,
    client_email:             process.env.GOOGLE_CLIENT_EMAIL,
    client_id:                process.env.GOOGLE_CLIENT_ID,
    auth_uri:                 'https://accounts.google.com/o/oauth2/auth',
    token_uri:                'https://oauth2.googleapis.com/token',
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * เพิ่มบุคคลเฝ้าระวังแถวใหม่ลง Google Sheets
 */
async function appendWatchlistPerson(person) {
  const sheets = getSheetsClient();
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Bangkok',
  });

  const row = [
    (person.rank      || '').trim(),
    (person.firstName || '').trim(),
    (person.lastName  || '').trim(),
    (person.crime     || '').trim(),
    (person.status    || 'เฝ้าระวัง').trim(),
    (person.area      || '').trim(),
    (person.caseNo    || '').trim(),
    dateStr,
    person.addedBy   || 'Admin LINE Bot',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_WATCHLIST}!A3:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return { success: true, row };
}

/**
 * ค้นหาแถวของบุคคลตามชื่อ-นามสกุล
 */
async function findRowIndex(firstName, lastName) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_WATCHLIST}!B:C`,
  });

  const rows = response.data.values;
  if (!rows) return null;

  for (let i = 0; i < rows.length; i++) {
    const rowFirstName = (rows[i][0] || '').trim();
    const rowLastName  = (rows[i][1] || '').trim();
    if (rowFirstName === firstName.trim() && rowLastName === lastName.trim()) {
      return i + 1;
    }
  }
  return null;
}

/**
 * ลบแถวข้อมูล
 */
async function deletePerson(firstName, lastName) {
  const sheets = getSheetsClient();
  const rowIndex = await findRowIndex(firstName, lastName);
  if (!rowIndex) return { success: false, message: 'ไม่พบรายชื่อนี้ในระบบ' };

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_WATCHLIST);
  const sheetId = sheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex }
        }
      }],
    },
  });
  return { success: true, rowIndex };
}

/**
 * แก้ไขข้อมูลบางฟิลด์
 */
async function updatePersonField(firstName, lastName, field, newValue) {
  const sheets = getSheetsClient();
  const rowIndex = await findRowIndex(firstName, lastName);
  if (!rowIndex) return { success: false, message: 'ไม่พบรายชื่อนี้ในระบบ' };

  const colMap = { 'ยศ': 'A', 'rank': 'A', 'คดี': 'D', 'crime': 'D', 'สถานะ': 'E', 'status': 'E', 'พื้นที่': 'F', 'area': 'F', 'หมายเลขคดี': 'G', 'caseNo': 'G' };
  const colLetter = colMap[field];
  if (!colLetter) return { success: false, message: 'ระบุชื่อฟิลด์ไม่ถูกต้อง' };

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_WATCHLIST}!${colLetter}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[newValue]] },
  });
  return { success: true, rowIndex };
}

/**
 * บันทึกผู้ใช้ลง Google Sheets เพื่อไม่ให้ข้อมูลหายเมื่อ Restart
 */
async function trackUserInSheet(userId, displayName) {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:A`,
    });
    const existingIds = (response.data.values || []).map(row => row[0]);
    if (existingIds.includes(userId)) return false;

    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    // A: userId, B: displayName, C: timestamp, D: บทบาท (เริ่มต้นเป็น people)
    const row = [userId, displayName || '', now, 'people'];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return true;
  } catch (e) {
    console.error('Error tracking user:', e.message);
    return false;
  }
}

/**
 * โหลดรายชื่อผู้ใช้ทั้งหมดจาก Google Sheets พร้อมบทบาทและเวลาแจ้งเตือน
 */
async function loadFollowersFromSheet() {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:E`,
    });
    const rows = response.data.values || [];
    // A: userId, B: displayName, C: timestamp, D: role, E: reminderTime
    return rows.slice(1).map(row => ({ 
      userId: row[0], 
      displayName: row[1] || '',
      role: (row[3] || 'people').toLowerCase().trim(),
      reminderTime: row[4] || ''
    }));
  } catch (err) {
    console.error('Error loading followers:', err.message);
    return [];
  }
}

/**
 * โหลดรายชื่อ Admin ทั้งหมดจาก Google Sheets
 */
async function loadAdminsFromSheet() {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_ADMINS}!A:B`,
    });
    const rows = response.data.values || [];
    // คืนค่าเฉพาะ userId
    return rows.slice(1).map(row => row[0]);
  } catch (err) {
    console.error('Error loading admins from sheet:', err.message);
    return [];
  }
}

/**
 * อัปเดตบทบาทของ User (คอลัมน์ D)
 */
async function updateUserRoleInSheet(userId, role) {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:A`,
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === userId);
    if (rowIndex === -1) return false;

    // คอลัมน์ D คือ index 3
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!D${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[role]] },
    });
    return true;
  } catch (e) {
    console.error('Error updating user role:', e.message);
    return false;
  }
}

/**
 * เพิ่ม Admin ใหม่ลง Google Sheets
 */
async function addAdminInSheet(userId, displayName, addedBy) {
  const sheets = getSheetsClient();
  try {
    // 1. อัปเดตบทบาทในหน้า "รายชื่อผู้ใช้" เป็น admin
    await updateUserRoleInSheet(userId, 'admin');

    // 2. เช็คว่ามีในหน้า "รายชื่อแอดมิน" แล้วหรือยัง
    const existingAdmins = await loadAdminsFromSheet();
    if (existingAdmins.includes(userId)) {
      return { success: true, message: 'ผู้ใช้นี้เป็น Admin อยู่แล้ว (อัปเดตบทบาทในรายชื่อผู้ใช้เรียบร้อย)' };
    }

    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const row = [userId, displayName || 'ไม่ระบุชื่อ', now, addedBy || 'System'];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_ADMINS}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return { success: true };
  } catch (err) {
    console.error('Error adding admin to sheet:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * บันทึกผู้ใช้ที่ถูกปิดกั้นลง Google Sheets
 */
async function blockUserInSheet(userId, displayName, blockedBy) {
  const sheets = getSheetsClient();
  try {
    // 1. อัปเดตบทบาทในหน้า "รายชื่อผู้ใช้" เป็น blocked
    await updateUserRoleInSheet(userId, 'blocked');

    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const row = [userId, displayName || 'ไม่ระบุชื่อ', now, blockedBy || 'Admin'];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_BLOCKED}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return { success: true };
  } catch (err) {
    console.error('Error blocking user in sheet:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * โหลดรายชื่อผู้ใช้ที่ถูกปิดกั้นทั้งหมดจาก Google Sheets
 */
async function loadBlockedUsersFromSheet() {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_BLOCKED}!A:A`,
    });
    const rows = response.data.values || [];
    return rows.slice(1).map(row => row[0]);
  } catch (err) {
    console.error('Error loading blocked users from sheet:', err.message);
    return [];
  }
}

function isConfigured() {
  const config = {
    GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
    SPREADSHEET_ID: !!process.env.SPREADSHEET_ID,
    GOOGLE_PROJECT_ID: !!process.env.GOOGLE_PROJECT_ID
  };
  return config.GOOGLE_CLIENT_EMAIL && config.GOOGLE_PRIVATE_KEY && config.SPREADSHEET_ID;
}

/**
 * อัปเดตเวลาแจ้งเตือนของ User (คอลัมน์ E)
 */
async function setUserReminderTime(userId, timestamp) {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:A`,
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === userId);
    if (rowIndex === -1) return false;

    // คอลัมน์ E คือ index 4
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!E${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timestamp || '']] },
    });
    return true;
  } catch (e) {
    console.error('Error setting reminder time:', e.message);
    return false;
  }
}

/**
 * ดึงรายการ User ที่ถึงเวลาแจ้งเตือนแล้ว
 */
async function getDueReminders() {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:E`,
    });
    const rows = response.data.values || [];
    const now = Date.now();
    const dueUsers = [];

    // เริ่มวนลูปจากแถวที่ 2 (slice(1))
    for (let i = 1; i < rows.length; i++) {
      const userId = rows[i][0];
      const reminderTime = parseInt(rows[i][4]); // คอลัมน์ E (index 4)

      if (reminderTime && reminderTime <= now) {
        dueUsers.push({ userId, rowIndex: i + 1 });
      }
    }
    return dueUsers;
  } catch (err) {
    console.error('Error getting due reminders:', err.message);
    return [];
  }
}

module.exports = {
  appendWatchlistPerson, deletePerson, updatePersonField, 
  trackUserInSheet, loadFollowersFromSheet, isConfigured, SHEET_WATCHLIST,
  appendLocationRecord,
  loadAdminsFromSheet, addAdminInSheet,
  blockUserInSheet, loadBlockedUsersFromSheet,
  setUserReminderTime, getDueReminders,
  updateUserRoleInSheet,
  checkAuthCode, consumeAuthCode, VALID_AUTH_CODES,
};