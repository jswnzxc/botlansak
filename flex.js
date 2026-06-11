// ============================================================
//  flex.js  — สร้าง Flex Message สวยงามสำหรับส่งกลับ
// ============================================================

/**
 * สร้าง Flex Message แสดงผลการค้นหา (พบ)
 */
function buildResultFlex(suspect, isAdminUser = false) {
  const statusColor = getStatusColor(suspect.status);

  const footerContents = [
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
  ];

  if (isAdminUser) {
    footerContents.unshift({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'md',
      contents: [
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          color: '#e74c3c',
          action: {
            type: 'message',
            label: 'ลบ',
            text: `/ลบ ${suspect.firstName} ${suspect.lastName}`,
          },
          flex: 1,
        },
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          color: '#3498db',
          action: {
            type: 'message',
            label: 'แก้ไข',
            text: `/แก้ไข ${suspect.firstName} ${suspect.lastName} | [ฟิลด์] | [ค่าใหม่]`,
          },
          flex: 2,
        },
      ],
    });
  }

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
        contents: footerContents,
      },
    },
  };
}

/**
 * เลือก card ที่เหมาะสมตาม sheetType ของข้อมูล
 */
function buildSmartCard(person, isAdminUser = false) {
  if (person.sheetType === 'personnel') return buildPersonnelCardFlex(person);
  if (person.sheetType === 'leader')    return buildLeaderCardFlex(person);
  return buildResultFlex(person, isAdminUser).contents; // suspect (default)
}

/**
 * สร้าง Carousel เมื่อพบหลายคน (รองรับทุก sheetType)
 * ปรับปรุง: รองรับการส่งหลาย Carousel (สูงสุด 5 messages) เพื่อให้เห็นข้อมูลทั้งหมด
 */
