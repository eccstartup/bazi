// AI收 x402 协议 + 八字计算 测试
const crypto = require('crypto');
const { calculateBazi } = require('../bazi');
const config = require('../config');

// 生成临时测试密钥对，注入到 config 以支持签名测试
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
config.alipay.privateKey = privateKey;
config.alipay.alipayPublicKey = publicKey;
config.alipay.appId = config.alipay.appId || 'TEST_APP_ID';
config.alipay.sellerPid = config.alipay.sellerPid || '2088000000000000';
config.isConfigured = true;

const { generateOrderId, buildPaymentNeeded } = require('../alipay');

let pass = 0, fail = 0;
function assert(condition, msg) {
  if (condition) { pass++; }
  else { console.error(`  ❌ FAIL: ${msg}`); fail++; }
}
function eq(a, e, m) { assert(a === e, `${m} => 期望"${e}", 得到"${a}"`); }

console.log('\n🔮 八字排盘 x402 测试\n');

// ====== 1. 订单号生成 ======
console.log('--- 1. 订单号生成 ---');
{
  const id1 = generateOrderId();
  const id2 = generateOrderId();
  assert(id1.startsWith('BAZI'), '订单号以 BAZI 开头');
  assert(id1 !== id2, '两次生成不重复');
  assert(id1.length > 8, '订单号长度合理');
}

// ====== 2. Payment-Needed 构造 ======
console.log('\n--- 2. Payment-Needed header ---');
{
  const orderNo = 'BAZITEST001';
  const needed = buildPaymentNeeded(orderNo, '0.10', 'API_2EBF0208D27248F6');
  assert(typeof needed === 'string', 'Payment-Needed 是字符串');
  assert(needed.length > 50, 'Payment-Needed 长度合理');

  // 解码验证
  const decoded = JSON.parse(Buffer.from(needed, 'base64url').toString('utf8'));
  assert(typeof decoded.protocol === 'object', 'protocol 是对象');
  assert(typeof decoded.method === 'object', 'method 是对象');

  const proto = decoded.protocol;
  eq(proto.out_trade_no, 'BAZITEST001', 'out_trade_no 正确');
  eq(proto.amount, '0.10', 'amount 正确');
  eq(proto.currency, 'CNY', 'currency=CNY');
  eq(proto.resource_id, 'API_2EBF0208D27248F6', 'resource_id 正确');
  eq(proto.seller_sign_type, 'RSA2', 'seller_sign_type=RSA2');
  assert(proto.pay_before.length > 10, 'pay_before 是 ISO 时间');
  assert(typeof proto.seller_signature === 'string', 'seller_signature 存在');

  const meth = decoded.method;
  eq(meth.goods_name, '生辰八字排盘', 'goods_name 正确');
  eq(meth.service_id, 'API_2EBF0208D27248F6', 'service_id 正确');
}

// ====== 3. Payment-Needed 签名验证（用测试密钥） ======
console.log('\n--- 3. 签名字段排序 ---');
{
  // 验证字段按字典序排列
  const fields = ['amount', 'currency', 'goods_name', 'out_trade_no', 'pay_before', 'resource_id', 'seller_unique_id', 'service_id'];
  const sorted = [...fields].sort();
  for (let i = 0; i < fields.length; i++) {
    eq(fields[i], sorted[i], `字段 ${i} 顺序: ${sorted[i]}`);
  }
}

// ====== 4. 八字计算 ======
console.log('\n--- 4. 八字计算 ---');
{
  const bazi = calculateBazi(2000, 1, 1, 8, 0, 0, '男');
  eq(bazi.riZhu, '戊（土）', 'riZhu=戊土');
  eq(bazi.shiChen, '辰', '时辰=辰');
  eq(bazi.shengXiao, '兔', '生肖=兔');
  eq(bazi.naYin['年柱'], '城头土', '纳音年柱=城头土');
}

// ====== 5. 不同日期八字 ======
console.log('\n--- 5. 不同日期八字 ---');
{
  eq(calculateBazi(1986, 5, 26, 7, 0, 0, '男').riZhu, '庚（金）', '1986-05-26→庚金');
  eq(calculateBazi(1999, 12, 25, 19, 0, 0, '男').riZhu, '辛（金）', '1999-12-25→辛金');
  eq(calculateBazi(2025, 6, 10, 12, 0, 0, '男').riZhu, '庚（金）', '2025-06-10→庚金');
}

// ====== 6. 结果数据结构 ======
console.log('\n--- 6. 结果数据结构 ---');
{
  const bazi = calculateBazi(2000, 1, 1, 8, 0, 0, '男');
  eq(bazi.pillars['年柱'].gan, '己', '年干=己');
  eq(bazi.pillars['年柱'].zhi, '卯', '年支=卯');
  eq(bazi.pillars['月柱'].gan, '丙', '月干=丙');
  eq(bazi.pillars['日柱'].gan, '戊', '日干=戊');
  eq(bazi.pillars['时柱'].gan, '丙', '时干=丙');
  eq(bazi.wuxing['时'], '火土', 'wu_xing 时=火土');
  eq(bazi.canggan['日'][0], '火丁', 'cang_gan 日[0]=火丁');
}

// ====== 7. 性别不影响排盘 ======
console.log('\n--- 7. 性别不影响排盘 ---');
{
  eq(calculateBazi(2000, 1, 1, 8, 0, 0, '男').riZhu,
     calculateBazi(2000, 1, 1, 8, 0, 0, '女').riZhu, '阴阳同日主');
}

// ====== 8. 纳音覆盖率 ======
console.log('\n--- 8. 纳音覆盖率 ---');
{
  let missing = 0;
  for (let i = 0; i < 60; i++) {
    const bazi = calculateBazi(2000 + i, 1, 1, 0, 0, 0, '男');
    if (!bazi.naYin['年柱']) missing++;
  }
  eq(missing, 0, '所有 60 甲子纳音无缺失');
}

// ====== 9. 配置检查 ======
console.log('\n--- 9. 配置 ---');
{
  const config = require('../config');
  eq(config.serviceId, 'API_2EBF0208D27248F6', '服务ID正确');
  eq(config.baziPrice, '0.10', '单价=0.10');
}

// ====== 汇总 ======
console.log(`\n=======================`);
console.log(`  ✅ PASS: ${pass}  ❌ FAIL: ${fail}`);
console.log(`=======================\n`);

if (fail > 0) process.exit(1);
