<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useModelTestStore } from '@renderer/store/modelTestStore'
import { ElMessage } from 'element-plus'
import { ArrowLeft, VideoPause, Refresh } from '@element-plus/icons-vue'
import { BubbleList, Sender, Thinking, XMarkdown } from 'vue-element-plus-x'

const props = defineProps({
  testId: String
})

const router = useRouter()
const route = useRoute()
const modelTestStore = useModelTestStore()

// 消息列表 - Element Plus X 格式
const messages = ref([])
const inputMessage = ref('')
const sending = ref(false)
const thinking = ref(false) // AI 思考状态
const chatContainer = ref(null)
const senderRef = ref(null)

const currentConfig = computed(() => {
  const testId = props.testId || route.params.testId
  return modelTestStore.getTestConfigById(testId)
})

// 获取协议图标
const getProtocolIcon = (protocol) => {
  const icons = {
    openai: '🤖',
    ollama: '🦙'
  }
  return icons[protocol] || '📦'
}

// 将我们的消息格式转换为 Element Plus X 格式
const convertToElementPlusXFormat = (msgList) => {
  return msgList.map(msg => ({
    _id: msg.id || Date.now() + Math.random(),
    content: msg.content,
    role: msg.role, // 'user' | 'assistant'
    placement: msg.role === 'user' ? 'end' : 'start', // 用户消息在右，助手消息在左
    avatar: msg.role === 'user' ? undefined : getProtocolIcon(currentConfig.value?.protocol),
    isMarkdown: msg.role === 'assistant', // 助手消息使用 Markdown 渲染
    createdAt: msg.timestamp
  }))
}

// 发送消息
const handleSend = async (content) => {
  const message = content?.trim() || inputMessage.value.trim()
  if (!message || sending.value) return

  const config = currentConfig.value
  if (!config) {
    ElMessage.error('未找到测试配置')
    return
  }

  // 添加用户消息
  const userMsg = {
    id: Date.now(),
    content: message,
    role: 'user',
    placement: 'end' // 用户消息在右侧
  }
  messages.value.push(userMsg)
  inputMessage.value = ''

  // 保存到历史
  modelTestStore.addChatMessage(config.id, userMsg)

  // 显示思考状态
  thinking.value = true
  sending.value = true

  // 准备助手消息容器
  const assistantMsg = {
    id: Date.now() + 1,
    content: '',
    role: 'assistant',
    placement: 'start', // 助手消息在左侧
    streaming: true // 标记为流式消息
  }
  messages.value.push(assistantMsg)

  try {
    // 获取消息历史
    const chatHistory = modelTestStore.getChatHistory(config.id)
    const allMessages = chatHistory
      .filter(m => m.id !== assistantMsg.id) // 排除刚添加的空消息
      .map(m => ({ role: m.role, content: m.content }))
      .concat({ role: 'user', content: message })

    // 设置流式输出监听
    const chunkHandler = (event, data) => {
      if (data.content) {
        assistantMsg.content += data.content
        // 触发响应式更新
        messages.value = [...messages.value]
      }
    }

    window.electron.ipcRenderer.on('modelTest:chunk', chunkHandler)

    // 发送聊天请求
    const params = config.advancedParams ? { ...config.advancedParams } : {}
    const response = await window.api.modelTest.chat(
      config.protocol,
      config.serverUrl,
      config.apiKey || '',
      config.model,
      allMessages,
      params
    )

    // 移除监听器
    window.electron.ipcRenderer.removeListener('modelTest:chunk', chunkHandler)

    // 如果流式响应没有被触发（某些情况下的降级处理）
    if (assistantMsg.content === '' && response) {
      assistantMsg.content = response
    }

    // 标记流式完成并触发响应式更新
    // 重新创建消息对象以确保 Vue 检测到变化
    const completedMsgIndex = messages.value.findIndex(m => m.id === assistantMsg.id)
    if (completedMsgIndex !== -1) {
      messages.value[completedMsgIndex] = {
        ...assistantMsg,
        streaming: false
      }
      // 强制触发更新
      messages.value = [...messages.value]
    }

    thinking.value = false

    // 保存助手回复到历史
    modelTestStore.addChatMessage(config.id, {
      role: 'assistant',
      content: assistantMsg.content
    })

    // 聚焦输入框
    nextTick(() => {
      senderRef.value?.focus()
    })
  } catch (error) {
    assistantMsg.content = `错误: ${error.message}`

    // 重新创建消息对象以触发更新
    const errorMsgIndex = messages.value.findIndex(m => m.id === assistantMsg.id)
    if (errorMsgIndex !== -1) {
      messages.value[errorMsgIndex] = {
        ...assistantMsg,
        streaming: false
      }
      messages.value = [...messages.value]
    }

    thinking.value = false
    ElMessage.error(`发送失败: ${error.message}`)
  } finally {
    sending.value = false
  }
}

// 重新生成
const handleRegenerate = async () => {
  if (sending.value || messages.value.length === 0) return

  // 移除最后一条助手消息
  const lastMessage = messages.value[messages.value.length - 1]
  if (lastMessage && lastMessage.role === 'assistant') {
    messages.value.pop()
  }

  // 获取最后一条用户消息重新发送
  const userMessages = messages.value.filter(m => m.role === 'user')
  if (userMessages.length > 0) {
    const lastUserMessage = userMessages[userMessages.length - 1]
    await handleSend(lastUserMessage.content)
  }
}

// 清空对话
const handleClear = () => {
  messages.value = []
  if (currentConfig.value) {
    modelTestStore.clearChatHistory(currentConfig.value.id)
  }
}

