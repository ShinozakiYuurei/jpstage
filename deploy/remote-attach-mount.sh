#!/usr/bin/env bash
#
# 给现有 nginx 容器增加一条 bind mount（/home/web/jpstage -> /var/www/jpstage）
#
#   bash deploy/remote-attach-mount.sh            # 执行
#   bash deploy/remote-attach-mount.sh --dry-run  # 只打印将执行的命令
#
# ════════════════════════════════════════════════════════════════════
#  ★ 为什么不用 `docker compose up -d nginx`
# ════════════════════════════════════════════════════════════════════
#
#  实测：服务器上的 nginx / php / mysql / redis **全部是 `docker run`
#  手工创建的**（`docker inspect` 里没有任何 com.docker.compose.* 标签，
#  `docker compose ls` 也是空的）。/home/web/docker-compose.yml 只是
#  一份**记录**，不是实际的编排来源。
#
#  因此 `docker compose up -d nginx` 会失败：
#      Conflict. The container name "/nginx" is already in use
#  compose 会试图新建一个同名容器，而那个名字被手工容器占着。
#
#  ★ 为什么也不删掉旧容器再用 compose 重建
#
#  那等于用 compose 文件的**当前内容**重新定义整个 nginx 服务。而
#  手工容器与 compose 文件之间可能已经漂移（例如有人在容器里加过挂载、
#  改过 tmpfs 大小，但没同步回文件）—— 用文件重建会把那些差异静默抹掉，
#  表现为「重建后某个站点坏了，但配置看起来没变」。
#
#  正确做法是**从运行中的容器提取真实参数**（docker inspect），
#  原样重放一遍，只增不改。这样无论容器与文件漂移与否，结果都可预期。
#
# ════════════════════════════════════════════════════════════════════
#  ★ 中断窗口
# ════════════════════════════════════════════════════════════════════
#
#  重建容器必然要 stop + rm + run，期间 nginx 不在，**该机器上所有站点
#  （hkmovie / imgmove / komari）会一起返回 502/520**。
#  实测这个窗口是 1~3 秒（nginx:alpine 启动很快）。
#
#  脚本做了三件事降低风险：
#    1. 重建前把当前容器参数与 compose 文件都备份到 /root/
#    2. 新容器起来后**立刻**验证：挂载是否生效 + 各站点是否恢复 200
#    3. 任一项不通过就自动用备份参数回滚
set -euo pipefail

VPS="${VPS_ALIAS:-伤心的云-HK}"
WEB_DIR="${WEB_DIR:-/home/web}"
NEW_SRC="${NEW_SRC:-$WEB_DIR/jpstage}"
NEW_DST="${NEW_DST:-/var/www/jpstage}"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

cd "$(dirname "$0")/.."

vps() { timeout "${2:-300}" ssh -o BatchMode=yes -o ConnectTimeout=20 "$VPS" "$1"; }

echo "▶ 给 nginx 容器增加挂载：$NEW_SRC -> $NEW_DST"

# 先把脚本送到服务器再执行：避免在 ssh 的引号里嵌复杂脚本（两层转义易错）
vps "cat > /tmp/jpstage-attach.sh" <<'REMOTE'
set -euo pipefail
WEB_DIR="__WEB_DIR__"
NEW_SRC="__NEW_SRC__"
NEW_DST="__NEW_DST__"
DRY=__DRY__

BK="/root/jpstage-attach-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"

# ---------- 0. 幂等：已经挂过就直接退出 ----------
if docker inspect nginx --format '{{range .Mounts}}{{.Destination}} {{end}}' | grep -qw "$NEW_DST"; then
  echo "  ✓ 容器已有 $NEW_DST，无需改动"
  exit 0
fi

# ---------- 1. 备份当前状态 ----------
docker inspect nginx > "$BK/nginx-inspect.json"
cp "$WEB_DIR/docker-compose.yml" "$BK/docker-compose.yml"
# 记下当前容器的启动参数（用于回滚）
docker inspect nginx --format '{{json .HostConfig.Binds}}' > "$BK/binds.json"
echo "  已备份到 $BK"

