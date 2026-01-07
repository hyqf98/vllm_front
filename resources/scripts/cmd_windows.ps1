# Windows 系统信息收集脚本
# 功能：一次性获取系统、CPU、内存、磁盘、GPU 等所有信息
# 输出格式：JSON

# 辅助函数：转义 JSON 字符串
function ConvertTo-JsonString {
    param([string]$str)
    $str -replace '\\', '\\' -replace '"', '\"' -replace "`n", '\n' -replace "`r", '\r' -replace "`t", '\t'
}

# 辅助函数：解析大小字符串为字节
function ConvertTo-Bytes {
    param([string]$sizeStr)
    if ($sizeStr -match '([\d.]+)\s*(KB|MB|GB|TB)?') {
        $value = [double]$matches[1]
        $unit = $matches[2]
        switch ($unit) {
            "KB" { return [int64]($value * 1KB) }
            "MB" { return [int64]($value * 1MB) }
            "GB" { return [int64]($value * 1GB) }
            "TB" { return [int64]($value * 1TB) }
            default { return [int64]$value }
        }
    }
    return 0
}

# 开始构建 JSON
$json = @{}
$json.timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# 1. 系统信息
$os = Get-CimInstance -ClassName Win32_OperatingSystem
$json.system = @{
    name = "$($os.Caption)"
    id = "windows"
    version = "$($os.Version)"
    kernel = "$($os.BuildNumber)"
    architecture = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "x86" }
    hostname = $env:COMPUTERNAME
}

# 2. CPU 信息
$cpu = Get-CimInstance -ClassName Win32_Processor
$json.cpu = @{
    model = $cpu.Name
    cores = $cpu.NumberOfCores
    coresPerSocket = $cpu.NumberOfCores
    sockets = if ($cpu.SocketDesignation) { 1 } else { 1 }
    threadsPerCore = $cpu.NumberOfLogicalProcessors / $cpu.NumberOfCores
    threads = $cpu.NumberOfLogicalProcessors
    architecture = $cpu.Architecture
    frequency = if ($cpu.MaxClockSpeed) { "{0:N2}" -f ($cpu.MaxClockSpeed / 1000) } else { "" }
    maxFrequency = if ($cpu.MaxClockSpeed) { "{0:N2}" -f ($cpu.MaxClockSpeed / 1000) } else { "" }
    minFrequency = ""
    usagePercent = 0  # 需要通过性能计数器获取
    temperature = $null
}

# 3. 内存信息
$memory = Get-CimInstance -ClassName Win32_PhysicalMemory
$memTotal = ($memory | Measure-Object -Property Capacity -Sum).Sum
$osMemory = Get-CimInstance -ClassName Win32_OperatingSystem
$memFree = $osMemory.FreePhysicalMemory * 1KB
$memUsed = $memTotal - $memFree

$json.memory = @{
    total = [int64]$memTotal
    used = [int64]$memUsed
    available = [int64]$memFree
    free = [int64]$memFree
    usagePercent = if ($memTotal -gt 0) { [math]::Round(($memUsed / $memTotal) * 100, 1) } else { 0 }
}

# 4. 磁盘信息
$disks = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
$json.disks = @($disks | ForEach-Object {
    $totalBytes = $_.Size
    $freeBytes = $_.FreeSpace
    $usedBytes = $totalBytes - $freeBytes

    @{
        device = $_.DeviceID
        mount = $_.DeviceID
        path = $_.DeviceID
        total = [int64]$totalBytes
        used = [int64]$usedBytes
        free = [int64]$freeBytes
        usagePercent = if ($totalBytes -gt 0) { [math]::Round(($usedBytes / $totalBytes) * 100) } else { 0 }
    }
})

# 5. GPU 信息
$gpus = @()
try {
    $nvidiaGpus = & nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit,fan.speed --format=csv,noheader,nounits 2>$null
    if ($?) {
        $nvidiaGpus | ForEach-Object {
            $parts = $_.split(',')
            if ($parts.Count -ge 9) {
                $gpus += @{
                    id = [int]$parts[0].Trim()
                    name = $parts[1].Trim()
                    memoryTotal = [int64]$parts[2].Trim() * 1MB
                    memoryUsed = [int64]$parts[3].Trim() * 1MB
                    memoryUsagePercent = if ([int]$parts[2] -gt 0) { [math]::Round(([int]$parts[3] / [int]$parts[2]) * 100) } else { 0 }
                    gpuUtil = [int]$parts[4].Trim()
                    temperature = [int]$parts[5].Trim()
                    powerDraw = [double]$parts[6].Trim()
                    powerLimit = [double]$parts[7].Trim()
                    fanSpeed = [int]$parts[8].Trim()
                    vendor = "nvidia"
                }
            }
        }
    } else {
        # 尝试使用 WMI 获取 GPU 信息
        $wmiGpus = Get-CimInstance -ClassName Win32_VideoController
        $gpus = @($wmiGpus | ForEach-Object {
            @{
                id = 0
                name = $_.Name
                memoryTotal = if ($_.AdapterRAM) { [int64]$_.AdapterRAM } else { 0 }
                memoryUsed = 0
                memoryUsagePercent = 0
                gpuUtil = 0
                temperature = 0
                powerDraw = 0
                powerLimit = 0
                fanSpeed = 0
                vendor = "unknown"
            }
        })
    }
} catch {
    # 如果 nvidia-smi 不可用，使用 WMI
    $wmiGpus = Get-CimInstance -ClassName Win32_VideoController
    $gpus = @($wmiGpus | ForEach-Object {
        @{
            id = 0
            name = $_.Name
            memoryTotal = if ($_.AdapterRAM) { [int64]$_.AdapterRAM } else { 0 }
            memoryUsed = 0
            memoryUsagePercent = 0
            gpuUtil = 0
            temperature = 0
            powerDraw = 0
            powerLimit = 0
            fanSpeed = 0
            vendor = "unknown"
        }
    })
}

$json.gpus = $gpus

# 输出 JSON
$json | ConvertTo-Json -Depth 10