function buildCarouselFlex(results, query, isAdminUser = false) {
  const maxPerCarousel = 10; 
  const chunks = [];
  for (let i = 0; i < results.length; i += maxPerCarousel) {
    chunks.push(results.slice(i, i + maxPerCarousel));
  }

  // LINE จำกัดการตอบกลับ 5 messages ต่อครั้ง
  return chunks.slice(0, 5).map((chunk, index) => {
    const startCount = (index * maxPerCarousel) + 1;
    const endCount = startCount + chunk.length - 1;
    
    return {
      type: 'flex',
      altText: `พบ ${results.length} รายการสำหรับ "${query}" (${startCount}-${endCount})`,
      contents: {
        type: 'carousel',
        contents: chunk.map(p => buildSmartCard(p, isAdminUser)),
      },
    };
  });
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
    altText: '📋 รายการเมนู — ระบบสายตรวจภูธรลานสัก',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1a3a6e',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '📋 รายการเมนู', color: '#a8c4e8', size: 'sm' },
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
          buildMenuButton('⛽', 'เบอร์ปั๊ม',               '/เบอร์ปั๊ม',        '#5d4037'),
          buildMenuButton('🏍️', 'เว็ปไซต์สายตรวจลานสัก',     'https://liff.line.me/2010319438-PkvEgigE', '#1a3a6e', 'uri'),
          buildMenuButton('📖', 'วิธีใช้งาน',                '/คำสั่ง',          '#cc3333'),
          buildMenuButton('📋', 'ตรวจสอบหมายจับ',            'ตรวจสอบหมายจับ',    '#b45309'),
          buildMenuButton('📍', 'จุดเสี่ยง / QR Code',      '/จุดเสี่ยง',        '#e67e22'),
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
          buildMenuButton('👥', 'แสดงรายชื่อทั้งหมด',       'บุคลากร ทั้งหมด',              '#1a5276'),
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
 * ปรับปรุง: รองรับการส่งหลาย Carousel เพื่อให้เห็นรายชื่อทั้งหมด
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

  const maxPerCarousel = 10;
  const chunks = [];
  for (let i = 0; i < persons.length; i += maxPerCarousel) {
    chunks.push(persons.slice(i, i + maxPerCarousel));
  }

  return chunks.slice(0, 5).map((chunk, index) => {
    const startCount = (index * maxPerCarousel) + 1;
    const endCount = startCount + chunk.length - 1;
    
    return {
      type: 'flex',
      altText: `ทำเนียบบุคลากร ${department} — ${persons.length} คน (${startCount}-${endCount})`,
      contents: {
        type: 'carousel',
        contents: chunk.map(p => buildPersonnelCardFlex(p)),
      },
    };
  });
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
          buildMenuButton('📋', 'แสดงรายชื่อทั้งหมด', 'ผู้นำตำบล ทั้งหมด',      '#27ae60'),
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
 * ปรับปรุง: รองรับการส่งหลาย Carousel เพื่อให้เห็นรายชื่อทั้งหมด
 */
function buildLeaderCarouselFlex(leaders, subdistrict) {
  if (leaders.length === 0) {
    return buildNotFoundFlex(subdistrict);
  }
  
  const maxPerCarousel = 10;
  const chunks = [];
  for (let i = 0; i < leaders.length; i += maxPerCarousel) {
    chunks.push(leaders.slice(i, i + maxPerCarousel));
  }

  return chunks.slice(0, 5).map((chunk, index) => {
    const startCount = (index * maxPerCarousel) + 1;
    const endCount = startCount + chunk.length - 1;

    return {
      type: 'flex',
      altText: `ทำเนียบผู้นำตำบล${subdistrict} — ${leaders.length} คน (${startCount}-${endCount})`,
      contents: {
        type: 'carousel',
        contents: chunk.map(l => buildLeaderCardFlex(l)),
      },
    };
  });
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

function buildMenuButton(icon, label, actionValue, color, type = 'message') {
  let action;
  if (type === 'location') {
    action = { type: 'location', label: label };
  } else if (type === 'uri') {
    action = { type: 'uri', label: label, uri: actionValue };
  } else {
    action = { type: 'message', label: label, text: actionValue };
  }

  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: color + '15',
    cornerRadius: '10px',
    paddingAll: '12px',
    margin: 'sm',
    action: action,
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

function buildFuelStationFlex() {
  return {
    type: 'flex',
    altText: '⛽ รายชื่อเบอร์โทรศัพท์ปั๊มน้ำมัน',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#e67e22',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '⛽ เบอร์โทรศัพท์ปั๊มน้ำมัน',
            color: '#ffffff',
            weight: 'bold',
            size: 'lg',
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
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '⛽ ปั๊มพีที', weight: 'bold', size: 'sm', color: '#27ae60' },
              { type: 'text', text: '📞 063-659-7494', size: 'md', color: '#2c3e50', action: { type: 'uri', label: 'Call', uri: 'tel:0636597494' } },
            ],
          },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '⛽ ปั๊มบางจาก', weight: 'bold', size: 'sm', color: '#2980b9' },
              { type: 'text', text: '📞 081-324-5773', size: 'md', color: '#2c3e50', action: { type: 'uri', label: 'Call', uri: 'tel:0813245773' } },
            ],
          },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '⛽ ปั๊มปตท.', weight: 'bold', size: 'sm', color: '#c0392b' },
              { type: 'text', text: '📞 092-376-4418', size: 'md', color: '#2c3e50', action: { type: 'uri', label: 'Call', uri: 'tel:0923764418' } },
            ],
          },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '⛽ ปั๊มบัญชาออยล์', weight: 'bold', size: 'sm', color: '#7f8c8d' },
              { type: 'text', text: '📞 082-935-4654', size: 'md', color: '#2c3e50', action: { type: 'uri', label: 'Call', uri: 'tel:0829354654' } },
            ],
          },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '⛽ ปั๊มลานสักบริการ', weight: 'bold', size: 'sm', color: '#8e44ad' },
              { type: 'text', text: '📞 086-628-2203', size: 'md', color: '#2c3e50', action: { type: 'uri', label: 'Call', uri: 'tel:0866282203' } },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'แตะที่เบอร์เพื่อโทรออก',
            size: 'xs',
            color: '#aaaaaa',
            align: 'center',
          },
        ],
      },
    },
  };
}

