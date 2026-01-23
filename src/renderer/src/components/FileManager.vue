<template>
  <div class="file-manager">
    <div class="file-manager-header">
      <div class="breadcrumb">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item @click="navigateToPath('/')">
            <el-icon><HomeFilled /></el-icon>
            根目录
          </el-breadcrumb-item>
          <el-breadcrumb-item
            v-for="(segment, index) in pathSegments"
            :key="index"
            @click="navigateToSegment(index)"
          >
            {{ segment }}
          </el-breadcrumb-item>
        </el-breadcrumb>
      </div>
      <div class="header-actions">
        <div class="search-bar" :class="{ 'has-keyword': searchKeyword }">
          <el-input
            v-model="searchInputValue"
            placeholder="搜索文件..."
            clearable
            size="small"
            @keyup.enter="handleSearchTrigger"
            @clear="handleSearchClear"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
            <template #append>
              <el-button
                v-if="searchInputValue"
                :icon="Search"
                size="small"
                text
                @click="handleSearchTrigger"
              />
            </template>
          </el-input>
        </div>
        <el-button type="primary" :icon="FolderAdd" @click="showCreateFolderDialog" size="small">
          新建文件夹
        </el-button>
        <el-button type="primary" :icon="DocumentAdd" @click="showCreateFileDialog" size="small">
          新建文件
        </el-button>
        <el-button
          v-if="selectedFiles.length > 0"
          type="danger"
          :icon="Delete"
          @click="handleBatchDelete"
          size="small"
        >
          批量删除 ({{ selectedFiles.length }})
        </el-button>
        <el-button :icon="Refresh" @click="refreshFiles" :loading="loading" size="small">
          刷新
        </el-button>
      </div>
    </div>

    <div class="file-manager-body">
      <div v-if="loading && files.length === 0" class="loading-state">
        <el-icon :size="32" class="is-loading"><Refresh /></el-icon>
        <p>加载中...</p>
      </div>

      <div v-else-if="displayFiles.length === 0" class="empty-state">
        <el-empty :description="searchKeyword ? '未找到匹配的文件或文件夹' : '此目录为空'" />
      </div>

      <div v-else class="file-list">
        <div
          v-for="file in displayFiles"
          :key="file.path"
          class="file-item"
          :class="{
            'is-selected': selectedFiles.includes(file.path),
            'is-directory': file.isDirectory
          }"
          @click="handleFileClick(file)"
          @dblclick="handleFileDbClick(file)"
          @contextmenu.prevent="showContextMenu($event, file)"
        >
          <div class="file-checkbox" @click.stop>
            <el-checkbox
              :model-value="selectedFiles.includes(file.path)"
              @change="(val) => handleSelectFile(file.path, val)"
            />
          </div>
          <div class="file-icon">
            <el-icon :size="24" :color="getFileIconColor(file)">
              <component :is="getFileIcon(file)" />
            </el-icon>
          </div>
          <div class="file-info">
            <div class="file-name" :title="file.name" v-html="highlightFileName(file.name)"></div>
            <div class="file-meta">
              <span v-if="file.isDirectory">文件夹</span>
              <span v-else>{{ formatFileSize(file.size) }}</span>
              <span class="file-mtime">{{ formatTime(file.modifiedTime) }}</span>
            </div>
          </div>
          <div class="file-actions" @click.stop>
            <el-dropdown trigger="click" @command="(cmd) => handleFileAction(cmd, file)">
              <el-button :icon="MoreFilled" circle size="small" text />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename" :icon="Edit">重命名</el-dropdown-item>
                  <el-dropdown-item command="delete" :icon="Delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建文件夹对话框 -->
    <el-dialog
      v-model="createFolderDialogVisible"
      title="新建文件夹"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="createFolderForm" label-width="80px">
        <el-form-item label="文件夹名">
          <el-input
            v-model="createFolderForm.name"
            placeholder="请输入文件夹名称"
            @keyup.enter="handleCreateFolder"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createFolderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFolder" :loading="actionLoading">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 新建文件对话框 -->
    <el-dialog
      v-model="createFileDialogVisible"
      title="新建文件"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="createFileForm" label-width="80px">
        <el-form-item label="文件名">
          <el-input
            v-model="createFileForm.name"
            placeholder="请输入文件名称（如：test.txt）"
            @keyup.enter="handleCreateFile"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createFileDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateFile" :loading="actionLoading">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 重命名对话框 -->
    <el-dialog
      v-model="renameDialogVisible"
      title="重命名"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="renameForm" label-width="80px">
        <el-form-item label="新名称">
          <el-input
            v-model="renameForm.name"
            placeholder="请输入新名称"
            @keyup.enter="handleRename"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleRename" :loading="actionLoading">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{
        left: contextMenuPosition.x + 'px',
        top: contextMenuPosition.y + 'px'
      }"
    >
      <div class="context-menu-item" @click="handleFileAction('rename', contextMenuFile)">
        <el-icon><Edit /></el-icon>
        重命名
      </div>
      <div class="context-menu-item danger" @click="handleFileAction('delete', contextMenuFile)">
        <el-icon><Delete /></el-icon>
        删除
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  FolderAdd,
  DocumentAdd,
  Delete,
  Refresh,
  Edit,
  MoreFilled,
  HomeFilled,
  Folder,
  Document,
  Picture,
  VideoCamera,
  Headset,
  Files,
  Search
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  serverId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['loading-change'])

