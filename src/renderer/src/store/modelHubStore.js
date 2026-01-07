/**
 * 模型市场状态管理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useModelHubStore = defineStore('modelHub', () => {
  // 模型缓存（按平台分类）
  const modelCache = ref({
    modelscope: [],
    huggingface: []
  })

  // 下载任务列表
  const downloadTasks = ref([])

  const DATA_MODULE = 'modelHub'

  /**
   * 获取模型列表
   */
  const fetchModels = async (platform, params = {}) => {
    // 调用 API（通过主进程代理，避免 CORS）
    const response = await window.api.modelHub.getModels(platform, params)
    

    if (response.success) {
      modelCache.value[platform] = response.data
      // 返回完整的响应对象，包含 data 和 total
      return {
        data: response.data,
        total: response.total
      }
    }

    throw new Error(response.error || '获取模型列表失败')
  }

  /**
   * 开始下载任务
   */
  const startDownload = async (downloadConfig) => {
    const taskId = Date.now().toString()

    const task = {
      id: taskId,
      ...downloadConfig,
      status: 'pending',
      progress: 0,
      logs: [],
      createdAt: new Date().toISOString()
    }

    downloadTasks.value.push(task)
    await saveDownloadTasks()

    return taskId
  }

  /**
   * 更新下载进度
   */
  const updateDownloadProgress = (taskId, progressData) => {
    const task = downloadTasks.value.find(t => t.id === taskId)
    if (task) {
      if (progressData.percentage !== undefined) {
        task.progress = progressData.percentage
      }
      if (progressData.log) {
        task.logs.push({
          timestamp: new Date().toISOString(),
          message: progressData.log
        })
      }
      if (progressData.status) {
        task.status = progressData.status
      }
      saveDownloadTasks()
    }
  }

  /**
   * 取消下载任务
   */
  const cancelDownload = async (taskId) => {
    const task = downloadTasks.value.find(t => t.id === taskId)
    if (task && task.status === 'downloading') {
      // 调用后端取消下载
      await window.api.modelHub.cancelDownload(task.serverId, taskId)
      task.status = 'cancelled'
      await saveDownloadTasks()
    }
  }

  /**
   * 重试下载
   */
  const retryDownload = async (taskId) => {
    const task = downloadTasks.value.find(t => t.id === taskId)
    if (task) {
      task.status = 'pending'
      task.progress = 0
      task.logs = []

      // 重新调用下载
      const result = await window.api.modelHub.startDownload({
        serverId: task.serverId,
        environmentId: task.environmentId,
        platform: task.platform,
        modelId: task.modelId,
        installPath: task.installPath,
        downloadId: taskId
      })

      if (result.success) {
        task.status = 'downloading'
        await saveDownloadTasks()
        return true
      }
    }
    return false
  }

  /**
   * 删除下载记录
   */
  const deleteDownloadTask = async (taskId) => {
    const index = downloadTasks.value.findIndex(t => t.id === taskId)
    if (index !== -1) {
      downloadTasks.value.splice(index, 1)
      await saveDownloadTasks()
    }
  }

  /**
   * 获取任务详情
   */
  const getDownloadTask = (taskId) => {
    return downloadTasks.value.find(t => t.id === taskId)
  }

  /**
   * 保存下载任务
   */
  const saveDownloadTasks = async () => {
    try {
      // 将对象转换为可序列化的纯 JSON
      const rawData = downloadTasks.value.map(task => ({
        id: task.id,
        serverId: task.serverId,
        environmentId: task.environmentId,
        platform: task.platform,
        modelId: task.modelId,
        installPath: task.installPath,
        status: task.status,
        progress: task.progress,
        logs: task.logs,
        createdAt: task.createdAt
      }))

      // 使用 JSON 序列化/反序列化来深拷贝，移除任何不可序列化的数据
      const serializedData = JSON.parse(JSON.stringify(rawData))

      const result = await window.api.data.write(DATA_MODULE, serializedData)

      // 检查写入结果
      if (!result.success) {
        throw new Error(result.error || '写入数据失败')
      }
    } catch (error) {
      console.error('保存下载任务失败:', error)
      throw error // 重新抛出错误
    }
  }

  /**
   * 加载下载任务
   */
  const loadDownloadTasks = async () => {
    try {
      const data = await window.api.data.read(DATA_MODULE, [])
      if (Array.isArray(data)) {
        downloadTasks.value = data
      }
    } catch (error) {
      console.error('加载下载任务失败:', error)
    }
  }

  /**
   * 清空模型缓存
   */
  const clearModelCache = (platform) => {
    if (platform) {
      modelCache.value[platform] = []
    } else {
      modelCache.value = {
        modelscope: [],
        huggingface: []
      }
    }
  }

  return {
    modelCache,
    downloadTasks,
    fetchModels,
    startDownload,
    updateDownloadProgress,
    cancelDownload,
    retryDownload,
    deleteDownloadTask,
    getDownloadTask,
    loadDownloadTasks,
    clearModelCache
  }
})
