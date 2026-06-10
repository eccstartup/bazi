const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');
const { calculateBazi } = require('./bazi');
const { createPaymentUrl, verifyNotify, verifyReturn, generateOrderId } = require('./alipay');

const app = express();
const bp = config.basePath;

if (!fs.existsSync(config.logDir)) fs.mkdirSync(config.logDir, { recursive: true });
app.use(express.json());

// ====== 订单存储 ======
const orders = {};
const TOKEN_EXPIRE_MS = 30 * 60 * 1000; // 30分钟

function createOrderToken() {
  return crypto.randomBytes(16).toString('hex');
}

// 清理过期订单
setInterval(() => {
  const now = Date.now();
  for (const [token, order] of Object.entries(orders)) {
    if (now - order.createdAt > TOKEN_EXPIRE_MS) delete orders[token];
  }
}, 60 * 1000);

// ====== 核心：查询八字 ======

// POST /v1/bazi/query
// Agent 调用此接口提交出生信息
// 成功 → 返回 { code: 0, payment_link: "..." }
// Agent 把 payment_link 传给 alipay-bot 生成支付短链
app.post(bp + '/query', async (req, res) => {
  try {
    const { name, gender, year, month, day, hour, minute = 0, second = 0 } = req.body;

    if (!year || !month || !day || hour === undefined) {
      return res.json({ code: 1, message: '缺少必填参数 year, month, day, hour' });
    }

    const y = +year, mo = +month, d = +day, h = +hour, mi = +minute, s = +second;
    const birthDate = new Date(y, mo - 1, d, h, mi, s);
    if (birthDate.getFullYear() !== y || birthDate.getMonth() + 1 !== mo || birthDate.getDate() !== d) {
      return res.json({ code: 1, message: '无效的日期时间' });
    }

    // 计算八字
    const bazi = calculateBazi(y, mo, d, h, mi, s, gender || '男');

    // 生成订单
    const orderToken = createOrderToken();
    const orderNo = generateOrderId();

    orders[orderToken] = {
      orderNo, status: 'pending', createdAt: Date.now(),
      input: { name: name || '用户', gender: gender || '男', birth: `${y}年${mo}月${d}日 ${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}` },
      result: {
        pillars: bazi.pillars, naYin: bazi.naYin, wuxing: bazi.wuxing,
        canggan: bazi.canggan, shensha: bazi.shensha,
        riZhu: bazi.riZhu, shengXiao: bazi.shengXiao, shiChen: bazi.shiChen,
      },
    };

    // 构建 payment_link
    // 演示模式：直接返回内部支付 URL（点击即成功）
    // 生产模式：返回支付宝收银台 URL，agent 喂给 alipay-bot trigger-payment-signal
    let paymentLink;

    if (config.isDemoMode) {
      paymentLink = `${req.protocol}://${req.get('host')}${bp}/pay/${orderToken}`;
    } else {
      try {
        const result = await createPaymentUrl(
          orderNo, config.baziPrice,
          `八字查询 - ${name || '用户'}`,
          `${year}-${month}-${day} ${hour}:${minute}`
        );
        paymentLink = result.payUrl;
      } catch (err) {
        console.error('[query] alipay error:', err.message);
        paymentLink = `${req.protocol}://${req.get('host')}${bp}/pay/${orderToken}`;
      }
    }

    // 返回格式与 Python 示例一致
    res.json({
      code: 0,
      message: 'success',
      order_token: orderToken,
      order_no: orderNo,
      price: config.baziPrice,
      payment_link: paymentLink,
    });
  } catch (err) {
    console.error('[query] error:', err.message);
    res.json({ code: 1, message: '服务器内部错误' });
  }
});

