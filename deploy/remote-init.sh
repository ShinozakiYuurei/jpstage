#!/usr/bin/env bash
#
# 一次性初始化 jpstage 站点（首次部署时跑一次，之后用 sync.sh）
#
#   bash deploy/remote-init.sh
#
# 做四件事，顺序不能乱：
#   1. 建独立站点目录 /home/web/jpstage（**不是** /home/web/html，
#      理由见 deploy/nginx-jpstage.conf 顶部）
#   2. 给 nginx 容器加一个 bind mount（需重建容器，约 1 秒）
#   3. 先只装 80 端口配置 → 用 certbot 签发 Let's Encrypt 证书
#   4. 证书就位后再换成完整配置（含 443）→ reload
#
# ════════════════════════════════════════════════════════════════════
#  ★ 为什么必须分两步装配置
# ════════════════════════════════════════════════════════════════════
#
#  CF 的 SSL/TLS 模式是 Full(strict)：源站 443 没有**有效**证书时一律 525。
#  若一上来就装含 443 的完整配置，nginx -t 会因为证书文件不存在而直接失败
#  （ssl_certificate 指向的文件必须存在，否则配置不合法），reload 被拒 ——
#  站点连 80 都用不了。
#
#  所以顺序是：80 → 签证书 → 443。中间那段「只有 80」的窗口是必要的，
#  而且很短（certbot 一般 5~15 秒）。
#
# ════════════════════════════════════════════════════════════════════
#  ★ 为什么用 certbot 的 webroot 而不是 standalone
# ════════════════════════════════════════════════════════════════════
#
#  服务器上现成的 /root/auto_cert_renewal.sh 用的是 webroot
#  （-w /var/www/letsencrypt）。这里与它保持一致，好处是：
#    · 不需要停 nginx（standalone 要占用 80 端口，得先把容器停掉）
#    · 首次签发与日后自动续期走**同一条路径** —— 首次能成，续期就能成。
#      若首次用 standalone、续期用 webroot，就多了一处「只在续期时才暴露」
#      的失败可能（而它的表现是几个月后证书过期，最难查）。
set -euo pipefail

DOMAIN="${DOMAIN:-jpstage.yuurei.de}"
SITE_ROOT="${SITE_ROOT:-/home/web/jpstage}"
WEB_DIR="${WEB_DIR:-/home/web}"
LE_EMAIL="${LE_EMAIL:-}"          # 留空则用 certbot 的 --register-unsafely-without-email
VPS="${VPS_ALIAS:-伤心的云-HK}"

cd "$(dirname "$0")/.."

say() { printf '\n▶ %s\n' "$*"; }
die() { printf '✖ %s\n' "$*" >&2; exit 1; }

vps() { timeout "${2:-300}" ssh -o BatchMode=yes -o ConnectTimeout=20 "$VPS" "$1"; }

# ════════════════════════════════════════════════════════════════════
#  0. 前置检查：本机产物必须已就绪
# ════════════════════════════════════════════════════════════════════
say "[0/5] 前置检查"
[ -f out/index.html ] || die "out/index.html 不存在，先跑 npm run build"
N_HTML=$(find out -name '*.html' | wc -l)
[ "$N_HTML" -ge 70 ] || die "产物只有 $N_HTML 页，疑似构建残缺（期望 ≥70）"
# 域名必须已烘入产物，否则 sitemap/robots 会指向错误域名
grep -q "$DOMAIN" out/sitemap.xml || die "sitemap.xml 里没有 $DOMAIN，构建时忘了设 NEXT_PUBLIC_SITE_URL？"
echo "  本机产物：$N_HTML 页，域名 $DOMAIN 已烘入"

# ════════════════════════════════════════════════════════════════════
#  1. 服务器侧：目录 + 容器挂载
# ════════════════════════════════════════════════════════════════════
say "[1/5] 准备站点目录"

# ★ 容器挂载不在这里做，而是由 deploy/remote-attach-mount.sh 负责。
#   原因（实测）：服务器上的容器全是 `docker run` 手工创建的，
#   `docker compose up` 会因容器名冲突而失败；而且必须从**运行中的容器**
#   提取参数重建，不能照 compose 文件重建（两者已漂移）。
#   那个脚本带 --dry-run 与自动回滚，单独跑也更安全可控。
vps "mkdir -p $SITE_ROOT && chmod 755 $SITE_ROOT && ls -ld $SITE_ROOT"
echo "  站点目录就绪：$SITE_ROOT"

