#!/bin/bash

################################################################################
# Linux 系统信息收集脚本
# 功能：一次性获取系统、CPU、内存、磁盘、GPU 等所有信息
# 输出格式：JSON
################################################################################

# 辅助函数：将字符串转义为 JSON 安全格式
json_escape() {
    local string="$1"
    # 转义反斜杠、双引号、换行符等
    string="${string//\\/\\\\}"
    string="${string//\"/\\\"}"
    string="${string//$'\n'/\\n}"
    string="${string//$'\r'/\\r}"
    string="${string//$'\t'/\\t}"
    printf '%s' "$string"
}

# 辅助函数：解析磁盘大小为字节
disk_to_bytes() {
    local size="$1"
    local num=$(echo "$size" | grep -oE '[0-9.]+')
    local unit=$(echo "$size" | grep -oE '[KMGTP]i?' | tail -1)

    if [ -z "$num" ]; then
        echo 0
        return
    fi

    case "$unit" in
        K|Ki) awk "BEGIN {printf \"%.0f\", $num * 1024}" ;;
        M|Mi) awk "BEGIN {printf \"%.0f\", $num * 1024 * 1024}" ;;
        G|Gi) awk "BEGIN {printf \"%.0f\", $num * 1024 * 1024 * 1024}" ;;
        T|Ti) awk "BEGIN {printf \"%.0f\", $num * 1024 * 1024 * 1024 * 1024}" ;;
        P|Pi) awk "BEGIN {printf \"%.0f\", $num * 1024 * 1024 * 1024 * 1024 * 1024}" ;;
        *)     awk "BEGIN {printf \"%.0f\", $num}" ;;
    esac
}

# 开始 JSON 输出
printf '{\n'
printf '"timestamp": "%s",\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

################################################################################
# 1. 系统信息
################################################################################
printf '"system": {\n'
if [ -f /etc/os-release ]; then
    NAME=$(grep "^PRETTY_NAME=" /etc/os-release | cut -d'"' -f2)
    ID=$(grep "^ID=" /etc/os-release | cut -d'"' -f2)
    VERSION=$(grep "^VERSION_ID=" /etc/os-release | cut -d'"' -f2)
    printf '"name": "%s",\n' "$(json_escape "$NAME")"
    printf '"id": "%s",\n' "$(json_escape "$ID")"
    printf '"version": "%s",\n' "$(json_escape "$VERSION")"
else
    printf '"name": "CentOS",\n'
    printf '"id": "centos",\n'
    printf '"version": "unknown",\n'
fi
printf '"kernel": "%s",\n' "$(uname -r)"
printf '"architecture": "%s",\n' "$(uname -m)"
printf '"hostname": "%s"\n' "$(hostname)"
printf '},\n'

################################################################################
# 2. CPU 信息
################################################################################
printf '"cpu": {\n'

# CPU 型号：优先从 lscpu 获取，失败则从 /proc/cpuinfo 获取
MODEL=$(LC_ALL=C lscpu 2>/dev/null | grep "^Model name:" | sed 's/Model name:\s*//' | sed 's/^\s*//;s/\s*$//')
if [ -z "$MODEL" ] || [ "$MODEL" = "" ]; then
    MODEL=$(cat /proc/cpuinfo 2>/dev/null | grep "model name" | head -1 | sed 's/model name\s*:\s*//' | sed 's/^\s*//;s/\s*$//')
fi
MODEL=${MODEL:-"Unknown CPU"}
printf '"model": "%s",\n' "$(json_escape "$MODEL")"

# CPU 核心数：优先从 lscpu 获取，失败则从 /proc/cpuinfo 计数
CORES=$(LC_ALL=C lscpu 2>/dev/null | grep "^CPU(s):" | awk '{print $2}')
if [ -z "$CORES" ] || [ "$CORES" = "" ]; then
    CORES=$(grep -c "^processor" /proc/cpuinfo 2>/dev/null)
fi
CORES=${CORES:-"0"}
printf '"cores": %s,\n' "$CORES"

