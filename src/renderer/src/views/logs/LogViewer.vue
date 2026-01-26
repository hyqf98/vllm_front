<script setup>
import { ref, onMounted, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useModelServiceStore } from '@renderer/store/modelServiceStore'
import { useServerStore } from '@renderer/store/serverStore'
import { ElMessage } from 'element-plus'
import { Refresh, Download, Loading, Search, ArrowDown, Folder, Document } from '@element-plus/icons-vue'

const route = useRoute()
const serviceStore = useModelServiceStore()
const serverStore = useServerStore()

const logMode = ref('service') // 'service' 或 'custom'
const selectedServiceId = ref('')
const customServerId = ref('')
const customLogPath = ref('')
const logContent = ref('')
const loading = ref(false)
const autoRefresh = ref(true)
const refreshInterval = ref(null)
const logLines = ref(100)

// 日志滚动容器引用
const logContainer = ref(null)

// 关键字过滤
const filterKeyword = ref('')
const filteredLogContent = ref('')
const showFilterInput = ref(false)

// 远程文件浏览
const browsingFiles = ref(false)
const fileDialogVisible = ref(false)
const currentPath = ref('/')
const fileList = ref([])

// 服务列表（过滤掉引用不存在服务器的服务）
const services = computed(() => {
  return serviceStore.services.filter(service => {
    // 检查服务关联的服务器是否存在
    const serverExists = servers.value.some(s => s.id === service.serverId)
    if (!serverExists) {
      console.warn(`服务 ${service.name} 引用了不存在的服务器: ${service.serverId}`)
    }
    return serverExists
  })
})
const servers = computed(() => serverStore.servers)

const selectedService = computed(() =>
  serviceStore.services.find((s) => s.id === selectedServiceId.value)
)

// 过滤后的日志内容
const displayLogContent = computed(() => {
  if (!filterKeyword.value) {
    return logContent.value
  }
  return filteredLogContent.value || logContent.value
})

// 监听日志模式变化
watch(logMode, () => {
  logContent.value = ''
  filteredLogContent.value = ''
  filterKeyword.value = ''
  stopAutoRefresh()
})

// 监听选中服务变化
watch(selectedServiceId, async (newId) => {
  if (newId && logMode.value === 'service') {
    // 等待下一帧，确保服务数据已加载
    await nextTick()
    await fetchLogs()
  }
})

// 监听自定义日志参数变化
watch([customServerId, customLogPath], async () => {
  if (logMode.value === 'custom' && customServerId.value && customLogPath.value) {
    await fetchLogs()
  }
})

// 监听日志内容变化，自动滚动到底部
watch(logContent, async () => {
  await nextTick()
  scrollToBottom()
})

