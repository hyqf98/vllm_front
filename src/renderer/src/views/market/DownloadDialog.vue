<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import { useModelHubStore } from '@renderer/store/modelHubStore'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: Boolean,
  model: Object,
  platform: String
})

const emit = defineEmits(['update:visible', 'minimized', 'stopped'])

const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()
const modelHubStore = useModelHubStore()

const formData = ref({
  serverId: '',
  environmentId: '',
  installPath: ''
})

const checkingCommand = ref(false)
const commandCheckResult = ref({
  modelscope: false,
  huggingface: false
})

const downloading = ref(false)
const downloadProgress = ref({
  percentage: 0,
  logs: [],
  status: 'pending'
})

const currentTaskId = ref(null)

// 所有环境列表（过滤掉引用不存在服务器的环境）
const allEnvironments = computed(() => {
  return environmentStore.environments.filter(env => {
    const serverExists = serverStore.servers.some(s => s.id === env.serverId)
    if (!serverExists) {
      console.warn(`环境 ${env.name} 引用了不存在的服务器: ${env.serverId}`)
    }
    return serverExists
  })
})

// 当前选中的环境
const selectedEnvironment = computed(() => {
  return environmentStore.getEnvironmentById(formData.value.environmentId)
})

// 当前选中的服务器
const selectedServer = computed(() => {
  if (!selectedEnvironment.value) return null
  return serverStore.servers.find(s => s.id === selectedEnvironment.value.serverId)
})

// 是否可以下载
const canDownload = computed(() => {
  const hasServer = !!formData.value.serverId
  const hasEnv = !!formData.value.environmentId
  const hasPath = !!formData.value.installPath
  return hasServer && hasEnv && hasPath
})

// 获取模型名称
const getModelName = computed(() => {
  if (!props.model) return ''
  return props.model.name || props.model.modelId || props.model.id || ''
})

// 监听环境变化，自动检测命令
watch(() => formData.value.environmentId, async (newEnvId) => {
  if (newEnvId && props.platform && selectedEnvironment.value && selectedServer.value) {
    await checkDownloadCommand()
  } else if (newEnvId && !selectedServer.value) {
    // 环境存在但服务器不存在（脏数据）
    console.warn(`环境 ${newEnvId} 引用的服务器不存在`)
    ElMessage.warning('所选环境的服务器不存在，请重新选择')
    formData.value.environmentId = ''
    commandCheckResult.value[props.platform] = false
  }
})

// 监听服务器变化，清空环境选择（已在模板中处理，这里作为额外保险）
watch(() => formData.value.serverId, (newServerId) => {
  if (newServerId) {
    // 如果之前选择的环境不属于新服务器，清空环境
    if (formData.value.environmentId) {
      const env = environmentStore.getEnvironmentById(formData.value.environmentId)
      if (env && env.serverId !== newServerId) {
        formData.value.environmentId = ''
        commandCheckResult.value[props.platform] = false
      }
    }
  }
})

// 检测下载命令
const checkDownloadCommand = async () => {
  const env = selectedEnvironment.value
  const server = selectedServer.value

  if (!env || !server) return

  checkingCommand.value = true
  commandCheckResult.value[props.platform] = false

  try {
    // 主进程会自动处理连接
    // 检测命令
    const commandToCheck = props.platform === 'modelscope' ? 'modelscope' : 'huggingface-cli'

    const result = await window.api.modelHub.checkCommand(
      server.id,
      env.type,
      env.name,
      commandToCheck
    )
    commandCheckResult.value[props.platform] = result.exists

    if (!result.exists) {
      ElMessage.warning({
        message: `未检测到 ${commandToCheck} 命令，可能需要先安装`,
        duration: 3000
      })
    } else {
      ElMessage.success({
        message: `检测到 ${commandToCheck} 命令`,
        duration: 2000
      })
    }
  } catch (error) {
    console.error('检测命令失败:', error)
  } finally {
    checkingCommand.value = false
  }
}

