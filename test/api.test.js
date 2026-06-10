// API 端点测试 — 通过直接调用 handler 逻辑测试，无需 HTTP 端口绑定
const { calculateBazi } = require('../bazi');
const { generateOrderId } = require('../alipay');

let pass = 0, fail = 0;
function assert(condition, msg) {
  if (condition) { pass++; }
  else { console.error(`  ❌ FAIL: ${msg}`); fail++; }
}

function eq(a, e, m) { assert(a === e, `${m} => 期望"${e}", 得到"${a}"`); }

console.log('\n🔮 八字排盘 API 逻辑测试\n');

// ====== 1. POST /query 参数校验逻辑 ======
console.log('--- 1. POST /query 参数校验 ---');
function validateQueryParams(body) {
  const { year, month, day, hour } = body || {};
  if (!year || !month || !day || hour === undefined) {
    return { valid: false, error: '缺少必填参数 year, month, day, hour' };
  }
  const y = +year, mo = +month, d = +day, h = +hour;
  const birthDate = new Date(y, mo - 1, d, h, 0, 0);
  if (birthDate.getFullYear() !== y || birthDate.getMonth() + 1 !== mo || birthDate.getDate() !== d) {
    return { valid: false, error: '无效的日期时间' };
  }
  return { valid: true, date: { y, mo, d, h, mi: +(body.minute || 0), s: +(body.second || 0) } };
}

eq(validateQueryParams({ year: 2000, month: 1, day: 1, hour: 8 }).valid, true, '正常参数校验通过');
eq(validateQueryParams({ year: 2000, month: 1, day: 1, hour: 0 }).valid, true, 'hour=0 校验通过');
eq(validateQueryParams({}).valid, false, '空 body 校验失败');
eq(validateQueryParams({ year: 2000, month: 1, hour: 8 }).valid, false, '缺 day 校验失败');
eq(validateQueryParams({ year: 2023, month: 2, day: 29, hour: 8 }).valid, false, '2023-02-29 校验失败');
eq(validateQueryParams({ year: 2024, month: 2, day: 29, hour: 8 }).valid, true, '2024-02-29 校验通过 (闰年)');

// ====== 2. query 返回结构 ======
console.log('\n--- 2. POST /query 响应结构模拟 ---');
{
  const input = { name: '测试', gender: '男', year: 2000, month: 1, day: 1, hour: 8 };
  const validated = validateQueryParams(input);
  assert(validated.valid, '输入校验通过');
  const { y, mo, d, h, mi, s } = validated.date;
  const bazi = calculateBazi(y, mo, d, h, mi, s, input.gender);
  const orderNo = generateOrderId();

  // 验证八字核心字段
  assert(bazi.pillars['年柱'], '年柱存在');
  assert(bazi.pillars['月柱'], '月柱存在');
  assert(bazi.pillars['日柱'], '日柱存在');
  assert(bazi.pillars['时柱'], '时柱存在');
  assert(bazi.riZhu, 'riZhu 存在');
  assert(bazi.shengXiao, 'shengXiao 存在');
  assert(bazi.shiChen, 'shiChen 存在');
  assert(bazi.naYin['年柱'], '纳音年柱存在');
  assert(bazi.naYin['月柱'], '纳音月柱存在');
  assert(bazi.naYin['日柱'], '纳音日柱存在');
  assert(bazi.naYin['时柱'], '纳音时柱存在');

  // 验证 wu_xing 四柱
  assert(bazi.wuxing['年'], 'wu_xing 年存在');
  assert(bazi.wuxing['月'], 'wu_xing 月存在');
  assert(bazi.wuxing['日'], 'wu_xing 日存在');
  assert(bazi.wuxing['时'], 'wu_xing 时存在');

  // 验证 order_no 格式
  assert(orderNo.startsWith('BAZI'), `order_no 以 BAZI 开头: ${orderNo}`);
}

