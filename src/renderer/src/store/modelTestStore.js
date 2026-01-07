import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 模型测试 Store
 * 管理模型测试配置和聊天记录
 */
export const useModelTestStore = defineStore('modelTest', () => {
  // 测试配置列表
  const testConfigs = ref([])

  // 当前选中的测试配置
  const currentTestConfig = ref(null)

  // 聊天记录 { testId: [{ role, content, timestamp }] }
  const chatHistories = ref({})

  // 是否正在加载
  const loading = ref(false)

  // 计算属性：按创建时间排序的测试配置
  const sortedConfigs = computed(() => {
    return [...testConfigs.value].sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  })

  // 计算属性：按协议分组的配置
  const groupedConfigs = computed(() => {
    const groups = {}
    testConfigs.value.forEach(config => {
      if (!groups[config.protocol]) {
        groups[config.protocol] = []
      }
      groups[config.protocol].push(config)
    })
    return groups
  })

  /**
   * 加载测试配置
   */
  async function loadTestConfigs() {
    loading.value = true
    try {
      const result = await window.api.data.read('model-tests', [])
      if (result.success) {
        testConfigs.value = result.data || []
      }
    } catch (error) {
      console.error('加载测试配置失败:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存测试配置
   */
  async function saveTestConfigs() {
    try {
      // 将 Vue 响应式对象转换为纯 JavaScript 对象
      // 使用 JSON.parse(JSON.stringify()) 来完全克隆并移除响应式引用
      const rawData = testConfigs.value.map(config => ({
        id: config.id,
        name: config.name,
        protocol: config.protocol,
        serverUrl: config.serverUrl,
        apiKey: config.apiKey || '',
        model: config.model,
        advancedParams: config.advancedParams || {},
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      }))

      // 完全克隆数据，移除所有响应式引用
      const safeData = JSON.parse(JSON.stringify(rawData))

      console.log('[modelTestStore] 保存测试配置:', safeData.length, '条')
      console.log('[modelTestStore] 配置数据:', JSON.stringify(safeData, null, 2))

      const result = await window.api.data.write('model-tests', safeData)

      console.log('[modelTestStore] 保存结果:', result)
      console.log('[modelTestStore] result.success:', result.success)
      console.log('[modelTestStore] result.error:', result.error)

      return result && result.success
    } catch (error) {
      console.error('[modelTestStore] 保存测试配置异常:', error)
      console.error('[modelTestStore] 错误堆栈:', error.stack)
      return false
    }
  }

  /**
   * 添加测试配置
   */
  async function addTestConfig(config) {
    const newConfig = {
      id: `test_${Date.now()}`,
      name: config.name,
      protocol: config.protocol, // 'openai' | 'ollama'
      serverUrl: config.serverUrl,
      apiKey: config.apiKey || '',
      model: config.model,
      advancedParams: config.advancedParams || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    testConfigs.value.push(newConfig)
    const saved = await saveTestConfigs()
    if (!saved) {
      // 保存失败，回滚
      testConfigs.value.pop()
      throw new Error('保存配置失败')
    }
    return newConfig
  }

  /**
   * 更新测试配置
   */
  async function updateTestConfig(id, updates) {
    const index = testConfigs.value.findIndex(c => c.id === id)
    if (index !== -1) {
      const originalConfig = { ...testConfigs.value[index] }
      testConfigs.value[index] = {
        ...testConfigs.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }
      const saved = await saveTestConfigs()
      if (!saved) {
        // 保存失败，回滚
        testConfigs.value[index] = originalConfig
        throw new Error('保存配置失败')
      }
      return true
    }
    throw new Error('配置不存在')
  }

  /**
   * 删除测试配置
   */
  async function deleteTestConfig(id) {
    const index = testConfigs.value.findIndex(c => c.id === id)
    if (index !== -1) {
      const deletedConfig = testConfigs.value[index]
      const deletedChatHistory = chatHistories.value[id]

      testConfigs.value.splice(index, 1)
      delete chatHistories.value[id]

      const saved = await saveTestConfigs()
      if (!saved) {
        // 保存失败，回滚
        testConfigs.value.splice(index, 0, deletedConfig)
        if (deletedChatHistory) {
          chatHistories.value[id] = deletedChatHistory
        }
        throw new Error('保存配置失败')
      }
      return true
    }
    throw new Error('配置不存在')
  }

  /**
   * 获取测试配置
   */
  function getTestConfigById(id) {
    return testConfigs.value.find(c => c.id === id)
  }

  /**
   * 设置当前测试配置
   */
  function setCurrentTestConfig(config) {
    currentTestConfig.value = config
  }

  /**
   * 获取聊天历史
   */
  function getChatHistory(testId) {
    if (!chatHistories.value[testId]) {
      chatHistories.value[testId] = []
    }
    return chatHistories.value[testId]
  }

  /**
   * 添加聊天消息
   */
  function addChatMessage(testId, message) {
    if (!chatHistories.value[testId]) {
      chatHistories.value[testId] = []
    }
    chatHistories.value[testId].push({
      ...message,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 清空聊天历史
   */
  function clearChatHistory(testId) {
    chatHistories.value[testId] = []
  }

  /**
   * 获取协议的默认参数
   */
  function getDefaultParams(protocol) {
    const params = {
      openai: {
        temperature: 0.7,
        maxTokens: 2000,
        topP: 1.0,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stream: true
      },
      ollama: {
        temperature: 0.7,
        numPredict: 2000,
        topP: 0.9,
        topK: 40,
        repeatPenalty: 1.1,
        stream: true
      }
    }
    return params[protocol] || {}
  }

  /**
   * 获取协议的参数配置
   */
  function getProtocolParams(protocol) {
    const params = {
      openai: [
        { key: 'temperature', label: '温度', type: 'number', min: 0, max: 2, step: 0.1, default: 0.7 },
        { key: 'maxTokens', label: '最大令牌数', type: 'number', min: 1, max: 128000, step: 1, default: 2000 },
        { key: 'topP', label: 'Top P', type: 'number', min: 0, max: 1, step: 0.05, default: 1.0 },
        { key: 'frequencyPenalty', label: '频率惩罚', type: 'number', min: -2, max: 2, step: 0.1, default: 0 },
        { key: 'presencePenalty', label: '存在惩罚', type: 'number', min: -2, max: 2, step: 0.1, default: 0 },
        { key: 'stream', label: '流式输出', type: 'boolean', default: true }
      ],
      ollama: [
        { key: 'temperature', label: '温度', type: 'number', min: 0, max: 2, step: 0.1, default: 0.7 },
        { key: 'numPredict', label: '预测令牌数', type: 'number', min: 1, max: 32000, step: 1, default: 2000 },
        { key: 'topP', label: 'Top P', type: 'number', min: 0, max: 1, step: 0.05, default: 0.9 },
        { key: 'topK', label: 'Top K', type: 'number', min: 1, max: 100, step: 1, default: 40 },
        { key: 'repeatPenalty', label: '重复惩罚', type: 'number', min: 0, max: 2, step: 0.1, default: 1.1 },
        { key: 'stream', label: '流式输出', type: 'boolean', default: true }
      ]
    }
    return params[protocol] || []
  }

  return {
    testConfigs,
    currentTestConfig,
    chatHistories,
    loading,
    sortedConfigs,
    groupedConfigs,
    loadTestConfigs,
    saveTestConfigs,
    addTestConfig,
    updateTestConfig,
    deleteTestConfig,
    getTestConfigById,
    setCurrentTestConfig,
    getChatHistory,
    addChatMessage,
    clearChatHistory,
    getDefaultParams,
    getProtocolParams
  }
})
