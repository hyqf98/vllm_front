<template>
  <el-dialog
    v-model="dialogVisible"
    :title="`GPU 进程管理 - ${serverName}`"
    width="900px"
    @close="handleClose"
  >
    <!-- 显卡类型和操作栏 -->
    <div class="gpu-header">
      <div class="gpu-info">
        <el-tag v-if="gpuType" :type="getGPUTypeTag(gpuType)" size="large">
          {{ getGPUTypeLabel(gpuType) }}
        </el-tag>
        <el-tag v-else type="info" size="large">检测中...</el-tag>
        <span v-if="!loading && processes.length > 0" class="process-count">
          共 {{ processes.length }} 个进程
        </span>
      </div>
      <el-button
        :icon="Refresh"
        :loading="loading"
        @click="refreshProcesses"
        size="small"
      >
        刷新
      </el-button>
    </div>

    <el-divider />

    <!-- 进程列表 -->
    <div class="process-content">
      <!-- 加载状态 -->
      <div v-if="loading && processes.length === 0" class="loading-state">
        <el-icon class="is-loading" :size="32">
          <Loading />
        </el-icon>
        <p>正在检测显卡并加载进程信息...</p>
      </div>

      <!-- 无显卡状态 -->
      <div v-else-if="!gpuType && !loading" class="empty-state">
        <el-empty description="未检测到支持的显卡">
          <p class="empty-hint">支持的显卡类型: NVIDIA (nvidia-smi), AMD (rocm-smi), Intel (intel_gpu_top)</p>
        </el-empty>
      </div>

      <!-- 无进程状态 -->
      <div v-else-if="processes.length === 0 && !loading" class="empty-state">
        <el-empty description="当前没有 GPU 进程在运行" />
      </div>

      <!-- 进程表格 -->
      <div v-else class="process-table-container">
        <el-table
          :data="processes"
          v-loading="loading && processes.length > 0"
          @selection-change="handleSelectionChange"
          row-key="pid"
          stripe
          style="width: 100%"
        >
          <el-table-column type="selection" width="50" />
          <el-table-column prop="pid" label="进程 ID" width="100" />
          <el-table-column label="显存占用" width="150">
            <template #default="{ row }">
              <span :class="getMemoryClass(row.memoryUsed)">
                {{ row.memoryFormatted }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="user" label="用户" width="120" />
          <el-table-column prop="gpuId" label="GPU" width="80">
            <template #default="{ row }">
              <el-tag size="small" type="info">GPU {{ row.gpuId }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="command" label="进程命令" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button
                type="danger"
                size="small"
                :icon="Delete"
                @click="handleKillProcess(row)"
              >
                终止
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <template #footer>
      <div class="dialog-footer">
        <div class="selected-info">
          <span v-if="selectedPids.length > 0" class="selected-count">
            已选择 {{ selectedPids.length }} 个进程
          </span>
        </div>
        <div class="footer-actions">
          <el-button
            v-if="selectedPids.length > 0"
            type="danger"
            :icon="Delete"
            :loading="killing"
            @click="handleKillBatch"
          >
            批量终止选中 ({{ selectedPids.length }})
          </el-button>
          <el-button @click="handleClose" :disabled="killing">
            关闭
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Loading, Delete } from '@element-plus/icons-vue'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  serverId: {
    type: String,
    required: true
  },
  serverName: {
    type: String,
    default: '服务器'
  },
  gpus: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible'])

// 状态
const loading = ref(false)
const killing = ref(false)
const processes = ref([])
const selectedPids = ref([])
const gpuType = ref('')

// 对话框显示状态
const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 监听对话框显示状态
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadProcesses()
  } else {
    // 关闭时清空数据
    processes.value = []
    selectedPids.value = []
    gpuType.value = ''
  }
})

