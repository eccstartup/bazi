// ======== 八字计算引擎 ========
const { Solar } = require('lunar-javascript');

const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DI_ZHI   = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const WU_XING = { '甲乙': '木', '丙丁': '火', '戊己': '土', '庚辛': '金', '壬癸': '水' };
const WU_XING_ZHI = { '寅卯': '木', '巳午': '火', '申酉': '金', '亥子': '水', '辰戌丑未': '土' };

const SHENG_XIAO = {
  子:'鼠',丑:'牛',寅:'虎',卯:'兔',辰:'龙',巳:'蛇',
  午:'马',未:'羊',申:'猴',酉:'鸡',戌:'狗',亥:'猪'
};

// 纳音五行表（六十甲子）
const NA_YIN_MAP = {};
const NA_YIN_LIST = [
  '海中金','海中金','炉中火','炉中火','大林木','大林木',
  '路旁土','路旁土','剑锋金','剑锋金','山头火','山头火',
  '涧下水','涧下水','城头土','城头土','白蜡金','白蜡金',
  '杨柳木','杨柳木','泉中水','泉中水','屋上土','屋上土',
  '霹雳火','霹雳火','松柏木','松柏木','长流水','长流水',
  '沙中金','沙中金','山下火','山下火','平地木','平地木',
  '壁上土','壁上土','金箔金','金箔金','覆灯火','覆灯火',
  '天河水','天河水','大驿土','大驿土','钗钏金','钗钏金',
  '桑柘木','桑柘木','大溪水','大溪水','沙中土','沙中土',
  '天上火','天上火','石榴木','石榴木','大海水','大海水'
];
for (let i = 0; i < 60; i++) {
  NA_YIN_MAP[TIAN_GAN[i % 10] + DI_ZHI[i % 12]] = NA_YIN_LIST[i];
}

const CANG_GAN = {
  子:['癸'], 丑:['己','癸','辛'], 寅:['甲','丙','戊'],
  卯:['乙'], 辰:['戊','乙','癸'], 巳:['丙','庚','戊'],
  午:['丁','己'], 未:['己','丁','乙'], 申:['庚','壬','戊'],
  酉:['辛'], 戌:['戊','辛','丁'], 亥:['壬','甲']
};

function getYearGanZhi(year) {
  return { gan: TIAN_GAN[(year - 4) % 10], zhi: DI_ZHI[(year - 4) % 12] };
}

function getMonthGanZhi(year, month) {
  const yg = (year - 4) % 10;
  const yinCorr = [2, 4, 6, 8, 0];
  const start = yinCorr[yg % 5];
  return { gan: TIAN_GAN[(start + month - 1) % 10], zhi: DI_ZHI[(month + 1) % 12] };
}

function getDayGanZhi(year, month, day) {
  const d = new Date(year, month - 1, day);
  const epoch = new Date(2000, 0, 1);
  const diff = Math.round((d - epoch) / 86400000);
  const offset = ((diff % 60) + 60) % 60;
  return { gan: TIAN_GAN[offset % 10], zhi: DI_ZHI[offset % 12] };
}

const SHI_CHEN = [
  { h:23, name:'子', idx:0 }, { h:1, name:'丑', idx:1 }, { h:3, name:'寅', idx:2 },
  { h:5, name:'卯', idx:3 }, { h:7, name:'辰', idx:4 }, { h:9, name:'巳', idx:5 },
  { h:11, name:'午', idx:6 }, { h:13, name:'未', idx:7 }, { h:15, name:'申', idx:8 },
  { h:17, name:'酉', idx:9 }, { h:19, name:'戌', idx:10 }, { h:21, name:'亥', idx:11 }
];

function getShiChen(hour) {
  for (const sc of SHI_CHEN) {
    if (sc.name === '子') {
      if (hour >= 23 || hour < 1) return sc;
    } else if (hour >= sc.h && hour < sc.h + 2) return sc;
  }
  return SHI_CHEN[0];
}

function getHourGanZhi(dayGan, hour) {
  const sc = getShiChen(hour);
  const dgIdx = TIAN_GAN.indexOf(dayGan);
  const start = (dgIdx % 5) * 2;
  return { gan: TIAN_GAN[(start + sc.idx) % 10], zhi: sc.name };
}

