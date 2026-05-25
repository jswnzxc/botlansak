// ============================================================
//  flex.js  — สร้าง Flex Message สวยงามสำหรับส่งกลับ
// ============================================================

/**
 * สร้าง Flex Message แสดงผลการค้นหา (พบ)
 */
function buildResultFlex(suspect) {
  const statusColor = getStatusColor(suspect.status);

  return {
    type: 'flex',
    altText: `พบ: ${suspect.fullName}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1a3a6e',
        paddingAll: '16px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '🔍 ผลการค้นหา',
                    color: '#a8c4e8',
                    size: 'xs',
                    weight: 'bold',
                  },
                  {
                    type: 'text',
                    text: suspect.rank || '',
                    color: '#7ec8a0',
                    size: 'sm',
                    margin: 'sm',
                  },
                  {
                    type: 'text',
                    text: `${suspect.firstName} ${suspect.lastName}`,
                    color: '#ffffff',
                    size: 'xl',
                    weight: 'bold',
                    wrap: true,
                  },
                ],
                flex: 1,
              },
              {
                type: 'box',
                layout: 'vertical',
                width: '52px',
                height: '52px',
                borderColor: '#3a6eb5',
                borderWidth: '2px',
                cornerRadius: '26px',
                backgroundColor: '#2a5298',
                justifyContent: 'center',
                alignItems: 'center',
                contents: [
                  {
                    type: 'text',
                    text: '👮',
                    size: 'xl',
                    align: 'center',
                  },
                ],
              },
            ],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        backgroundColor: '#ffffff',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: statusColor.bg,
            cornerRadius: '8px',
            paddingAll: '10px',
            margin: 'none',
            contents: [
              {
                type: 'text',
                text: '● สถานะ:',
                color: statusColor.label,
                size: 'sm',
                flex: 0,
              },
              {
                type: 'text',
                text: suspect.status || '-',
                color: statusColor.text,
                size: 'sm',
                weight: 'bold',
                margin: 'sm',
                flex: 1,
              },
            ],
          },
          { type: 'separator', margin: 'md', color: '#f0f0f0' },
          buildInfoRow('📋', 'ประเภทคดี', suspect.crime || '-'),
          buildInfoRow('📍', 'พื้นที่รับผิดชอบ', suspect.area || '-'),
          buildInfoRow('🔢', 'หมายเลขคดี', suspect.caseNo || '-'),
          buildInfoRow('📅', 'วันที่บันทึก', suspect.date || '-'),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#f7f8fa',
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: 'สถานีตำรวจภูธรลานสัก อ.ลานสัก จ.อุทัยธานี',
            color: '#aaaaaa',
            size: 'xs',
            align: 'center',
            wrap: true,
          },
          {
            type: 'text',
            text: 'ข้อมูลนี้เป็นความลับ ห้ามเผยแพร่',
            color: '#cc4444',
            size: 'xs',
            align: 'center',
            margin: 'sm',
          },
        ],
      },
    },
  };
}

/**
 * เลือก card ที่เหมาะสมตาม sheetType ของข้อมูล
 */
function buildSmartCard(person) {
  if (person.sheetType === 'personnel') return buildPersonnelCardFlex(person);
  if (person.sheetType === 'leader')    return buildLeaderCardFlex(person);
  return buildResultFlex(person).contents; // suspect (default)
}

/**
 * สร้าง Carousel เมื่อพบหลายคน (รองรับทุก sheetType)
 */
function buildCarouselFlex(results, query) {
  return {
    type: 'flex',
    altText: `พบ ${results.length} รายการสำหรับ "${query}"`,
    contents: {
      type: 'carousel',
      contents: results.slice(0, 10).map(p => buildSmartCard(p)),
    },
  };
}

/**
 * Flex Message เมื่อไม่พบ
 */
function buildNotFoundFlex(query) {
  return {
    type: 'flex',
    altText: `ไม่พบ "${query}" ในระบบ`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '24px',
        spacing: 'md',
        alignItems: 'center',
        contents: [
          { type: 'text', text: '❌', size: 'xxl', align: 'center' },
          {
            type: 'text',
            text: 'ไม่พบข้อมูล',
            size: 'lg',
            weight: 'bold',
            color: '#cc4444',
            align: 'center',
          },
          {
            type: 'text',
            text: `ไม่พบชื่อ "${query}"\nในระบบสายตรวจภูธรลานสัก`,
            size: 'sm',
            color: '#888888',
            align: 'center',
            wrap: true,
            margin: 'sm',
          },
          { type: 'separator', margin: 'lg', color: '#eeeeee' },
          {
            type: 'text',
            text: 'ลองพิมพ์ชื่อ-นามสกุล หรือยศก็ได้ครับ',
            size: 'xs',
            color: '#aaaaaa',
            align: 'center',
            margin: 'md',
          },
        ],
      },
    },
  };
}

/**
 * Flex Message เมนูหลัก (Welcome)
 */
function buildWelcomeFlex() {
  return {
    type: 'flex',
    altText: 'สวัสดีครับ ระบบสายตรวจภูธรลานสัก',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1a3a6e',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '👮 ระบบสืบค้นข้อมูล', color: '#a8c4e8', size: 'sm' },
          {
            type: 'text',
            text: 'สายตรวจภูธรลานสัก',
            color: '#ffffff',
            size: 'xl',
            weight: 'bold',
            margin: 'sm',
          },
          {
            type: 'text',
            text: 'อ.ลานสัก จ.อุทัยธานี',
            color: '#7ec8a0',
            size: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: 'เลือกบริการที่ต้องการ:',
            size: 'sm',
            color: '#555555',
            margin: 'none',
          },
          buildMenuButton('🔍', 'ค้นหาชื่อผู้ต้องหา',       'ค้นหาชื่อ',         '#1a3a6e'),
          buildMenuButton('👥', 'ทำเนียบบุคลากร สภ.ลานสัก', 'ทำเนียบบุคลากร',    '#1a5276'),
          buildMenuButton('🏘️', 'ทำเนียบผู้นำตำบล',         'ทำเนียบผู้นำตำบล',  '#1d6a4a'),
          buildMenuButton('🌐', 'เว็บไซต์ สภ.ลานสัก',       'เว็บไซต์',          '#5d4037'),
          buildMenuButton('🚨', 'แจ้งเหตุ / ร้องทุกข์',     'แจ้งเหตุ',          '#cc3333'),
          buildMenuButton('📋', 'ตรวจสอบหมายจับ',            'ตรวจสอบหมายจับ',    '#b45309'),
          buildMenuButton('🏢', 'ข้อมูลสถานี',               'ข้อมูลสถานี',       '#2d6a4f'),
          buildMenuButton('📞', 'ติดต่อเจ้าหน้าที่',         'ติดต่อเจ้าหน้าที่', '#555555'),
        ],
      },
    },
  };
}

/**
 * Flex Message เมนูทำเนียบ — ให้ผู้ใช้เลือกว่าจะดูฝ่ายไหน
 * แสดงเป็น Quick Reply Bubble พร้อมปุ่มเลือกฝ่าย/ชั้นยศ
 */
function buildPersonnelMenuFlex() {
  return {
    type: 'flex',
    altText: 'ทำเนียบบุคลากร สภ.ลานสัก — เลือกฝ่ายที่ต้องการ',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1a5276',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '👥 ทำเนียบบุคลากร', color: '#aed6f1', size: 'sm' },
          {
            type: 'text',
            text: 'สถานีตำรวจภูธรลานสัก',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            margin: 'sm',
          },
          {
            type: 'text',
            text: 'เลือกฝ่ายที่ต้องการดู',
            color: '#aed6f1',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          buildMenuButton('⭐', 'ผู้บังคับบัญชา',         'บุคลากร ผู้บังคับบัญชา',        '#1a3a6e'),
          buildMenuButton('🚔', 'งานป้องกันปราบปราม',     'บุคลากร งานป้องกันปราบปราม',    '#1a5276'),
          buildMenuButton('🔎', 'งานสืบสวน',              'บุคลากร งานสืบสวน',             '#1a5276'),
          buildMenuButton('📂', 'งานสอบสวน',              'บุคลากร งานสอบสวน',             '#1a5276'),
          buildMenuButton('📊', 'งานอำนวยการ',            'บุคลากร งานอำนวยการ',           '#1a5276'),
          buildMenuButton('🚦', 'งานจราจร',               'บุคลากร งานจราจร',              '#1a5276'),
          buildMenuButton('📋', 'ช่วยราชการ',              'บุคลากร ช่วยราชการ',            '#1a5276'),
          buildMenuButton('👤', 'ค้นหาตามชื่อ',           'ค้นหาชื่อ',                     '#555555'),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#f0f4fa',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: 'กดปุ่มเพื่อดูรายชื่อในแต่ละฝ่าย',
            color: '#aaaaaa',
            size: 'xs',
            align: 'center',
          },
        ],
      },
    },
  };
}

/**
 * Flex Carousel แสดงรายชื่อบุคลากร สภ. (แต่ละ card = 1 คน)
 */
function buildPersonnelCardFlex(person) {
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1a5276',
      paddingAll: '14px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              width: '48px',
              height: '48px',
              cornerRadius: '24px',
              backgroundColor: '#2e86c1',
              justifyContent: 'center',
              alignItems: 'center',
              contents: [{ type: 'text', text: '👮', size: 'lg', align: 'center' }],
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              flex: 1,
              contents: [
                {
                  type: 'text',
                  text: person.rank || '',
                  color: '#aed6f1',
                  size: 'xs',
                },
                {
                  type: 'text',
                  text: `${person.firstName} ${person.lastName}`,
                  color: '#ffffff',
                  size: 'md',
                  weight: 'bold',
                  wrap: true,
                },
              ],
            },
          ],
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: '#e8f4fd',
          cornerRadius: '8px',
          paddingAll: '10px',
          margin: 'none',
          contents: [
            { type: 'text', text: '● สถานะ:', color: '#2e86c1', size: 'sm', flex: 0 },
            { type: 'text', text: 'ตำรวจ สภ.ลานสัก', color: '#1a5276', size: 'sm', weight: 'bold', margin: 'sm', flex: 1 },
          ],
        },
        { type: 'separator', margin: 'md', color: '#f0f0f0' },
        buildInfoRow('🏷️', 'ตำแหน่ง',  person.position || '-'),
        buildInfoRow('🏢', 'ฝ่าย/งาน', person.area     || '-'),
        buildInfoRow('📞', 'โทรศัพท์', person.phone    || '-'),
        buildInfoRow('📅', 'วันที่',   person.date     || '-'),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f7f8fa',
      paddingAll: '10px',
      contents: [
        { type: 'text', text: 'สถานีตำรวจภูธรลานสัก อ.ลานสัก จ.อุทัยธานี', color: '#aaaaaa', size: 'xs', align: 'center', wrap: true },
      ],
    },
  };
}

/**
 * Carousel แสดงรายชื่อบุคลากร สภ. หลายคน
 */
function buildPersonnelCarouselFlex(persons, department) {
  if (persons.length === 0) {
    return buildNotFoundFlex(department);
  }
  if (persons.length === 1) {
    return {
      type: 'flex',
      altText: `บุคลากร: ${persons[0].fullName}`,
      contents: buildPersonnelCardFlex(persons[0]),
    };
  }
  return {
    type: 'flex',
    altText: `ทำเนียบบุคลากร ${department} — ${persons.length} คน`,
    contents: {
      type: 'carousel',
      contents: persons.slice(0, 12).map(p => buildPersonnelCardFlex(p)),
    },
  };
}

/**
 * Flex Message เมนูทำเนียบผู้นำตำบล
 */
function buildVillageLeaderMenuFlex() {
  return {
    type: 'flex',
    altText: 'ทำเนียบผู้นำตำบล — เลือกตำบลที่ต้องการ',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1d6a4a',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🏘️ ทำเนียบผู้นำตำบล', color: '#a9dfbf', size: 'sm' },
          {
            type: 'text',
            text: 'อำเภอลานสัก จ.อุทัยธานี',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            margin: 'sm',
          },
          {
            type: 'text',
            text: 'เลือกตำบลที่ต้องการ',
            color: '#a9dfbf',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          buildMenuButton('🌳', 'ตำบลลานสัก',      'ผู้นำตำบล ลานสัก',      '#1d6a4a'),
          buildMenuButton('🌾', 'ตำบลน้ำรอบ',      'ผู้นำตำบล น้ำรอบ',      '#1d6a4a'),
          buildMenuButton('🏔️', 'ตำบลทุ่งนางงาม',  'ผู้นำตำบล ทุ่งนางงาม',  '#1d6a4a'),
          buildMenuButton('🌿', 'ตำบลระบำ',         'ผู้นำตำบล ระบำ',        '#1d6a4a'),
          buildMenuButton('🍃', 'ตำบลป่าอ้อ',       'ผู้นำตำบล ป่าอ้อ',      '#1d6a4a'),
          buildMenuButton('🏡', 'ตำบลประดู่ยืน',    'ผู้นำตำบล ประดู่ยืน',   '#1d6a4a'),
          buildMenuButton('🔎', 'ค้นหาตามชื่อ',     'ค้นหาชื่อ',             '#555555'),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#eafaf1',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: 'กดปุ่มเพื่อดูรายชื่อผู้นำในแต่ละตำบล',
            color: '#aaaaaa',
            size: 'xs',
            align: 'center',
          },
        ],
      },
    },
  };
}

/**
 * Flex Card แสดงข้อมูลผู้นำตำบล 1 คน
 */
function buildLeaderCardFlex(leader) {
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#1d6a4a',
      paddingAll: '14px',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              width: '48px',
              height: '48px',
              cornerRadius: '24px',
              backgroundColor: '#27ae60',
              justifyContent: 'center',
              alignItems: 'center',
              contents: [{ type: 'text', text: '🏘️', size: 'lg', align: 'center' }],
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              flex: 1,
              contents: [
                {
                  type: 'text',
                  text: leader.position || '',
                  color: '#a9dfbf',
                  size: 'xs',
                },
                {
                  type: 'text',
                  text: `${leader.rank} ${leader.firstName} ${leader.lastName}`.trim(),
                  color: '#ffffff',
                  size: 'md',
                  weight: 'bold',
                  wrap: true,
                },
              ],
            },
          ],
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      spacing: 'sm',
      contents: [
        buildInfoRow('🏷️', 'ตำแหน่ง',   leader.position || '-'),
        buildInfoRow('📍', 'ตำบล',       leader.area     || '-'),
        buildInfoRow('🏘️', 'หมู่ที่',    leader.village  || '-'),
        buildInfoRow('📞', 'โทรศัพท์',  leader.phone    || '-'),
        buildInfoRow('📅', 'วาระ',       leader.date     || '-'),
      ],
    },
  };
}

/**
 * Carousel แสดงรายชื่อผู้นำตำบลทั้งหมดในตำบลที่เลือก
 */
function buildLeaderCarouselFlex(leaders, subdistrict) {
  if (leaders.length === 0) {
    return buildNotFoundFlex(subdistrict);
  }
  // แสดงเป็น Carousel เสมอ (ทั้งหมด ไม่เกิน 12 card)
  return {
    type: 'flex',
    altText: `ทำเนียบผู้นำตำบล${subdistrict} — ${leaders.length} คน`,
    contents: {
      type: 'carousel',
      contents: leaders.slice(0, 12).map(l => buildLeaderCardFlex(l)),
    },
  };
}

/**
 * Flex Message ข้อมูลสถานี
 */
function buildStationFlex() {
  return {
    type: 'flex',
    altText: 'ข้อมูลสถานีตำรวจภูธรลานสัก',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2d6a4f',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🏢 ข้อมูลสถานี', color: '#95d5b2', size: 'sm' },
          {
            type: 'text',
            text: 'สถานีตำรวจภูธรลานสัก',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          buildInfoRow('📍', 'ที่อยู่',         'เลขที่ 1 ถ.ลานสัก ต.ลานสัก อ.ลานสัก จ.อุทัยธานี 61160'),
          buildInfoRow('📞', 'โทรศัพท์',        '056-537-095'),
          buildInfoRow('🚨', 'สายด่วนฉุกเฉิน', '191'),
          buildInfoRow('⏰', 'เวลาทำการ',       'ตลอด 24 ชั่วโมง'),
          buildInfoRow('🌐', 'Line OA',         'lansak956@gamil.com'),
        ],
      },
    },
  };
}

/**
 * Flex Message ลิงก์เว็บไซต์
 */
function buildWebsiteFlex() {
  return {
    type: 'flex',
    altText: 'เว็บไซต์ สภ.ลานสัก',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#5d4037',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🌐 เว็บไซต์', color: '#ffccbc', size: 'sm' },
          {
            type: 'text',
            text: 'สถานีตำรวจภูธรลานสัก',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: 'เข้าถึงข้อมูลและบริการออนไลน์ผ่านเว็บไซต์ของสถานีได้ที่ปุ่มด้านล่าง',
            size: 'sm',
            color: '#555555',
            wrap: true,
          },
          {
            type: 'button',
            style: 'primary',
            color: '#5d4037',
            margin: 'md',
            action: {
              type: 'uri',
              label: '🌐 เปิดเว็บไซต์ สภ.ลานสัก',
              // ✅ URL เว็บไซต์จริงของสถานี
              uri: 'https://lansakpolicetool.netlify.app/',  // ← แก้ตรงนี้
            },
          },
          {
            type: 'button',
            style: 'secondary',
            margin: 'sm',
            action: {
              type: 'uri',
              label: '📘 Facebook สายตรวจภูธรลานสัก',
              uri: 'https://www.facebook.com/lansak.police',  // ← แก้ตรงนี้
            },
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#f7f8fa',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: 'สอบถามเพิ่มเติม Line OA: @lansak_police',
            color: '#aaaaaa',
            size: 'xs',
            align: 'center',
          },
        ],
      },
    },
  };
}

// ===== Helper Functions =====

function buildInfoRow(icon, label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    paddingAll: '6px',
    contents: [
      { type: 'text', text: icon,  size: 'sm', flex: 0, offsetTop: '1px' },
      { type: 'text', text: label, color: '#888888', size: 'sm', flex: 3, margin: 'sm' },
      { type: 'text', text: value, color: '#333333', size: 'sm', weight: 'bold', flex: 5, wrap: true, align: 'end' },
    ],
  };
}

function buildMenuButton(icon, label, action, color) {
  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: color + '15',
    cornerRadius: '10px',
    paddingAll: '12px',
    margin: 'sm',
    action: { type: 'message', label: label, text: action },
    contents: [
      { type: 'text', text: icon,  size: 'md', flex: 0 },
      { type: 'text', text: label, size: 'sm', color: color, weight: 'bold', margin: 'md', flex: 1 },
      { type: 'text', text: '›',   size: 'lg', color: color, flex: 0 },
    ],
  };
}

function getStatusColor(status) {
  if (!status) return { bg: '#f5f5f5', text: '#666666', label: '#888888' };
  if (status.includes('หมายจับ'))   return { bg: '#fff0f0', text: '#cc3333', label: '#dd5555' };
  if (status.includes('ดำเนินคดี')) return { bg: '#fffbeb', text: '#b45309', label: '#d97706' };
  if (status.includes('พักโทษ'))    return { bg: '#f0fdf4', text: '#166534', label: '#22c55e' };
  return { bg: '#f0f4ff', text: '#1e40af', label: '#3b82f6' };
}

module.exports = {
  buildResultFlex,
  buildCarouselFlex,
  buildNotFoundFlex,
  buildWelcomeFlex,
  buildStationFlex,
  buildWebsiteFlex,
  buildPersonnelMenuFlex,
  buildPersonnelCardFlex,
  buildPersonnelCarouselFlex,
  buildVillageLeaderMenuFlex,
  buildLeaderCardFlex,
  buildLeaderCarouselFlex,
};
