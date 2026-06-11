const { calculateBazi } = require('../bazi');

let pass = 0, fail = 0;
function assert(condition, msg) {
  if (condition) { console.log('  ✅ PASS:', msg); pass++; }
  else { console.error('  ❌ FAIL:', msg); fail++; }
}
function eq(a, e, m) { assert(a === e, `${m} => 期望"${e}", 得到"${a}"`); }
function ps(p) { return p.gan + p.zhi; }

console.log('\n🔮 八字排盘引擎测试\n');

// ---- 1. 年柱 ----
console.log('--- 1. 年柱 ---');
const y1 = calculateBazi(2024, 6, 10, 12);
eq(ps(y1.pillars['年柱']), '甲辰', '2024→甲辰');
const y2 = calculateBazi(1986, 5, 26, 7);
eq(ps(y2.pillars['年柱']), '丙寅', '1986→丙寅');
// 正确实现处理立春换年
// 2000-01-01 立春前应算己卯
eq(ps(calculateBazi(2000, 1, 1, 0).pillars['年柱']), '己卯', '2000-01-01→己卯');
eq(ps(calculateBazi(2025, 6, 10, 12).pillars['年柱']), '乙巳', '2025→乙巳');
eq(ps(calculateBazi(1990, 1, 1, 0).pillars['年柱']), '己巳', '1990→己巳');

// ---- 2. 月柱 ----
console.log('\n--- 2. 月柱 ---');
// 正确实现按节气换月柱
eq(ps(calculateBazi(2000, 1, 1, 0).pillars['月柱']), '丙子', '2000-01-01→丙子');
eq(ps(calculateBazi(2024, 6, 10, 12).pillars['月柱']), '庚午', '2024-06-10→庚午');
eq(ps(calculateBazi(1986, 5, 26, 7).pillars['月柱']), '癸巳', '1986-05-26→癸巳');

// ---- 3. 日柱 ----
console.log('\n--- 3. 日柱 ---');
const y3 = calculateBazi(2000, 1, 1, 0);
eq(ps(y3.pillars['日柱']), '戊午', '2000-01-01→戊午');
eq(y3.riGan, '戊', '日干戊');

// 2021-01-01
eq(ps(calculateBazi(2021, 1, 1, 0).pillars['日柱']), '己酉', '2021-01-01→己酉');

// ---- 4. 时柱 ----
console.log('\n--- 4. 时柱 ---');
// 戊午日子时→壬子
eq(ps(y3.pillars['时柱']), '壬子', '戊午日子时→壬子');
eq(calculateBazi(2000, 1, 1, 0).shiChen, '子', '0时→子时');

// 戊午日午时→戊午
eq(ps(calculateBazi(2000, 1, 1, 12).pillars['时柱']), '戊午', '戊午日午时→戊午');

// 23点算子时
eq(calculateBazi(2000, 1, 1, 23).shiChen, '子', '23时→子时');

// 1月2日己未日丑时→乙丑
const bday = calculateBazi(2000, 1, 2, 2);
eq(bday.shiChen, '丑', '2时→丑时');
eq(ps(bday.pillars['时柱']), '乙丑', '己未日丑时→乙丑');

// ---- 5. 五行 ----
console.log('\n--- 5. 五行 ---');
eq(y2.riGanWuXing, '金', '庚→金');
eq(y3.riGanWuXing, '土', '戊→土');
assert(y1.wuxing['年'].length > 0, '年柱五行有值');
assert(y1.wuxing['月'].length > 0, '月柱五行有值');
assert(y1.wuxing['日'].length > 0, '日柱五行有值');
assert(y1.wuxing['时'].length > 0, '时柱五行有值');

// ---- 6. 纳音 ----
console.log('\n--- 6. 纳音 ---');
eq(calculateBazi(2000, 1, 1, 0).naYin['年柱'], '城头土', '己卯纳音城头土');
eq(calculateBazi(2000, 1, 1, 0).naYin['月柱'], '涧下水', '丙子纳音涧下水');
eq(calculateBazi(2000, 1, 1, 0).naYin['日柱'], '天上火', '戊午纳音天上火');
eq(calculateBazi(1986, 5, 26, 7).naYin['年柱'], '炉中火', '丙寅纳音炉中火');

// ---- 7. 生肖 ----
console.log('\n--- 7. 生肖 ---');
eq(y2.shengXiao, '虎', '寅→虎');
eq(calculateBazi(2000, 1, 1, 0).shengXiao, '兔', '己卯生肖→兔');

// ---- 8. 藏干 ----
console.log('\n--- 8. 藏干 ---');
// 2000-01-01: 年支卯→乙，月支子→癸，日支午→丁己
eq(calculateBazi(2000, 1, 1, 0).canggan['年'][0], '木乙', '卯藏干→乙');
eq(calculateBazi(2000, 1, 1, 0).canggan['月'][0], '水癸', '子藏干→癸');
eq(calculateBazi(2000, 1, 1, 0).canggan['日'][0], '火丁', '午藏干首→丁');

// 1986-05-26: 年支寅→甲丙戊
eq(calculateBazi(1986, 5, 26, 7).canggan['年'][0], '木甲', '寅藏干首→甲');

// ---- 9. 输出完整性 ----
console.log('\n--- 9. 输出完整性 ---');
assert(Array.isArray(y1.textLines) && y1.textLines.length > 0, 'textLines非空数组');
assert(y1.riZhu.includes('（') && y1.riZhu.includes('）'), 'riZhu包含五行');

// ---- 10. 边界 ----
console.log('\n--- 10. 边界 ---');
eq(ps(calculateBazi(2024, 2, 29, 12).pillars['年柱']), '甲辰', '闰年02-29年柱→甲辰');

// ====== 汇总 ======
console.log(`\n=======================`);
console.log(`  ✅ PASS: ${pass}  ❌ FAIL: ${fail}`);
console.log(`=======================\n`);
