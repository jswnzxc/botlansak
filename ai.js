const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 * ปรับปรุง: ใช้เวอร์ชัน v1 (Stable) เพื่อป้องกัน Error 404 ใน v1beta
 */
async function askAI(userQuestion, sheetContext) {
  if (!process.env.GEMINI_API_KEY) return "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบครับ";

  // ใช้ API เวอร์ชัน 1 (Stable) แทน v1beta
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // รายชื่อโมเดลที่ต้องการลองใช้ (เน้นตัวที่เสถียร)
  const modelNames = ['gemini-1.5-flash', 'gemini-1.0-pro'];
  
  let lastError = null;

  for (const modelName of modelNames) {
    try {
      // ระบุเวอร์ชัน API เป็น v1
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
      
      const systemPrompt = `
        คุณคือ "ผู้ช่วยอัจฉริยะ สายตรวจภูธรลานสัก"
        ทำหน้าที่ตอบคำถามจากข้อมูลที่ได้รับเท่านั้น หากไม่มีในข้อมูลให้บอกว่าไม่พบ
        ข้อมูลในระบบ:
        ${sheetContext}
      `;

      const result = await model.generateContent([systemPrompt, userQuestion]);
      const response = await result.response;
      const text = response.text();
      
      if (text) return text;
    } catch (err) {
      console.error(`AI Error (${modelName}):`, err.message);
      lastError = err.message;
      
      // ถ้าเป็น 404 ให้ลองตัวถัดไป
      if (err.message.includes('404') || err.message.includes('not found')) {
        continue;
      }
      break;
    }
  }

  return `❌ AI ขัดข้อง (Stable V1): ${lastError}\nกรุณาตรวจสอบสิทธิ์การใช้งานที่ Google AI Studio`;
}

/**
 * วิเคราะห์รูปภาพ (OCR) บัตรประชาชน หรือ ป้ายทะเบียน
 */
async function analyzeImage(imageBuffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) return null;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }, { apiVersion: 'v1' });

    const prompt = `
      คุณคือผู้ช่วยตำรวจ หน้าที่ของคุณคือสกัดข้อมูลจากรูปภาพที่ส่งมา:
      1. หากเป็น "บัตรประชาชน": ให้สกัด ชื่อ และ นามสกุล เป็นภาษาไทย (ไม่ต้องมียศ เช่น นาย/นาง/นางสาว)
      2. หากเป็น "ป้ายทะเบียนรถ": ให้สกัด เลขทะเบียน และ จังหวัด
      
      ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น (ห้ามมีคำอธิบายอื่น):
      {
        "type": "id_card" หรือ "license_plate",
        "firstName": "ชื่อ",
        "lastName": "นามสกุล",
        "plateNo": "เลขทะเบียน",
        "province": "จังหวัด",
        "confidence": 0-1
      }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType
        }
      }
    ]);

    const response = await result.response;
    let text = response.text().trim();
    
    // ทำความสะอาด JSON (เผื่อ AI ใส่ markdown ```json มา)
    text = text.replace(/```json|```/g, '').trim();
    
    return JSON.parse(text);
  } catch (err) {
    console.error('Analyze Image Error:', err.message);
    return null;
  }
}

module.exports = { askAI, analyzeImage };