function getWuXing(gan) {
  for (const [k, v] of Object.entries(WU_XING)) {
    if (k.includes(gan)) return v;
  }
  return '';
}

function getWuXingZhi(zhi) {
  for (const [k, v] of Object.entries(WU_XING_ZHI)) {
    if (k.includes(zhi)) return v;
  }
  return '';
}

function getNaYin(gan, zhi) {
  return NA_YIN_MAP[gan + zhi] || '';
}

// 导出此方法，以防其他测试或组件需要
function getCangGan(zhi) {
  return CANG_GAN[zhi] || [];
}

function getShenSha(zhi, dayZhi) {
  const yiMa = { 寅:'申',午:'申',戌:'申', 申:'寅',子:'寅',辰:'寅',
                 巳:'亥',酉:'亥',丑:'亥', 亥:'巳',卯:'巳',未:'巳' };
  const taoHua = { 寅:'卯',午:'卯',戌:'卯', 申:'酉',子:'酉',辰:'酉',
                   巳:'午',酉:'午',丑:'午', 亥:'子',卯:'子',未:'子' };
  const r = [];
  if (yiMa[dayZhi] === zhi) r.push('驿马');
  if (taoHua[dayZhi] === zhi) r.push('桃花');
  return r;
}

function calculateBazi(year, month, day, hour, minute = 0, second = 0, gender = '男') {
  const yNum = Number(year);
  const mNum = Number(month);
  const dNum = Number(day);
  const hNum = Number(hour);
  const miNum = Number(minute);
  const sNum = Number(second);

  const date = new Date(yNum, mNum - 1, dNum, hNum, miNum, sNum);
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  const y = { gan: eightChar.getYearGan(), zhi: eightChar.getYearZhi() };
  const m = { gan: eightChar.getMonthGan(), zhi: eightChar.getMonthZhi() };
  const d = { gan: eightChar.getDayGan(), zhi: eightChar.getDayZhi() };
  const h = { gan: eightChar.getTimeGan(), zhi: eightChar.getTimeZhi() };

  const pillars = { 年柱: y, 月柱: m, 日柱: d, 时柱: h };
  const names = ['年柱', '月柱', '日柱', '时柱'];
  const naYin = {};
  for (const n of names) naYin[n] = getNaYin(pillars[n].gan, pillars[n].zhi);

  const wuxing = {};
  for (const n of names) wuxing[n[0]] = getWuXing(pillars[n].gan) + getWuXingZhi(pillars[n].zhi);

  const canggan = {};
  for (const n of names) canggan[n[0]] = getCangGan(pillars[n].zhi).map(g => getWuXing(g) + g);

  const shensha = {};
  for (const n of names) shensha[n[0]] = getShenSha(pillars[n].zhi, d.zhi);

  return {
    pillars,
    naYin,
    wuxing,
    canggan,
    shensha,
    riZhu: `${d.gan}（${getWuXing(d.gan)}）`,
    riGan: d.gan,
    riGanWuXing: getWuXing(d.gan),
    shengXiao: SHENG_XIAO[y.zhi] || '',
    shiChen: h.zhi,
    textLines: [
      '【四柱八字】',
      `  ${names.map(n => pillars[n].gan).join('  ')}`,
      `  ${names.map(n => pillars[n].zhi).join('  ')}`,
      `   年柱  月柱  日柱  时柱`,
      `纳音: ${names.map(n => naYin[n]).join('  ')}`,
      '',
      `【日主】${d.gan}（${getWuXing(d.gan)}）`,
      `【生肖】${SHENG_XIAO[y.zhi] || ''}  【时辰】${h.zhi}时`,
      '',
      '【藏干】',
      ...names.map(n => `  ${n}: ${(canggan[n[0]] || []).join(' ') || '无'}`),
      '',
      '【神煞】',
      ...names.map(n => `  ${n}: ${(shensha[n[0]] || []).join(' ') || '无'}`),
    ]
  };
}

module.exports = { calculateBazi };
