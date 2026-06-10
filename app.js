const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const { calculateBazi } = require('./bazi');
const { createPaymentUrl, verifyNotify, verifyReturn, generateOrderId } = require('./alipay');

const app = express();
const bp = config.basePath;
app.use(express.json());

// ====== 无状态 Token 方案（适配 Vercel Serverless）======

// TOKEN_SECRET 必须用环境变量，否则每次冷启动随机生成，旧 token 全部失效
const TOKEN_SECRET = process.env.TOKEN_SECRET || (config.isDemoMode
  ? 'bazi-demo-secret-not-for-production'
  : (() => { console.error('[fatal] TOKEN_SECRET not set'); process.exit(1); })());

/**
 * HMAC 签名 → 返回 base64url(JSON) + "." + hex(HMAC)
 */
function signPayload(payload) {
  const json = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(json).digest('hex');
  return Buffer.from(json).toString('base64url') + '.' + hmac;
}

/**
 * 验证并解码 token，篡改或过期返回 null
 */
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
    // 过期检查：token 创建后 30 分钟有效
    if (payload._ts && Date.now() - payload._ts > 30 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ====== 核心：查询八字 ======

// POST /v1/bazi/query
// Agent 调用此接口提交出生信息
// 成功 → 返回 { code: 0, payment_link: "...", order_token: "..." }
// token 内编码了查询参数，后续 /result/:token 根据 token 算结果，无需内存存储
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

    const orderNo = generateOrderId();

    // 将查询参数编码进 token（无状态方案）
    const orderToken = signPayload({
      _ts: Date.now(),
      name: name || '用户',
      gender: gender || '男',
      y, mo, d, h, mi, s,
      orderNo,
    });

    // 构建 payment_link
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
// 演示模式：验证 token 合法性即返回支付成功
// 生产模式：支付宝支付成功后回调
app.get(bp + '/pay/:orderToken', (req, res) => {
  const payload = verifyToken(req.params.orderToken);
  if (!payload) return res.status(404).json({ code: 1, message: '订单不存在或已过期' });

  res.json({ code: 0, message: '支付成功', order_token: req.params.orderToken });
});

// ====== 结果查询 ======

/**
 * 根据 token 构建完整的八字结果数据
 */
function buildResultFromPayload(payload) {
  const bazi = calculateBazi(payload.y, payload.mo, payload.d, payload.h, payload.mi, payload.s, payload.gender);
  return {
    name: payload.name,
    gender: payload.gender,
    birth: `${payload.y}年${payload.mo}月${payload.d}日 ${String(payload.h).padStart(2, '0')}:${String(payload.mi).padStart(2, '0')}:${String(payload.s).padStart(2, '0')}`,
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
}

// GET/POST /v1/bazi/result/:orderToken
function resultHandler(req, res) {
  const payload = verifyToken(req.params.orderToken);
  if (!payload) {
    return res.status(404).json({ code: 1, message: '订单不存在或已过期' });
  }

  res.json({
    code: 0,
    message: 'success',
    order_no: payload.orderNo,
    data: buildResultFromPayload(payload),
  });
}

app.get(bp + '/result/:orderToken', resultHandler);
app.post(bp + '/result/:orderToken', resultHandler);

// 支付宝异步通知（生产模式需要数据库，此处保持兼容）
app.post(bp + '/alipay/notify', (req, res) => {
  const data = req.body;
  if (verifyNotify(data) && data.trade_status === 'TRADE_SUCCESS') {
    // 生产模式需接入数据库验证订单状态
    res.send('success');
  } else {
    res.send('failure');
  }
});

// 支付宝同步跳转
app.get(bp + '/alipay/return', (req, res) => {
  if (verifyReturn(req.query)) {
    res.json({ code: 0, message: '支付成功' });
  } else {
    res.json({ code: 1, message: '支付验证失败' });
  }
});

// 健康检查
app.get(bp + '/health', (req, res) => {
  res.json({
    status: 'ok',
    basePath: bp,
    demo: config.isDemoMode,
    stateless: true,
    vercel: !!process.env.VERCEL,
  });
});

// 根路径
app.get('/', (req, res) => res.redirect(bp + '/health'));

// 404
app.use((req, res) => res.json({ code: 1, message: '接口不存在' }));

// ====== 导出 & 启动 ======
module.exports = { app, config, verifyToken, signPayload };

// 本地运行
if (require.main === module) {
  app.listen(config.port, config.host, () => {
    console.log(`\n  🔮 AI 八字排盘 - AI收 x402`);
    console.log(`  ${'='.repeat(34)}`);
    console.log(`  健康检查: http://localhost:${config.port}${bp}/health`);
    console.log(`  查询接口: POST http://localhost:${config.port}${bp}/query`);
    console.log(`  模式: ${config.isDemoMode ? '演示模式 🆓 (无状态)' : '生产模式 💰'}`);
    console.log(`  ${'='.repeat(34)}\n`);
  });
}