// 文件列表
const files = ref([])
const currentPath = ref('/')
const loading = ref(false)
const actionLoading = ref(false)

// 搜索
const searchInputValue = ref('')
const searchKeyword = ref('')

// 选中的文件
const selectedFiles = ref([])

// 对话框
const createFolderDialogVisible = ref(false)
const createFileDialogVisible = ref(false)
const renameDialogVisible = ref(false)

// 表单
const createFolderForm = ref({ name: '' })
const createFileForm = ref({ name: '' })
const renameForm = ref({ name: '' })
const currentRenameFile = ref(null)

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuFile = ref(null)

// 路径分段
const pathSegments = computed(() => {
  if (currentPath.value === '/') return []
  return currentPath.value.split('/').filter(Boolean)
})

// 搜索结果
const searchResults = computed(() => {
  if (!searchKeyword.value || !searchKeyword.value.trim()) {
    return []
  }

  const keyword = searchKeyword.value.toLowerCase().trim()
  return files.value.filter(file => {
    return file.name.toLowerCase().includes(keyword)
  })
})

// 显示的文件列表（有搜索时显示搜索结果，否则显示所有文件）
const displayFiles = computed(() => {
  if (searchKeyword.value && searchKeyword.value.trim()) {
    return searchResults.value
  }
  return files.value
})

