const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

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
  if (!process.env.GEMINI_API_KEY) return { error: 'Missing API Key' };

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // รายชื่อโมเดลที่ต้องการลองใช้ (สำหรับ Image Analysis)
  const modelNames = [
    'gemini-1.5-flash', 
    'gemini-1.5-flash-latest', 
    'gemini-1.5-pro', 
    'gemini-1.5-flash-001'
  ];

  let lastError = null;

  for (const modelName of modelNames) {
    try {
      console.log(`Trying OCR with model: ${modelName} (v1beta)`);
      const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });

      const prompt = `
        คุณคือผู้เชี่ยวชาญด้าน OCR ของตำรวจไทย หน้าที่ของคุณคือสกัดข้อมูลจากรูปภาพที่ส่งมาอย่างแม่นยำที่สุด:
        
        กรณีที่ 1: "บัตรประชาชน"
        - สกัด ชื่อ (firstName) และ นามสกุล (lastName) เป็นภาษาไทย
        - ไม่ต้องใส่คำนำหน้า (นาย/นาง/นางสาว)
        - สกัด "ที่อยู่ตามบัตร" (address) ให้ครบถ้วนที่สุด
        
        กรณีที่ 2: "ป้ายทะเบียนรถ"
        - สกัด เลขทะเบียน (plateNo) เช่น "1กข 1234"
        - สกัด จังหวัด (province) เช่น "อุทัยธานี"
        
        ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น (ห้ามมีคำพูดอื่นนอกเหนือจาก JSON):
        {
          "type": "id_card" หรือ "license_plate",
          "firstName": "...",
          "lastName": "...",
          "address": "...",
          "plateNo": "...",
          "province": "...",
          "confidence": 0-1
        }
        
        สำคัญ: หากสแกนไม่สำเร็จหรือไม่มั่นใจ ให้ใส่ค่าเป็น null ในฟิลด์นั้นๆ แต่ยังคงส่งรูปแบบ JSON เดิมมา
      `;

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ];

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [
          { text: prompt },
          { inlineData: { data: imageBuffer.toString('base64'), mimeType } }
        ]}],
        safetySettings
      });

      const response = await result.response;
      
      if (response.promptFeedback && response.promptFeedback.blockReason) {
        console.warn(`Model ${modelName} blocked by safety: ${response.promptFeedback.blockReason}`);
        continue;
      }

      const rawText = response.text().trim();
      console.log(`🤖 Raw AI OCR Response (${modelName}):`, rawText);
      
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      
      const cleanJson = jsonMatch[0].replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      if (parsed.type) return parsed;
    } catch (err) {
      console.error(`OCR Error (${modelName}):`, err.message);
      lastError = err.message;
      if (err.message.includes('404') || err.message.includes('not found')) {
        continue;
      }
      break; 
    }
  }

  return { error: lastError || 'All models failed' };
}

module.exports = { askAI, analyzeImage };