# ---------- 2. 从运行中的容器提取真实参数 ----------
# ★ 逐项从 inspect 读，而不是照抄 compose 文件 —— 理由见脚本顶部注释。
#
# ★★ 实测确认了「文件与运行状态已漂移」★★
#   /home/web/docker-compose.yml 里 nginx 服务写着：
#       tmpfs:
#         - /var/cache/nginx:rw,noexec,nosuid,size=2048m
#   但运行中的容器 `HostConfig.Tmpfs` 是 **null**，容器内也没有该挂载。
#   即 compose 文件描述的是一个**从未生效过**（或已被手工重建抹掉）的状态。
#   若照文件重建，会凭空多出一个 2GB 的 tmpfs 上限 —— 在一个只剩 8GB 磁盘、
#   内存长期紧张的机器上，这不是「恢复配置」而是「引入变化」。
#   从运行中的容器提取则完全避开这个坑。
IMG=$(docker inspect nginx --format '{{.Config.Image}}')
NET=$(docker inspect nginx --format '{{.HostConfig.NetworkMode}}')
RESTART=$(docker inspect nginx --format '{{.HostConfig.RestartPolicy.Name}}')

# 挂载：把现有 bind 全部取出，再加上新的
# ★ 末尾的 `grep -v '^$'` 不能省：
#   模板每项后输出一个换行，最后一项之后还有一个尾部换行，
#   mapfile 会把它当成一个**空元素**。不过滤的话就会多出一条 `-v ""`，
#   而 docker 会直接报错退出（空挂载参数不合法）。
#   实测 dry-run 里正是这样暴露的：命令中间出现 `-v  -v /home/web/jpstage:...`。
mapfile -t OLD_BINDS < <(docker inspect nginx --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}:{{.Destination}}{{"\n"}}{{end}}{{end}}' | grep -v '^$' || true)
echo "  现有 bind 挂载 ${#OLD_BINDS[@]} 条"
[ "${#OLD_BINDS[@]}" -gt 0 ] || { echo "✖ 提取到 0 条 bind 挂载，拒绝继续（这会导致新容器无任何挂载）"; exit 1; }

# 卷挂载（php socket 等 named volume）也要保留，否则 php 站点会失去 socket
mapfile -t OLD_VOLS < <(docker inspect nginx --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}:{{.Destination}}{{"\n"}}{{end}}{{end}}' | grep -v '^$' || true)
echo "  现有 volume 挂载 ${#OLD_VOLS[@]} 条"

# tmpfs（实测为 null，即没有；仍逐项探测以便将来真有的时候能保留）
mapfile -t OLD_TMPFS < <(docker inspect nginx --format '{{range $k, $v := .HostConfig.Tmpfs}}{{$k}}={{"\n"}}{{end}}' 2>/dev/null | grep -v '^=$' | grep -v '^$' || true)

# ---------- 3. 组装 docker run ----------
ARGS=(run -d --name nginx --restart "$RESTART" --network "$NET")
for b in "${OLD_BINDS[@]}"; do ARGS+=(-v "$b"); done
ARGS+=(-v "$NEW_SRC:$NEW_DST")
for v in "${OLD_VOLS[@]}"; do ARGS+=(-v "$v"); done
for t in "${OLD_TMPFS[@]}"; do ARGS+=(--tmpfs "$t"); done

# 其他可能存在的关键参数（逐项探测，有就带上）
for key in Privileged ReadonlyRootfs; do
  val=$(docker inspect nginx --format "{{.HostConfig.$key}}")
  [ "$val" = "true" ] && ARGS+=(--"$(echo "$key" | tr '[:upper:]' '[:lower:]')")
done
# 端口：host 网络模式下不需要，但若将来换成 bridge 就得带上
PORTS=$(docker inspect nginx --format '{{range $p, $conf := .HostConfig.PortBindings}}{{$p}} {{"\n"}}{{end}}' | tr ' ' '\n' | grep -v '^$' || true)
if [ "$NET" != "host" ] && [ -n "$PORTS" ]; then
  for p in $PORTS; do ARGS+=(-p "$p"); done
fi
# 环境变量：**跳过空值**。
#   docker inspect 的 Config.Env 里实测最后一项是空字符串，
#   直接带上去会变成 `-e ''`，让 docker 报错退出。
mapfile -t ENVS < <(docker inspect nginx --format '{{range .Config.Env}}{{.}}{{"\n"}}{{end}}' | grep -v '^$' || true)
for e in "${ENVS[@]}"; do ARGS+=(-e "$e"); done

ARGS+=("$IMG")

echo "  将执行："
printf '    docker %s\n' "${ARGS[*]}"

# ★ dry-run 必须能看出「参数是否完整」：只打印命令不够，
#   还得把关键项单独列出来 —— 人眼扫一遍长命令很难发现少了两条挂载。
echo "  关键参数核对："
printf '    bind 挂载 %s 条（含新增 1 条）\n' "$(( ${#OLD_BINDS[@]} + 1 ))"
printf '    volume  %s 条\n' "${#OLD_VOLS[@]}"
printf '    环境变量 %s 条\n' "${#ENVS[@]}"