function buildAllCommandsFlex(isAdminUser, isVerified = false) {
  const contents = [
    {
      type: 'text',
      text: '📖 วิธีใช้งาน',
      weight: 'bold',
      size: 'md',
      color: '#1a3a6e',
    },
    {
      type: 'text',
      text: 'ยินดีต้อนรับสู่ระบบผู้ช่วยสายตรวจ สภ.ลานสัก ท่านสามารถใช้งานระบบได้ง่ายๆ ดังนี้:',
      size: 'xs',
      color: '#555555',
      wrap: true,
      margin: 'sm',
    },
    { type: 'separator', margin: 'md' },
  ];

  if (!isVerified) {
    contents.push({
      type: 'text',
      text: '🔐 การเข้าถึงข้อมูล (สำหรับเจ้าหน้าที่)',
      weight: 'bold',
      size: 'sm',
      margin: 'md',
      color: '#c0392b',
    });
    contents.push({
      type: 'text',
      text: 'หากท่านเป็นเจ้าหน้าที่ กรุณายืนยันตัวตนเพื่อเข้าถึงระบบสืบค้นข้อมูล:\nพิมพ์: /verify [รหัสผ่าน]',
      size: 'xs',
      color: '#7f8c8d',
      wrap: true,
      margin: 'sm',
    });
    contents.push({ type: 'separator', margin: 'md' });
  }

  contents.push({
    type: 'text',
    text: '🔍 การสืบค้นข้อมูล',
    weight: 'bold',
    size: 'sm',
    margin: 'md',
    color: '#2c3e50',
  });
  
  const searchDesc = isVerified 
    ? '• ค้นหาบุคคล: พิมพ์ "ชื่อ" หรือ "นามสกุล" ได้ทันที\n• ค้นหาเบอร์: พิมพ์เบอร์โทร 10 หลัก\n• ทำเนียบตำรวจ: พิมพ์ "ตำรวจ"\n• ทำเนียบผู้นำ: พิมพ์ "ผู้นำตำบล"'
    : '• ทำเนียบผู้นำ: พิมพ์ "ผู้นำตำบล" (เข้าถึงได้ทุกคน)\n• ค้นหาเบอร์เชิงลึก: พิมพ์ "ค้นหาเบอร์เชิงลึก 08XXXXXXXX"';

  contents.push({
    type: 'text',
    text: searchDesc,
    size: 'xs',
    color: '#7f8c8d',
    wrap: true,
    margin: 'sm',
  });

  contents.push({
    type: 'text',
    text: '📍 ระบบจุดเสี่ยง (QR Code)',
    weight: 'bold',
    size: 'sm',
    margin: 'md',
    color: '#2c3e50',
  });
  contents.push({
    type: 'text',
    text: 'พิมพ์ "/จุดเสี่ยง" เพื่อเลือกสถานที่และรับ QR Code',
    size: 'xs',
    color: '#7f8c8d',
    wrap: true,
    margin: 'sm',
  });

  contents.push({
    type: 'text',
    text: '📋 คำสั่งทั่วไป',
    weight: 'bold',
    size: 'sm',
    margin: 'md',
    color: '#2c3e50',
  });
  contents.push({
    type: 'text',
    text: '• /เมนู : แสดงเมนูหลัก\n• /คำสั่ง : แสดงวิธีใช้งานนี้\n• /เบอร์ปั๊ม : ดูเบอร์โทรศัพท์ปั๊มน้ำมัน',
    size: 'xs',
    color: '#7f8c8d',
    wrap: true,
    margin: 'sm',
  });

  if (isAdminUser) {
    contents.push({ type: 'separator', margin: 'lg' });
    contents.push({
      type: 'text',
      text: '👑 ส่วนผู้ดูแลระบบ (Admin Only)',
      weight: 'bold',
      size: 'sm',
      margin: 'md',
      color: '#c0392b',
    });
    contents.push({
      type: 'text',
      text: '• เพิ่มข้อมูล: /เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ...\n• แก้ไข/ลบ: /แก้ไข หรือ /ลบ ตามด้วยชื่อ-นามสกุล\n• จัดการ: /สถิติ, /ล้างcache, /broadcast',
      size: 'xs',
      color: '#7f8c8d',
      wrap: true,
      margin: 'sm',
    });
  }

  return {
    type: 'flex',
    altText: '📖 วิธีใช้งาน — ระบบสายตรวจภูธรลานสัก',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: contents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'สอบถามปัญหาการใช้งาน ติดต่อแอดมินระบบ',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
          },
        ],
      },
    },
  };
}

