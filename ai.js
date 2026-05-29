const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * ฟังก์ชันตอบคำถามด้วย AI โดยใช้ข้อมูลจาก Sheets เป็นบริบท
 * ปรับปรุง: ใช้เวอร์ชัน v1 (Stable) เพื่อป้องกัน Error 404 ใน v1beta
 */
async function askAI(userQuestion, sheetContext) {
  if (!process.env.GEMINI_API_KEY) return "⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบครับ";

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // ปรับชื่อโมเดลให้ตรงตามที่ Google กำหนด
  const modelNames = ['gemini-1.5-flash', 'gemini-pro'];
  
  let lastError = null;

  for (const modelName of modelNames) {
    try {
      // ใช้ v1beta เพื่อรองรับโมเดลใหม่ๆ ได้ดีกว่า
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
      
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
      continue;
    }
  }

  return `❌ AI ขัดข้อง: ${lastError}\nกรุณาตรวจสอบสิทธิ์การใช้งานที่ Google AI Studio`;
}

/**
 * ฟังก์ชันสรุปข้อมูลจากข้อความ (เช่น ผลจาก OCR บัตรประชาชน)
 * @param {string} rawText ข้อความดิบที่ต้องการสรุป
 * @returns {Object} { success: boolean, data?: Object, error?: string }
 */
async function summarizeHistory(rawText) {
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, error: 'GEMINI_API_KEY is missing' };
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelNames = ['gemini-1.5-flash', 'gemini-pro'];
  
  const systemPrompt = `
    คุณคือผู้ช่วยสรุปข้อมูลประวัติจากข้อความที่ได้จากการแสกนบัตรหรือเอกสาร
    กรุณาสรุปข้อมูลจากข้อความที่ผู้ใช้ส่งมาให้เป็น JSON format ดังนี้:
    {
      "type": "ประเภทเอกสาร (เช่น บัตรประชาชน, ใบขับขี่)",
      "data": "ข้อมูลสำคัญ (เช่น ชื่อ-นามสกุล, เลขบัตร)",
      "address": "ที่อยู่ที่ปรากฏในเอกสาร (ถ้ามี)",
      "accuracy": "ประเมินความแม่นยำของข้อมูล (สูง/กลาง/ต่ำ)",
      "status": "สถานะหรือประวัติคดีที่พบในข้อความ (ถ้าไม่มีให้ใส่ 'ไม่พบ')"
    }
    ตอบกลับเฉพาะ JSON เท่านั้น ห้ามมีคำอธิบายอื่น ห้ามมี markdown code blocks
  `;

  let lastError = '';

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      }, { apiVersion: 'v1beta' });

      const result = await model.generateContent([systemPrompt, rawText]);
      const response = await result.response;
      let text = response.text().trim();
      
      // ลบ markdown code block ถ้ามี
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        text = text.substring(jsonStart, jsonEnd + 1);
      }

      const parsedData = JSON.parse(text);
      return { success: true, data: parsedData };
    } catch (err) {
      console.error(`summarizeHistory Error (${modelName}):`, err.message);
      lastError = err.message;
    }
  }

  return { success: false, error: lastError };
}

module.exports = { askAI, summarizeHistory };