// 加载进程列表
const loadProcesses = async () => {
  loading.value = true
  processes.value = []
  gpuType.value = ''

  try {
    const result = await window.api.gpu.getProcesses(props.serverId)

    if (result.success) {
      gpuType.value = result.gpuType
      processes.value = result.processes || []

      if (processes.value.length === 0) {
        ElMessage.info('当前没有 GPU 进程在运行')
      } else {
        ElMessage.success(`加载到 ${processes.value.length} 个 GPU 进程`)
      }
    } else {
      ElMessage.error(`获取进程失败: ${result.error || '未知错误'}`)
    }
  } catch (error) {
    ElMessage.error(`获取进程失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// 刷新进程列表
const refreshProcesses = () => {
  loadProcesses()
}

// 处理选择变化
const handleSelectionChange = (selection) => {
  selectedPids.value = selection.map(p => p.pid)
}

// 终止单个进程
const handleKillProcess = async (process) => {
  try {
    await ElMessageBox.confirm(
      `确定要终止进程 ${process.pid} 吗？\n\n进程命令: ${process.command}\n显存占用: ${process.memoryFormatted}\n\n⚠️ 警告: 终止进程可能导致数据丢失！`,
      '确认终止进程',
      {
        confirmButtonText: '确定终止',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true
      }
    )

    killing.value = true
    const result = await window.api.gpu.killProcess(props.serverId, process.pid)

    if (result.success) {
      ElMessage.success(`进程 ${process.pid} 已终止`)
      // 刷新列表
      await loadProcesses()
    } else {
      ElMessage.error(`终止进程失败: ${result.error || '未知错误'}`)
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(`终止进程失败: ${error.message}`)
    }
  } finally {
    killing.value = false
  }
}

// 批量终止进程
const handleKillBatch = async () => {
  if (selectedPids.value.length === 0) {
    ElMessage.warning('请先选择要终止的进程')
    return
  }

  // 限制批量操作数量
  if (selectedPids.value.length > 20) {
    ElMessage.warning('单次最多只能终止 20 个进程')
    return
  }

  try {
    const selectedProcesses = processes.value.filter(p => selectedPids.value.includes(p.pid))
    const processInfo = selectedProcesses.map(p =>
      `PID ${p.pid}: ${p.command} (${p.memoryFormatted})`
    ).join('\n')

    await ElMessageBox.confirm(
      `确定要终止以下 ${selectedPids.value.length} 个进程吗？\n\n${processInfo}\n\n⚠️ 警告: 批量终止进程可能导致数据丢失！`,
      '确认批量终止进程',
      {
        confirmButtonText: '确定终止',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true
      }
    )

    killing.value = true
    const result = await window.api.gpu.killBatchProcesses(props.serverId, selectedPids.value)

    if (result.success) {
      const { killed = [], failed = [] } = result

      if (killed.length > 0) {
        ElMessage.success(`成功终止 ${killed.length} 个进程${failed.length > 0 ? `，${failed.length} 个失败` : ''}`)
      }

      if (failed.length > 0) {
        ElMessage.warning(`以下进程终止失败: ${failed.join(', ')}`)
      }

      // 刷新列表
      await loadProcesses()
    } else {
      ElMessage.error(`批量终止失败: ${result.error || '未知错误'}`)
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(`批量终止失败: ${error.message}`)
    }
  } finally {
    killing.value = false
  }
}

// 关闭对话框
const handleClose = () => {
  if (killing.value) {
    ElMessage.warning('正在终止进程，请稍候...')
    return
  }
  dialogVisible.value = false
}

// 获取显卡类型标签类型
const getGPUTypeTag = (type) => {
  const tagMap = {
    nvidia: 'success',
    amd: 'danger',
    intel: 'warning'
  }
  return tagMap[type] || 'info'
}

// 获取显卡类型标签文本
const getGPUTypeLabel = (type) => {
  const labelMap = {
    nvidia: 'NVIDIA',
    amd: 'AMD',
    intel: 'Intel'
  }
  return labelMap[type] || type.toUpperCase()
}

// 获取显存占用样式类
const getMemoryClass = (memoryUsed) => {
  if (!memoryUsed) return ''
  // 将字节转换为 GB
  const gb = memoryUsed / (1024 * 1024 * 1024)
  if (gb > 10) return 'memory-high'
  if (gb > 5) return 'memory-medium'
  return 'memory-normal'
}

onMounted(() => {
  if (props.visible) {
    loadProcesses()
  }
})
</script>

<style lang="scss" scoped>
.gpu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .gpu-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .process-count {
      color: #606266;
      font-size: 14px;
    }
  }
}

.process-content {
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    gap: 16px;

    p {
      color: #909399;
      font-size: 14px;
      margin: 0;
    }
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 0;

    .empty-hint {
      color: #909399;
      font-size: 12px;
      margin-top: 12px;
    }
  }

  .process-table-container {
    :deep(.el-table) {
      font-size: 13px;
    }

    .memory-normal {
      color: #67c23a;
      font-weight: 500;
    }

    .memory-medium {
      color: #e6a23c;
      font-weight: 500;
    }

    .memory-high {
      color: #f56c6c;
      font-weight: 600;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .selected-info {
    .selected-count {
      color: #409eff;
      font-size: 14px;
      font-weight: 500;
    }
  }

  .footer-actions {
    display: flex;
    gap: 12px;
  }
}
</style>