function buildQuickAddFlex() {
  return {
    type: 'flex',
    altText: '➕ เพิ่มข้อมูลใหม่',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#27ae60',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '➕ เพิ่มข้อมูลผู้ต้องหา/เฝ้าระวัง', color: '#ffffff', weight: 'bold', size: 'sm' },
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
            text: 'แตะที่ข้อความด้านล่างเพื่อคัดลอกและแก้ไข:',
            size: 'xs',
            color: '#888888',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#f8f9fa',
            paddingAll: '12px',
            cornerRadius: '8px',
            contents: [
              {
                type: 'text',
                text: '/เพิ่ม ยศ ชื่อ นามสกุล | คดี | สถานะ | พื้นที่ | หมายเลขคดี',
                size: 'xs',
                color: '#2c3e50',
                wrap: true,
              },
            ],
            action: {
              type: 'message',
              label: 'Copy Template',
              text: '/เพิ่ม\nนาย/นาง/ยศ ชื่อ นามสกุล:\nคดี:\nสถานะ:\nพื้นที่:\nหมายเลขคดี:',
            },
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              { type: 'text', text: '💡 คำแนะนำ:', size: 'xxs', color: '#aaaaaa' },
              { type: 'text', text: 'คัดลอกข้อความด้านบนไปกรอกข้อมูล\nระบุ นาย/นาง หรือยศ มาด้วย (ถ้าไม่ใส่ระบบจะเติม "นาย" ให้เอง)\nอันไหนไม่มีให้เว้นว่างไว้ ระบบจะใส่ "-" ให้ครับ', size: 'xxs', color: '#aaaaaa', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
              type: 'message',
              label: 'ดูวิธีเพิ่มอย่างละเอียด',
              text: '/adminhelp',
            },
          },
        ],
      },
    },
  };
}

function buildDeepPhoneSearchFlex(phone, carrierInfo, localResults = []) {
  const cleanPhone = phone.replace(/\D/g, '');
  
  const contents = [
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `📞 หมายเลข: ${phone}`, weight: 'bold', size: 'lg', color: '#1a3a6e' },
        { type: 'text', text: `📡 เครือข่าย: ${carrierInfo.carrier}`, size: 'sm', color: '#2c3e50' },
        { type: 'text', text: `📍 พื้นที่จดทะเบียน: ${carrierInfo.region}`, size: 'sm', color: '#2c3e50' },
      ],
    },
    { type: 'separator', margin: 'md' },
    {
      type: 'text',
      text: '🔍 ตรวจสอบประวัติออนไลน์ (OSINT)',
      weight: 'bold',
      size: 'xs',
      margin: 'md',
      color: '#888888',
    },
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'md',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#4285F4',
          height: 'sm',
          action: { type: 'uri', label: 'Google', uri: `https://www.google.com/search?q=${encodeURIComponent('"' + cleanPhone + '"')}` },
        },
        {
          type: 'button',
          style: 'primary',
          color: '#1877F2',
          height: 'sm',
          action: { type: 'uri', label: 'Facebook', uri: `https://www.facebook.com/search/top/?q=${encodeURIComponent(cleanPhone)}` },
        },
      ],
    },
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      margin: 'sm',
      contents: [
        {
          type: 'button',
          style: 'secondary',
          color: '#e74c3c',
          height: 'sm',
          action: { type: 'uri', label: '🚨 เช็คมิจฉาชีพ (ฉลาดโอน)', uri: `https://www.chaladoon.com/check?q=${encodeURIComponent(cleanPhone)}` },
        },
      ],
    },
  ];

  if (localResults.length > 0) {
    contents.push({ type: 'separator', margin: 'lg' });
    contents.push({
      type: 'text',
      text: `✅ พบข้อมูลในระบบ ${localResults.length} รายการ`,
      weight: 'bold',
      size: 'xs',
      margin: 'md',
      color: '#27ae60',
    });
    
    localResults.slice(0, 2).forEach(p => {
      contents.push({
        type: 'text',
        text: `• ${p.fullName} (${p.sheetType === 'personnel' ? 'ตำรวจ' : p.sheetType === 'leader' ? 'ผู้นำ' : 'ผู้ต้องหา'})`,
        size: 'xs',
        color: '#2c3e50',
        margin: 'xs',
      });
    });
  }

  return {
    type: 'flex',
    altText: `🔍 ค้นหาเบอร์เชิงลึก: ${phone}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2c3e50',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🔍 ระบบสืบค้นเบอร์เชิงลึก', color: '#ffffff', weight: 'bold', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: contents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'ข้อมูลจากการวิเคราะห์เบื้องต้นและแหล่งข่าวเปิด', size: 'xxs', color: '#aaaaaa', align: 'center' },
        ],
      },
    },
  };
}

/**
 * สร้าง Flex Message แสดงรายการสถานที่ที่บันทึกไว้
 */
function buildLocationListFlex(locations) {
  const items = locations.slice(-10).reverse(); // แสดง 10 รายการล่าสุด
  
  const contents = items.map(loc => ({
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    paddingAll: 'sm',
    backgroundColor: '#f1f8e9',
    cornerRadius: 'md',
    contents: [
      {
        type: 'text',
        text: `📅 ${loc.dateTime}`,
        size: 'xs',
        color: '#558b2f',
        weight: 'bold'
      },
      {
        type: 'text',
        text: `📍 ${loc.title || 'สถานที่ไม่มีชื่อ'}`,
        size: 'sm',
        weight: 'bold',
        margin: 'xs',
        wrap: true
      },
      {
        type: 'text',
        text: loc.address || '-',
        size: 'xs',
        color: '#666666',
        wrap: true,
        margin: 'xs'
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
          {
            type: 'text',
            text: `👮 ผู้บันทึก: ${loc.user}`,
            size: 'xxs',
            color: '#888888',
            flex: 4
          },
          {
            type: 'text',
            text: '🌐 ดูแผนที่',
            size: 'xxs',
            color: '#1a73e8',
            align: 'end',
            flex: 2,
            action: {
              type: 'uri',
              label: 'Map',
              uri: `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
            }
          }
        ]
      },
      {
        type: 'text',
        text: `⚖️ สถานะ: ${loc.status}`,
        size: 'xxs',
        color: '#c62828',
        margin: 'xs'
      }
    ]
  }));

  if (contents.length === 0) {
    contents.push({
      type: 'text',
      text: 'ไม่พบข้อมูลสถานที่ในระบบ',
      align: 'center',
      color: '#aaaaaa',
      margin: 'lg'
    });
  }

  return {
    type: 'flex',
    altText: 'รายการสถานที่ล่าสุด',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2e7d32',
        contents: [
          {
            type: 'text',
            text: '📍 รายการสถานที่ที่บันทึก',
            color: '#ffffff',
            weight: 'bold',
            size: 'md'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: contents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'แสดง 10 รายการล่าสุด',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center'
          }
        ]
      }
    }
  };
}