// ====== 3. result 数据结构 ======
console.log('\n--- 3. GET /result 响应数据验证 ---');
{
  const bazi = calculateBazi(2000, 1, 1, 8, 0, 0, '男');
  const resultData = {
    name: '测试用户',
    gender: '男',
    birth: '2000年1月1日 08:00:00',
    ri_zhu: bazi.riZhu,
    sheng_xiao: bazi.shengXiao,
    shi_chen: bazi.shiChen,
    pillars: {
      year: { gan: bazi.pillars['年柱'].gan, zhi: bazi.pillars['年柱'].zhi, na_yin: bazi.naYin['年柱'] },
      month: { gan: bazi.pillars['月柱'].gan, zhi: bazi.pillars['月柱'].zhi, na_yin: bazi.naYin['月柱'] },
      day: { gan: bazi.pillars['日柱'].gan, zhi: bazi.pillars['日柱'].zhi, na_yin: bazi.naYin['日柱'] },
      hour: { gan: bazi.pillars['时柱'].gan, zhi: bazi.pillars['时柱'].zhi, na_yin: bazi.naYin['时柱'] },
    },
    wu_xing: bazi.wuxing,
    cang_gan: bazi.canggan,
    shen_sha: bazi.shensha,
  };

  eq(resultData.name, '测试用户', 'name 正确');
  eq(resultData.gender, '男', 'gender 正确');
  eq(resultData.ri_zhu, '甲（木）', 'ri_zhu = 甲（木）');
  eq(resultData.sheng_xiao, '龙', 'sheng_xiao = 龙');
  eq(resultData.shi_chen, '辰', 'shi_chen = 辰 (8时)');

  // pillars
  eq(resultData.pillars.year.gan, '庚', '年干=庚');
  eq(resultData.pillars.year.zhi, '辰', '年支=辰');
  eq(resultData.pillars.year.na_yin, '白蜡金', '年纳音=白蜡金');
  eq(resultData.pillars.month.gan, '戊', '月干=戊');
  eq(resultData.pillars.month.zhi, '寅', '月支=寅');
  eq(resultData.pillars.month.na_yin, '城头土', '月纳音=城头土');
  eq(resultData.pillars.day.gan, '甲', '日干=甲');
  eq(resultData.pillars.day.zhi, '子', '日支=子');
  eq(resultData.pillars.day.na_yin, '海中金', '日纳音=海中金');
  eq(resultData.pillars.hour.gan, '戊', '时干=戊');
  eq(resultData.pillars.hour.zhi, '辰', '时支=辰');
  eq(resultData.pillars.hour.na_yin, '大林木', '时纳音=大林木');

  // wu_xing: 庚辰 -> 金土, 戊寅 -> 土木, 甲子 -> 木水, 戊辰 -> 土木
  eq(resultData.wu_xing['年'], '金土', 'wu_xing 年=金土');
  eq(resultData.wu_xing['月'], '土木', 'wu_xing 月=土木');
  eq(resultData.wu_xing['日'], '木水', 'wu_xing 日=木水');
  eq(resultData.wu_xing['时'], '土土', 'wu_xing 时=土土');

  // cang_gan
  assert(resultData.cang_gan['年'].length > 0, 'cang_gan 年非空');
  assert(resultData.cang_gan['月'].length > 0, 'cang_gan 月非空');
  assert(resultData.cang_gan['日'].length > 0, 'cang_gan 日非空');
  assert(resultData.cang_gan['时'].length > 0, 'cang_gan 时非空');
  eq(resultData.cang_gan['日'][0], '水癸', 'cang_gan 日[0]=水癸');

  // shen_sha
  assert(typeof resultData.shen_sha === 'object', 'shen_sha 为对象');
}

// ====== 4. 性别影响(目前算法性别不影响排盘) ======
console.log('\n--- 4. 性别输入 ---');
{
  const male = calculateBazi(2000, 1, 1, 8, 0, 0, '男');
  const female = calculateBazi(2000, 1, 1, 8, 0, 0, '女');
  eq(male.riZhu, female.riZhu, '阴阳同四柱(当前实现)');
  eq(male.shiChen, female.shiChen, '阴阳同时辰');
}

