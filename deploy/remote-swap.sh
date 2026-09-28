#!/usr/bin/env bash
#
# 【在服务器上执行】校验上传的产物包，然后原子切换站点目录
#
# 用法：bash /tmp/jpstage-swap.sh <SITE_ROOT> <WEB_DIR> <MIN_HTML>
#
# ════════════════════════════════════════════════════════════════════
#  ★ 为什么这个脚本独立成文件，而不是内嵌在 remote-upload.sh 的 heredoc 里
# ════════════════════════════════════════════════════════════════════
#
#  最初它是嵌在 `vps "cat > /tmp/x.sh" <<REMOTE ... REMOTE` 里的。
#  那个写法有个致命问题：**转义层数**。
#     · heredoc 未加引号 → 本地 shell 会先展开 $VAR 与 $(cmd)
#     · 想让变量在**服务器上**展开，就得写成 \$VAR
#     · 而 $(...) 要写成 \$(...)，里面若还有引号就更容易错
#
#  实测代价：`LISTING=$(tar -tf "$NEW")` 这一行被**本地**展开了，
#  于是「包内缺 index.html」的校验形同虚设（报了一串 shell 错误，
#  但脚本继续往下跑，站点照样上线 —— 最坏的一种失败：看起来成功了）。
#
#  独立成文件后：参数从命令行传、内容原样送过去，**没有任何嵌套转义**。
#  这也让这个脚本可以被单独测试（bash deploy/remote-swap.sh ... 在服务器上跑）。
set -euo pipefail

SITE_ROOT="${1:?用法: jpstage-swap.sh <SITE_ROOT> <WEB_DIR> <MIN_HTML>}"
WEB_DIR="${2:?缺少 WEB_DIR}"
MIN_HTML="${3:?缺少 MIN_HTML}"

NEW=/tmp/jpstage-out.tar
PREV="$WEB_DIR/jpstage-prev.tar"

# ---------- 校验传输完整性 ----------
[ -f "$NEW" ] || { echo "✖ 上传的 tar 不存在"; exit 1; }
tar -tf "$NEW" >/dev/null 2>&1 || { echo "✖ tar 已损坏（传输中断？），线上未改动"; exit 1; }

# ★★ 先把清单读进变量，再做判断 —— 不要用 `tar -tf | grep -q` ★★
#
#   这是 grep -q 与 pipefail 的经典冲突，实测卡住了整次部署：
#     · grep -q 一旦匹配就**立即退出**（这正是 -q 的语义）；
#     · 它一退出，还在写输出的 tar 就收到 SIGPIPE（退出码 141）；
#     · 而脚本开头有 set -o pipefail，管道因此返回失败；
#     · 于是 `grep -q ... || { 报错 }` 走进了报错分支 ——
#       即使那个文件**明明存在**。
#   实测现象：证书都签好了，却在「包内缺 index.html」上失败，
#   而在服务器上手工跑同样的命令却返回匹配（手工跑时没有 pipefail）。
#
#   改成一次性读取清单，同时也更快（一次 tar 读取代替三次）。
#
# ★★ 但「读进变量」还不够 —— 后面不能再把它**管进** `grep -q` ★★
#   2026-09-29 实测踩到：`printf '%s\n' "$LISTING" | grep -q ...` 里
#   grep -q 命中后立刻退出，还在写的 printf 收到 SIGPIPE（退出码 141）；
#   脚本开头有 set -o pipefail，于是整条管道返回失败 ——
#   文件明明存在，却被判成「包内缺 index.html」，整次发布中止。
#   （与上面 tar -tf | grep -q 是同一个坑，只是换了个位置。）
#   所以清单改成写进临时文件，后面用**参数**读：没有管道就没有 SIGPIPE。
LISTING_FILE=/tmp/jpstage-listing.txt
tar -tf "$NEW" > "$LISTING_FILE"

N=$(grep -c '\.html$' "$LISTING_FILE" || true)
echo "  包内 HTML：$N 页"
[ "$N" -ge "$MIN_HTML" ] || { echo "✖ 包内只有 $N 页，低于阈值 $MIN_HTML，拒绝切换"; exit 1; }

# 条目名带 `./` 前缀（打包时用的是 `tar -cf ... -C out .`），
# 所以是 `^\./index\.html$` 而不是 `^index\.html$`。
grep -qx '\./index\.html' "$LISTING_FILE" || { echo "✖ 包内缺 index.html"; exit 1; }
grep -q '\./_next/static/' "$LISTING_FILE" || { echo "✖ 包内缺 _next/static"; exit 1; }
rm -f "$LISTING_FILE"

# ---------- 留存当前版本（供 --rollback）----------
if [ -f "$SITE_ROOT/index.html" ]; then
  tar -cf "$PREV.tmp" -C "$SITE_ROOT" . 2>/dev/null || true
  mv "$PREV.tmp" "$PREV"     # mv 是原子的，避免留下半截备份
  echo "  当前版本已存为 jpstage-prev.tar（$(du -h "$PREV" | cut -f1)）"
else
  echo "  （首次部署，无上一版可留存）"
fi

# ---------- 切换 ----------
# ★ 只清内容、保留目录本身：bind mount 绑定的是目录 inode。
#   把目录整个删掉再建，容器里看到的仍是旧 inode（空目录），站点会 404。
#   hkmovie 的重建脚本里专门记了这个坑。
mkdir -p "$SITE_ROOT"
find "$SITE_ROOT" -mindepth 1 -delete
tar -xf "$NEW" -C "$SITE_ROOT"
# a+rX：文件可读、目录可进入（nginx worker 以 nginx 用户运行，
# 需要能读到 root 拥有的这些文件）。X 而不是 x：不给普通文件加执行位。
chmod -R a+rX "$SITE_ROOT"
rm -f "$NEW"

echo "  线上 HTML：$(find "$SITE_ROOT" -name '*.html' | wc -l) 页"
echo "  站点目录：$(du -sh "$SITE_ROOT" | cut -f1)"