/**
 * Flex Message เมนูหลักจุดเสี่ยง (เลือกหมวดหมู่)
 */
function buildRiskCategoryMenuFlex() {
  return {
    type: 'flex',
    altText: '📍 เลือกหมวดหมู่จุดเสี่ยง',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#c0392b',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '📍 ระบบจุดเสี่ยง / QR Code', color: '#f5b7b1', size: 'sm' },
          {
            type: 'text',
            text: 'เลือกหมวดหมู่ที่ต้องการ',
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
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          buildMenuButton('🏪', 'ห้างร้าน / สะดวกซื้อ', 'หมวดจุดเสี่ยง ห้างร้าน', '#c0392b'),
          buildMenuButton('🏦', 'ธนาคาร',            'หมวดจุดเสี่ยง ธนาคาร', '#c0392b'),
          buildMenuButton('🏥', 'ส่วนราชการ',         'หมวดจุดเสี่ยง ราชการ', '#c0392b'),
          buildMenuButton('💎', 'ร้านทอง',            'หมวดจุดเสี่ยง ร้านทอง', '#c0392b'),
          buildMenuButton('⛽', 'ปั๊มน้ำมัน',          'หมวดจุดเสี่ยง ปั๊มน้ำมัน', '#c0392b'),
          buildMenuButton('🏭', 'อื่นๆ / สถานที่ทั่วไป', 'หมวดจุดเสี่ยง อื่นๆ',    '#c0392b'),
        ],
      },
    },
  };
}

/**
 * Flex Message รายชื่อสถานที่ในแต่ละหมวดหมู่
 */