# 每个插槽的核心数
CORES_PER_SOCKET=$(LC_ALL=C lscpu 2>/dev/null | grep "^Core(s) per socket:" | awk '{print $4}')
CORES_PER_SOCKET=${CORES_PER_SOCKET:-"$CORES"}
printf '"coresPerSocket": %s,\n' "$CORES_PER_SOCKET"

# 插槽数
SOCKETS=$(LC_ALL=C lscpu 2>/dev/null | grep "^Socket(s):" | awk '{print $2}')
SOCKETS=${SOCKETS:-"1"}
printf '"sockets": %s,\n' "$SOCKETS"

# 每核心线程数
THREADS_PER_CORE=$(LC_ALL=C lscpu 2>/dev/null | grep "^Thread(s) per core:" | awk '{print $4}')
if [ -z "$THREADS_PER_CORE" ] || [ "$THREADS_PER_CORE" = "" ] || [ "$THREADS_PER_CORE" = "0" ]; then
    # 从 /proc/cpuinfo 获取 siblings 和 cpu cores
    SIBLINGS=$(grep "^siblings" /proc/cpuinfo 2>/dev/null | head -1 | awk '{print $3}')
    CPU_CORES=$(grep "^cpu cores" /proc/cpuinfo 2>/dev/null | head -1 | awk '{print $4}')
    if [ -n "$SIBLITS" ] && [ -n "$CPU_CORES" ] && [ "$CPU_CORES" -gt 0 ]; then
        THREADS_PER_CORE=$((SIBLINGS / CPU_CORES))
    else
        THREADS_PER_CORE="1"
    fi
fi
THREADS_PER_CORE=${THREADS_PER_CORE:-"1"}
printf '"threadsPerCore": %s,\n' "$THREADS_PER_CORE"

TOTAL_THREADS=$((CORES_PER_SOCKET * SOCKETS * THREADS_PER_CORE))
printf '"threads": %s,\n' "$TOTAL_THREADS"

# CPU 架构
ARCH=$(LC_ALL=C lscpu 2>/dev/null | grep "^Architecture:" | awk '{print $2}')
if [ -z "$ARCH" ] || [ "$ARCH" = "" ]; then
    ARCH=$(uname -m)
fi
ARCH=${ARCH:-"unknown"}
printf '"architecture": "%s",\n' "$(json_escape "$ARCH")"

# CPU 频率：优先从 lscpu 获取，失败则从 /proc/cpuinfo 获取
MHZ=$(LC_ALL=C lscpu 2>/dev/null | grep "^CPU MHz:" | awk '{print $3}')
if [ -z "$MHZ" ] || [ "$MHZ" = "" ]; then
    MHZ=$(grep "cpu MHz" /proc/cpuinfo 2>/dev/null | head -1 | awk '{print $4}')
fi
if [ -n "$MHZ" ] && [ "$MHZ" != "" ]; then
    GHZ=$(awk "BEGIN {printf \"%.2f\", $MHZ/1000}")
    printf '"frequency": "%s",\n' "$GHZ"
else
    printf '"frequency": "",\n'
fi

# CPU 最大频率
MAX_MHZ=$(LC_ALL=C lscpu 2>/dev/null | grep "^CPU max MHz:" | awk '{print $4}')
if [ -n "$MAX_MHZ" ] && [ "$MAX_MHZ" != "" ]; then
    MAX_GHZ=$(awk "BEGIN {printf \"%.2f\", $MAX_MHZ/1000}")
    printf '"maxFrequency": "%s",\n' "$MAX_GHZ"
else
    printf '"maxFrequency": "",\n'
fi

# CPU 最小频率
MIN_MHZ=$(LC_ALL=C lscpu 2>/dev/null | grep "^CPU min MHz:" | awk '{print $4}')
if [ -n "$MIN_MHZ" ] && [ "$MIN_MHZ" != "" ]; then
    MIN_GHZ=$(awk "BEGIN {printf \"%.2f\", $MIN_MHZ/1000}")
    printf '"minFrequency": "%s",\n' "$MIN_GHZ"
