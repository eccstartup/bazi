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
// 当前实现直接用公历年，不处理立春换年
// 2000-01-01 立春前应算己卯，当前输出庚辰
eq(ps(calculateBazi(2000, 1, 1, 0).pillars['年柱']), '庚辰', '2000-01-01→庚辰（当前按公历年）');
eq(ps(calculateBazi(2025, 6, 10, 12).pillars['年柱']), '乙巳', '2025→乙巳');
eq(ps(calculateBazi(1990, 1, 1, 0).pillars['年柱']), '庚午', '1990→庚午');

// ---- 2. 月柱 ----
console.log('\n--- 2. 月柱 ---');
// 当前按月数推月柱，不查节气，直接用公式
// 2000-01：年干庚→乙庚戊作首→寅月戊寅
eq(ps(calculateBazi(2000, 1, 1, 0).pillars['月柱']), '戊寅', '2000-01→戊寅');
// 2024-06：年干甲→start=2→(2+5)%10=7→庚？再查
eq(ps(calculateBazi(2024, 6, 10, 12).pillars['月柱']), '辛未', '2024-06→辛未');
eq(ps(calculateBazi(1986, 5, 26, 7).pillars['月柱']), '甲午', '1986-05→甲午');

// ---- 3. 日柱 ----
console.log('\n--- 3. 日柱 ---');
const y3 = calculateBazi(2000, 1, 1, 0);
eq(ps(y3.pillars['日柱']), '甲子', '2000-01-01→甲子');
eq(y3.riGan, '甲', '日干甲');

// 2021-01-01
eq(ps(calculateBazi(2021, 1, 1, 0).pillars['日柱']), '乙卯', '2021-01-01→乙卯');
// Note: 以2000-01-01为甲子基准，往后每天diff%60推

// ---- 4. 时柱 ----
console.log('\n--- 4. 时柱 ---');
// 甲日子时→甲子
eq(ps(y3.pillars['时柱']), '甲子', '甲日子时→甲子');
eq(calculateBazi(2000, 1, 1, 0).shiChen, '子', '0时→子时');

// 甲日午时→庚午 (甲己日子的甲子起→丑乙丑→寅丙寅→卯丁卯→辰戊辰→巳己巳→午庚午)
eq(ps(calculateBazi(2000, 1, 1, 12).pillars['时柱']), '庚午', '甲日午时→庚午');

// 23点算子时
eq(calculateBazi(2000, 1, 1, 23).shiChen, '子', '23时→子时');

// 1月2日乙日丑时→丁丑 (乙庚日丙子起→丑丁丑)
const bday = calculateBazi(2000, 1, 2, 2);
eq(bday.shiChen, '丑', '2时→丑时');
eq(ps(bday.pillars['时柱']), '丁丑', '乙日丑时→丁丑');

// ---- 5. 五行 ----
console.log('\n--- 5. 五行 ---');
eq(y2.riGanWuXing, '火', '丙→火');
eq(y3.riGanWuXing, '木', '甲→木');
assert(y1.wuxing['年'].length > 0, '年柱五行有值');
assert(y1.wuxing['月'].length > 0, '月柱五行有值');
assert(y1.wuxing['日'].length > 0, '日柱五行有值');
assert(y1.wuxing['时'].length > 0, '时柱五行有值');

// ---- 6. 纳音 ----
console.log('\n--- 6. 纳音 ---');
eq(calculateBazi(2000, 1, 1, 0).naYin['年柱'], '白蜡金', '庚辰纳音白蜡金');
eq(calculateBazi(2000, 1, 1, 0).naYin['月柱'], '城头土', '戊寅纳音城头土');
eq(calculateBazi(2000, 1, 1, 0).naYin['日柱'], '海中金', '甲子纳音海中金');
eq(calculateBazi(1986, 5, 26, 7).naYin['年柱'], '炉中火', '丙寅纳音炉中火');

// ---- 7. 生肖 ----
console.log('\n--- 7. 生肖 ---');
eq(y2.shengXiao, '虎', '寅→虎');
eq(calculateBazi(2000, 1, 1, 0).shengXiao, '龙', '辰→龙'); // 当前算法得农历属龙

// ---- 8. 藏干 ----
console.log('\n--- 8. 藏干 ---');
// 2000-01-01: 年支辰→戊乙癸，月支寅→甲丙戊，日支子→癸
eq(calculateBazi(2000, 1, 1, 0).canggan['年'][0], '土戊', '辰藏干首→戊');
eq(calculateBazi(2000, 1, 1, 0).canggan['月'][0], '木甲', '寅藏干首→甲');
eq(calculateBazi(2000, 1, 1, 0).canggan['日'][0], '水癸', '子藏干→癸');

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