function buildRiskLocationMenuFlex(category) {
  let locations = [];
  let icon = '📍';
  let color = '#c0392b';

  if (category === 'ห้างร้าน') {
    icon = '🏪';
    locations = ['โลตัส', 'เซเว่นปั๊มปตทลานสัก', 'ซีเจ', 'เซเว่นตลาด', 'เซเว่นข้างโรงพยาบาลลานสัก'];
  } else if (category === 'ธนาคาร') {
    icon = '🏦';
    locations = ['ธ.ก.ส. ลานสัก', 'ธนาคารออมสิน'];
  } else if (category === 'ราชการ') {
    icon = '🏥';
    locations = ['โรงพยาบาลลานสัก', 'บ้านพักนายอำเภอ', 'ห้องควบคุม สภ.ลานสัก', 'เทศบาลตำบลลานสัก', 'โรงเรียนอนุบาลลานสัก'];
  } else if (category === 'ร้านทอง') {
    icon = '💎';
    locations = ['ห้างทองมังกรฟ้า', 'ร้านค้าทองเยาวราชเส้น CJ', 'ห้องทองลานสักวิทยุ', 'ห้างทองเยาวราช'];
  } else if (category === 'ปั๊มน้ำมัน') {
    icon = '⛽';
    locations = ['ปั๊มเอสโซ่', 'ปั๊มน้ำมันลานสักบริการ', 'ปั๊มน้ำมันบางจาก'];
  } else if (category === 'อื่นๆ') {
    icon = '🏭';
    locations = ['ร้านพีพีเม็ททัลชีท', 'สวนสุขภาพลานสัก'];
  }

  return {
    type: 'flex',
    altText: `📍 รายชื่อจุดเสี่ยงหมวด ${category}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: color,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: `${icon} หมวด${category}`, color: '#f5b7b1', size: 'sm' },
          {
            type: 'text',
            text: 'เลือกสถานที่เพื่อรับ QR Code',
            color: '#ffffff',
            size: 'md',
            weight: 'bold',
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'xs',
        contents: locations.map(loc => buildMenuButton(icon, loc, `ขอคิวอาร์ ${loc}`, color)),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'link',
            height: 'sm',
            action: { type: 'message', label: 'กลับไปหน้าหมวดหมู่', text: '/จุดเสี่ยง' },
          },
        ],
      },
    },
  };
}

/**
 * Flex Message รายชื่อสถานที่จุดเสี่ยงทั้งหมด (ไม่แบ่งหมวดหมู่)
 */
function buildAllRiskLocationsMenuFlex() {
  const allLocations = [
    { name: 'โลตัส', icon: '🏪' },
    { name: 'เซเว่นปั๊มปตทลานสัก', icon: '🏪' },
    { name: 'ซีเจ', icon: '🏪' },
    { name: 'เซเว่นตลาด', icon: '🏪' },
    { name: 'เซเว่นข้างโรงพยาบาลลานสัก', icon: '🏪' },
    { name: 'ธ.ก.ส. ลานสัก', icon: '🏦' },
    { name: 'ธนาคารออมสิน', icon: '🏦' },
    { name: 'โรงพยาบาลลานสัก', icon: '🏥' },
    { name: 'บ้านพักนายอำเภอ', icon: '🏥' },
    { name: 'ห้องควบคุม สภ.ลานสัก', icon: '🏥' },
    { name: 'เทศบาลตำบลลานสัก', icon: '🏥' },
    { name: 'โรงเรียนอนุบาลลานสัก', icon: '🏥' },
    { name: 'ห้างทองมังกรฟ้า', icon: '💎' },
    { name: 'ร้านค้าทองเยาวราชเส้น CJ', icon: '💎' },
    { name: 'ห้องทองลานสักวิทยุ', icon: '💎' },
    { name: 'ห้างทองเยาวราช', icon: '💎' },
    { name: 'ปั๊มเอสโซ่', icon: '⛽' },
    { name: 'ปั๊มน้ำมันลานสักบริการ', icon: '⛽' },
    { name: 'ปั๊มน้ำมันบางจาก', icon: '⛽' },
    { name: 'ร้านพีพีเม็ททัลชีท', icon: '🏭' },
    { name: 'สวนสุขภาพลานสัก', icon: '🏭' }
  ];

  const color = '#c0392b';

  // แบ่งเป็น 2 ส่วนเพื่อให้ Bubble ไม่ยาวเกินไป
  const chunk1 = allLocations.slice(0, 11);
  const chunk2 = allLocations.slice(11);

  const createBubble = (locations, pageLabel) => ({
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: color,
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '📍 ระบบจุดเสี่ยง / QR Code', color: '#f5b7b1', size: 'sm' },
        {
          type: 'text',
          text: `เลือกสถานที่ (${pageLabel})`,
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
      paddingAll: '14px',
      spacing: 'xs',
      contents: locations.map(loc => buildMenuButton(loc.icon, loc.name, `ขอคิวอาร์ ${loc.name}`, color)),
    },
  });

  return {
    type: 'flex',
    altText: '📍 เลือกสถานที่จุดเสี่ยง',
    contents: {
      type: 'carousel',
      contents: [
        createBubble(chunk1, 'หน้า 1/2'),
        createBubble(chunk2, 'หน้า 2/2'),
      ],
    },
  };
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
  buildFuelStationFlex,
  buildAllCommandsFlex,
  buildQuickAddFlex,
  buildDeepPhoneSearchFlex,
  buildSmartCard,
  buildLocationListFlex,
  buildRiskCategoryMenuFlex,
  buildRiskLocationMenuFlex,
  buildAllRiskLocationsMenuFlex,
};
