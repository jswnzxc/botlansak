# 🚔 Bot-Score สายตรวจภูธรลานสัก

Line Bot สำหรับค้นหาข้อมูลในระบบ เชื่อมต่อกับ Google Sheets

---

## 📁 โครงสร้างไฟล์

```
lansak-bot/
├── index.js        ← ตัวหลัก (Server + Webhook)
├── database.js     ← ดึงข้อมูลจาก Google Sheets
├── flex.js         ← สร้าง Flex Message สวยงาม
├── setup-menu.js   ← สร้างเมนู 6 ปุ่ม (รันครั้งเดียว)
├── package.json
├── .env            ← ⚠️ สร้างจาก .env.example อย่า commit!
├── .env.example    ← Template สำหรับตั้งค่า
└── menu.png        ← รูปเมนู 2500×1686 px (สร้างเอง)
```

---

## 🚀 วิธีติดตั้งและใช้งาน

### ขั้นที่ 1: ติดตั้ง Package
```bash
npm install
```

### ขั้นที่ 2: ตั้งค่า .env
```bash
cp .env.example .env
```
แก้ไขไฟล์ `.env` ใส่ค่าจริง:
- `LINE_CHANNEL_SECRET` — จาก Line Developers Console
- `LINE_CHANNEL_TOKEN` — จาก Line Developers Console  
- `SPREADSHEET_ID` — ID จาก URL ของ Google Sheets

### ขั้นที่ 3: ตั้งค่า Google Sheets
1. สร้าง Google Sheets ใหม่
2. ตั้งชื่อหัวคอลัมน์แถวที่ 1:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| ยศ | ชื่อ | นามสกุล | คดี | สถานะ | พื้นที่ | หมายเลขคดี | วันที่บันทึก |

3. กด **Share** → **Anyone with the link** → **Viewer**
4. คัดลอก ID จาก URL: `docs.google.com/spreadsheets/d/`**[ID นี้]**`/edit`

### ขั้นที่ 4: รัน Bot
```bash
npm start
```

### ขั้นที่ 5: เชื่อม Webhook (ใช้ ngrok สำหรับทดสอบ)
```bash
# Terminal ใหม่
ngrok http 3000
```
คัดลอก URL เช่น `https://abc123.ngrok.io`  
ไปที่ Line Developers → Messaging API → Webhook URL  
ใส่: `https://abc123.ngrok.io/webhook` → กด Verify

### ขั้นที่ 6: สร้าง Rich Menu (ทำครั้งเดียว)
```bash
# วางไฟล์ menu.png ขนาด 2500×1686 px ในโฟลเดอร์ก่อน
npm run setup-menu
```

---

## 💬 คำสั่งที่ Bot เข้าใจ

| พิมพ์ | Bot ตอบ |
|-------|---------|
| สวัสดี / hello | เมนูหลัก |
| ค้นหาชื่อ | คำแนะนำการค้นหา |
| ชื่อ / นามสกุล / ยศ | ผลค้นหาจาก Sheets |
| ข้อมูลสถานี | ที่อยู่ เบอร์โทร |
| แจ้งเหตุ | ช่องทางแจ้งเหตุ |
| ติดต่อ | เบอร์ติดต่อทั้งหมด |
| รีเฟรช | ล้าง Cache โหลดข้อมูลใหม่ |

---

## ☁️ Deploy ขึ้น Server จริง (Railway.app — ฟรี)

1. สมัคร [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. ไปที่ Variables → ใส่ค่าใน .env ทั้งหมด
4. คัดลอก Public URL → ใส่เป็น Webhook URL ใน Line

---

## ⚠️ หมายเหตุด้านความปลอดภัย

- ไม่ควร commit ไฟล์ `.env` ขึ้น GitHub เด็ดขาด
- Google Sheets ที่ใช้ควรเปิดเป็น Public แบบ Viewer เท่านั้น
- ควรมีระบบ Authentication เพิ่มเติมก่อนใช้งานจริงในหน่วยงาน
