#!/usr/bin/env bash
#
# 把本机构建好的 out/ 上传到服务器（只传产物，服务器不构建）
#
#   bash deploy/remote-upload.sh              # 上传并切换
#   bash deploy/remote-upload.sh --dry-run    # 只检查，不碰线上
#   bash deploy/remote-upload.sh --rollback   # 回到服务器上的上一版
#
# ════════════════════════════════════════════════════════════════════
#  ★ 为什么是「本机构建 + 传产物」，而不是像 hkmovie 那样在服务器构建
# ════════════════════════════════════════════════════════════════════
#
#  服务器是 2 核 2G，实测**可用内存只剩 600MB 上下**（hkmovie / nginx /
#  komari / nodectl 已占用大部分），而且历史上真的被 OOM 杀过进程
#  （dmesg 里有 `Memory cgroup out of memory: Killed process`）。
#  Next.js 构建是内存大户（hkmovie 构建 266 页时峰值常在 1GB 以上，
#  靠 3GB swap 兜住）。在这台机器上跑构建，风险不是「慢」，而是
#  **可能把别人的站点一起拖死** —— OOM killer 挑哪个进程下手是它说了算。
#
#  本站是纯静态导出，产物只有 12MB / 75 个 HTML —— 本机构建完传上去，
#  整个环节不依赖服务器有 Node、不占服务器内存、也快得多。
#
#  代价：本机必须有完整构建环境（本来就有，开发就在本机）。
#  这个取舍与 hkmovie 不同，是因为**两台站点的部署环境不同**，
#  不是因为它那样做错了 —— 它的构建机就是那台服务器，没得选。
#
# ════════════════════════════════════════════════════════════════════
#  ★ 为什么先传 /tmp 再切换，而不是直接解到站点目录
# ════════════════════════════════════════════════════════════════════
#
#  直接 `tar -xf - -C $SITE_ROOT` 的话，网络一旦在传输中途断掉，
#  站点目录里就是**一半新一半旧**的混合状态：部分页面是新版、
#  部分还是旧版，_next/static 的 hash 文件可能缺一半 ——
#  表现为随机页面 404 或样式错乱，而且很难判断是「传坏了」还是「构建错了」。
#
#  先完整传到 /tmp 并校验，再一次性切换，就把「网络传输」与
#  「站点内容替换」两件事分开了：传输失败时线上毫发无损。
#
# ════════════════════════════════════════════════════════════════════
#  ★ 服务器侧的脚本为什么是独立文件（deploy/remote-swap.sh 等）
# ════════════════════════════════════════════════════════════════════
#
#  最初它们是嵌在本文件的 `vps "cat > /tmp/x.sh" <<REMOTE ...` 里的。
#  那个写法有致命的转义问题：heredoc 未加引号时本地 shell 会先展开
#  $VAR 与 $(cmd)，想让变量在服务器上展开就得写 \$VAR、\$(...)。
#  实测 `LISTING=$(tar -tf "$NEW")` 被**本地**展开了 —— 于是
#  「包内缺 index.html」的校验形同虚设：报了一串 shell 错误，
#  但脚本继续往下跑，站点照样上线。这是最坏的一种失败：看起来成功了。
#
#  改成独立文件后：内容原样送过去，参数走命令行，零嵌套转义。
#  附带好处是这些脚本能被单独审查与单独测试。
# =======================================================================
#  * SITE_ROOT 为什么是 /home/web/jpstage（宿主机视角）
# =======================================================================
#
#   nginx 跑在**容器**里（docker-compose 的 nginx 服务），而站点配置
#   写的是 root /var/www/jpstage —— 那是**容器内**的路径。
#   两者不是冲突，是同一份数据的两个视角：
#     宿主机 /home/web/jpstage  --bind mount-->  容器 /var/www/jpstage
#   挂载声明在 /home/web/docker-compose.yml：
#     - ./jpstage:/var/www/jpstage
#   实测两边同一文件 inode 相同（stat -c %i），确认是 bind mount。
#
#   * 推论（两条，别再当成两套路径去「对齐」）：
#     (1) 部署脚本必须在**宿主机**路径写：/home/web/jpstage。
#         写进容器内的 /var/www/jpstage 会落到容器的可写层，
#         容器重建即丢失，且宿主机侧看不到 —— 站点仍是旧版。
#     (2) 看到 nginx 配的 root 路径「在宿主机不存在」是**正常的**，
#         不要据此判断配置坏了。判断配置是否正确，要看挂载在不在：
#           docker inspect nginx   (看 .Mounts 里 .Source -> .Destination)
#         挂载在，两个路径就是通的。
#
#   ! 这条曾经被误判过一次：在宿主机上 ls /var/www/jpstage 发现「不存在」，
#   就得出「nginx root 指向空目录、部署写错地方」的结论 —— 实际完全正常。
set -euo pipefail

VPS="${VPS_ALIAS:-伤心的云-HK}"
DOMAIN="${DOMAIN:-jpstage.yuurei.de}"
SITE_ROOT="${SITE_ROOT:-/home/web/jpstage}"
WEB_DIR="${WEB_DIR:-/home/web}"
MIN_HTML="${MIN_HTML:-70}"

cd "$(dirname "$0")/.."

say() { printf '\n▶ %s\n' "$*"; }
die() { printf '✖ %s\n' "$*" >&2; exit 1; }

vps() { timeout "${2:-600}" ssh -o BatchMode=yes -o ConnectTimeout=20 "$VPS" "$1"; }

