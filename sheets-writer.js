// ============================================================
//  sheets-writer.js  — เขียนข้อมูลลง Google Sheets ด้วย Service Account
//  ใช้สำหรับ Admin เพิ่มบุคคลเฝ้าระวังผ่าน LINE
// ============================================================
//
//  วิธีตั้งค่า Google Service Account:
//  1. ไปที่ https://console.cloud.google.com
//  2. สร้าง Project ใหม่ (หรือใช้ project เดิม)
//  3. Enable "Google Sheets API"
//  4. IAM & Admin → Service Accounts → Create Service Account
//  5. กด "Create Key" → เลือก JSON → ดาวน์โหลดไฟล์ credentials.json
//  6. เปิด Google Sheets → Share → ใส่ email ของ Service Account → Editor
//  7. ใส่ค่าจาก credentials.json ลงใน .env ตามด้านล่าง
//
// ============================================================

require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Sheet ที่จะเขียน (ตรงกับ tab ใน Google Sheets)
const SHEET_WATCHLIST = 'บุคคลเฝ้าระวัง';

/**
 * สร้าง Google Sheets client ด้วย Service Account
 */
function getSheetsClient() {
  const credentials = {
    type: 'service_account',
    project_id:               process.env.GOOGLE_PROJECT_ID,
    private_key_id:           process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key:              (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
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
 * @param {Object} person - ข้อมูลบุคคล
 */
async function appendWatchlistPerson(person) {
  const sheets = getSheetsClient();

  // Format วันที่ไทย
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Bangkok',
  });

  // ลำดับคอลัมน์: A=ยศ B=ชื่อ C=นามสกุล D=คดี E=สถานะ F=พื้นที่ G=หมายเลขคดี H=วันที่บันทึก I=บันทึกโดย
  const row = [
    person.rank      || '',
    person.firstName || '',
    person.lastName  || '',
    person.crime     || '',
    person.status    || 'เฝ้าระวัง',
    person.area      || '',
    person.caseNo    || '',
    dateStr,
    person.addedBy   || 'Admin LINE Bot',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_WATCHLIST}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return { success: true, row };
}

/**
 * ตรวจสอบว่า Service Account ตั้งค่าครบหรือยัง
 */
function isConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.SPREADSHEET_ID
  );
}

module.exports = { appendWatchlistPerson, isConfigured, SHEET_WATCHLIST };