else
    printf '"minFrequency": "",\n'
fi

# CPU 使用率（强制使用英文环境）
CPU_USAGE=$(LC_ALL=C top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
CPU_USAGE=${CPU_USAGE:-"0"}
printf '"usagePercent": %s,\n' "$CPU_USAGE"

# CPU 温度
CPU_TEMP=""
if command -v sensors >/dev/null 2>&1; then
    CPU_TEMP=$(sensors -j 2>/dev/null | grep -o '"Package id 0"[^}]*' | grep -o '"temp[0-9]*_input":[0-9.]*' | head -1 | cut -d':' -f2)
    if [ -z "$CPU_TEMP" ]; then
        CPU_TEMP=$(sensors -j 2>/dev/null | grep -o '"Core 0"[^}]*' | grep -o '"temp[0-9]*_input":[0-9.]*' | head -1 | cut -d':' -f2)
    fi
fi
if [ -n "$CPU_TEMP" ]; then
    CPU_TEMP_INT=$(awk "BEGIN {printf \"%.0f\", $CPU_TEMP}")
    printf '"temperature": %s\n' "$CPU_TEMP_INT"
else
    printf '"temperature": null\n'
fi
printf '},\n'

################################################################################
# 3. 内存信息
################################################################################
printf '"memory": {\n'
MEM_TOTAL_KB=$(cat /proc/meminfo 2>/dev/null | grep "^MemTotal:" | awk '{print $2}')
MEM_AVAILABLE_KB=$(cat /proc/meminfo 2>/dev/null | grep "^MemAvailable:" | awk '{print $2}')
MEM_FREE_KB=$(cat /proc/meminfo 2>/dev/null | grep "^MemFree:" | awk '{print $2}')

MEM_TOTAL=$((MEM_TOTAL_KB * 1024))
MEM_FREE=$((MEM_FREE_KB * 1024))

if [ -n "$MEM_AVAILABLE_KB" ] && [ "$MEM_AVAILABLE_KB" -gt 0 ]; then
    MEM_AVAILABLE=$((MEM_AVAILABLE_KB * 1024))
    MEM_USED=$((MEM_TOTAL - MEM_AVAILABLE))
else
    MEM_AVAILABLE=$MEM_FREE
    MEM_USED=$((MEM_TOTAL - MEM_FREE))
fi

printf '"total": %s,\n' "$MEM_TOTAL"
printf '"used": %s,\n' "$MEM_USED"
printf '"available": %s,\n' "$MEM_AVAILABLE"
printf '"free": %s,\n' "$MEM_FREE"

if [ "$MEM_TOTAL" -gt 0 ]; then
    USAGE=$(awk "BEGIN {printf \"%.1f\", ($MEM_USED/$MEM_TOTAL)*100}")
    printf '"usagePercent": %s\n' "$USAGE"
else
    printf '"usagePercent": 0\n'
fi
printf '},\n'

################################################################################
# 4. 磁盘信息
################################################################################
printf '"disks": [\n'

# 使用临时文件存储磁盘信息（强制使用英文环境）
DF_TEMP=$(mktemp)
LC_ALL=C df -h 2>/dev/null > "$DF_TEMP"

DISK_COUNT=0
while read filesystem size used avail percent mount; do
    # 跳过标题行
    [ "$filesystem" = "Filesystem" ] && continue
    # 跳过特殊文件系统
    case "$filesystem" in
        tmpfs|devtmpfs|overlay|none|udev|rootfs) continue ;;
    esac
    # 跳过特殊挂载点
    case "$mount" in
        /proc|/sys|/dev|/run|/tmp|/var/run|/snap*) continue ;;
    esac

    TOTAL_BYTES=$(disk_to_bytes "$size")
    USED_BYTES=$(disk_to_bytes "$used")
    AVAIL_BYTES=$(disk_to_bytes "$avail")
    PERCENT_NUM=$(echo "$percent" | tr -d '%')

    if [ $DISK_COUNT -gt 0 ]; then
        printf ',\n'
    fi
    DISK_COUNT=$((DISK_COUNT + 1))

    printf '{\n'
    printf '"device": "%s",\n' "$(json_escape "$filesystem")"
    printf '"mount": "%s",\n' "$(json_escape "$mount")"
    printf '"path": "%s",\n' "$(json_escape "$mount")"
    printf '"total": %s,\n' "$TOTAL_BYTES"
    printf '"used": %s,\n' "$USED_BYTES"
    printf '"free": %s,\n' "$AVAIL_BYTES"
    printf '"usagePercent": %s\n' "${PERCENT_NUM:-0}"
    printf '}'