MODE=upload
case "${1:-}" in
  --dry-run)  MODE=dry ;;
  --rollback) MODE=rollback ;;
  '') ;;
  *) die "未知参数：$1（可用：--dry-run / --rollback）" ;;
esac

# ════════════════════════════════════════════════════════════════════
#  回滚：把服务器上留存的上一版 tar 解回去
# ════════════════════════════════════════════════════════════════════
if [ "$MODE" = "rollback" ]; then
  say "回滚到服务器上的上一版"
  vps "cat > /tmp/jpstage-rollback.sh" < deploy/remote-rollback.sh
  vps "bash /tmp/jpstage-rollback.sh '$SITE_ROOT' '$WEB_DIR' '$MIN_HTML'"
  say "回滚完成：https://$DOMAIN"
  exit 0
fi

# ════════════════════════════════════════════════════════════════════
#  1. 本机前置检查
# ════════════════════════════════════════════════════════════════════
say "[1/4] 检查本机产物"
[ -f out/index.html ] || die "out/index.html 不存在，先跑 npm run build"

N_HTML=$(find out -name '*.html' | wc -l)
[ "$N_HTML" -ge "$MIN_HTML" ] || die "产物只有 $N_HTML 页，低于阈值 $MIN_HTML，疑似构建残缺"

# 域名必须已烘入产物：sitemap/robots 里的绝对 URL 是**构建期**写死的，
# 构建时忘了设 NEXT_PUBLIC_SITE_URL 就会得到 localhost 或 example 域名 ——
# 页面上完全看不出来，只有搜索引擎会看到一堆错误 URL。
grep -q "$DOMAIN" out/sitemap.xml || die "sitemap.xml 里没有 $DOMAIN。
     构建时请用：NEXT_PUBLIC_SITE_URL=https://$DOMAIN npm run build"

# _next/static 必须存在：否则页面能开但样式全丢
[ -d out/_next/static ] || die "out/_next/static 不存在，构建产物不完整"

# 抽一个真实的详情页 slug 用于冒烟（不写死：写死的 slug 会随数据变化而消失，
# 那是 hkmovie 踩过的坑 —— 拿已下映的片做冒烟，让正常发布被报成失败）
SMOKE_SLUG=$(ls out/show 2>/dev/null | head -1 || true)
echo "  产物：$N_HTML 页，$(du -sh out | cut -f1)"
echo "  冒烟用 slug：${SMOKE_SLUG:-（无，跳过详情页抽检）}"

if [ "$MODE" = "dry" ]; then
  say "--dry-run：检查通过，未上传"
  exit 0
fi

# ════════════════════════════════════════════════════════════════════
#  2. 打包并上传到服务器 /tmp
# ════════════════════════════════════════════════════════════════════
say "[2/4] 打包并上传到服务器 /tmp"
TAR=$(mktemp -t jpstage-out-XXXXXX.tar)
trap 'rm -f "$TAR"' EXIT

# -C out . ：用相对路径打包，解压时直接落进站点目录，不会多一层 out/
tar -cf "$TAR" -C out .
echo "  包大小：$(du -h "$TAR" | cut -f1)"

# 用 ssh 的 stdin 传，不额外依赖 rsync/scp 的可用性
timeout 900 ssh -o BatchMode=yes -o ConnectTimeout=20 "$VPS" "cat > /tmp/jpstage-out.tar" < "$TAR"
echo "  已上传"

# ════════════════════════════════════════════════════════════════════
#  3. 服务器侧校验 + 原子切换
# ════════════════════════════════════════════════════════════════════
say "[3/4] 服务器侧校验并切换"
vps "cat > /tmp/jpstage-swap.sh" < deploy/remote-swap.sh
vps "bash /tmp/jpstage-swap.sh '$SITE_ROOT' '$WEB_DIR' '$MIN_HTML'"

# ════════════════════════════════════════════════════════════════════
#  4. 公网冒烟
# ════════════════════════════════════════════════════════════════════
say "[4/4] 公网冒烟（经 Cloudflare）"

code_of() { curl -s -o /dev/null -m 25 -w '%{http_code}' "$1" || echo 000; }

A=$(code_of "https://$DOMAIN/")
B=$(code_of "https://$DOMAIN/now/")
C=skip
if [ -n "$SMOKE_SLUG" ]; then
  C=$(code_of "https://$DOMAIN/show/$SMOKE_SLUG/")
fi

echo "  首頁=$A  /now=$B  抽檢詳情頁(${SMOKE_SLUG:-无})=$C"

# 静态资源也要验：页面 200 但 CSS 404 是最隐蔽的一种坏法
# （HTML 正常返回、内容也在，只是整站样式丢失）
CSS=$(ls out/_next/static/chunks/*.css 2>/dev/null | head -1 | sed 's|^out||')
if [ -n "$CSS" ]; then
  D=$(code_of "https://$DOMAIN$CSS")
  echo "  CSS($CSS)=$D"
  [ "$D" = "200" ] || die "静态资源不可访问，站点样式会丢失"
fi

if [ "$A" != "200" ] || [ "$B" != "200" ]; then
  die "冒烟未通过（首页=$A /now=$B）。
     常见原因：
       · 525 → CF 的 Full(strict) 连不上源站 443，检查证书是否就位
       · 404 → 产物没同步到 \$SITE_ROOT，或 nginx root 指向了别处
       · 502/520 → nginx 配置有误，看 docker logs nginx"
fi
[ "$C" = "skip" ] || [ "$C" = "200" ] || die "详情页冒烟失败（$C）"

printf '\n✅ 已发布：https://%s\n\n' "$DOMAIN"
