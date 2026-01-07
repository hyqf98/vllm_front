<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleClose, Download } from '@element-plus/icons-vue'
import { useModelHubStore } from '@renderer/store/modelHubStore'
import { useServerStore } from '@renderer/store/serverStore'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'close'])

const modelHubStore = useModelHubStore()
const serverStore = useServerStore()

// 是否显示详细信息
const showDetailDialog = ref(false)
const selectedTask = ref(null)

// 从 store 计算正在下载的任务（响应式）
const minimizedTasks = computed(() => {
  return modelHubStore.downloadTasks.filter(
    task => task.status === 'downloading'
  )
})

// 加载下载任务
const loadTasks = async () => {
  await modelHubStore.loadDownloadTasks()
}

// 获取服务器名称
const getServerName = (serverId) => {
  const server = serverStore.servers.find(s => s.id === serverId)
  return server?.name || '未知服务器'
}

// 恢复下载对话框
const handleRestore = (task) => {
  selectedTask.value = task
  showDetailDialog.value = true
}

// 停止下载
const handleStop = async (task) => {
  try {
    await modelHubStore.cancelDownload(task.id)
    ElMessage.success('已取消下载')
    await loadTasks()
  } catch (error) {
    ElMessage.error(`取消下载失败: ${error.message}`)
  }
}

// 组件挂载时加载任务
onMounted(async () => {
  await loadTasks()
})

// 监听 downloadTasks 变化，自动刷新
watch(() => modelHubStore.downloadTasks, (newTasks) => {
  console.log('[MinimizedDownloads] 下载任务更新:', newTasks.length)
}, { deep: true })
</script>

<template>
  <!-- 最小化下载面板 - 右上角 -->
  <Transition name="panel-fade">
    <div v-if="visible" class="minimized-downloads-panel">
      <!-- 面板头部 -->
      <div class="panel-header">
        <div class="panel-title">
          <el-icon><Download /></el-icon>
          <span>下载管理 ({{ minimizedTasks.length }})</span>
        </div>
        <el-button
          size="small"
          :icon="CircleClose"
          circle
          @click="emit('update:visible', false)"
        />
      </div>

      <TransitionGroup name="download-card" tag="div" class="downloads-list">
        <div
          v-for="task in minimizedTasks"
          :key="task.id"
          class="download-card"
          @click="handleRestore(task)"
        >
          <div class="card-header">
            <div class="model-info">
              <span class="platform-tag" :class="task.platform">
                {{ task.platform === 'modelscope' ? 'MS' : 'HF' }}
              </span>
              <span class="model-name">{{ task.modelId?.split('/').pop() || task.modelId }}</span>
            </div>
            <div class="card-actions" @click.stop>
              <el-button
                size="small"
                type="danger"
                :icon="CircleClose"
                circle
                @click="handleStop(task)"
              />
            </div>
          </div>

          <div class="card-progress">
            <el-progress
              :percentage="task.progress || 0"
              :show-text="false"
              :stroke-width="3"
            />
            <div class="progress-info">
              <span class="percentage">{{ task.progress || 0 }}%</span>
              <span class="server-name">{{ getServerName(task.serverId) }}</span>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <!-- 空状态 -->
      <div v-if="minimizedTasks.length === 0" class="empty-state">
        <el-empty description="暂无下载任务" :image-size="60" />
      </div>
    </div>
  </Transition>

  <!-- 详情对话框 -->
  <el-dialog
    v-model="showDetailDialog"
    :title="`下载详情 - ${selectedTask?.modelId?.split('/').pop()}`"
    width="700px"
    @closed="selectedTask = null"
  >
    <div v-if="selectedTask" class="task-detail">
      <div class="detail-info">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="模型">
            {{ selectedTask.modelId }}
          </el-descriptions-item>
          <el-descriptions-item label="平台">
            {{ selectedTask.platform.toUpperCase() }}
          </el-descriptions-item>
          <el-descriptions-item label="服务器">
            {{ getServerName(selectedTask.serverId) }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="selectedTask.status === 'downloading' ? 'primary' : 'info'">
              {{ selectedTask.status === 'downloading' ? '下载中' : selectedTask.status }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="进度" :span="2">
            {{ selectedTask.progress || 0 }}%
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="detail-logs">
        <div class="logs-header">日志</div>
        <el-scrollbar height="300px">
          <div
            v-for="(log, index) in (selectedTask.logs || []).slice(-100)"
            :key="index"
            class="log-line"
          >
            <span class="log-time">{{ new Date(log.timestamp).toLocaleTimeString() }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
          <div v-if="!selectedTask.logs || selectedTask.logs.length === 0" class="log-empty">
            暂无日志
          </div>
        </el-scrollbar>
      </div>
    </div>

    <template #footer>
      <el-button @click="showDetailDialog = false">关闭</el-button>
      <el-button type="primary" @click="showDetailDialog = false">恢复下载对话框</el-button>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
.minimized-downloads-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 320px;
  max-height: 600px;
  overflow-y: auto;
  z-index: 1000;
  pointer-events: auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 1px solid #e4e7ed;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

  .panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: white;

    .el-icon {
      font-size: 18px;
    }
  }

  :deep(.el-button) {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
}

.downloads-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.download-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #e4e7ed;

  &:hover {
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.platform-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;

  &.modelscope {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  &.huggingface {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
  }
}

.model-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  flex-shrink: 0;
}

.card-progress {
  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;

    .percentage {
      font-size: 13px;
      font-weight: 600;
      color: #409eff;
    }

    .server-name {
      font-size: 11px;
      color: #909399;
    }
  }
}

.empty-state {
  padding: 20px;
}

.task-detail {
  .detail-info {
    margin-bottom: 20px;
  }

  .detail-logs {
    .logs-header {
      font-size: 14px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 12px;
    }

    .log-line {
      font-size: 12px;
      padding: 6px 0;
      border-bottom: 1px solid #f5f7fa;
      display: flex;
      gap: 12px;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;

      .log-time {
        color: #909399;
        flex-shrink: 0;
      }

      .log-message {
        color: #606266;
        word-break: break-all;
        flex: 1;
      }
    }

    .log-empty {
      text-align: center;
      color: #909399;
      padding: 40px 0;
    }
  }
}

// 动画
.download-card-enter-active,
.download-card-leave-active {
  transition: all 0.3s ease;
}

.download-card-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.download-card-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.download-card-move {
  transition: transform 0.3s ease;
}

// 面板淡入淡出动画
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: all 0.3s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}
</style>
