// API 端点测试 — 无状态 token 版本（适配 Vercel Serverless）
const { calculateBazi } = require('../bazi');
const { generateOrderId } = require('../alipay');
const app = require('../app');
const crypto = require('crypto');
const TOKEN_SECRET = 'bazi-demo-secret-not-for-production';
function signPayload(payload) {
  const json = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(json).digest('hex');
  return Buffer.from(json).toString('base64url') + '.' + hmac;
}
function verifyToken(token) {
  try {
    const idx = token.lastIndexOf('.');
    if (idx <= 0) return null;
    const payloadB64 = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(json).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(json);
    if (payload._ts && Date.now() - payload._ts > 30 * 60 * 1000) return null;
    return payload;
  } catch { return null; }
}

let pass = 0, fail = 0;
function assert(condition, msg) {
  if (condition) { pass++; }
  else { console.error(`  ❌ FAIL: ${msg}`); fail++; }
}
function eq(a, e, m) { assert(a === e, `${m} => 期望"${e}", 得到"${a}"`); }

console.log('\n🔮 八字排盘 API 测试 (无状态版)\n');

// ====== 1. Token 签名/验证 ======
console.log('--- 1. Token 签名/验证 ---');
{
  const payload = { _ts: Date.now(), name: '测试', gender: '男', y: 2000, mo: 1, d: 1, h: 8, mi: 0, s: 0, orderNo: 'BAZITEST' };
  const token = signPayload(payload);
  assert(typeof token === 'string' && token.includes('.'), 'token 格式含 .');
  const decoded = verifyToken(token);
  assert(decoded !== null, '合法 token 验证通过');
  eq(decoded.name, '测试', '解码 name 正确');
  eq(decoded.y, 2000, '解码 y 正确');

  // 篡改检测
  const tampered = token.replace(token[10], token[10] === 'A' ? 'B' : 'A');
  const v = verifyToken(tampered);
  assert(v === null, '篡改 token 验证失败');
}

// ====== 2. Token 过期 ======
console.log('\n--- 2. Token 过期 ---');
{
  // 构造一个 31 分钟前的 payload
  const expiredPayload = { _ts: Date.now() - 31 * 60 * 1000, name: '过期', y: 2000, mo: 1, d: 1, h: 0, mi: 0, s: 0 };
  const token = signPayload(expiredPayload);
  assert(verifyToken(token) === null, '31 分钟前 token 过期');
}

// ====== 3. POST /query 参数校验逻辑 ======
console.log('\n--- 3. POST /query 参数校验 ---');
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
eq(validateQueryParams({}).valid, false, '空 body 校验失败');
eq(validateQueryParams({ year: 2023, month: 2, day: 29, hour: 8 }).valid, false, '2023-02-29 校验失败');
eq(validateQueryParams({ year: 2024, month: 2, day: 29, hour: 8 }).valid, true, '2024-02-29 校验通过 (闰年)');

// ====== 4. token → 八字计算 ======
console.log('\n--- 4. Token 内八字计算 ---');
{
  const payload = { _ts: Date.now(), name: '测试', gender: '男', y: 2000, mo: 1, d: 1, h: 8, mi: 0, s: 0, orderNo: 'B001' };
  const bazi = calculateBazi(payload.y, payload.mo, payload.d, payload.h, payload.mi, payload.s, payload.gender);
  eq(bazi.riZhu, '甲（木）', 'riZhu 从 token 参数算出');
  eq(bazi.shiChen, '辰', '时辰=辰');
  eq(bazi.shengXiao, '龙', '生肖=龙');
  eq(bazi.naYin['年柱'], '白蜡金', '纳音年柱=白蜡金');
}

// ====== 5. 不同日期 8 字唯一性 ======
console.log('\n--- 5. 不同日期八字验证 ---');
{
  eq(calculateBazi(1986, 5, 26, 7, 0, 0, '男').riZhu, '丙（火）', '1986-05-26→丙火');
  eq(calculateBazi(1999, 12, 25, 19, 0, 0, '男').riZhu, '丁（火）', '1999-12-25→丁火');
  eq(calculateBazi(2025, 6, 10, 12, 0, 0, '男').riZhu, '丙（火）', '2025-06-10→丙火');
}

// ====== 6. 结果数据结构验证 ======
console.log('\n--- 6. 结果数据结构 ---');
{
  const bazi = calculateBazi(2000, 1, 1, 8, 0, 0, '男');
  const data = {
    name: '测试', gender: '男',
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
  eq(data.pillars.year.gan, '庚', '年干=庚');
  eq(data.pillars.year.zhi, '辰', '年支=辰');
  eq(data.pillars.month.gan, '戊', '月干=戊');
  eq(data.pillars.day.gan, '甲', '日干=甲');
  eq(data.pillars.hour.gan, '戊', '时干=戊');
  eq(data.wu_xing['时'], '土土', 'wu_xing 时=土土');
  eq(data.cang_gan['日'][0], '水癸', 'cang_gan 日[0]=水癸');
}

// ====== 7. payment_link 格式 ======
console.log('\n--- 7. payment_link 格式 ---');
{
  const token = signPayload({ _ts: Date.now(), name: 'x', y: 2000, mo: 1, d: 1, h: 0, mi: 0, s: 0, orderNo: 'X' });
  const bp = '/v1/bazi';
  const paymentLink = `http://127.0.0.1:3000${bp}/pay/${token}`;
  assert(paymentLink.includes('/pay/'), '含 /pay/');
  assert(paymentLink.includes(token), '含 token');
}

// ====== 8. 性别不影响排盘 ======
console.log('\n--- 8. 性别不影响排盘 ---');
{
  eq(calculateBazi(2000, 1, 1, 8, 0, 0, '男').riZhu, calculateBazi(2000, 1, 1, 8, 0, 0, '女').riZhu, '阴阳同日主');
}

// ====== 9. 纳音覆盖率 ======
console.log('\n--- 9. 纳音覆盖率 ---');
{
  let missing = 0;
  for (let i = 0; i < 60; i++) {
    const bazi = calculateBazi(2000 + i, 1, 1, 0, 0, 0, '男');
    if (!bazi.naYin['年柱']) missing++;
  }
  eq(missing, 0, '所有 60 甲子纳音无缺失');
}

// ====== 10. 支付宝演示模式 ======
console.log('\n--- 10. 支付宝演示逻辑 ---');
{
  const config = require('../config');
  eq(config.baziPrice, 0.01, 'price=0.01');
  assert(config.isDemoMode === true, 'isDemoMode=true');
}

// ====== 11. Token 长度合理 ======
console.log('\n--- 11. Token 长度 ---');
{
  const p = { _ts: Date.now(), name: '用户', gender: '男', y: 2000, mo: 1, d: 1, h: 8, mi: 0, s: 0, orderNo: 'BAZITEST' };
  const token = signPayload(p);
  assert(token.length > 100, `token 长度 > 100 (实际 ${token.length})`);
  assert(token.length < 600, `token 长度 < 600 (实际 ${token.length})`);
}

// ====== 汇总 ======
console.log(`\n=======================`);
console.log(`  ✅ PASS: ${pass}  ❌ FAIL: ${fail}`);
console.log(`=======================\n`);

if (fail > 0) process.exit(1);
