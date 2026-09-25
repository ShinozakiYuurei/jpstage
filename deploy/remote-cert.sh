#!/usr/bin/env bash
#
# 【在服务器上执行】签发（或复用）Let's Encrypt 证书并部署到 nginx 读取位置
#
# 用法：bash /tmp/jpstage-cert.sh <DOMAIN> <WEB_DIR> [EMAIL]
#
# 独立成文件而非内嵌 heredoc：嵌套转义会把 $VAR / $(...) 提前在本地展开，
# 实测已经因此让一处校验静默失效（见 deploy/remote-swap.sh 顶部注释）。
set -euo pipefail

DOMAIN="${1:?用法: jpstage-cert.sh <DOMAIN> <WEB_DIR> [EMAIL]}"
WEB_DIR="${2:?缺少 WEB_DIR}"
EMAIL="${3:-}"

EMAIL_ARG="--register-unsafely-without-email"
[ -n "$EMAIL" ] && EMAIL_ARG="--email $EMAIL"

# ---------- 幂等：已有有效证书就跳过 ----------
# ★ 为什么必须幂等：Let's Encrypt 对同一组域名有**每周 5 次**的签发配额。
#   部署脚本重复跑几次（调试、重试）就可能触顶，之后整整一周都签不出新证书
#   （包括正常的续期）—— 而那时的表现是「部署莫名其妙失败」，很难联想到配额。
if [ -d "/etc/letsencrypt/live/$DOMAIN" ] && \
   openssl x509 -checkend 2592000 -noout -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
  echo "  已有有效证书（30 天内不过期），跳过签发"
else
  # ★ 用与 /root/auto_cert_renewal.sh **完全相同**的镜像与参数：
  #   首次签发与日后自动续期走同一条路径 —— 首次能成，续期就能成。
  #   若首次用 standalone、续期用 webroot，就多了一处「只在续期时才暴露」
  #   的失败可能，而它的表现是几个月后证书过期，最难查。
  docker run --rm \
    -v "/etc/letsencrypt:/etc/letsencrypt" \
    -v "$WEB_DIR/letsencrypt:/var/www/letsencrypt" \
    certbot/certbot certonly \
    --webroot -w /var/www/letsencrypt \
    -d "$DOMAIN" \
    $EMAIL_ARG \
    --agree-tos --no-eff-email \
    --key-type ecdsa \
    --non-interactive
fi

# ---------- 部署到 nginx 读取的位置 ----------
# ★ 命名必须是 <域名>_cert.pem / <域名>_key.pem：
#   /root/auto_cert_renewal.sh 靠**遍历 certs/*_cert.pem 反推域名**，
#   命名不符的文件它永远看不到，也就永远不会被续期。
#   那是一个静默失败：证书照常工作到过期，然后突然全线 525。
mkdir -p "$WEB_DIR/certs"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$WEB_DIR/certs/${DOMAIN}_cert.pem"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem"   "$WEB_DIR/certs/${DOMAIN}_key.pem"
chmod 600 "$WEB_DIR/certs/${DOMAIN}_key.pem"

# ---------- 校验：证书确实覆盖了目标域名 ----------
# 不校验的话，若 live 目录里意外是别的域名的证书（软链错、复用了旧目录），
# nginx 会照常启动，但浏览器报证书不匹配、CF 报 525 —— 很难定位到是证书内容问题。
echo "  证书内容："
openssl x509 -in "$WEB_DIR/certs/${DOMAIN}_cert.pem" -noout -subject -dates | sed 's/^/    /'
openssl x509 -in "$WEB_DIR/certs/${DOMAIN}_cert.pem" -noout -ext subjectAltName 2>/dev/null | tail -1 | sed 's/^/    SAN:/'

if ! openssl x509 -in "$WEB_DIR/certs/${DOMAIN}_cert.pem" -noout -text 2>/dev/null | grep -q "DNS:$DOMAIN"; then
  echo "  ✖ 证书里没有 DNS:$DOMAIN，nginx 起来后会证书不匹配"
  exit 1
fi
echo "  ✓ 证书就位且覆盖 $DOMAIN"