// 监听自动刷新开关
watch(autoRefresh, (enabled) => {
  if (enabled) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

// 滚动到底部
const scrollToBottom = () => {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

onMounted(async () => {
  // 加载服务和服务器列表
  serviceStore.loadServices()
  serverStore.loadServers()

  // 等待一帧确保数据已更新
  await nextTick()

  // 检查路由参数，如果有 serviceId，自动选中该服务
  const routeServiceId = route.query.serviceId
  if (routeServiceId) {
    logMode.value = 'service'
    selectedServiceId.value = routeServiceId
    // 手动触发获取日志
    await fetchLogs()
  } else if (services.value.length > 0) {
    // 否则默认选中第一个服务
    logMode.value = 'service'
    selectedServiceId.value = services.value[0].id
    // 手动触发获取日志
    await fetchLogs()
  }

  // 默认启动自动刷新
  if (autoRefresh.value) {
    startAutoRefresh()
  }
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})

// 过滤日志
const filterLogs = () => {
  if (!filterKeyword.value.trim()) {
    filteredLogContent.value = logContent.value
    return
  }

  const keyword = filterKeyword.value.toLowerCase()
  const lines = logContent.value.split('\n')
  const filteredLines = lines.filter(line => line.toLowerCase().includes(keyword))

  if (filteredLines.length > 0) {
    filteredLogContent.value = filteredLines.join('\n')
    ElMessage.success(`找到 ${filteredLines.length} 条匹配日志`)
  } else {
    filteredLogContent.value = '未找到匹配的日志'
    ElMessage.warning('未找到匹配的日志')
  }
}

// 清空过滤
const clearFilter = () => {
  filterKeyword.value = ''
  filteredLogContent.value = ''
}

// 监听过滤关键字变化
watch(filterKeyword, () => {
  if (!filterKeyword.value) {
    filteredLogContent.value = ''
  }
})

// 获取日志
const fetchLogs = async () => {
  loading.value = true

  try {
    let serverId, logPath

    if (logMode.value === 'service') {
      if (!selectedService.value) {
        return
      }
      serverId = selectedService.value.serverId
      logPath = selectedService.value.logPath
    } else {
      if (!customServerId.value || !customLogPath.value) {
        ElMessage.warning('请选择服务器并输入日志路径')
        return
      }
      serverId = customServerId.value
      logPath = customLogPath.value
    }

    // 主进程会自动处理连接
    const result = await window.api.log.read(serverId, logPath, logLines.value)

    if (result.success) {
      logContent.value = result.content || '暂无日志内容'
    } else {
      ElMessage.error(`读取日志失败: ${result.error}`)
      logContent.value = `错误: ${result.error}`
    }
  } catch (error) {
    ElMessage.error(`读取日志失败: ${error.message}`)
    logContent.value = `错误: ${error.message}`
  } finally {
    loading.value = false
  }
}

// 开始自动刷新
const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshInterval.value = setInterval(() => {
    fetchLogs()
  }, 3000) // 每3秒刷新一次
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
  }
}

// 下载日志
const downloadLog = () => {
  if (!logContent.value) {
    ElMessage.warning('暂无日志内容')
    return
  }

  const blob = new Blob([logContent.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedService.value.name}_log_${new Date().getTime()}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  ElMessage.success('日志已下载')
}

// 清空日志显示
const clearLogDisplay = () => {
  logContent.value = ''
  ElMessage.success('已清空日志显示')
}

// 获取服务状态显示文本
const getServiceStatusText = (service) => {
  const statusMap = {
    stopped: '已停止',
    starting: '启动中',
    running: '运行中',
    stopping: '停止中',
    error: '错误'
  }
  return statusMap[service.status] || '未知'
}

// 浏览远程日志文件
const browseRemoteFiles = async () => {
  if (!customServerId.value) {
    ElMessage.warning('请先选择服务器')
    return
  }

  // 获取服务器信息
  const server = servers.value.find(s => s.id === customServerId.value)
  if (!server) {
    ElMessage.error('服务器信息不存在')
    return
  }

  // 主进程会自动处理连接
  // 打开对话框并加载根目录
  currentPath.value = '/'
  fileDialogVisible.value = true
  await loadDirectoryContents('/')
}

// 加载目录内容
const loadDirectoryContents = async (path) => {
  browsingFiles.value = true
  try {
    const result = await window.api.ssh.listDirectory(customServerId.value, path)

    if (result.success && result.data && result.data.items && result.data.items.length > 0) {
      const { items } = result.data

      // 目录在前，文件在后，分别排序
      const dirs = items.filter(item => item.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
      const files = items.filter(item => !item.isDirectory).sort((a, b) => a.name.localeCompare(b.name))

      fileList.value = [...dirs, ...files].map(item => {
        const fullPath = path === '/' || path.endsWith('/') ? `${path}${item.name}` : `${path}/${item.name}`
        return {
          name: item.name,
          fullPath: fullPath,
          isDir: item.isDirectory
        }
      })
    } else {
      fileList.value = []
      ElMessage.info('目录为空')
    }
  } catch (error) {
    ElMessage.error(`浏览目录失败: ${error.message}`)
    fileList.value = []
  } finally {
    browsingFiles.value = false
  }
}

// 导航到目录
const navigateToDirectory = async (item) => {
  if (item.isDir) {
    currentPath.value = item.fullPath
    await loadDirectoryContents(item.fullPath)
  }
}

// 文件行双击事件
const handleRowDblClick = async (item) => {
  if (item.isDir) {
    currentPath.value = item.fullPath
    await loadDirectoryContents(item.fullPath)
  }
}

// 文件行单击事件
const handleRowClick = async (item) => {
  if (item.isDir) {
    currentPath.value = item.fullPath
    await loadDirectoryContents(item.fullPath)
  }
}

// 向上一级目录
const navigateUp = async () => {
  if (currentPath.value === '/') return

  const parentPath = currentPath.value.split('/').slice(0, -1).join('/') || '/'
  currentPath.value = parentPath
  await loadDirectoryContents(parentPath)
}

// 选择文件
const selectFile = (item) => {
  if (item.isDir) {
    // 如果是目录，进入目录
    currentPath.value = item.fullPath
    loadDirectoryContents(item.fullPath)
  } else {
    // 选择文件作为日志路径
    customLogPath.value = item.fullPath
    fileDialogVisible.value = false
  }
}
</script>

<template>
  <div class="log-viewer">
    <!-- 控制栏 -->
    <el-card class="control-bar" shadow="never">
      <div class="mode-selector">
        <el-radio-group v-model="logMode">
          <el-radio label="service">模型服务日志</el-radio>
          <el-radio label="custom">自定义日志文件</el-radio>
        </el-radio-group>
      </div>

      <div class="controls">
        <div class="left-controls">
          <!-- 模型服务模式 -->
          <template v-if="logMode === 'service'">
            <el-select
              v-model="selectedServiceId"
              placeholder="请选择服务"
              style="width: 300px"
            >
              <el-option
                v-for="service in services"
                :key="service.id"
                :label="`${service.name} (${service.framework}) - ${getServiceStatusText(service)}`"
                :value="service.id"
              />
            </el-select>
          </template>

          <!-- 自定义日志模式 -->
          <template v-else>
            <el-select
              v-model="customServerId"
              placeholder="请选择服务器"
              style="width: 200px"
            >
              <el-option
                v-for="server in servers"
                :key="server.id"
                :label="server.name"
                :value="server.id"
              />
            </el-select>
            <el-input
              v-model="customLogPath"
              placeholder="请输入日志文件路径，例如：/tmp/model.log"
              style="width: 400px"
            >
              <template #append>
                <el-button
                  :icon="Folder"
                  @click="browseRemoteFiles"
                  :loading="browsingFiles"
                >
                  浏览
                </el-button>
              </template>
            </el-input>
          </template>

          <el-input-number
            v-model="logLines"
            :min="10"
            :max="1000"
            :step="50"
            controls-position="right"
            style="width: 150px"
          />
          <span class="label">行</span>
        </div>

        <div class="right-controls">
          <!-- 关键字过滤 -->
          <el-button
            :icon="Search"
            @click="showFilterInput = !showFilterInput"
          >
            过滤
          </el-button>

          <el-switch
            v-model="autoRefresh"
            active-text="自动刷新"
            inactive-text="手动刷新"
          />

          <el-button
            :icon="Refresh"
            :loading="loading"
            @click="fetchLogs"
          >
            刷新
          </el-button>

          <el-button
            :icon="Download"
            @click="downloadLog"
          >
            下载日志
          </el-button>

          <el-button @click="clearLogDisplay">
            清空显示
          </el-button>

          <el-button
            :icon="ArrowDown"
            @click="scrollToBottom"
            title="滚动到底部"
          >
            底部
          </el-button>
        </div>
      </div>

      <!-- 关键字过滤输入框 -->
      <div v-if="showFilterInput" class="filter-bar">
        <el-input
          v-model="filterKeyword"
          placeholder="输入关键字过滤日志..."
          style="width: 400px"
          clearable
          @clear="clearFilter"
          @keyup.enter="filterLogs"
        >
          <template #append>
            <el-button :icon="Search" @click="filterLogs">过滤</el-button>
          </template>
        </el-input>
        <el-tag v-if="filterKeyword" type="info" style="margin-left: 12px">
          过滤模式: {{ filterKeyword }}
        </el-tag>
        <el-button v-if="filterKeyword" size="small" style="margin-left: 8px" @click="clearFilter">
          清除过滤
        </el-button>
      </div>

      <!-- 服务信息 -->
      <div v-if="logMode === 'service' && selectedService" class="service-info">
        <el-tag size="small" type="success">{{ selectedService.framework.toUpperCase() }}</el-tag>
        <span class="info-text">日志路径: {{ selectedService.logPath }}</span>
        <el-tag v-if="autoRefresh" size="small" type="warning">自动刷新中...</el-tag>
      </div>

      <!-- 自定义日志信息 -->
      <div v-if="logMode === 'custom' && customServerId && customLogPath" class="service-info">
        <el-tag size="small" type="primary">自定义日志</el-tag>
        <span class="info-text">日志路径: {{ customLogPath }}</span>
        <el-tag v-if="autoRefresh" size="small" type="warning">自动刷新中...</el-tag>
      </div>
    </el-card>

    <!-- 日志内容区 -->
    <el-card class="log-content-card" shadow="never">
      <div v-if="logMode === 'service' && !selectedServiceId" class="empty-state">
        <el-empty description="请选择一个服务查看日志" />
      </div>

      <div v-else-if="logMode === 'custom' && (!customServerId || !customLogPath)" class="empty-state">
        <el-empty description="请选择服务器并输入日志文件路径" />
      </div>

      <div v-else-if="loading && !logContent" class="loading-state">
        <el-icon class="is-loading" size="40">
          <Loading />
        </el-icon>
        <p>加载日志中...</p>
      </div>

      <div v-else class="log-content" ref="logContainer">
        <pre>{{ displayLogContent }}</pre>
      </div>
    </el-card>

    <!-- 文件浏览对话框 -->
    <el-dialog
      v-model="fileDialogVisible"
      :title="`选择日志文件 - ${currentPath}`"
      width="700px"
    >
      <div class="path-navigation">
        <el-button
          :icon="Folder"
          @click="navigateUp"
          :disabled="currentPath === '/'"
          size="small"
          style="margin-right: 8px;"
        >
          上级目录
        </el-button>
        <span class="current-path">当前路径: {{ currentPath }}</span>
      </div>
      <el-divider />
      <el-scrollbar height="450px">
        <el-empty v-if="fileList.length === 0" description="目录为空" />
        <el-table
          v-else
          :data="fileList"
          @row-dblclick="handleRowDblClick"
          @row-click="handleRowClick"
          style="width: 100%"
          row-key="name"
        >
          <el-table-column prop="name" label="名称" width="350">
            <template #default="{ row }">
              <div class="file-item">
                <el-icon :size="16" style="margin-right: 8px;">
                  <Folder v-if="row.isDir" />
                  <Document v-else />
                </el-icon>
                <span>{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="fullPath" label="完整路径" />
          <el-table-column label="类型" width="80">
            <template #default="{ row }">
              <el-tag :type="row.isDir ? 'warning' : 'success'" size="small">
                {{ row.isDir ? '目录' : '文件' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button
                type="primary"
                size="small"
                @click.stop="selectFile(row)"
              >
                {{ row.isDir ? '进入' : '选择' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-scrollbar>
      <template #footer>
        <el-button @click="fileDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 140px);

  .control-bar {
    .mode-selector {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f0f0f0;
    }

    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .left-controls,
      .right-controls {
        display: flex;
        align-items: center;
        gap: 12px;

        .label {
          color: #606266;
          font-size: 14px;
        }
      }
    }

    .service-info {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 12px;
      border-top: 1px solid #f0f0f0;

      .info-text {
        color: #606266;
        font-size: 13px;
      }
    }

    .filter-bar {
      display: flex;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid #f0f0f0;
    }
  }

  .log-content-card {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    :deep(.el-card__body) {
      flex: 1;
      overflow: hidden;
      padding: 0;
    }

    .empty-state {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .loading-state {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;

      p {
        color: #909399;
        font-size: 14px;
      }
    }

    .log-content {
      height: 100%;
      overflow: auto;
      background: #1e1e1e;
      padding: 16px;

      pre {
        margin: 0;
        font-family: 'Courier New', 'Consolas', monospace;
        font-size: 13px;
        line-height: 1.6;
        color: #d4d4d4;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
    }
  }
}

.path-navigation {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.current-path {
  font-size: 14px;
  color: #606266;
  word-break: break-all;
}

.file-item {
  display: flex;
  align-items: center;
  cursor: pointer;
}
</style>
