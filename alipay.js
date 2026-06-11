// ======== AI收 x402 协议模块 ========
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const config = require('./config');

// 请求超时时间（毫秒）
const REQUEST_TIMEOUT_MS = 15000;
// Payment-Proof 最大长度（防止恶意超长输入）
const MAX_PROOF_LENGTH = 10000;
// 支付宝响应最大长度（防止超大响应导致 OOM）
const MAX_RESPONSE_SIZE = 1024 * 1024;

// ====== 工具函数 ======

// 生成唯一订单号（使用高熵随机源避免碰撞）
function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
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

// 读取支付宝公钥（用于验证支付宝响应签名）
function getAlipayPublicKey() {
  let key = config.alipay.alipayPublicKey;
  if (!key) return null;
  if (!key.includes('-----BEGIN')) {
    key = `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
  }
  return key;
}

// 格式化为北京时间字符串
// style='datetime' => "2026-06-11 08:00:00"
// style='iso'      => "2026-06-11T08:00:00+08:00"
function formatBeijingTime(date, style = 'datetime') {
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    parts[type] = value;
  }
  if (style === 'iso') {
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

// 验证支付宝响应签名（使用支付宝公钥）
function verifyAlipayResponseSign(rawBody, responseKey) {
  const publicKey = getAlipayPublicKey();
  if (!publicKey) {
    console.warn('[x402] 支付宝公钥未配置，跳过响应签名验证');
    return true; // 未配置公钥时跳过验证（向后兼容）
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    console.error('[x402] 无法解析支付宝响应 JSON');
    return false;
  }

  const sign = parsed.sign;
  if (!sign) {
    console.error('[x402] 支付宝响应缺少 sign 字段');
    return false;
  }

  // 从原始响应中提取 responseKey 对应的 JSON 子串
  // 支付宝标准验签：取 "responseKey":{...} 和 ,"sign" 之间的内容
  const keyPattern = `"${responseKey}":`;
  const keyIndex = rawBody.indexOf(keyPattern);
  if (keyIndex === -1) {
    console.error('[x402] 响应中未找到 key:', responseKey);
    return false;
  }

  const contentStart = rawBody.indexOf('{', keyIndex + keyPattern.length);
  const signIndex = rawBody.indexOf(',"sign"');
  if (contentStart === -1 || signIndex === -1 || contentStart >= signIndex) {
    console.error('[x402] 无法从响应中提取签名内容');
    return false;
  }

  const signContent = rawBody.slice(contentStart, signIndex);

  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signContent, 'utf8');
    return verify.verify(publicKey, sign, 'base64');
  } catch (err) {
    console.error('[x402] 响应签名验证异常:', err.message);
    return false;
  }
}

// ====== Payment-Needed 构造（402 响应） ======

/**
 * 构造 Payment-Needed header 值
 * @param {string} orderNo 商户订单号
 * @param {string} amount  金额（元），如 "0.10"
 * @param {string} resourceId 资源标识
 * @returns {string} Base64URL 编码的 JSON
 * @throws {Error} 如果私钥未配置或金额格式无效
 */
function buildPaymentNeeded(orderNo, amount, resourceId) {
  // 校验金额格式（整数或最多两位小数）
  if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error(`Invalid amount format: ${amount}`);
  }

  const privateKey = getPrivateKey();
  if (!privateKey) {
    throw new Error('Private key not configured, cannot sign Payment-Needed');
  }

  // 30 分钟后过期，使用北京时间 ISO 格式
  const payBefore = formatBeijingTime(new Date(Date.now() + 30 * 60 * 1000), 'iso');
  const goodsName = '生辰八字排盘';

  // 参与签名的参数（按支付宝官方文档，签名字段使用 seller_id）
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

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signStr, 'utf8');
  const signature = sign.sign(privateKey, 'base64');

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
  // 输入长度校验
  if (!rawHeader || rawHeader.length > MAX_PROOF_LENGTH) {
    return { success: false, error: 'Invalid payment proof' };
  }

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
  const timestamp = formatBeijingTime(new Date());

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

  const responseKey = 'alipay_aipay_agent_payment_verify_response';

  // 发送请求
  try {
    const { parsed: result, raw: rawBody } = await postToAlipay(gateway, params);

    // 验证支付宝响应签名
    if (!verifyAlipayResponseSign(rawBody, responseKey)) {
      return { success: false, error: 'Response signature verification failed' };
    }

    const response = result[responseKey] || {};
    if (response.code === '10000') {
      return { success: true, tradeNo: response.trade_no };
    }
    return { success: false, error: response.sub_msg || response.msg || 'verify failed' };
  } catch (err) {
    console.error('[x402] verify error:', err.message);
    // 返回通用错误信息，不泄露内部细节
    return { success: false, error: 'Payment verification request failed' };
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
  const timestamp = formatBeijingTime(new Date());

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

  const responseKey = 'alipay_aipay_agent_fulfillment_confirm_response';

  try {
    const { parsed: result, raw: rawBody } = await postToAlipay(gateway, params);

    // 验证支付宝响应签名
    if (!verifyAlipayResponseSign(rawBody, responseKey)) {
      console.error('[x402] fulfillment response signature verification failed');
      return { success: false };
    }

    const response = result[responseKey] || {};
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
    const transport = url.protocol === 'http:' ? http : https;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      let totalSize = 0;
      res.on('data', chunk => {
        totalSize += chunk.length;
        if (totalSize > MAX_RESPONSE_SIZE) {
          res.destroy();
          reject(new Error('Alipay response exceeded maximum size'));
          return;
        }
        data += chunk;
      });
      res.on('end', () => {
        try { resolve({ parsed: JSON.parse(data), raw: data }); }
        catch { reject(new Error('Invalid JSON from Alipay')); }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Alipay gateway request timeout'));
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
