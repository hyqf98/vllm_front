#!/bin/bash

################################################################################
# macOS (Darwin) 系统信息收集脚本
# 功能：一次性获取系统、CPU、内存、磁盘、GPU 等所有信息
# 输出格式：JSON
################################################################################

# 辅助函数：将字符串转义为 JSON 安全格式
json_escape() {
    local string="$1"
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
PRODUCT_NAME=$(sw_vers -productName 2>/dev/null || echo "macOS")
PRODUCT_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
BUILD_VERSION=$(sw_vers -buildVersion 2>/dev/null || echo "unknown")
printf '"name": "%s",\n' "$(json_escape "$PRODUCT_NAME $PRODUCT_VERSION")"
printf '"id": "darwin",\n'
printf '"version": "%s",\n' "$(json_escape "$PRODUCT_VERSION")"
printf '"kernel": "%s",\n' "$(uname -r)"
printf '"architecture": "%s",\n' "$(uname -m)"
printf '"hostname": "%s"\n' "$(hostname)"
printf '},\n'

################################################################################
# 2. CPU 信息
################################################################################
printf '"cpu": {\n'
MODEL=$(sysctl -n machdep.cpu.brand_string 2>/dev/null)
MODEL=${MODEL:-"Unknown CPU"}
printf '"model": "%s",\n' "$(json_escape "$MODEL")"

CORES=$(sysctl -n hw.ncpu 2>/dev/null)
CORES=${CORES:-"0"}
printf '"cores": %s,\n' "$CORES"

CORES_PER_SOCKET=$(sysctl -n hw.physicalcpu 2>/dev/null)
CORES_PER_SOCKET=${CORES_PER_SOCKET:-"$CORES"}
printf '"coresPerSocket": %s,\n' "$CORES_PER_SOCKET"

printf '"sockets": 1,\n'

THREADS=$(sysctl -n hw.logicalcpu 2>/dev/null)
THREADS=${THREADS:-"$CORES"}
THREADS_PER_CORE=$((THREADS / CORES_PER_SOCKET))
printf '"threadsPerCore": %s,\n' "$THREADS_PER_CORE"

printf '"threads": %s,\n' "$THREADS"

printf '"architecture": "%s",\n' "$(uname -m)"

# CPU 频率
MHZ=$(sysctl -n hw.cpufrequency 2>/dev/null)
if [ -n "$MHZ" ]; then
    GHZ=$(awk "BEGIN {printf \"%.2f\", $MHZ/1000000000}")
    printf '"frequency": "%s",\n' "$GHZ"
else
    printf '"frequency": "",\n'
fi
printf '"maxFrequency": "",\n'
printf '"minFrequency": "",\n'

# CPU 使用率（强制使用英文环境）
CPU_USAGE=$(LC_ALL=C top -l 1 2>/dev/null | grep "CPU usage" | awk '{print $3}' | cut -d'%' -f1)
CPU_USAGE=${CPU_USAGE:-"0"}
printf '"usagePercent": %s,\n' "$CPU_USAGE"

# CPU 温度 (macOS 需要 third-party 工具，这里设为 null)
printf '"temperature": null\n'
printf '},\n'

################################################################################
# 3. 内存信息
################################################################################
printf '"memory": {\n'
MEM_TOTAL=$(sysctl -n hw.memsize 2>/dev/null)
MEM_TOTAL=${MEM_TOTAL:-"0"}

# 使用 vm_stat 获取内存使用情况
VM_STAT=$(vm_stat 2>/dev/null)

# 从第一行提取页面大小
PAGE_SIZE=$(echo "$VM_STAT" | head -1 | sed 's/.*page size of //' | sed 's/ bytes.*//' | awk '{print $1}')
PAGE_SIZE=${PAGE_SIZE:-"4096"}

# 提取各类页面数量（vm_stat 输出格式: Pages free: 12345.）
FREE_PAGES=$(echo "$VM_STAT" | grep "Pages free" | awk '{print $3}' | sed 's/\.//' || echo "0")
FREE_PAGES=${FREE_PAGES:-"0"}

INACTIVE_PAGES=$(echo "$VM_STAT" | grep "Pages inactive" | awk '{print $3}' | sed 's/\.//' || echo "0")
INACTIVE_PAGES=${INACTIVE_PAGES:-"0"}

SPECULATIVE_PAGES=$(echo "$VM_STAT" | grep "Pages speculative" | awk '{print $3}' | sed 's/\.//' || echo "0")
SPECULATIVE_PAGES=${SPECULATIVE_PAGES:-"0"}

FREE_BYTES=$((FREE_PAGES * PAGE_SIZE))
INACTIVE_BYTES=$((INACTIVE_PAGES * PAGE_SIZE))
SPECULATIVE_BYTES=$((SPECULATIVE_PAGES * PAGE_SIZE))
AVAILABLE_BYTES=$((FREE_BYTES + INACTIVE_BYTES + SPECULATIVE_BYTES))
USED_BYTES=$((MEM_TOTAL - AVAILABLE_BYTES))

# 确保所有数值都是有效的
FREE_BYTES=${FREE_BYTES:-"0"}
AVAILABLE_BYTES=${AVAILABLE_BYTES:-"0"}
USED_BYTES=${USED_BYTES:-"0"}

printf '"total": %s,\n' "$MEM_TOTAL"
printf '"used": %s,\n' "$USED_BYTES"
printf '"available": %s,\n' "$AVAILABLE_BYTES"
printf '"free": %s,\n' "$FREE_BYTES"

if [ "$MEM_TOTAL" -gt 0 ]; then
    USAGE=$(awk "BEGIN {printf \"%.1f\", ($USED_BYTES/$MEM_TOTAL)*100}")
    printf '"usagePercent": %s\n' "$USAGE"
else
    printf '"usagePercent": 0\n'
fi
printf '},\n'

################################################################################
# 4. 磁盘信息
################################################################################
printf '"disks": [\n'

# 使用临时文件存储磁盘信息（macOS 需要特殊处理）
DF_TEMP=$(mktemp)
LC_ALL=C df -h 2>/dev/null > "$DF_TEMP"

DISK_COUNT=0
# 跳过标题行，然后使用 awk 处理每一行
tail -n +2 "$DF_TEMP" | while read -r line; do
    # 使用 awk 提取字段（macOS df 输出格式不同）
    filesystem=$(echo "$line" | awk '{print $1}')
    size=$(echo "$line" | awk '{print $2}')
    used=$(echo "$line" | awk '{print $3}')
    avail=$(echo "$line" | awk '{print $4}')
    capacity=$(echo "$line" | awk '{print $5}')
    mount=$(echo "$line" | awk '{print $9}')

    # 跳过特殊文件系统
    case "$filesystem" in
        devfs|tmpfs|overlay|none|map) continue ;;
    esac

    # 跳过特殊挂载点
    case "$mount" in
        /System/Volumes/*|/dev|/private|/automount|"") continue ;;
    esac

    # 跳过没有挂载点的行
    [ -z "$mount" ] && continue

    TOTAL_BYTES=$(disk_to_bytes "$size")
    USED_BYTES=$(disk_to_bytes "$used")
    AVAIL_BYTES=$(disk_to_bytes "$avail")
    PERCENT_NUM=$(echo "$capacity" | tr -d '%' | grep -oE '[0-9]+' | head -1)

    # 跳过无效的磁盘（总大小为0）
    [ "$TOTAL_BYTES" -le 0 ] && continue

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
done

rm -f "$DF_TEMP"
printf '\n],\n'

################################################################################
# 5. GPU 信息
################################################################################
printf '"gpus": [\n'
GPU_COUNT=0

# 使用 system_profiler 获取 GPU 信息
GPU_INFO=$(system_profiler SPDisplaysDataType 2>/dev/null)
if [ -n "$GPU_INFO" ]; then
    # 使用临时文件存储 GPU 名称列表
    GPU_NAMES_TEMP=$(mktemp)
    echo "$GPU_INFO" | grep "Chipset Model:" | sed 's/.*Chipset Model: //' > "$GPU_NAMES_TEMP"

    GPU_VRAM=$(echo "$GPU_INFO" | grep "VRAM:" | sed 's/.*VRAM: //' | sed 's/ *$//')

    GPU_ID=0
    while read GPU_NAME; do
        [ -z "$GPU_NAME" ] && continue

        if [ $GPU_COUNT -gt 0 ]; then
            printf ',\n'
        fi
        GPU_COUNT=$((GPU_COUNT + 1))

        # 判断 GPU 厂商
        VENDOR="unknown"
        case "$GPU_NAME" in
            *Apple*|*M1*|*M2*|*M3*) VENDOR="apple" ;;
            *AMD*|*Radeon*) VENDOR="amd" ;;
            *NVIDIA*) VENDOR="nvidia" ;;
            *Intel*) VENDOR="intel" ;;
        esac

        printf '{\n'
        printf '"id": %s,\n' "$GPU_ID"
        printf '"name": "%s",\n' "$(json_escape "$GPU_NAME")"
        printf '"vendor": "%s",\n' "$VENDOR"

        # 如果是 Apple Silicon，显示统一内存
        if [ "$VENDOR" = "apple" ]; then
            printf '"memoryTotal": %s,\n' "$MEM_TOTAL"
            printf '"memoryUsed": 0,\n'
            printf '"unifiedMemory": true,\n'
        else
            # 解析 VRAM
            VRAM_BYTES=$(echo "$GPU_VRAM" | head -1 | sed 's/ GB//;s/ MB//' | xargs)
            if echo "$GPU_VRAM" | grep -q "GB"; then
                VRAM_BYTES=$(awk "BEGIN {printf \"%.0f\", $VRAM_BYTES * 1024 * 1024 * 1024}")
            elif echo "$GPU_VRAM" | grep -q "MB"; then
                VRAM_BYTES=$(awk "BEGIN {printf \"%.0f\", $VRAM_BYTES * 1024 * 1024}")
            else
                VRAM_BYTES=0
            fi
            printf '"memoryTotal": %s,\n' "${VRAM_BYTES}"
            printf '"memoryUsed": 0,\n'
        fi
        printf '"memoryUsagePercent": 0,\n'
        printf '"gpuUtil": 0,\n'
        printf '"temperature": 0\n'
        printf '}'

        GPU_ID=$((GPU_ID + 1))
    done < "$GPU_NAMES_TEMP"

    rm -f "$GPU_NAMES_TEMP"
fi

printf '\n]\n'

# 结束 JSON
printf '}\n'
