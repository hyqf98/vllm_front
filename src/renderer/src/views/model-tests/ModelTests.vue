<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useModelTestStore } from '@renderer/store/modelTestStore'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const modelTestStore = useModelTestStore()

const dialogVisible = ref(false)
const dialogMode = ref('add') // 'add' | 'edit'
const editingConfig = ref(null)
const testingConfig = ref(null)

const formData = ref({
  name: '',
  protocol: 'openai',
  serverUrl: '',
  apiKey: '',
  model: '',
  advancedParams: {}
})

const formRules = {
  name: [{ required: true, message: '请输入测试名称', trigger: 'blur' }],
  protocol: [{ required: true, message: '请选择协议', trigger: 'change' }],
  serverUrl: [{ required: true, message: '请输入服务地址', trigger: 'blur' }],
  model: [{ required: true, message: '请输入模型名称', trigger: 'blur' }]
}

const testLoading = ref(false)

const protocolOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Ollama', value: 'ollama' }
]

const protocolParams = computed(() => {
  return modelTestStore.getProtocolParams(formData.value.protocol)
})

// 监听协议变化，设置默认参数
watch(() => formData.value.protocol, (newProtocol) => {
  formData.value.advancedParams = modelTestStore.getDefaultParams(newProtocol)

  // 设置默认服务地址
  if (newProtocol === 'openai') {
    formData.value.serverUrl = 'https://api.openai.com/v1'
  } else if (newProtocol === 'ollama') {
    formData.value.serverUrl = 'http://localhost:11434'
  }
})

// 打开添加对话框
const handleAdd = () => {
  dialogMode.value = 'add'
  formData.value = {
    name: '',
    protocol: 'openai',
    serverUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: '',
    advancedParams: modelTestStore.getDefaultParams('openai')
  }
  dialogVisible.value = true
}

// 打开编辑对话框
const handleEdit = (config) => {
  dialogMode.value = 'edit'
  editingConfig.value = config
  formData.value = {
    name: config.name,
    protocol: config.protocol,
    serverUrl: config.serverUrl,
    apiKey: config.apiKey || '',
    model: config.model,
    advancedParams: { ...config.advancedParams }
  }
  dialogVisible.value = true
}

