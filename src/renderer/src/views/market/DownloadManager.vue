<script setup>
import { ref, computed, onMounted } from 'vue'
import { useModelHubStore } from '@renderer/store/modelHubStore'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible'])

const modelHubStore = useModelHubStore()
const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()

const logDialogVisible = ref(false)
const currentLogs = ref([])

// 获取状态标签类型
const getStatusType = (status) => {
  const typeMap = {
    pending: 'info',
    downloading: 'primary',
    completed: 'success',
    error: 'danger',
    cancelled: 'warning'
  }
  return typeMap[status] || 'info'
}

// 获取状态文本
const getStatusText = (status) => {
  const textMap = {
    pending: '等待中',
    downloading: '下载中',
    completed: '已完成',
    error: '下载失败',
    cancelled: '已取消'
  }
  return textMap[status] || '未知'
}

// 获取服务器名称
const getServerName = (serverId) => {
  const server = serverStore.servers.find(s => s.id === serverId)
  return server?.name || '未知服务器'
}

// 获取环境名称
const getEnvironmentName = (envId) => {
  const env = environmentStore.getEnvironmentById(envId)
  return env?.name || '未知环境'
}

// 取消下载
const handleCancel = async (task) => {
  if (task.status !== 'downloading') {
    ElMessage.warning('只能取消正在下载的任务')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要取消下载 "${task.modelId}" 吗？`,
      '确认取消',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await modelHubStore.cancelDownload(task.id)
    ElMessage.success('下载已取消')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('取消下载失败')
    }
  }
}

// 重试下载
const handleRetry = async (task) => {
  if (task.status === 'downloading') {
    ElMessage.warning('任务正在下载中')
    return
  }

  try {
    const success = await modelHubStore.retryDownload(task.id)
    if (success) {
      ElMessage.success('重新开始下载')
    } else {
      ElMessage.error('重试失败')
    }
  } catch (error) {
    ElMessage.error('重试失败')
  }
}

// 查看日志
const handleViewLogs = (task) => {
  currentLogs.value = task.logs || []
  logDialogVisible.value = true
}

// 删除记录
const handleDelete = async (task) => {
  if (task.status === 'downloading') {
    ElMessage.warning('请先取消正在下载的任务')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除下载记录 "${task.modelId}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await modelHubStore.deleteDownloadTask(task.id)
    ElMessage.success('删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  modelHubStore.loadDownloadTasks()
})
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="下载管理"
    width="900px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="download-manager">
      <el-table :data="modelHubStore.downloadTasks" style="width: 100%" max-height="500">
        <el-table-column prop="modelId" label="模型" min-width="200">
          <template #default="{ row }">
            <div class="model-cell">
              <div class="model-id">{{ row.modelId }}</div>
              <el-tag :type="row.platform === 'modelscope' ? 'success' : 'primary'" size="small">
                {{ row.platform === 'modelscope' ? 'ModelScope' : 'HuggingFace' }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="服务器/环境" min-width="150">
          <template #default="{ row }">
            <div class="server-env">
              <div>{{ getServerName(row.serverId) }}</div>
              <div class="env-name">{{ getEnvironmentName(row.environmentId) }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="安装路径" prop="installPath" min-width="150" show-overflow-tooltip />

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="进度" width="120">
          <template #default="{ row }">
            <el-progress
              :percentage="row.progress"
              :status="row.status === 'error' ? 'exception' : row.status === 'completed' ? 'success' : ''"
              :stroke-width="8"
            />
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'downloading'"
              type="warning"
              size="small"
              @click="handleCancel(row)"
            >
              取消
            </el-button>
            <el-button
              v-if="row.status === 'error' || row.status === 'cancelled'"
              type="primary"
              size="small"
              @click="handleRetry(row)"
            >
              重试
            </el-button>
            <el-button
              size="small"
              @click="handleViewLogs(row)"
            >
              日志
            </el-button>
            <el-button
              v-if="row.status !== 'downloading'"
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-if="modelHubStore.downloadTasks.length === 0"
        description="暂无下载记录"
      />
    </div>

    <!-- 日志对话框 -->
    <el-dialog
      v-model="logDialogVisible"
      title="下载日志"
      width="700px"
      append-to-body
    >
      <el-scrollbar height="400px">
        <div class="log-content">
          <div v-if="currentLogs.length === 0" class="log-empty">
            暂无日志
          </div>
          <div
            v-for="(log, index) in currentLogs"
            :key="index"
            class="log-line"
          >
            {{ typeof log === 'string' ? log : log.message || log }}
          </div>
        </div>
      </el-scrollbar>
    </el-dialog>
  </el-dialog>
</template>

<style lang="scss" scoped>
.download-manager {
  .model-cell {
    display: flex;
    align-items: center;
    gap: 8px;

    .model-id {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .server-env {
    font-size: 13px;

    .env-name {
      font-size: 12px;
      color: #909399;
      margin-top: 4px;
    }
  }
}

.log-content {
  .log-line {
    font-size: 12px;
    color: #606266;
    padding: 4px 0;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .log-empty {
    text-align: center;
    color: #909399;
    padding: 40px 0;
  }
}
</style>
