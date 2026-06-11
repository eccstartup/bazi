#!/bin/bash
# ===================================
# 八字排盘 x402 协议 API 自助测试脚本
# 用法: 先 node app.js 启动服务，再 bash scripts/test-api.sh
# ===================================

BASE="http://localhost:3000/v1/bazi"
PASS=0
FAIL=0

check() {
  local expected="$1" actual="$2" desc="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✅ $desc (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc — 预期 $expected, 实际 $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo "🔮 八字排盘 x402 API 测试"
echo "===================="

# 0. 检查服务是否在线
echo ""
echo "--- 0. 检查服务 ---"
if ! curl -s --connect-timeout 3 "$BASE/health" > /dev/null 2>&1; then
  echo "  ❌ 无法连接 $BASE"
  echo "  请先启动服务: node app.js"
  exit 1
fi
echo "  ✅ 服务在线"

# 1. 健康检查
echo ""
echo "--- 1. 健康检查 ---"
HTTP_CODE=$(curl -s -o /tmp/bazi_test.json -w "%{http_code}" "$BASE/health")
check "200" "$HTTP_CODE" "健康检查"
python3 -m json.tool < /tmp/bazi_test.json 2>/dev/null

# 2. 提交查询（无 Payment-Proof）
echo ""
echo "--- 2. 提交查询（无支付凭证）---"
HTTP_CODE=$(curl -s -o /tmp/bazi_test.json -w "%{http_code}" -X POST "$BASE/query" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试用户","gender":"男","year":2000,"month":1,"day":1,"hour":8}')

if [ "$HTTP_CODE" = "402" ]; then
  check "402" "$HTTP_CODE" "正确返回 402 Payment Required"
elif [ "$HTTP_CODE" = "200" ]; then
  check "200" "$HTTP_CODE" "开发模式：直接返回结果（未配置支付宝）"
else
  check "402" "$HTTP_CODE" "查询响应"
fi
python3 -m json.tool < /tmp/bazi_test.json 2>/dev/null

# 3. 参数校验：缺少 hour
echo ""
echo "--- 3. 参数校验（缺少 hour）---"
HTTP_CODE=$(curl -s -o /tmp/bazi_test.json -w "%{http_code}" -X POST "$BASE/query" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试用户","year":2000,"month":1,"day":1}')
check "400" "$HTTP_CODE" "缺少必填参数返回 400"

# 4. 无效日期
echo ""
echo "--- 4. 无效日期（2月30日）---"
HTTP_CODE=$(curl -s -o /tmp/bazi_test.json -w "%{http_code}" -X POST "$BASE/query" \
  -H "Content-Type: application/json" \
  -d '{"year":2000,"month":2,"day":30,"hour":8}')
check "400" "$HTTP_CODE" "无效日期返回 400"

# 5. 伪造 Payment-Proof
echo ""
echo "--- 5. 伪造 Payment-Proof ---"
HTTP_CODE=$(curl -s -o /tmp/bazi_test.json -w "%{http_code}" -X POST "$BASE/query" \
  -H "Content-Type: application/json" \
  -H "Payment-Proof: fake-proof-12345" \
  -d '{"name":"测试用户","gender":"男","year":2000,"month":1,"day":1,"hour":8}')

if [ "$HTTP_CODE" = "402" ]; then
  check "402" "$HTTP_CODE" "伪造凭证被拒绝"
elif [ "$HTTP_CODE" = "200" ]; then
  check "200" "$HTTP_CODE" "开发模式：跳过验证"
else
  check "402" "$HTTP_CODE" "伪造凭证响应"
fi

# 6. 不存在的接口
echo ""
echo "--- 6. 不存在的接口 ---"
HTTP_CODE=$(curl -s -o /tmp/bazi_test.json -w "%{http_code}" "$BASE/nonexistent")
check "404" "$HTTP_CODE" "不存在的接口返回 404"

# 7. 超大请求体（应被 body limit 拦截）
echo ""
echo "--- 7. 超大请求体 ---"
LARGE_BODY=$(python3 -c "print('{\"name\":\"' + 'A'*20000 + '\"}')")
HTTP_CODE=$(curl -s -o /tmp/bazi_test.json -w "%{http_code}" -X POST "$BASE/query" \
  -H "Content-Type: application/json" \
  -d "$LARGE_BODY")
check "413" "$HTTP_CODE" "超大请求体被拦截"

# 清理
rm -f /tmp/bazi_test.json

echo ""
echo "===================="
echo "  ✅ PASS: $PASS  ❌ FAIL: $FAIL"
echo "===================="

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
