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
  // 按照 ISO8601 UTC+8 格式化截止时间
  const payBefore = new Date(Date.now() + 30 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString().slice(0, 19) + '+08:00';
  const goodsName = '生辰八字排盘';

  // 参与签名的参数（必须包含这 8 个字段）
  const signParams = {
    amount,
    currency: 'CNY',
    goods_name: goodsName,
    out_trade_no: orderNo,
    pay_before: payBefore,
    resource_id: resourceId,
    seller_id: config.alipay.sellerPid,
    service_id: config.serviceId,
  };

  // 按 key 字典序排序，拼接 key=value&key=value
  const signStr = Object.keys(signParams)
    .sort()
    .map(k => `${k}=${signParams[k]}`)
    .join('&');

  const privateKey = getPrivateKey();
  let signature = '';
  if (privateKey) {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signStr, 'utf8');
    signature = sign.sign(privateKey, 'base64');
  }

  // 构造嵌套的 protocol 和 method 返回体
  const payload = {
    protocol: {
      out_trade_no: orderNo,
      amount,
      currency: 'CNY',
      resource_id: resourceId,
      pay_before: payBefore,
      seller_signature: signature,
      seller_sign_type: 'RSA2',
      seller_unique_id: config.alipay.sellerPid,
    },
    method: {
      seller_name: config.alipay.sellerName,
      seller_id: config.alipay.sellerPid,
      seller_app_id: config.alipay.appId,
      goods_name: goodsName,
      seller_unique_id_key: 'seller_id',
      service_id: config.serviceId,
    }
  };

  // Base64URL 编码
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// ====== Payment-Proof 验证 ======

/**
 * 调用 alipay.aipay.agent.payment.verify 验证支付凭证
 * @param {string} rawHeader  请求头中的 Payment-Proof 值（可能是 Base64 编码的 JSON，也可能是裸凭证）
 * @returns {Promise<{success: boolean, tradeNo?: string, error?: string}>}
 */
async function verifyPaymentProof(rawHeader) {
  const { appId, gateway } = config.alipay;
  const privateKey = getPrivateKey();
  if (!privateKey || !appId) {
    return { success: false, error: 'Alipay not configured' };
  }

  let paymentProof = rawHeader;
  let tradeNo = '';
  let clientSession = '';

  try {
    // 尝试进行 Base64 解码，并解析 JSON 结构
    const decodedStr = Buffer.from(rawHeader, 'base64').toString('utf8');
    const parsed = JSON.parse(decodedStr);
    
    // 如果是规范的 A2A Payment-Proof 嵌套结构
    if (parsed.protocol && parsed.protocol.payment_proof) {
      paymentProof = parsed.protocol.payment_proof;
      tradeNo = parsed.protocol.trade_no || '';
      if (parsed.method) {
        clientSession = parsed.method.client_session || '';
      }
    }
  } catch (err) {
    // 解码失败说明是测试时传入的裸凭证，保留使用 rawHeader 作为 paymentProof
    console.log('[x402] rawHeader is not base64 json, using as raw payment_proof');
  }

  // 构造业务参数
  const bizContentObj = { payment_proof: paymentProof };
  if (tradeNo) bizContentObj.trade_no = tradeNo;
  if (clientSession) bizContentObj.client_session = clientSession;

  const bizContent = JSON.stringify(bizContentObj);
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