// 停止生成
const handleStop = () => {
  sending.value = false
  thinking.value = false
  const lastMessage = messages.value[messages.value.length - 1]
  if (lastMessage && lastMessage.role === 'assistant' && lastMessage.streaming) {
    lastMessage.streaming = false
  }
}

// 返回列表
const handleBack = () => {
  router.push({ name: '模型测试' })
}

// 初始化
onMounted(() => {
  const config = currentConfig.value
  if (config) {
    // 加载历史消息
    const history = modelTestStore.getChatHistory(config.id)
    messages.value = convertToElementPlusXFormat(history)
  } else {
    ElMessage.error('未找到测试配置')
    handleBack()
  }
})

// 监听配置变化
watch(() => props.testId, (newTestId) => {
  if (newTestId) {
    const config = modelTestStore.getTestConfigById(newTestId)
    if (config) {
      const history = modelTestStore.getChatHistory(config.id)
      messages.value = convertToElementPlusXFormat(history)
    }
  }
})
</script>

<template>
  <div class="chat-test-panel">
    <!-- 顶部工具栏 -->
    <div class="chat-header">
      <div class="header-left">
        <el-button @click="handleBack" size="small" text>
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="config-info">
          <span class="protocol-icon">{{ getProtocolIcon(currentConfig?.protocol) }}</span>
          <div class="info-text">
            <div class="config-name">{{ currentConfig?.name }}</div>
            <div class="config-model">{{ currentConfig?.model }}</div>
          </div>
        </div>
      </div>
      <div class="header-right">
        <el-button @click="handleClear" :disabled="messages.length === 0" size="small" text>
          清空对话
        </el-button>
      </div>
    </div>

    <!-- 聊天区域 -->
    <div class="chat-messages">
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-content">
          <div class="empty-icon">💬</div>
          <div class="empty-title">开始对话</div>
          <div class="empty-desc">输入消息开始测试模型</div>
        </div>
      </div>

      <!-- Element Plus X 消息列表 -->
      <BubbleList
        v-else
        :list="messages"
        :auto-scroll="true"
        class="message-list"
      >
        <template #default="{ message }">
          <!-- 用户消息 -->
          <div v-if="message.role === 'user'" class="user-message">
            <div class="message-content">{{ message.content }}</div>
          </div>

          <!-- 助手消息 - 使用 XMarkdown 渲染 -->
          <div v-else class="assistant-message">
            <!-- 流式过程中显示纯文本 + 思考动画 -->
            <div v-show="message.streaming" class="streaming-content">
              <Thinking :loading="true" />
              <div class="content-text">{{ message.content }}</div>
            </div>
            <!-- 流式完成后渲染 Markdown - key 包含 streaming 状态以确保重新渲染 -->
            <XMarkdown
              v-show="!message.streaming && message.content"
              :key="`${message._id}-${message.streaming}`"
              :markdown="message.content"
              code-highlight-theme="github-dark"
              default-theme-mode="dark"
            />
          </div>
        </template>
      </BubbleList>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input-area">
      <div class="input-toolbar">
        <el-button
          v-if="sending"
          type="warning"
          size="small"
          @click="handleStop"
          text
        >
          <el-icon><VideoPause /></el-icon>
          停止生成
        </el-button>
        <el-button
          v-else-if="messages.length > 0"
          size="small"
          @click="handleRegenerate"
          text
        >
          <el-icon><Refresh /></el-icon>
          重新生成
        </el-button>
      </div>

      <!-- Element Plus X 输入框 -->
      <Sender
        v-model="inputMessage"
        ref="senderRef"
        :disabled="sending"
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        @submit="handleSend"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-test-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
  overflow: hidden;

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: white;
    border-bottom: 1px solid #e4e7ed;
    flex-shrink: 0;

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;

      .config-info {
        display: flex;
        align-items: center;
        gap: 10px;

        .protocol-icon {
          font-size: 24px;
        }

        .info-text {
          .config-name {
            font-size: 15px;
            font-weight: 600;
            color: #303133;
          }

          .config-model {
            font-size: 12px;
            color: #909399;
            margin-top: 2px;
          }
        }
      }
    }
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background: #f5f7fa;

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 400px;

      .empty-content {
        text-align: center;
        color: #909399;

        .empty-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.6;
        }

        .empty-title {
          font-size: 18px;
          margin-bottom: 8px;
          color: #606266;
        }

        .empty-desc {
          font-size: 14px;
          color: #909399;
        }
      }
    }

    .message-list {
      min-height: 100%;
    }

    // 用户消息样式
    :deep(.user-message) {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;

      .message-content {
        background: #409eff;
        color: white;
        padding: 12px 16px;
        border-radius: 16px 16px 4px 16px;
        max-width: 70%;
        word-wrap: break-word;
        word-break: break-word;
      }
    }

    // 助手消息样式
    :deep(.assistant-message) {
      display: flex;
      justify-content: flex-start;
      margin-bottom: 16px;

      .x-markdown {
        background: white;
        padding: 12px 16px;
        border-radius: 16px 16px 16px 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        max-width: 70%;
      }

      // 流式内容样式
      .streaming-content {
        background: white;
        padding: 12px 16px;
        border-radius: 16px 16px 16px 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        max-width: 70%;

        .content-text {
          margin-top: 12px;
          white-space: pre-wrap;
          word-wrap: break-word;
          word-break: break-word;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 14px;
          line-height: 1.6;
        }
      }
    }
  }

  .chat-input-area {
    background: white;
    border-top: 1px solid #e4e7ed;
    padding: 16px 20px;
    flex-shrink: 0;

    .input-toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
  }
}
</style>
