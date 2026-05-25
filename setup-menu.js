// ============================================================
//  setup-menu.js  — สร้าง Rich Menu (เมนู 6 ปุ่ม) ใน Line
//  รัน: node setup-menu.js
//  (รันครั้งเดียวพอ ไม่ต้องรันทุกครั้งที่เปิด Bot)
// ============================================================

require('dotenv').config();
const line = require('@line/bot-sdk');
const fs   = require('fs');
const path = require('path');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});
const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN,
});

async function setupRichMenu() {
  console.log('🚀 เริ่มสร้าง Rich Menu...\n');

  // ──────────────────────────────────────────────────────────
  //  Layout 6 ปุ่ม (2 แถว × 3 คอลัมน์)  2500 × 1686 px
  //
  //  ┌──────────────┬──────────────┬──────────────┐
  //  │  🔍 ค้นหา   │ 👥 ทำเนียบ  │ 🏘️ ผู้นำตำบล│  ← แถวบน (y 0–842)
  //  ├──────────────┼──────────────┼──────────────┤
  //  │ 🌐 เว็บไซต์ │ 🚨 แจ้งเหตุ │ 🏢 สถานี    │  ← แถวล่าง (y 843–1685)
  //  └──────────────┴──────────────┴──────────────┘
  // ──────────────────────────────────────────────────────────
  const richMenu = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'เมนูหลักสายตรวจลานสัก',
    chatBarText: '📋 เมนูหลัก',
    areas: [
      // ── แถวบน ──
      {
        bounds: { x: 0,    y: 0, width: 833, height: 843 },
        action: { type: 'message', label: 'ค้นหาชื่อ',       text: 'ค้นหาชื่อ' },
      },
      {
        bounds: { x: 833,  y: 0, width: 834, height: 843 },
        action: { type: 'message', label: 'ทำเนียบบุคลากร',  text: 'ทำเนียบบุคลากร' },
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: 'message', label: 'ทำเนียบผู้นำตำบล', text: 'ทำเนียบผู้นำตำบล' },
      },
      // ── แถวล่าง ──
      {
        bounds: { x: 0,    y: 843, width: 833, height: 843 },
        action: { type: 'message', label: 'เว็บไซต์',         text: 'เว็บไซต์' },
      },
      {
        bounds: { x: 833,  y: 843, width: 834, height: 843 },
        action: { type: 'message', label: 'แจ้งเหตุ',          text: 'แจ้งเหตุ' },
      },
      {
        bounds: { x: 1667, y: 843, width: 833, height: 843 },
        action: { type: 'message', label: 'ข้อมูลสถานี',       text: 'ข้อมูลสถานี' },
      },
    ],
  };

  const { richMenuId } = await client.createRichMenu(richMenu);
  console.log(`✅ สร้าง Rich Menu แล้ว ID: ${richMenuId}`);

  // อัพโหลดรูปเมนู — รองรับทั้ง .jpg และ .png
  const jpgPath = path.join(__dirname, 'menu.jpg');
  const pngPath = path.join(__dirname, 'menu.png');
  const menuImagePath = fs.existsSync(jpgPath) ? jpgPath : fs.existsSync(pngPath) ? pngPath : null;
  const contentType   = menuImagePath?.endsWith('.jpg') ? 'image/jpeg' : 'image/png';

  if (menuImagePath) {
    console.log(`📐 พบไฟล์: ${path.basename(menuImagePath)}`);
    const stats = fs.statSync(menuImagePath);
    const sizekb = stats.size / 1024;
    console.log(`   ขนาดไฟล์ต้นฉบับ: ${sizekb.toFixed(0)} KB`);

    let imageBuffer = fs.readFileSync(menuImagePath);
    let finalContentType = contentType;

    // ถ้าไฟล์ใหญ่กว่า 900KB ให้ compress อัตโนมัติด้วย sharp
    if (stats.size > 900 * 1024) {
      console.log('   🗜️  ไฟล์ใหญ่เกิน 900KB — กำลัง compress อัตโนมัติ...');
      try {
        const sharp = require('sharp');
        imageBuffer = await sharp(menuImagePath)
          .resize(2500, 1686, { fit: 'fill' })
          .jpeg({ quality: 70, progressive: true })
          .toBuffer();
        finalContentType = 'image/jpeg';
        console.log(`   ✅ compress แล้ว: ${(imageBuffer.length / 1024).toFixed(0)} KB (JPEG quality 70)`);
      } catch (e) {
        // sharp ไม่ได้ติดตั้ง — ใช้ไฟล์เดิมและแจ้งเตือน
        console.warn('   ⚠️  ไม่พบ sharp — ใช้ไฟล์เดิม อาจ reject ถ้าใหญ่เกิน 1MB');
        console.warn('   💡 ติดตั้ง: npm install sharp');
      }
    }

    console.log(`📤 กำลังอัพโหลด (${(imageBuffer.length/1024).toFixed(0)} KB, ${finalContentType})...`);

    const uploadRes = await fetch(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
          'Content-Type': finalContentType,
        },
        body: imageBuffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`อัพโหลดรูปล้มเหลว: ${uploadRes.status} — ${errText}`);
    }
    console.log('✅ อัพโหลดรูปเมนูแล้ว');
  } else {
    console.log('⚠️  ไม่พบไฟล์ menu.png — Rich Menu จะไม่มีรูป');
    console.log('   วางไฟล์ menu.png (2500×1686 px) ในโฟลเดอร์เดียวกันแล้วรันใหม่');
    console.log('\n   💡 คำแนะนำ layout รูป menu.png (2500×1686 px):');
    console.log('   ┌────────────┬──────────────┬──────────────┐');
    console.log('   │ 🔍 ค้นหา  │ 👥 ทำเนียบ  │ 🏘️ ผู้นำตำบล│');
    console.log('   ├────────────┼──────────────┼──────────────┤');
    console.log('   │ 🌐 เว็บไซต│ 🚨 แจ้งเหตุ  │ 🏢 สถานี    │');
    console.log('   └────────────┴──────────────┴──────────────┘');
  }

  // ตั้งเป็น Default Rich Menu
  console.log('⚙️  กำลังตั้งเป็น Default Rich Menu...');
  await client.setDefaultRichMenu(richMenuId);
  console.log('✅ ตั้งเป็น Default Rich Menu แล้ว');
  console.log('\n🎉 เสร็จสมบูรณ์! Rich Menu พร้อมใช้งานแล้วครับ');
}

async function deleteAllRichMenus() {
  const { richmenus } = await client.getRichMenuList();
  if (!richmenus || richmenus.length === 0) return;
  console.log(`🗑️  ลบ Rich Menu เก่า ${richmenus.length} รายการ...`);
  await Promise.all(richmenus.map(m => client.deleteRichMenu(m.richMenuId)));
}

(async () => {
  try {
    await deleteAllRichMenus();
    await setupRichMenu();
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err.message);
    // แสดง response body จาก LINE API ถ้ามี
    if (err.originalError?.response) {
      console.error('   LINE API response:', JSON.stringify(err.originalError.response.data, null, 2));
    }
    if (err.response) {
      console.error('   Response body:', JSON.stringify(err.response, null, 2));
    }
    console.error('   Stack:', err.stack);
    if (err.message.includes('401')) {
      console.error('   ตรวจสอบ LINE_CHANNEL_TOKEN ใน .env ครับ');
    }
  }
})();
