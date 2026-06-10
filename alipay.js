// ======== AI收 x402 协议模块 ========
const crypto = require('crypto');
const https = require('https');
const config = require('./config');

// ====== 工具函数 ======

// 生成唯一订单号
function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `BAZI${ts}${rand}`;
}

// 读取私钥（支持 PEM 格式和裸密钥）
function getPrivateKey() {
  let key = config.alipay.privateKey;
  if (!key) return null;
  // 如果不含 PEM 头，包裹一下
  if (!key.includes('-----BEGIN')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }
  return key;
}

// 读取支付宝公钥
function getAlipayPublicKey() {
  let key = config.alipay.alipayPublicKey;
  if (!key) return null;
  if (!key.includes('-----BEGIN')) {
    key = `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
  }
  return key;
}

// ====== Payment-Needed 构造（402 响应） ======

/**
 * 构造 Payment-Needed header 值
 * @param {string} orderNo 商户订单号
 * @param {string} amount  金额（元），如 "0.10"
 * @param {string} resourceId 资源标识
 * @returns {string} Base64URL 编码的 JSON
 */
function buildPaymentNeeded(orderNo, amount, resourceId) {
  const payBefore = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const params = {
    amount,
    currency: 'CNY',
    out_trade_no: orderNo,
    pay_before: payBefore,
    resource_id: resourceId,
    seller_sign_type: 'RSA2',
    seller_unique_id: config.alipay.sellerPid,
  };

  // 签名：按 key 字典序排序，拼接 key=value&key=value
  const signStr = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');

  const privateKey = getPrivateKey();
  let signature = '';
  if (privateKey) {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signStr, 'utf8');
    signature = sign.sign(privateKey, 'base64');
  }

  const payload = {
    ...params,
    seller_signature: signature,
  };

  // Base64URL 编码
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// ====== Payment-Proof 验证 ======

/**
 * 调用 alipay.aipay.agent.payment.verify 验证支付凭证
 * @param {string} paymentProof  请求头中的 Payment-Proof 值
 * @returns {Promise<{success: boolean, tradeNo?: string, error?: string}>}
 */
async function verifyPaymentProof(paymentProof) {
  const { appId, gateway } = config.alipay;
  const privateKey = getPrivateKey();
  if (!privateKey || !appId) {
    return { success: false, error: 'Alipay not configured' };
  }

  const bizContent = JSON.stringify({ payment_proof: paymentProof });
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 公共请求参数
  const params = {
    app_id: appId,
    method: 'alipay.aipay.agent.payment.verify',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp,
    version: '1.0',
    biz_content: bizContent,
  };

  // 签名
  const signStr = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signStr, 'utf8');
  params.sign = sign.sign(privateKey, 'base64');

  // 发送请求
  try {
    const result = await postToAlipay(gateway, params);
    const response = result.alipay_aipay_agent_payment_verify_response || {};
    if (response.code === '10000') {
      return { success: true, tradeNo: response.trade_no };
    }
    return { success: false, error: response.sub_msg || response.msg || 'verify failed' };
  } catch (err) {
    console.error('[x402] verify error:', err.message);
    return { success: false, error: err.message };
  }
}

// ====== 履约确认 ======

/**
 * 调用 alipay.aipay.agent.fulfillment.confirm 发送履约回执
 * @param {string} tradeNo 支付宝交易号
 * @returns {Promise<{success: boolean}>}
 */
async function confirmFulfillment(tradeNo) {
  const { appId, gateway } = config.alipay;
  const privateKey = getPrivateKey();
  if (!privateKey || !appId) return { success: false };

  const bizContent = JSON.stringify({ trade_no: tradeNo });
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const params = {
    app_id: appId,
    method: 'alipay.aipay.agent.fulfillment.confirm',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp,
    version: '1.0',
    biz_content: bizContent,
  };

  const signStr = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');

  const signObj = crypto.createSign('RSA-SHA256');
  signObj.update(signStr, 'utf8');
  params.sign = signObj.sign(privateKey, 'base64');

  try {
    const result = await postToAlipay(gateway, params);
    const response = result.alipay_aipay_agent_fulfillment_confirm_response || {};
    return { success: response.code === '10000' };
  } catch (err) {
    console.error('[x402] fulfillment error:', err.message);
    return { success: false };
  }
}

// ====== HTTP 请求工具 ======

function postToAlipay(gatewayUrl, params) {
  return new Promise((resolve, reject) => {
    const body = Object.keys(params)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');

    const url = new URL(gatewayUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Alipay')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  generateOrderId,
  buildPaymentNeeded,
  verifyPaymentProof,
  confirmFulfillment,
};
