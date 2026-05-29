require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Sheet ที่จะเขียน (ตรงกับ tab ใน Google Sheets)
const SHEET_WATCHLIST = 'ผู้ต้องหา';
const SHEET_USERS     = 'รายชื่อผู้ใช้'; // แผ่นงานใหม่สำหรับเก็บ ID คนใช้บอท

/**
 * สร้าง Google Sheets client ด้วย Service Account
 */
function getSheetsClient() {
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  
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
    const row = [userId, displayName || '', now];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_USERS}!A:C`,
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
      range: `${SHEET_USERS}!A:B`,
    });
    const rows = response.data.values || [];
    return rows.slice(1).map(row => ({ userId: row[0], displayName: row[1] || '' }));
  } catch (err) {
    console.error('Error loading followers:', err.message);
    return [];
  }
}

const SHEET_LOGS      = 'บันทึกการสแกน'; // แผ่นงานสำหรับเก็บประวัติการสแกน OCR

/**
 * บันทึกประวัติการสแกน OCR
 */
async function logOcrScan(data, adminId) {
  const sheets = getSheetsClient();
  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  
  const row = [
    now,
    data.type === 'id_card' ? 'บัตรประชาชน' : 'ป้ายทะเบียน',
    data.type === 'id_card' ? `${data.firstName} ${data.lastName}` : `${data.plateNo} ${data.province}`,
    data.address || '-',
    adminId || 'Unknown',
    `ความแม่นยำ: ${(data.confidence * 100).toFixed(0)}%`
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_LOGS}!A2:F`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return true;
  } catch (e) {
    console.error('Error logging OCR scan:', e.message);
    return false;
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
  trackUserInSheet, loadFollowersFromSheet, isConfigured, logOcrScan, SHEET_WATCHLIST 
};