done < "$DF_TEMP"

rm -f "$DF_TEMP"
printf '\n],\n'

################################################################################
# 5. GPU 信息
################################################################################
printf '"gpus": [\n'
if command -v nvidia-smi >/dev/null 2>&1; then
    # 使用临时文件存储 GPU 信息（强制使用英文环境）
    GPU_TEMP=$(mktemp)
    LC_ALL=C nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,fan.speed \
        --format=csv,noheader,nounits 2>/dev/null > "$GPU_TEMP"

    GPU_COUNT=0
    while IFS=, read -r idx name mem_total mem_used gpu_util mem_util temp power_draw power_limit fan; do
        if [ $GPU_COUNT -gt 0 ]; then
            printf ',\n'
        fi
        GPU_COUNT=$((GPU_COUNT + 1))

        name=$(echo "$name" | xargs)

        # 清理数值：移除 [N/A] 和其他非数字内容
        mem_total=$(echo "$mem_total" | xargs | sed 's/\[N\/A\]/0/g' | grep -oE '[0-9]+') || echo "0"
        mem_used=$(echo "$mem_used" | xargs | sed 's/\[N\/A\]/0/g' | grep -oE '[0-9]+') || echo "0"
        gpu_util=$(echo "$gpu_util" | xargs | sed 's/\[N\/A\]/0/g' | grep -oE '[0-9]+') || echo "0"
        temp=$(echo "$temp" | xargs | sed 's/\[N\/A\]/0/g' | grep -oE '[0-9]+') || echo "0"
        power_draw=$(echo "$power_draw" | xargs | sed 's/\[N\/A\]/0/g' | grep -oE '[0-9]+' | head -1) || echo "0"
        power_limit=$(echo "$power_limit" | xargs | sed 's/\[N\/A\]/0/g' | grep -oE '[0-9]+' | head -1) || echo "0"
        fan=$(echo "$fan" | xargs | sed 's/\[N\/A\]/0/g' | grep -oE '[0-9]+') || echo "0"

        printf '{\n'
        printf '"id": %s,\n' "${idx:-0}"
        printf '"name": "%s",\n' "$(json_escape "$name")"
        printf '"memoryTotal": %s,\n' "$((mem_total * 1024 * 1024))"
        printf '"memoryUsed": %s,\n' "$((mem_used * 1024 * 1024))"
        if [ "$mem_total" -gt 0 ]; then
            MEM_PERCENT=$(awk "BEGIN {printf \"%.0f\", ($mem_used/$mem_total)*100}")
            printf '"memoryUsagePercent": %s,\n' "$MEM_PERCENT"
        else
            printf '"memoryUsagePercent": 0,\n'
        fi
        printf '"gpuUtil": %s,\n' "${gpu_util}"
        printf '"temperature": %s,\n' "${temp}"
        printf '"powerDraw": %s,\n' "${power_draw}"
        printf '"powerLimit": %s,\n' "${power_limit}"
        printf '"fanSpeed": %s\n' "${fan}"
        printf '}'
    done < "$GPU_TEMP"

    rm -f "$GPU_TEMP"
    printf '\n'
fi
printf ']\n'

# 结束 JSON
printf '}\n'
