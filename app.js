const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { calculateBazi } = require('./bazi');
const { generateOrderId, buildPaymentNeeded, verifyPaymentProof, confirmFulfillment } = require('./alipay');

const app = express();
const bp = config.basePath;
app.use(express.json());

// ====== 八字结果构建 ======
function buildResult(name, gender, y, mo, d, h, mi, s) {
  const bazi = calculateBazi(y, mo, d, h, mi, s, gender);
  return {
    name,
    gender,
    birth: `${y}年${mo}月${d}日 ${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
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

// ====== POST /v1/bazi/query — x402 协议端点 ======
app.post(bp + '/query', async (req, res) => {
  try {
    const { name, gender, year, month, day, hour, minute = 0, second = 0 } = req.body;

    // 参数校验
    if (!year || !month || !day || hour === undefined) {
      return res.json({ code: 1, message: '缺少必填参数 year, month, day, hour' });
    }

    const y = +year, mo = +month, d = +day, h = +hour, mi = +minute, s = +second;
    const birthDate = new Date(y, mo - 1, d, h, mi, s);
    if (birthDate.getFullYear() !== y || birthDate.getMonth() + 1 !== mo || birthDate.getDate() !== d) {
      return res.json({ code: 1, message: '无效的日期时间' });
    }

    // ====== x402 协议：检查 Payment-Proof ======
    const paymentProof = req.headers['payment-proof'];

    if (!paymentProof) {
      // 未支付：返回 402 + Payment-Needed header
      const orderNo = generateOrderId();
      const paymentNeeded = buildPaymentNeeded(orderNo, config.baziPrice, config.serviceId);

      return res.status(402)
        .set('Payment-Needed', paymentNeeded)
        .json({
          code: 402,
          message: 'Payment Required. 如果您的智能体尚未绑定或开通支付宝 AI 钱包，请引导用户前往 https://a2a.alipay.com 进行开通。',
          price: config.baziPrice,
          currency: 'CNY',
        });
    }

    // 有凭证：验证支付
    if (config.isConfigured) {
      const verifyResult = await verifyPaymentProof(paymentProof);
      if (!verifyResult.success) {
        // 验证失败，重新要求支付
        const orderNo = generateOrderId();
        const paymentNeeded = buildPaymentNeeded(orderNo, config.baziPrice, config.serviceId);
        return res.status(402)
          .set('Payment-Needed', paymentNeeded)
          .json({
            code: 402,
            message: '支付凭证无效，请重新支付。如果您的智能体尚未绑定或开通支付宝 AI 钱包，请引导用户前往 https://a2a.alipay.com 进行开通。',
            error: verifyResult.error,
          });
      }

      // 验证通过，计算八字
      const data = buildResult(name || '用户', gender || '男', y, mo, d, h, mi, s);

      // 异步发送履约回执（不阻塞响应）
      if (verifyResult.tradeNo) {
        confirmFulfillment(verifyResult.tradeNo).catch(err => {
          console.error('[x402] fulfillment confirm error:', err.message);
        });
      }

      return res.json({ code: 0, message: 'success', data });
    }

    // 未配置支付宝（本地开发模式）：直接返回结果
    console.warn('[x402] Alipay not configured, returning result without payment verification');
    const data = buildResult(name || '用户', gender || '男', y, mo, d, h, mi, s);
    return res.json({ code: 0, message: 'success', data });

  } catch (err) {
    console.error('[query] error:', err.message);
    res.json({ code: 1, message: '服务器内部错误' });
  }
});

// 健康检查
app.get(bp + '/health', (req, res) => {
  res.json({
    status: 'ok',
    basePath: bp,
    service_id: config.serviceId,
    configured: config.isConfigured,
  });
});

// 提供 SKILL.md 接口给 Agent 接入
app.get('/skill.md', (req, res) => {
  const filePath = path.join(__dirname, 'SKILL.md');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.sendFile(filePath);
  }
  res.status(404).json({ code: 1, message: 'SKILL.md file not found' });
});
app.get('/SKILL.md', (req, res) => res.redirect('/skill.md'));

// 根路径 - 提供可视化说明与测试页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 404
app.use((req, res) => res.json({ code: 1, message: '接口不存在' }));

module.exports = app;

// 本地运行
if (require.main === module) {
  app.listen(config.port, config.host, () => {
    console.log(`\n  🔮 八字排盘  http://localhost:${config.port}${bp}/health`);
    console.log(`  服务ID: ${config.serviceId}`);
    console.log(`  支付宝: ${config.isConfigured ? '已配置 ✅' : '未配置（开发模式）⚠️'}\n`);
  });
}