// 开始下载
const handleStartDownload = async () => {
  if (!canDownload.value) {
    ElMessage.warning('请完善下载配置')
    return
  }

  downloading.value = true
  downloadProgress.value = {
    percentage: 0,
    logs: [],
    status: 'downloading'
  }

  try {
    // 获取环境信息
    const env = selectedEnvironment.value
    if (!env) {
      ElMessage.error('环境信息不存在')
      downloading.value = false
      return
    }

    const downloadConfig = {
      serverId: formData.value.serverId,
      environmentId: formData.value.environmentId,
      envType: env.type,          // 环境类型: conda | uv | system
      envName: env.name,          // 环境名称
      platform: props.platform,
      modelId: props.model.modelId || props.model.id,
      installPath: formData.value.installPath
    }

    // 创建下载任务
    const taskId = await modelHubStore.startDownload(downloadConfig)
    currentTaskId.value = taskId
    console.log('任务ID：' + taskId);
    

    // 调用后端开始下载
    const result = await window.api.modelHub.startDownload({
      ...downloadConfig,
      downloadId: taskId
    })

    if (result.success) {
      ElMessage.success('下载任务已启动')
      setupProgressListener(taskId)
    } else {
      ElMessage.error(`下载失败: ${result.error}`)
      downloading.value = false
    }
  } catch (error) {
    ElMessage.error(`下载失败: ${error.message}`)
    downloading.value = false
  }
}

// 最小化对话框
const handleMinimize = () => {
  emit('update:visible', false)
  emit('minimized', {
    taskId: currentTaskId.value?.id || currentTaskId.value,
    modelId: props.model.modelId || props.model.id,
    modelName: getModelName.value,
    platform: props.platform,
    serverId: formData.value.serverId,
    environmentId: formData.value.environmentId
  })
}

// 停止下载
const handleStop = async () => {
  if (!currentTaskId.value) return

  const taskId = typeof currentTaskId.value === 'object' ? currentTaskId.value.id : currentTaskId.value

  try {
    // 调用后端取消下载
    await window.api.modelHub.cancelDownload(formData.value.serverId, props.model.modelId || props.model.id)
    ElMessage.info('已取消下载')
    downloading.value = false
    downloadProgress.value.status = 'cancelled'
    emit('stopped', { taskId })
    emit('update:visible', false)
  } catch (error) {
    ElMessage.error(`取消下载失败: ${error.message}`)
  }
}

// 设置进度监听
const setupProgressListener = (taskId) => {
  // 监听进度事件
  const progressHandler = (event, data) => {
    downloadProgress.value.percentage = data.percentage
    modelHubStore.updateDownloadProgress(taskId, data)

    if (data.status === 'completed') {
      downloading.value = false
      ElMessage.success('下载完成!')
      // 延迟关闭对话框
      setTimeout(() => {
        emit('update:visible', false)
      }, 1500)
    } else if (data.status === 'error') {
      downloading.value = false
      ElMessage.error('下载出错，请查看日志')
    }
  }

  // 监听日志事件
  const logHandler = (event, data) => {
    console.log('[DownloadDialog] 收到日志事件:', data)
    console.log('[DownloadDialog] 当前日志数量:', downloadProgress.value.logs.length)
    downloadProgress.value.logs.push(data.log)
    console.log('[DownloadDialog] 添加日志后数量:', downloadProgress.value.logs.length)
    modelHubStore.updateDownloadProgress(taskId, { log: data.log })
  }

  console.log('[DownloadDialog] 设置监听器, taskId:', taskId)
  console.log('[DownloadDialog] 监听事件名:', `download:log:${taskId}`, `download:progress:${taskId}`)

  window.electron.ipcRenderer.on(`download:progress:${taskId}`, progressHandler)
  window.electron.ipcRenderer.on(`download:log:${taskId}`, logHandler)

  console.log('[DownloadDialog] 监听器已设置，当前监听器数量:', window.electron.ipcRenderer.listenerCount(`download:log:${taskId}`))

  // 保存处理器引用用于清理
  currentTaskId.value = {
    id: taskId,
    progressHandler,
    logHandler
  }
}

// 清理监听器
const cleanupListeners = () => {
  if (currentTaskId.value && typeof currentTaskId.value === 'object') {
    const { id, progressHandler, logHandler } = currentTaskId.value
    window.electron.ipcRenderer.removeListener(`download:progress:${id}`, progressHandler)
    window.electron.ipcRenderer.removeListener(`download:log:${id}`, logHandler)
  }
  currentTaskId.value = null
}

