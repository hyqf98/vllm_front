<script setup>
import { ref, onMounted, watch } from 'vue'
import { useModelHubStore } from '@renderer/store/modelHubStore'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import DownloadDialog from './DownloadDialog.vue'
import DownloadManager from './DownloadManager.vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download, Loading } from '@element-plus/icons-vue'

const modelHubStore = useModelHubStore()
const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()

const platform = ref('modelscope')
const allModels = ref([])
const loading = ref(false)
const searchQuery = ref('')
const downloadDialogVisible = ref(false)
const downloadManagerVisible = ref(false)
const detailDialogVisible = ref(false)
const selectedModel = ref(null)
const detailUrl = ref('')

// 分页相关
const currentPage = ref(1)
const pageSize = ref(30)
const total = ref(0)

// 监听平台切换
watch(platform, () => {
  currentPage.value = 1
  loadModels()
})

// 监听搜索变化（防抖）
let searchTimer = null
watch(searchQuery, () => {
  currentPage.value = 1
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadModels()
  }, 500)
})

// 加载模型列表（指定页）
const loadModels = async () => {
  loading.value = true
  try {
    const result = await modelHubStore.fetchModels(platform.value, {
      search: searchQuery.value || '',
      pageSize: pageSize.value,
      pageIndex: currentPage.value - 1  // 页码从0开始
    })

    allModels.value = result.data || []
    total.value = result.total || 0
  } catch (error) {
    ElMessage.error('加载模型列表失败')
    allModels.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// 搜索模型
const handleSearch = () => {
  clearTimeout(searchTimer)
  currentPage.value = 1
  loadModels()
}

// 页码变化
const handlePageChange = async (page) => {
  if (page < 1) page = 1
  currentPage.value = page
  await loadModels()

  // 滚动到顶部
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.scrollTop = 0
  }
}

// 点击下载按钮
const handleDownload = (model) => {
  selectedModel.value = model
  downloadDialogVisible.value = true
}

// 打开详情页面
const openDetailPage = (model) => {
  const modelId = model.modelId || model.id
  if (platform.value === 'modelscope') {
    detailUrl.value = `https://modelscope.cn/models/${modelId}`
  } else {
    detailUrl.value = `https://huggingface.co/${modelId}`
  }
  detailDialogVisible.value = true
}

// 打开下载管理器
const openDownloadManager = () => {
  downloadManagerVisible.value = true
}

// 任务类型图标映射
const taskIcons = {
  'text-generation': '💬',
  'text2text-generation': '💬',
  'text-to-image': '🎨',
  'image-generation': '🎨',
  'image-classification': '🖼️',
  'object-detection': '🎯',
  'image-segmentation': '✂️',
  'automatic-speech-recognition': '🎤',
  'text-to-speech': '🔊',
  'audio-classification': '🎵',
  'fill-mask': '🔮',
  'token-classification': '🏷️',
  'text-classification': '📝',
  'question-answering': '❓',
  'translation': '🌐',
  'summarization': '📋',
  'feature-extraction': '🔍',
  'reinforcement-learning': '🎮',
  'robotics': '🤖',
  'default': '🤖'
}

// 获取模型图标
const getModelIcon = (model) => {
  const task = model.task
  if (task) {
    const normalizedTask = task.toLowerCase().replace(/_/g, '-')
    return taskIcons[normalizedTask] || taskIcons[task] || taskIcons['default']
  }

  const modelId = (model.modelId || '').toLowerCase()
  if (modelId.includes('gpt') || modelId.includes('llama') || modelId.includes('qwen') || modelId.includes('chat')) return '💬'
  if (modelId.includes('stable-diffusion') || modelId.includes('sd-')) return '🎨'
  if (modelId.includes('whisper')) return '🎤'

  return platform.value === 'modelscope' ? '🚀' : '🤗'
}

// 获取模型名称
const getModelName = (model) => model.name || model.modelId || 'Unknown'

// 获取模型描述
const getModelDescription = (model) => model.description || '暂无描述'

// 获取下载量
const getDownloads = (model) => model.downloads || 0

// 格式化数字
const formatNumber = (num) => {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

onMounted(() => {
  loadModels()
  serverStore.loadServers()
  environmentStore.loadEnvironments()
  modelHubStore.loadDownloadTasks()
})
</script>

<template>
  <div class="model-market">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-radio-group v-model="platform" size="large">
        <el-radio-button value="modelscope">ModelScope</el-radio-button>
        <el-radio-button value="huggingface">HuggingFace</el-radio-button>
      </el-radio-group>

      <el-input
        v-model="searchQuery"
        placeholder="搜索模型..."
        :prefix-icon="Search"
        style="width: 300px"
        clearable
        @keyup.enter="handleSearch"
      />

      <el-button :icon="Search" @click="handleSearch">搜索</el-button>
      <el-button :icon="Refresh" @click="loadModels">刷新</el-button>

      <div style="flex: 1"></div>

      <el-button :icon="Download" @click="openDownloadManager">
        下载管理
        <el-badge
          v-if="modelHubStore.downloadTasks.length > 0"
          :value="modelHubStore.downloadTasks.filter(t => t.status === 'downloading').length"
          class="download-badge"
        />
      </el-button>
    </div>

    <!-- 模型卡片网格 -->
    <div class="content-area">
      <!-- Loading 指示器 -->
      <div v-if="loading" class="loading-indicator">
        <el-icon class="is-loading" :size="20">
          <Loading />
        </el-icon>
        <span>加载中...</span>
      </div>

      <div class="models-grid-container">
        <div :class="['models-grid', { 'is-empty': !loading && allModels.length === 0 }]">
          <el-empty v-if="!loading && allModels.length === 0" description="暂无模型数据">
            <el-button type="primary" @click="loadModels">重新加载</el-button>
          </el-empty>

          <div
            v-for="(model, index) in allModels"
            :key="`${model.id || model.modelId}-${currentPage}-${index}`"
            class="model-card"
            @click="openDetailPage(model)"
          >
            <div class="card-header">
              <div class="model-icon">
                <img v-if="model.avatar" :src="model.avatar" :alt="getModelName(model)" class="avatar-img" />
                <span v-else>{{ getModelIcon(model) }}</span>
              </div>
              <div class="model-info">
                <div class="model-name">{{ getModelName(model) }}</div>
                <div class="model-id">{{ model.modelId || model.id }}</div>
              </div>
            </div>

            <el-divider style="margin: 12px 0" />

            <div class="card-body">
              <div class="model-description">
                {{ getModelDescription(model) || '暂无描述' }}
              </div>

              <div class="model-stats">
                <div class="stat-item">
                  <span class="stat-icon">⬇️</span>
                  <span class="stat-value">{{ formatNumber(getDownloads(model)) }}</span>
                </div>
                <div v-if="model.likes" class="stat-item">
                  <span class="stat-icon">👍</span>
                  <span class="stat-value">{{ formatNumber(model.likes) }}</span>
                </div>
              </div>
            </div>

            <div class="card-footer">
              <el-button
                type="primary"
                size="small"
                :icon="Download"
                @click.stop="handleDownload(model)"
              >
                下载模型
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="total > 0" class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next, jumper"
          :small="false"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <!-- 下载对话框 -->
    <DownloadDialog
      v-model:visible="downloadDialogVisible"
      :model="selectedModel"
      :platform="platform"
    />

    <!-- 下载管理器 -->
    <DownloadManager v-model:visible="downloadManagerVisible" />

    <!-- 详情页面对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      :title="selectedModel?.name || selectedModel?.modelId || '模型详情'"
      width="90%"
      :fullscreen="false"
      destroy-on-close
    >
      <div class="detail-container">
        <iframe
          v-if="detailUrl"
          :src="detailUrl"
          class="detail-iframe"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.model-market {
  padding: 20px;
  background: #f5f7fa;
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;

  .toolbar {
    margin-bottom: 20px;
    display: flex;
    gap: 12px;
    align-items: center;
    background: #fff;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);

    .download-badge {
      margin-left: 8px;
    }
  }

  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  // Loading 指示器（顶部小型指示器）
  .loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    background: #fff;
    border-radius: 8px;
    margin-bottom: 12px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

    span {
      font-size: 13px;
      color: #606266;
    }
  }

  // 模型网格容器（固定高度）
  .models-grid-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .models-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 20px;
    overflow-y: auto;
    padding: 4px;
    align-content: start;
    height: 100%;

    // 空状态时居中显示
    &.is-empty {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .model-card {
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    height: 240px;
    cursor: pointer;

    &:hover {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
      transform: translateY(-2px);
    }

    .card-header {
      display: flex;
      align-items: center;
      padding: 16px;
      gap: 12px;
      flex-shrink: 0;

      .model-icon {
        width: 48px;
        height: 48px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;

        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 8px;
        }
      }

      .model-info {
        flex: 1;
        min-width: 0;

        .model-name {
          font-size: 16px;
          font-weight: 600;
          color: #303133;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .model-id {
          font-size: 12px;
          color: #909399;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }

    .card-body {
      padding: 0 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 0;

      .model-description {
        font-size: 13px;
        color: #606266;
        line-height: 1.5;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        margin-bottom: 12px;
        flex-shrink: 0;
      }

      .model-stats {
        display: flex;
        gap: 16px;

        .stat-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #909399;

          .stat-icon {
            font-size: 14px;
          }

          .stat-value {
            font-weight: 500;
          }
        }
      }
    }

    .card-footer {
      padding: 12px 16px;
      border-top: 1px solid #e4e7ed;
      display: flex;
      justify-content: flex-end;
      flex-shrink: 0;
      background: #fff;
    }
  }

  .pagination-container {
    display: flex;
    justify-content: center;
    padding: 20px 0;
    background: #fff;
    border-radius: 12px;
    margin-top: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }
}
</style>

<style lang="scss">
// 详情对话框样式（非 scoped，因为 el-dialog 在 body 下）
.detail-container {
  width: 100%;
  height: 75vh;

  .detail-iframe {
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 4px;
  }
}
</style>