if [ "$DRY" = "1" ]; then
  echo "  --dry-run：未执行"
  exit 0
fi

# ---------- 4. 重建 ----------
echo "  停止并删除旧容器（各站点会有 1~3 秒中断）..."
docker stop nginx >/dev/null
docker rm nginx >/dev/null

if ! docker "${ARGS[@]}" >/dev/null; then
  echo "  ✖ 新容器启动失败，正在回滚..."
  # 回滚：用备份的 binds 原样重放
  RB=(run -d --name nginx --restart "$RESTART" --network "$NET")
  for b in "${OLD_BINDS[@]}"; do RB+=(-v "$b"); done
  for v in "${OLD_VOLS[@]}"; do RB+=(-v "$v"); done
  for t in "${OLD_TMPFS[@]}"; do RB+=(--tmpfs "$t"); done
  RB+=("$IMG")
  docker "${RB[@]}" >/dev/null && echo "  ✓ 已回滚（站点恢复原状）" || echo "  ✖✖ 回滚也失败，请人工介入：$BK"
  exit 1
fi

# ---------- 5. 验证 ----------
sleep 3
echo "  验证挂载..."
docker inspect nginx --format '{{range .Mounts}}{{.Destination}} {{end}}' | grep -qw "$NEW_DST" \
  || { echo "  ✖ 挂载未生效"; exit 1; }
echo "  ✓ 挂载已生效"

echo "  验证容器内可见..."
docker exec nginx ls -d "$NEW_DST" >/dev/null 2>&1 \
  || { echo "  ✖ 容器内看不到 $NEW_DST"; exit 1; }
echo "  ✓ 容器内可见 $NEW_DST"

echo "  验证 nginx 配置..."
docker exec nginx nginx -t 2>&1 | tail -1

echo "  验证各站点恢复..."
# ★ 域名列表从 conf.d **动态扫描**，不硬编码：
#   硬编码的清单会漏掉「以后新加的站点」—— 而那种遗漏是静默的：
#   重建后新站点挂了，脚本却报「全部正常」。
#   注意只取 server_name 里的第一个名字（一个 server 块可以有多个别名，
#   但主名才是我们要测的），并排除 default_server 的通配符 `_`。
#
# ★★ `tr -d '\r'` 不能省 ★★
#   conf.d 下的文件是 **CRLF 行尾**（实测 `cat -A` 显示 `_;^M$`）。
#   不剔掉 CR 的话，取出的会是 `_\r` 而不是 `_`，
#   `grep -v '^_$'` 就匹配不上 —— 于是 `_` 被当成一个域名去 curl，
#   而那会请求到 default_server（返回 444/301），被误判为「站点挂了」。
#   （同一个 CRLF 坑在 sed 插入挂载时也踩过一次，见 remote-init.sh。）
DOMAINS=$(grep -rhE '^\s*server_name\s' "$WEB_DIR/conf.d/" 2>/dev/null \
  | tr -d '\r' \
  | sed 's/#.*//' | awk '{for(i=2;i<=NF;i++) print $i}' \
  | tr -d ';' | grep -v '^_$' | grep -v '^\$' | sort -u)
[ -n "$DOMAINS" ] || { echo "  ✖ 未能从 conf.d 扫到任何域名"; exit 1; }
FAIL=0
for h in $DOMAINS; do
  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "Host: $h" http://127.0.0.1/ || echo 000)
  printf '    %-28s %s\n' "$h" "$c"
  # 301/302/308 都算正常（各站点策略不同：有的全站跳 https）
  case "$c" in 200|301|302|308) ;; *) FAIL=1 ;; esac
done
if [ "$FAIL" = "1" ]; then
  echo "  ✖ 有站点未恢复，请检查：docker logs nginx"
  echo "    备份：$BK（内含 nginx-inspect.json 与 docker-compose.yml）"
  exit 1
fi
echo "  ✓ 各站点正常"

echo "  备份保留在：$BK"
REMOTE

# 变量替换（避免 heredoc 里再做一层展开）
vps "sed -i 's|__WEB_DIR__|$WEB_DIR|g; s|__NEW_SRC__|$NEW_SRC|g; s|__NEW_DST__|$NEW_DST|g; s|__DRY__|$DRY|g' /tmp/jpstage-attach.sh && bash /tmp/jpstage-attach.sh" 600