// 重置表单
const resetForm = () => {
  formData.value = {
    serverId: '',
    environmentId: '',
    installPath: ''
  }
  commandCheckResult.value = {
    modelscope: false,
    huggingface: false
  }
  downloadProgress.value = {
    percentage: 0,
    logs: [],
    status: 'pending'
  }
  cleanupListeners()
}

watch(() => props.visible, async (visible) => {
  if (visible) {
    // 对话框打开时，加载最新的数据
    await serverStore.loadServers()
    await environmentStore.loadEnvironments()

    // 自动清理脏数据（引用不存在服务器的环境）
    const validServerIds = serverStore.servers.map(s => s.id)
    const cleanedCount = await environmentStore.cleanOrphanEnvironments(validServerIds)

    if (cleanedCount > 0) {
      console.log(`自动清理了 ${cleanedCount} 个孤立环境`)
    }
  } else {
    resetForm()
  }
})

onUnmounted(() => {
  cleanupListeners()
})

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="下载模型"
    width="700px"
    @update:model-value="emit('update:visible', $event)"
    :close-on-click-modal="!downloading"
  >
    <el-form :model="formData" label-width="100px" :disabled="downloading">
      <el-form-item label="模型">
        <el-input :value="getModelName" disabled />
      </el-form-item>

      <el-form-item label="平台">
        <el-input :value="platform.toUpperCase()" disabled />
      </el-form-item>

      <el-form-item label="服务器">
        <el-select
          v-model="formData.serverId"
          placeholder="请选择服务器"
          style="width: 100%"
          @change="formData.environmentId = ''; commandCheckResult[platform] = false"
        >
          <el-option
            v-for="server in serverStore.servers"
            :key="server.id"
            :label="server.name"
            :value="server.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="环境">
        <el-select
          v-model="formData.environmentId"
          placeholder="请选择环境"
          style="width: 100%"
          :loading="checkingCommand"
        >
          <el-option
            v-for="env in allEnvironments.filter(e => e.serverId === formData.serverId)"
            :key="env.id"
            :label="`${env.name} (${env.type})`"
            :value="env.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="安装路径">
        <el-input
          v-model="formData.installPath"
          placeholder="例如: /data/models/qwen-7b"
        />
        <div class="form-tip">
          模型将下载到指定目录
        </div>
      </el-form-item>

      <!-- 命令检测结果 -->
      <div class="command-check">
        <el-alert
          :type="commandCheckResult[platform] ? 'success' : 'warning'"
          :title="commandCheckResult[platform]
            ? `检测到 ${platform === 'modelscope' ? 'modelscope' : 'huggingface-cli'} 命令`
            : `未检测到 ${platform === 'modelscope' ? 'modelscope' : 'huggingface-cli'} 命令，下载可能失败`"
          :closable="false"
          show-icon
        />
      </div>

      <!-- 下载日志 -->
      <div v-if="downloading" class="download-progress">
        <div class="download-logs">
          <div class="logs-header">下载日志</div>
          <el-scrollbar height="300px">
            <div
              v-for="(log, index) in downloadProgress.logs.slice(-100)"
              :key="index"
              class="log-line"
            >
              {{ log }}
            </div>
            <div v-if="downloadProgress.logs.length === 0" class="log-empty">
              等待日志输出...
            </div>
          </el-scrollbar>
        </div>
      </div>
    </el-form>

    <template #footer>
      <!-- 非下载状态 -->
      <template v-if="!downloading">
        <el-button @click="emit('update:visible', false)">
          取消
        </el-button>
        <el-button
          type="primary"
          :disabled="!canDownload"
          @click="handleStartDownload"
        >
          开始下载
        </el-button>
      </template>

      <!-- 下载状态 -->
      <template v-else>
        <el-button @click="handleStop" type="danger">
          停止下载
        </el-button>
        <el-button @click="handleMinimize">
          最小化
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.command-check {
  margin-bottom: 16px;
}

.download-progress {
  margin-top: 20px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;

  .download-logs {
    .logs-header {
      font-size: 14px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 12px;
    }

    .log-line {
      font-size: 12px;
      color: #606266;
      padding: 4px 0;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.5;
    }

    .log-empty {
      font-size: 12px;
      color: #909399;
      text-align: center;
      padding: 40px 0;
    }
  }
}
</style>
