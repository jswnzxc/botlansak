// ============================================================
//  broadcast.js  — ระบบแจ้งเตือนไปยังผู้ใช้ทุกคนที่เป็นเพื่อนกับบอท
//
//  วิธีทำงาน:
//  - เมื่อมีใครส่งข้อความหาบอท → บันทึก userId ลง followers.json
//  - Admin พิมพ์ /broadcast <ข้อความ> → ส่งหาทุกคนใน followers.json
//
//  ⚠️ หมายเหตุ LINE API:
//  - LINE Messaging API Plan ฟรีไม่รองรับ Multicast (ส่งพร้อมกันหลายคน)
//  - ต้องใช้ Plan Developer Trial หรือ Official Account Manager
//  - ถ้าต้องการ Broadcast จริงๆ ควร Upgrade เป็น LINE Official Account
//  - หรือใช้ Push Message ทีละคน (ฟรี แต่ช้า ถ้ามีผู้ใช้เยอะ)
// ============================================================

const fs   = require('fs');
const path = require('path');

const FOLLOWERS_FILE = path.join(__dirname, 'followers.json');

/**
 * โหลด followers list
 */
function loadFollowers() {
  try {
    if (!fs.existsSync(FOLLOWERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(FOLLOWERS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * บันทึก followers list
 */
function saveFollowers(followers) {
  fs.writeFileSync(FOLLOWERS_FILE, JSON.stringify(followers, null, 2), 'utf-8');
}

/**
 * บันทึก userId เมื่อมีการส่งข้อความ
 * เรียกทุกครั้งที่มี event เข้ามา
 */
function trackUser(userId, displayName) {
  if (!userId) return;
  const followers = loadFollowers();
  const isNew = !followers[userId];

  followers[userId] = {
    userId,
    displayName: displayName || followers[userId]?.displayName || '',
    lastSeen: new Date().toISOString(),
    firstSeen: followers[userId]?.firstSeen || new Date().toISOString(),
  };

  saveFollowers(followers);
  return isNew; // return true ถ้าเป็นผู้ใช้ใหม่
}

/**
 * ดึงรายชื่อ followers ทั้งหมด
 */
function getFollowers() {
  return Object.values(loadFollowers());
}

/**
 * ส่งข้อความ Broadcast ไปยังทุกคน
 * @param {Object} client - LINE Messaging API client
 * @param {string|Object} message - ข้อความหรือ Flex Message
 * @returns {Object} สรุปผล { sent, failed, total }
 */
async function broadcastToAll(client, message) {
  const followers = getFollowers();
  if (followers.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  const lineMessage = typeof message === 'string'
    ? { type: 'text', text: message }
    : message;

  let sent = 0, failed = 0;

  // ส่งทีละคน (รองรับทุก Plan)
  // หากมีผู้ใช้เยอะ ควร Upgrade ใช้ multicast แทน
  for (const follower of followers) {
    try {
      await client.pushMessage({
        to: follower.userId,
        messages: [lineMessage],
      });
      sent++;
      // หน่วงเล็กน้อยเพื่อไม่ให้ Rate Limit
      await sleep(100);
    } catch (err) {
      console.error(`❌ ส่งหา ${follower.userId} ไม่ได้:`, err.message);
      failed++;
      // ถ้า userId ไม่มีในระบบแล้ว (Unfollow) → ลบออก
      if (err.message?.includes('Invalid reply token') ||
          err.statusCode === 400) {
        removeFollower(follower.userId);
      }
    }
  }

  return { sent, failed, total: followers.length };
}

/**
 * ส่งข้อความ Broadcast แบบ Multicast (เร็วกว่า แต่ต้องใช้ Plan ที่รองรับ)
 * ใช้ได้กับ LINE Developer Trial / Official Account
 */
async function multicastToAll(client, message) {
  const followers = getFollowers();
  if (followers.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  const lineMessage = typeof message === 'string'
    ? { type: 'text', text: message }
    : message;

  const userIds = followers.map(f => f.userId);
  // LINE Multicast รองรับสูงสุด 500 คนต่อครั้ง
  const BATCH_SIZE = 500;

  let sent = 0, failed = 0;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    try {
      await client.multicast({
        to: batch,
        messages: [lineMessage],
      });
      sent += batch.length;
    } catch (err) {
      console.error(`❌ Multicast batch ${i}-${i + BATCH_SIZE} ล้มเหลว:`, err.message);
      failed += batch.length;
    }
    await sleep(500);
  }

  return { sent, failed, total: userIds.length };
}

/**
 * ลบ follower ที่ Unfollow แล้ว
 */
function removeFollower(userId) {
  const followers = loadFollowers();
  if (followers[userId]) {
    delete followers[userId];
    saveFollowers(followers);
    console.log(`🗑️  ลบ follower ออก: ${userId}`);
  }
}

/**
 * สถิติ followers
 */
function getStats() {
  const followers = getFollowers();
  return {
    total: followers.length,
    followers,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * สร้าง Flex Message สรุปผลการ Broadcast
 */
function buildBroadcastResultFlex(result, previewText) {
  const successRate = result.total > 0
    ? Math.round((result.sent / result.total) * 100)
    : 0;

  return {
    type: 'flex',
    altText: `📢 Broadcast: ส่งสำเร็จ ${result.sent}/${result.total} คน`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: result.failed > 0 ? '#b45309' : '#1d6a4a',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '📢 ผลการ Broadcast', color: '#ffffff', weight: 'bold', size: 'md' },
        ],
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
              { type: 'text', text: '✅ ส่งสำเร็จ',  color: '#27ae60', size: 'md', weight: 'bold', flex: 1 },
              { type: 'text', text: `${result.sent} คน`, color: '#27ae60', size: 'md', weight: 'bold', align: 'end' },
            ],
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '❌ ส่งไม่ได้',  color: '#cc3333', size: 'sm', flex: 1 },
              { type: 'text', text: `${result.failed} คน`, color: '#cc3333', size: 'sm', align: 'end' },
            ],
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '👥 ทั้งหมด',    color: '#555555', size: 'sm', flex: 1 },
              { type: 'text', text: `${result.total} คน`, color: '#555555', size: 'sm', align: 'end' },
            ],
          },
          { type: 'separator', margin: 'md', color: '#eeeeee' },
          {
            type: 'text',
            text: `📄 ข้อความ: "${previewText.slice(0, 50)}${previewText.length > 50 ? '...' : ''}"`,
            color: '#888888', size: 'xs', wrap: true, margin: 'sm',
          },
        ],
      },
    },
  };
}

module.exports = {
  trackUser,
  getFollowers,
  broadcastToAll,
  multicastToAll,
  removeFollower,
  getStats,
  buildBroadcastResultFlex,
};