# 确认容器确实已挂载该目录（没挂的话后面证书签完也访问不了）
if ! vps "docker inspect nginx --format '{{range .Mounts}}{{.Destination}} {{end}}' | grep -qw /var/www/jpstage"; then
  die "nginx 容器没有 /var/www/jpstage 挂载。
     请先跑：bash deploy/remote-attach-mount.sh"
fi
echo "  ✓ 容器已挂载 /var/www/jpstage"

# ════════════════════════════════════════════════════════════════════
#  2. 先装「只有 80 端口」的临时配置
# ════════════════════════════════════════════════════════════════════
say "[2/5] 装载 80 端口临时配置（为 ACME 验证）"

# 配置文件也是独立文件（deploy/nginx-jpstage-preinit.conf），不内嵌 heredoc ——
# 理由与 remote-swap.sh 顶部注释相同（嵌套转义会让内容静默变形）。
vps "cat > /tmp/jpstage-80only.conf" < deploy/nginx-jpstage-preinit.conf
vps "sed -i 's|__DOMAIN__|$DOMAIN|' /tmp/jpstage-80only.conf && \
     cp /tmp/jpstage-80only.conf '$WEB_DIR/conf.d/$DOMAIN.conf' && \
     docker exec nginx nginx -t 2>&1 | tail -2 && \
     docker exec nginx nginx -s reload && echo '  ✓ 80 端口配置已生效'"

# ════════════════════════════════════════════════════════════════════
#  3. 验证 ACME 路径确实能从公网访问（**签发前**的必要检查）
# ════════════════════════════════════════════════════════════════════
say "[3/5] 验证 ACME 路径可达（签发前的必要检查）"

TOKEN="jpstage-preflight-$(date +%s)"
vps "printf '%s' '$TOKEN' > $WEB_DIR/letsencrypt/.well-known/acme-challenge/$TOKEN && chmod 644 $WEB_DIR/letsencrypt/.well-known/acme-challenge/$TOKEN"

# ★ 从**公网经 Cloudflare** 请求，而不是在服务器上 localhost 请求。
#   两者结果可能不同：CF 若把 ACME 路径也 301 到 https，localhost 仍然 200，
#   但 Let's Encrypt 从公网取时会撞上「要先有证书」的死循环。
#   必须用公网路径验证，才真正证明签发会成功。
GOT=$(curl -s -m 20 "http://$DOMAIN/.well-known/acme-challenge/$TOKEN" || true)
if [ "$GOT" != "$TOKEN" ]; then
  vps "rm -f $WEB_DIR/letsencrypt/.well-known/acme-challenge/$TOKEN" || true
  die "ACME 路径不可达（期望 '$TOKEN'，实得 '$GOT'）。
     Let's Encrypt 的 HTTP-01 验证会失败。
     常见原因：Cloudflare 对这条路径做了强制 HTTPS 重定向。
     此时应改用 DNS-01（需要 CF API Token）或临时把云朵点成灰色。"
fi
echo "  ✓ 公网经 CF 可读到 challenge 文件（HTTP-01 可用）"
vps "rm -f $WEB_DIR/letsencrypt/.well-known/acme-challenge/$TOKEN" || true

# ════════════════════════════════════════════════════════════════════
#  4. 签发证书
# ════════════════════════════════════════════════════════════════════
say "[4/5] 签发 Let's Encrypt 证书"

# 证书脚本也是独立文件（deploy/remote-cert.sh），参数走命令行。
vps "cat > /tmp/jpstage-cert.sh" < deploy/remote-cert.sh
vps "bash /tmp/jpstage-cert.sh '$DOMAIN' '$WEB_DIR' '$LE_EMAIL'" 600

# ════════════════════════════════════════════════════════════════════
#  5. 换成完整配置（含 443）并上传产物
# ════════════════════════════════════════════════════════════════════
say "[5/5] 启用 HTTPS 配置并上传产物"

vps "cat > /tmp/jpstage-full.conf" < deploy/nginx-jpstage.conf
vps "sed -i 's|__SITE_DOMAIN__|$DOMAIN|g' /tmp/jpstage-full.conf; \
     cp /tmp/jpstage-full.conf '$WEB_DIR/conf.d/$DOMAIN.conf' && \
     docker exec nginx nginx -t 2>&1 | tail -2 && \
     docker exec nginx nginx -s reload && echo '  ✓ HTTPS 配置已生效'"

# 上传产物（与 sync.sh 相同的传输方式）
bash deploy/remote-upload.sh

say "完成"
cat <<EOF

  站点： https://$DOMAIN
  根目录： $SITE_ROOT（容器内 /var/www/jpstage）

  后续更新只需跑：bash deploy/sync.sh
  证书续期：/root/auto_cert_renewal.sh（每日 cron，自动识别新证书）
EOF
