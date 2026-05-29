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
 * ฟังก์ชันสรุปข้อมูลจากข้อความ (เช่น ผลจาก OCR บัตรประชาชน)
 * @param {string} rawText ข้อความดิบที่ต้องการสรุป
 * @returns {Object} ข้อมูลที่สรุปแล้วในรูปแบบ JSON
 */
async function summarizeHistory(rawText) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('summarizeHistory: GEMINI_API_KEY is missing');
    return null;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelNames = ['gemini-1.5-flash', 'gemini-1.0-pro'];
  
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

  for (const modelName of modelNames) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
      const result = await model.generateContent([systemPrompt, rawText]);
      const response = await result.response;
      let text = response.text().trim();
      
      // ลบ markdown code block ถ้ามี
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // ค้นหาขอบเขตของ JSON (เผื่อ AI ตอบอย่างอื่นมาด้วย)
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        text = text.substring(jsonStart, jsonEnd + 1);
      }

      const parsedData = JSON.parse(text);
      console.log(`✅ summarizeHistory success with model: ${modelName}`);
      return parsedData;
    } catch (err) {
      console.error(`summarizeHistory Error (${modelName}):`, err.message);
      // ถ้าเป็นโมเดลสุดท้ายแล้วค่อยคืนค่า null
      if (modelName === modelNames[modelNames.length - 1]) {
        return null;
      }
    }
  }
}

module.exports = { askAI, summarizeHistory };
