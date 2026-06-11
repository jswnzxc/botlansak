require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Sheet ที่จะเขียน (ตรงกับ tab ใน Google Sheets)
const SHEET_WATCHLIST = 'ผู้ต้องหา';
const SHEET_USERS     = 'รายชื่อผู้ใช้'; // แผ่นงานใหม่สำหรับเก็บ ID คนใช้บอท
const SHEET_LOCATIONS = 'บันทึกสถานที่'; // แผ่นงานสำหรับบันทึกสถานที่
const SHEET_ADMINS    = 'รายชื่อแอดมิน'; // แผ่นงานสำหรับเก็บ ID แอดมิน
const SHEET_BLOCKED   = 'รายชื่อผู้ใช้ที่ถูกปิดกั้น'; // แผ่นงานสำหรับเก็บ ID คนที่โดนบล็อก

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
    '',                               // A: ยศ (ว่าง)
    locationData.title || 'สถานที่ไม่มีชื่อ', // B: ชื่อสถานที่
    locationData.address || '-',      // C: ที่อยู่
    locationData.latitude.toString(), // D: Latitude
    locationData.longitude.toString(),// E: Longitude
    userName || 'Unknown',            // F: ผู้บันทึก
    'รอดำเนินการ',                     // G: สถานะ
    dateTimeStr,                      // H: วันที่/เวลา
    'LINE Bot'                        // I: ระบบที่บันทึก
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_LOCATIONS}!A:I`,
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
 * ปรับปรุง: เพิ่มคอลัมน์ "บทบาท" (Role)
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
    // A: userId, B: displayName, C: timestamp, D: role (default: public)
    const row = [userId, displayName || '', now, 'public'];
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
 * โหลดรายชื่อผู้ใช้ทั้งหมดจาก Google Sheets
 */
async function loadFollowersFromSheet() {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:D`,
    });
    const rows = response.data.values || [];
    // A: userId, B: displayName, C: timestamp, D: role
    return rows.slice(1).map(row => ({ 
      userId: row[0], 
      displayName: row[1] || '',
      role: row[3] || 'public'
    }));
  } catch (err) {
    console.error('Error loading followers:', err.message);
    return [];
  }
}

/**
 * อัปเดตบทบาทผู้ใช้
 */
async function updateUserRole(userId, newRole) {
  const sheets = getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:A`,
    });
    const rows = response.data.values || [];
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === userId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) return { success: false, message: 'ไม่พบผู้ใช้นี้ในระบบ' };

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!D${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newRole]] },
    });
    return { success: true };
  } catch (err) {
    console.error('Error updating user role:', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * ตรวจสอบบทบาทผู้ใช้
 */
async function getUserRole(userId) {
  const followers = await loadFollowersFromSheet();
  const user = followers.find(f => f.userId === userId);
  return user ? user.role : 'public';
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
 * เพิ่ม Admin ใหม่ลง Google Sheets
 */
async function addAdminInSheet(userId, displayName, addedBy) {
  const sheets = getSheetsClient();
  try {
    // เช็คว่ามีอยู่แล้วหรือยัง
    const existingAdmins = await loadAdminsFromSheet();
    if (existingAdmins.includes(userId)) {
      return { success: false, message: 'ผู้ใช้นี้เป็น Admin อยู่แล้ว' };
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

module.exports = { 
  appendWatchlistPerson, deletePerson, updatePersonField, 
  trackUserInSheet, loadFollowersFromSheet, isConfigured, SHEET_WATCHLIST,
  appendLocationRecord,
  loadAdminsFromSheet, addAdminInSheet,
  blockUserInSheet, loadBlockedUsersFromSheet
};