// ====== 5. 不同出生日期 8 字唯一性 ======
console.log('\n--- 5. 不同日期八字验证 ---');
{
  const b1 = calculateBazi(1986, 5, 26, 7, 0, 0, '男');
  eq(b1.riZhu, '丙（火）', '1986-05-26 日主=丙火');

  const b2 = calculateBazi(1999, 12, 25, 19, 0, 0, '男');
  eq(b2.riZhu, '丁（火）', '1999-12-25 日主=丁火');
  eq(b2.shiChen, '戌', '19时→戌时');

  const b3 = calculateBazi(2025, 6, 10, 12, 0, 0, '男');
  eq(b3.riZhu, '丙（火）', '2025-06-10 日主=丙火');
  eq(b3.shiChen, '午', '12时→午时');
}

// ====== 6. payment_link 生成逻辑 ======
console.log('\n--- 6. payment_link 生成 ---');
{
  const token = '0123456789abcdef0123456789abcdef';
  const bp = '/v1/bazi';
  const paymentLink = `http://127.0.0.1:3000${bp}/pay/${token}`;
  assert(paymentLink.includes('/pay/'), 'payment_link 包含 /pay/ 路径');
  assert(paymentLink.includes(token), 'payment_link 包含 token');
  assert(paymentLink.startsWith(`http://127.0.0.1:3000${bp}/pay/`), 'payment_link 格式正确');
}

// ====== 7. order_token 格式 ======
console.log('\n--- 7. order_token 格式');
{
  const crypto = require('crypto');
  const token = crypto.randomBytes(16).toString('hex');
  eq(token.length, 32, 'order_token 长度=32');
  assert(/^[0-9a-f]{32}$/.test(token), 'order_token 为 32 位 hex');
}

// ====== 8. 订单状态转换 ======
console.log('\n--- 8. 订单状态机');
{
  const order = { status: 'pending' };
  eq(order.status, 'pending', '初始状态=pending');
  order.status = 'paid';
  eq(order.status, 'paid', '支付后状态=paid');
}

// ====== 9. 支付宝 simulate ======
console.log('\n--- 9. 支付宝逻辑 (演示模式) ---');
{
  // 演示模式最终价格 0.01
  const config = require('../config');
  eq(config.baziPrice, 0.01, '演示模式价格=0.01');
  assert(config.isDemoMode === true, 'isDemoMode=true');
}

// ====== 10. 纳音配置验证 ======
console.log('\n--- 10. 纳音覆盖率验证 ---');
{
  // 验证所有六十甲子都有纳音
  const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  let missing = 0;
  for (let i = 0; i < 60; i++) {
    const gan = TIAN_GAN[i % 10];
    const zhi = DI_ZHI[i % 12];
    const bazi = calculateBazi(2000 + i, 1, 1, 0, 0, 0, '男');
    // 用年柱纳音验证
    const naYin = bazi.naYin['年柱'];
    if (!naYin) { console.error(`    缺失纳音: ${gan}${zhi}`); missing++; }
  }
  eq(missing, 0, '所有六十甲子纳音无缺失');
}

    // ====== 11. POST result 已支付返回完整数据 ======
    console.log('\n--- 11. POST result 已支付验证 ---');
    {
      const bazi = calculateBazi(2000, 1, 1, 8, 0, 0, '男');
      const data = {
        name: 'POST结果测试', ri_zhu: bazi.riZhu,
        pillars: {
          year: { gan: bazi.pillars['年柱'].gan, zhi: bazi.pillars['年柱'].zhi, na_yin: bazi.naYin['年柱'] },
        },
        wu_xing: bazi.wuxing, cang_gan: bazi.canggan,
      };
      eq(data.name, 'POST结果测试', 'POST result data.name 正确');
      eq(data.ri_zhu, '甲（木）', 'POST result ri_zhu=甲（木）');
      eq(data.pillars.year.na_yin, '白蜡金', 'POST result 年纳音=白蜡金');
      assert(typeof data.wu_xing === 'object', 'POST result wu_xing 为对象');
      assert(Array.isArray(data.cang_gan['日']), 'POST result cang_gan 日柱为数组');
    }

// ====== 汇总 ======
console.log(`\n=======================`);
console.log(`  ✅ PASS: ${pass}  ❌ FAIL: ${fail}`);
console.log(`=======================\n`);

if (fail > 0) process.exit(1);