// GET /v1/bazi/pay/:orderToken
// 演示模式：直接标记已支付
// 生产模式：支付宝支付成功后回调此接口标记
app.get(bp + '/pay/:orderToken', (req, res) => {
  const order = orders[req.params.orderToken];
  if (!order) return res.status(404).json({ code: 1, message: '订单不存在' });

  order.status = 'paid';
  order.paidAt = Date.now();

  res.json({ code: 0, message: '支付成功', order_token: req.params.orderToken });
});

// 构建结果数据的公共方法
function buildResult(order) {
  return {
    name: order.input.name,
    gender: order.input.gender,
    birth: order.input.birth,
    ri_zhu: order.result.riZhu,
    sheng_xiao: order.result.shengXiao,
    shi_chen: order.result.shiChen,
    pillars: {
      year: { gan: order.result.pillars['年柱'].gan, zhi: order.result.pillars['年柱'].zhi, na_yin: order.result.naYin['年柱'] },
      month: { gan: order.result.pillars['月柱'].gan, zhi: order.result.pillars['月柱'].zhi, na_yin: order.result.naYin['月柱'] },
      day: { gan: order.result.pillars['日柱'].gan, zhi: order.result.pillars['日柱'].zhi, na_yin: order.result.naYin['日柱'] },
      hour: { gan: order.result.pillars['时柱'].gan, zhi: order.result.pillars['时柱'].zhi, na_yin: order.result.naYin['时柱'] },
    },
    wu_xing: order.result.wuxing,
    cang_gan: order.result.canggan,
    shen_sha: order.result.shensha,
  };
}

// GET/POST /v1/bazi/result/:orderToken
// Agent 轮询获取八字结果
function resultHandler(req, res) {
  const order = orders[req.params.orderToken];
  if (!order) return res.status(404).json({ code: 1, message: '订单不存在或已过期' });

  if (order.status !== 'paid') {
    return res.json({ code: 2, message: '支付未完成', order_token: req.params.orderToken, payment_link: `${req.protocol}://${req.get('host')}${bp}/pay/${req.params.orderToken}` });
  }

  res.json({
    code: 0,
    message: 'success',
    order_no: order.orderNo,
    data: buildResult(order),
  });
}

app.get(bp + '/result/:orderToken', resultHandler);
app.post(bp + '/result/:orderToken', resultHandler);

// 支付宝异步通知
app.post(bp + '/alipay/notify', (req, res) => {
  const data = req.body;
  if (verifyNotify(data) && data.trade_status === 'TRADE_SUCCESS') {
    for (const [, order] of Object.entries(orders)) {
      if (order.orderNo === data.out_trade_no) { order.status = 'paid'; break; }
    }
    res.send('success');
  } else {
    res.send('failure');
  }
});

// 支付宝同步跳转
app.get(bp + '/alipay/return', (req, res) => {
  if (verifyReturn(req.query)) {
    for (const [, order] of Object.entries(orders)) {
      if (order.orderNo === req.query.out_trade_no) { order.status = 'paid'; break; }
    }
    res.json({ code: 0, message: '支付成功' });
  } else {
    res.json({ code: 1, message: '支付验证失败' });
  }
});

// 健康检查
app.get(bp + '/health', (req, res) => {
  res.json({ status: 'ok', basePath: bp, demo: config.isDemoMode });
});

// 根路径
app.get('/', (req, res) => res.redirect(bp + '/health'));

// 404
app.use((req, res) => res.json({ code: 1, message: '接口不存在' }));

module.exports = { app, config };

// ====== 启动 ======
if (require.main === module) {
app.listen(config.port, config.host, () => {
  console.log(`\n  🔮 AI 八字排盘 - AI收 x402`);
  console.log(`  ${'='.repeat(34)}`);
  console.log(`  健康检查: http://localhost:${config.port}${bp}/health`);
  console.log(`  查询接口: POST http://localhost:${config.port}${bp}/query`);
  console.log(`  模式: ${config.isDemoMode ? '演示模式 🆓' : '生产模式 💰'}`);
  console.log(`  ${'='.repeat(34)}\n`);
});
}