// 删除配置
const handleDelete = async (config) => {
  try {
    await ElMessageBox.confirm(`确定要删除测试配置 "${config.name}" 吗？`, '确认删除', {
      type: 'warning'
    })

    await modelTestStore.deleteTestConfig(config.id)
    ElMessage.success('删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 测试连接
const handleTestConnection = async () => {
  try {
    testLoading.value = true
    const result = await window.api.modelTest.testConnection(
      formData.value.protocol,
      formData.value.serverUrl,
      formData.value.apiKey,
      formData.value.model
    )

    if (result.success) {
      ElMessage.success('连接测试成功')
    } else {
      ElMessage.error(`连接测试失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`连接测试失败: ${error.message}`)
  } finally {
    testLoading.value = false
  }
}

// 保存配置
const handleSave = async () => {
  try {
    if (dialogMode.value === 'add') {
      await modelTestStore.addTestConfig(formData.value)
      ElMessage.success('添加成功')
    } else {
      await modelTestStore.updateTestConfig(editingConfig.value.id, formData.value)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
  } catch (error) {
    ElMessage.error(`保存失败: ${error.message}`)
  }
}

// 开始聊天测试
const handleChatTest = (config) => {
  modelTestStore.setCurrentTestConfig(config)
  router.push({ name: '聊天测试', params: { testId: config.id } })
}

// 获取协议图标
const getProtocolIcon = (protocol) => {
  const icons = {
    openai: '🤖',
    ollama: '🦙'
  }
  return icons[protocol] || '📦'
}

onMounted(() => {
  modelTestStore.loadTestConfigs()
})
</script>

<template>
  <div class="model-tests-container">
    <div class="header">
      <h2>模型测试</h2>
      <el-button type="primary" @click="handleAdd">
        添加测试配置
      </el-button>
    </div>

    <div v-if="modelTestStore.sortedConfigs.length === 0" class="empty-wrapper">
      <el-empty description="暂无测试配置">
        <el-button type="primary" @click="handleAdd">添加第一个测试配置</el-button>
      </el-empty>
    </div>

    <div v-else class="configs-grid">
      <el-card
        v-for="config in modelTestStore.sortedConfigs"
        :key="config.id"
        class="config-card"
        shadow="hover"
      >
        <template #header>
          <div class="card-header">
            <span class="config-name">
              <span class="protocol-icon">{{ getProtocolIcon(config.protocol) }}</span>
              {{ config.name }}
            </span>
            <el-tag :type="config.protocol === 'openai' ? 'primary' : 'success'" size="small">
              {{ config.protocol.toUpperCase() }}
            </el-tag>
          </div>
        </template>

        <div class="config-info">
          <div class="info-item">
            <span class="label">服务地址:</span>
            <span class="value">{{ config.serverUrl }}</span>
          </div>
          <div class="info-item">
            <span class="label">模型:</span>
            <span class="value">{{ config.model }}</span>
          </div>
          <div class="info-item" v-if="config.advancedParams">
            <span class="label">温度:</span>
            <span class="value">{{ config.advancedParams.temperature }}</span>
          </div>
        </div>

        <template #footer>
          <div class="card-footer">
            <el-button type="primary" size="small" @click="handleChatTest(config)">
              开始测试
            </el-button>
            <el-button size="small" @click="handleEdit(config)">
              编辑
            </el-button>
            <el-button type="danger" size="small" @click="handleDelete(config)">
              删除
            </el-button>
          </div>
        </template>
      </el-card>
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '添加测试配置' : '编辑测试配置'"
      width="700px"
    >
      <el-form :model="formData" :rules="formRules" label-width="120px">
        <el-form-item label="测试名称" prop="name">
          <el-input v-model="formData.name" placeholder="例如: OpenAI GPT-4 测试" />
        </el-form-item>

        <el-form-item label="协议类型" prop="protocol">
          <el-select v-model="formData.protocol" placeholder="请选择协议">
            <el-option
              v-for="opt in protocolOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="服务地址" prop="serverUrl">
          <el-input v-model="formData.serverUrl" placeholder="例如: https://api.openai.com/v1" />
        </el-form-item>

        <el-form-item label="API Key" prop="apiKey" v-if="formData.protocol === 'openai'">
          <el-input v-model="formData.apiKey" type="password" placeholder="可选，某些服务需要" show-password />
        </el-form-item>

        <el-form-item label="模型名称" prop="model">
          <el-input v-model="formData.model" placeholder="例如: gpt-4, llama2, qwen2" />
        </el-form-item>

        <el-divider content-position="left">高级参数</el-divider>

        <div class="advanced-params">
          <el-form-item
            v-for="param in protocolParams"
            :key="param.key"
            :label="param.label"
          >
            <el-input
              v-if="param.type === 'number'"
              v-model.number="formData.advancedParams[param.key]"
              :type="number"
              :min="param.min"
              :max="param.max"
              :step="param.step"
            />
            <el-switch
              v-else-if="param.type === 'boolean'"
              v-model="formData.advancedParams[param.key]"
            />
          </el-form-item>
        </div>

        <el-form-item>
          <el-button @click="handleTestConnection" :loading="testLoading">
            测试连接
          </el-button>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.model-tests-container {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
  }

  .empty-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
  }

  .configs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 20px;

    .config-card {
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .config-name {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;

          .protocol-icon {
            font-size: 20px;
          }
        }
      }

      .config-info {
        .info-item {
          display: flex;
          margin-bottom: 8px;
          font-size: 14px;

          .label {
            color: #909399;
            width: 80px;
            flex-shrink: 0;
          }

          .value {
            color: #303133;
            word-break: break-all;
          }
        }
      }

      .card-footer {
        display: flex;
        gap: 8px;
      }
    }
  }
}

.advanced-params {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
</style>
