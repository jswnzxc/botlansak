const { GoogleGenerativeAI } = require('@google/generative-ai');

// ตั้งค่า Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 */
async function askAI(userQuestion, sheetContext) {
  if (!process.env.GEMINI_API_KEY) return "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบครับ";

  // รายชื่อโมเดลที่ต้องการลองใช้ (ตามลำดับความเหมาะสม)
  const modelNames = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
  
  let lastError = null;

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const systemPrompt = `
        คุณคือ "ผู้ช่วยอัจฉริยะ สายตรวจภูธรลานสัก"
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
      
      // ถ้าเป็น 404 (ไม่พบโมเดล) ให้ลองโมเดลถัดไป
      if (err.message.includes('404') || err.message.includes('not found')) {
        continue;
      }
      
      // ถ้าเป็น Error อื่นๆ เช่น API Key ผิด ให้หยุดและแจ้งเตือนเลย
      break;
    }
  }

  return `❌ AI ขัดข้อง: ${lastError || "ไม่สามารถติดต่อ AI ได้"}\nกรุณาตรวจสอบการตั้งค่า API Key ใน Google AI Studio`;
}

module.exports = { askAI };
