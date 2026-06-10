// ======== 支付宝支付集成 ========
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

let alipaySdk = null;

function getAlipaySdk() {
  if (alipaySdk) return alipaySdk;
  if (config.isDemoMode) return null;
  try {
    const AlipaySdk = require('alipay-sdk').default;
    const appPrivateKey = fs.readFileSync(
      path.resolve(config.alipay.appPrivateKeyPath), 'utf8'
    );
    const alipayPublicKey = fs.readFileSync(
      path.resolve(config.alipay.alipayPublicKeyPath), 'utf8'
    );
    alipaySdk = new AlipaySdk({
      appId: config.alipay.appId,
      privateKey: appPrivateKey,
      alipayPublicKey,
      gateway: config.alipay.gateway,
    });
    console.log('[alipay] SDK initialized');
  } catch (err) {
    console.warn('[alipay] SDK init failed, using demo mode:', err.message);
  }
  return alipaySdk;
}

// 生成唯一订单号
function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `BAZI${ts}${rand}`;
}

// 创建支付页面跳转URL
async function createPaymentUrl(orderNo, amount, subject, body) {
  const sdk = getAlipaySdk();
  if (!sdk) {
    // 演示模式
    return { payUrl: `/demo-pay?orderNo=${orderNo}`, isDemo: true };
  }
  const bizContent = {
    out_trade_no: orderNo,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: amount.toFixed(2),
    subject,
    body: body || '',
  };

  const result = await sdk.pageExecute('alipay.trade.page.pay', {
    bizContent,
    returnUrl: config.alipay.returnUrl,
    notifyUrl: config.alipay.notifyUrl,
  });
  return { payUrl: result, isDemo: false };
}

// 验证异步通知
function verifyNotify(params) {
  const sdk = getAlipaySdk();
  if (!sdk) return false;
  try {
    return sdk.checkNotifySign(params);
  } catch {
    return false;
  }
}

// 验证同步返回
function verifyReturn(params) {
  return verifyNotify(params);
}

module.exports = { createPaymentUrl, verifyNotify, verifyReturn, generateOrderId };
