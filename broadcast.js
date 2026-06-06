const { trackUserInSheet, loadFollowersFromSheet } = require('./sheets-writer');

/**
 * บันทึก userId เมื่อมีการส่งข้อความ
 */
async function trackUser(userId, displayName) {
  if (!userId) return;
  return await trackUserInSheet(userId, displayName);
}

/**
 * ส่งข้อความ Broadcast ไปยังทุกคน (ดึงรายชื่อจาก Google Sheets)
 */
async function broadcastToAll(client, message) {
  const followers = await loadFollowersFromSheet();
  if (followers.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  const lineMessage = typeof message === 'string'
    ? { type: 'text', text: message }
    : message;

  let sent = 0, failed = 0;

  for (const follower of followers) {
    try {
      await client.pushMessage({
        to: follower.userId,
        messages: [lineMessage],
      });
      sent++;
      await new Promise(resolve => setTimeout(resolve, 100)); // หน่วงเล็กน้อย
    } catch (err) {
      console.error(`❌ ส่งหา ${follower.userId} ไม่ได้:`, err.message);
      failed++;
    }
  }

  return { sent, failed, total: followers.length };
}

function getStats() {
  // สถิติแบบด่วน (ดึงสดจากชีตจะช้า ให้รออัพเดตผ่านการรัน broadcast จริง)
  return { total: 'รอการตรวจสอบ (ดึงข้อมูลจาก Sheets)' };
}

/**
 * สร้าง Flex Message สรุปผลการ Broadcast
 */
function buildBroadcastResultFlex(result, previewText, targetName = null) {
  const title = targetName ? `📢 ส่งหา: ${targetName}` : '📢 ผลการ Broadcast';
  const statusColor = result.sent > 0 ? '#27ae60' : '#e74c3c';
  
  return {
    type: 'flex',
    altText: `📢 Broadcast สำเร็จ ${result.sent} คน`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1d6a4a',
        paddingAll: '14px',
        contents: [{ type: 'text', text: title, color: '#ffffff', weight: 'bold' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: result.notFound ? '❌ ไม่พบรายชื่อ' : '✅ ส่งสำเร็จ', color: statusColor, weight: 'bold', flex: 1 },
              { type: 'text', text: `${result.sent} คน`, color: statusColor, weight: 'bold', align: 'end' },
            ],
          },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: `📄 ข้อความ: "${previewText.slice(0, 50)}..."`, color: '#888888', size: 'xs', wrap: true },
        ],
      },
    },
  };
}

/**
 * ลบ userId เมื่อมีการ Unfollow (Optional: สำหรับจัดการ Database ภายหลัง)
 */
function removeFollower(userId) {
  console.log(`👋 User ${userId} unfollowed.`);
  // ในเวอร์ชันนี้เราเน้นเก็บ log ส่วนการลบออกจาก Sheets สามารถเพิ่ม batchUpdate ได้ถ้าต้องการ
}

/**
 * ส่งข้อความ Broadcast ไปยังบุคคลที่ระบุชื่อ (displayName)
 */
async function broadcastToTarget(client, message, targetName) {
  const followers = await loadFollowersFromSheet();
  const targetFollowers = followers.filter(f => 
    f.displayName.toLowerCase().includes(targetName.toLowerCase())
  );

  if (targetFollowers.length === 0) {
    return { sent: 0, failed: 0, total: 0, notFound: true };
  }

  const lineMessage = typeof message === 'string'
    ? { type: 'text', text: message }
    : message;

  let sent = 0, failed = 0;

  for (const follower of targetFollowers) {
    try {
      await client.pushMessage({
        to: follower.userId,
        messages: [lineMessage],
      });
      sent++;
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`❌ ส่งหา ${follower.userId} (${follower.displayName}) ไม่ได้:`, err.message);
      failed++;
    }
  }

  return { sent, failed, total: targetFollowers.length };
}

module.exports = {
  trackUser,
  broadcastToAll,
  broadcastToTarget,
  removeFollower,
  getStats,
  buildBroadcastResultFlex,
};