// 加载文件列表
const loadFiles = async () => {
  loading.value = true
  emit('loading-change', true)
  try {
    const result = await window.api.fileManager.listDirectory(props.serverId, currentPath.value)
    if (result.success) {
      files.value = result.data || []
    } else {
      ElMessage.error(`加载文件列表失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`加载文件列表失败: ${error.message}`)
  } finally {
    loading.value = false
    emit('loading-change', false)
  }
}

// 刷新文件列表
const refreshFiles = () => {
  loadFiles()
}

// 导航到指定路径
const navigateToPath = (path) => {
  currentPath.value = path
  selectedFiles.value = []
  loadFiles()
}

// 导航到路径分段
const navigateToSegment = (index) => {
  const segments = pathSegments.value.slice(0, index + 1)
  const newPath = '/' + segments.join('/')
  navigateToPath(newPath)
}

// 处理文件点击
const handleFileClick = (file) => {
  // 文件夹：单击直接进入
  if (file.isDirectory) {
    navigateToPath(file.path)
    return
  }

  // 文件：单击切换选中状态
  const index = selectedFiles.value.indexOf(file.path)
  if (index > -1) {
    selectedFiles.value.splice(index, 1)
  } else {
    selectedFiles.value.push(file.path)
  }
}

// 处理文件双击
const handleFileDbClick = (file) => {
  // 文件夹：单击已经进入，双击不需要额外操作
  if (file.isDirectory) {
    return
  }

  // 文件：双击显示信息
  ElMessage.info(`文件: ${file.name}`)
}

// 处理文件选择
const handleSelectFile = (path, checked) => {
  if (checked) {
    if (!selectedFiles.value.includes(path)) {
      selectedFiles.value.push(path)
    }
  } else {
    const index = selectedFiles.value.indexOf(path)
    if (index > -1) {
      selectedFiles.value.splice(index, 1)
    }
  }
}

// 触发搜索（回车或点击搜索按钮）
const handleSearchTrigger = () => {
  searchKeyword.value = searchInputValue.value.trim()
  // 搜索后清空选中状态
  selectedFiles.value = []
}

// 清除搜索
const handleSearchClear = () => {
  searchInputValue.value = ''
  searchKeyword.value = ''
}

// 高亮文件名中的匹配关键词
const highlightFileName = (fileName) => {
  if (!searchKeyword.value || !searchKeyword.value.trim()) {
    return fileName
  }

  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    return fileName
  }

  // 转义特殊字符
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedKeyword})`, 'gi')

  return fileName.replace(regex, '<span class="highlight">$1</span>')
}

// 显示创建文件夹对话框
const showCreateFolderDialog = () => {
  createFolderForm.value.name = ''
  createFolderDialogVisible.value = true
}

// 显示创建文件对话框
const showCreateFileDialog = () => {
  createFileForm.value.name = ''
  createFileDialogVisible.value = true
}

// 创建文件夹
const handleCreateFolder = async () => {
  const name = createFolderForm.value.name.trim()
  if (!name) {
    ElMessage.warning('请输入文件夹名称')
    return
  }

  actionLoading.value = true
  try {
    const result = await window.api.fileManager.createDirectory(
      props.serverId,
      currentPath.value,
      name
    )
    if (result.success) {
      ElMessage.success('文件夹创建成功')
      createFolderDialogVisible.value = false
      loadFiles()
    } else {
      ElMessage.error(`创建失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`创建失败: ${error.message}`)
  } finally {
    actionLoading.value = false
  }
}

// 创建文件
const handleCreateFile = async () => {
  const name = createFileForm.value.name.trim()
  if (!name) {
    ElMessage.warning('请输入文件名称')
    return
  }

  actionLoading.value = true
  try {
    const result = await window.api.fileManager.createFile(
      props.serverId,
      currentPath.value,
      name
    )
    if (result.success) {
      ElMessage.success('文件创建成功')
      createFileDialogVisible.value = false
      loadFiles()
    } else {
      ElMessage.error(`创建失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`创建失败: ${error.message}`)
  } finally {
    actionLoading.value = false
  }
}

// 重命名
const handleRename = async () => {
  const newName = renameForm.value.name.trim()
  if (!newName) {
    ElMessage.warning('请输入新名称')
    return
  }

  if (!currentRenameFile.value) {
    return
  }

  actionLoading.value = true
  try {
    const result = await window.api.fileManager.rename(
      props.serverId,
      currentRenameFile.value.path,
      newName
    )
    if (result.success) {
      ElMessage.success('重命名成功')
      renameDialogVisible.value = false
      loadFiles()
    } else {
      ElMessage.error(`重命名失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`重命名失败: ${error.message}`)
  } finally {
    actionLoading.value = false
  }
}

// 删除文件
const handleDelete = async (file) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除 "${file.name}" 吗？${file.isDirectory ? '此操作将删除文件夹及其所有内容！' : ''}`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    actionLoading.value = true
    const result = await window.api.fileManager.delete(props.serverId, [file.path])
    if (result.success) {
      ElMessage.success('删除成功')
      selectedFiles.value = selectedFiles.value.filter(p => p !== file.path)
      loadFiles()
    } else {
      ElMessage.error(`删除失败: ${result.error}`)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(`删除失败: ${error.message}`)
    }
  } finally {
    actionLoading.value = false
  }
}

// 批量删除
const handleBatchDelete = async () => {
  if (selectedFiles.value.length === 0) {
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedFiles.value.length} 个项目吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    actionLoading.value = true
    const result = await window.api.fileManager.delete(props.serverId, selectedFiles.value)
    if (result.success) {
      ElMessage.success('删除成功')
      selectedFiles.value = []
      loadFiles()
    } else {
      ElMessage.error(`删除失败: ${result.error}`)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(`删除失败: ${error.message}`)
    }
  } finally {
    actionLoading.value = false
  }
}

// 文件操作
const handleFileAction = (command, file) => {
  contextMenuVisible.value = false
  if (command === 'rename') {
    currentRenameFile.value = file
    renameForm.value.name = file.name
    renameDialogVisible.value = true
  } else if (command === 'delete') {
    handleDelete(file)
  }
}

// 显示右键菜单
const showContextMenu = (event, file) => {
  contextMenuFile.value = file
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false
}

// 获取文件图标
const getFileIcon = (file) => {
  if (file.isDirectory) {
    return Folder
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  const iconMap = {
    // 图片
    jpg: Picture,
    jpeg: Picture,
    png: Picture,
    gif: Picture,
    bmp: Picture,
    svg: Picture,
    webp: Picture,
    // 视频
    mp4: VideoCamera,
    avi: VideoCamera,
    mkv: VideoCamera,
    mov: VideoCamera,
    wmv: VideoCamera,
    // 音频
    mp3: Headset,
    wav: Headset,
    flac: Headset,
    aac: Headset,
    // 默认
    txt: Document,
    md: Document
  }

  return iconMap[ext] || Document
}

// 获取文件图标颜色
const getFileIconColor = (file) => {
  if (file.isDirectory) {
    return '#f7ba2a'
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  const colorMap = {
    // 图片 - 绿色
    jpg: '#67c23a',
    jpeg: '#67c23a',
    png: '#67c23a',
    gif: '#67c23a',
    // 视频 - 红色
    mp4: '#f56c6c',
    avi: '#f56c6c',
    mkv: '#f56c6c',
    // 音频 - 橙色
    mp3: '#e6a23c',
    wav: '#e6a23c',
    flac: '#e6a23c'
  }

  return colorMap[ext] || '#909399'
}

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '-'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 组件挂载
onMounted(() => {
  loadFiles()
  document.addEventListener('click', closeContextMenu)
})

// 组件卸载
onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
})
</script>

<style lang="scss" scoped>
.file-manager {
  display: flex;
  flex-direction: column;
  height: 600px;
  max-height: 600px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  overflow: hidden;

  .file-manager-header {
    padding: 16px 20px;
    border-bottom: 1px solid #e4e7ed;
    background: #f5f7fa;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-shrink: 0;

    .breadcrumb {
      flex: 1;
      min-width: 0;

      :deep(.el-breadcrumb__item) {
        .el-breadcrumb__inner {
          cursor: pointer;

          &:hover {
            color: #409eff;
          }
        }
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;

      .search-bar {
        width: 240px;
        flex-shrink: 0;
        transition: all 0.3s ease;

        &.has-keyword {
          width: 280px;
        }

        :deep(.el-input) {
          .el-input__wrapper {
            border-radius: 6px;
            box-shadow: 0 0 0 1px #dcdfe6 inset;
            transition: all 0.3s ease;

            &:hover {
              box-shadow: 0 0 0 1px #c0c4cc inset;
            }
          }

          &.is-focus {
            .el-input__wrapper {
              box-shadow: 0 0 0 1px #409eff inset;
            }
          }

          .el-input__prefix {
            color: #909399;
          }

          .el-input__append {
            padding: 0;
            background: transparent;

            .el-button {
              padding: 4px;
            }
          }
        }
      }
    }
  }

  .file-manager-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #909399;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .file-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;

      &::-webkit-scrollbar {
        width: 8px;
      }

      &::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 4px;
      }

      &::-webkit-scrollbar-thumb {
        background: #dcdfe6;
        border-radius: 4px;

        &:hover {
          background: #c0c4cc;
        }
      }
    }

    .file-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 6px;
      border: 1px solid transparent;

      &:hover {
        background: #f5f7fa;
        border-color: #e4e7ed;
        transform: translateX(2px);
      }

      &.is-selected {
        background: linear-gradient(135deg, #ecf5ff 0%, #e1f0ff 100%);
        border-color: #a0cfff;
        box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
      }

      &.is-directory {
        .file-name {
          font-weight: 500;
          color: #409eff;
        }
      }

      .file-checkbox {
        margin-right: 12px;

        :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
          background-color: #409eff;
          border-color: #409eff;
        }
      }

      .file-icon {
        margin-right: 12px;
        flex-shrink: 0;
      }

      .file-info {
        flex: 1;
        min-width: 0;

        .file-name {
          font-size: 14px;
          color: #303133;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          :deep(.highlight) {
            background: linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%);
            color: #fff;
            padding: 0 4px;
            border-radius: 3px;
            font-weight: 500;
            box-shadow: 0 1px 3px rgba(132, 250, 176, 0.3);
          }
        }

        .file-meta {
          font-size: 12px;
          color: #909399;
          margin-top: 4px;

          span {
            margin-right: 16px;
          }
        }
      }

      .file-actions {
        opacity: 0;
        transition: opacity 0.2s;
      }

      &:hover .file-actions {
        opacity: 1;
      }
    }
  }
}

.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 9999;
  min-width: 120px;

  .context-menu-item {
    padding: 8px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #606266;

    &:hover {
      background: #f5f7fa;
    }

    &.danger {
      color: #f56c6c;

      &:hover {
        background: #fef0f0;
      }
    }
  }
}
</style>
