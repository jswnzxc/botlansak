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

module.exports = { askAI };
