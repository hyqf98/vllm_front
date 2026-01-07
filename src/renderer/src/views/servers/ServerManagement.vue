<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Connection, Refresh, ArrowRight } from '@element-plus/icons-vue'

const router = useRouter()
const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()

// 服务器对话框
const serverDialogVisible = ref(false)
const serverDialogTitle = ref('添加服务器')
const isServerEdit = ref(false)
const loading = ref(false)

const formRef = ref(null)

const serverFormData = ref({
  id: '',
  name: '',
  type: 'ssh', // 'ssh' | 'localhost'
  osType: 'linux', // 'linux' | 'darwin' | 'windows'
  host: '',
  port: 22,
  username: '',
  password: '',
  privateKey: '',
  description: ''
})

const authType = ref('password') // password | privateKey

// 计算属性：是否为远程服务器
const isRemoteServer = computed(() => serverFormData.value.type === 'ssh')

const serverFormRules = {
  name: [{ required: true, message: '请输入宿主机名称', trigger: 'blur' }],
  host: [{
    validator: (rule, value, callback) => {
      if (isRemoteServer.value && !value) {
        callback(new Error('请输入服务器地址'))
      } else {
        callback()
      }
    },
    trigger: 'blur'
  }],
  port: [{
    validator: (rule, value, callback) => {
      if (isRemoteServer.value && !value) {
        callback(new Error('请输入SSH端口'))
      } else {
        callback()
      }
    },
    trigger: 'blur'
  }],
  username: [{
    validator: (rule, value, callback) => {
      if (isRemoteServer.value && !value) {
        callback(new Error('请输入用户名'))
      } else {
        callback()
      }
    },
    trigger: 'blur'
  }],
  password: [
    {
      validator: (rule, value, callback) => {
        if (isRemoteServer.value && authType.value === 'password' && !value) {
          callback(new Error('请输入密码'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  privateKey: [
    {
      validator: (rule, value, callback) => {
        if (isRemoteServer.value && authType.value === 'privateKey' && !value) {
          callback(new Error('请输入私钥路径'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 服务器列表
const servers = computed(() => serverStore.servers)

// 环境列表（按服务器分组，用于显示环境数量）
const environmentsByServer = computed(() => {
  const result = {}
  for (const server of servers.value) {
    result[server.id] = environmentStore.getEnvironmentsByServerId(server.id)
  }
  return result
})

onMounted(() => {
  serverStore.loadServers()
  environmentStore.loadEnvironments()
})

// ==================== 服务器操作 ====================

// 打开添加服务器对话框
const handleAddServer = () => {
  isServerEdit.value = false
  serverDialogTitle.value = '添加宿主机'
  resetServerForm()
  serverDialogVisible.value = true
}

// 打开编辑服务器对话框
const handleEditServer = (server) => {
  isServerEdit.value = true
  serverDialogTitle.value = '编辑宿主机'
  serverFormData.value = {
    ...server,
    type: server.type || 'ssh',
    osType: server.osType || 'linux'
  }
  authType.value = server.privateKey ? 'privateKey' : 'password'
  serverDialogVisible.value = true
}

// 当类型切换时，自动检测本地系统类型
const handleTypeChange = async (type) => {
  if (type === 'localhost') {
    // 自动检测当前系统类型
    const userAgent = navigator.userAgent || ''
    const platform = navigator.platform || ''

    if (platform.includes('Mac') || platform.includes('Darwin') || userAgent.includes('Mac')) {
      serverFormData.value.osType = 'darwin'
    } else if (platform.includes('Win') || userAgent.includes('Windows')) {
      serverFormData.value.osType = 'windows'
    } else {
      serverFormData.value.osType = 'linux'
    }
  }
}

// 删除服务器
const handleDeleteServer = async (server) => {
  try {
    const envs = environmentStore.getEnvironmentsByServerId(server.id)
    const envCount = envs.length
    const envMessage = envCount > 0
      ? `这将同时删除该宿主机下的 ${envCount} 个环境配置。`
      : ''

    await ElMessageBox.confirm(
      `确定要删除宿主机 "${server.name}" 吗？${envMessage}`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 删除宿主机下的所有环境
    for (const env of envs) {
      await environmentStore.deleteEnvironment(env.id)
    }

    await serverStore.deleteServer(server.id)
    ElMessage.success('删除成功')
  } catch (error) {
    // 用户取消
  }
}

// 测试连接
const handleTestConnection = async (server) => {
  // localhost 不需要测试连接
  if (server.type === 'localhost') {
    ElMessage.success('本地宿主机无需连接测试')
    return
  }

  loading.value = true
  serverStore.updateServerStatus(server.id, 'connecting')

  try {
    const result = await window.api.ssh.connect({
      serverId: server.id,
      type: server.type || 'ssh',
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      privateKey: server.privateKey
    })

    if (result.success) {
      serverStore.updateServerStatus(server.id, 'connected')
      ElMessage.success('连接成功')

      setTimeout(async () => {
        await window.api.ssh.disconnect(server.id)
        serverStore.updateServerStatus(server.id, 'disconnected')
      }, 3000)
    } else {
      serverStore.updateServerStatus(server.id, 'error')
      ElMessage.error(`连接失败: ${result.error}`)
    }
  } catch (error) {
    serverStore.updateServerStatus(server.id, 'error')
    ElMessage.error(`连接失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// 提交服务器表单
const handleSubmitServer = async () => {
  try {
    await formRef.value.validate()
  } catch (error) {
    return
  }

  loading.value = true
  try {
    const data = { ...serverFormData.value }

    if (authType.value === 'password') {
      data.privateKey = ''
    } else {
      data.password = ''
    }

    if (isServerEdit.value) {
      await serverStore.updateServer(data.id, data)
      ElMessage.success('更新成功')
    } else {
      await serverStore.addServer(data)
      ElMessage.success('添加成功')
    }

    serverDialogVisible.value = false
  } catch (error) {
    ElMessage.error(`操作失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// 重置服务器表单
const resetServerForm = () => {
  serverFormData.value = {
    id: '',
    name: '',
    type: 'ssh',
    osType: 'linux',
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    description: ''
  }
  authType.value = 'password'
  formRef.value?.resetFields()
}

// ==================== 通用 ====================

// 获取状态标签类型
const getStatusType = (status) => {
  const statusMap = {
    disconnected: '',
    connecting: 'warning',
    connected: 'success',
    error: 'danger'
  }
  return statusMap[status] || ''
}

// 获取状态文本
const getStatusText = (status) => {
  const textMap = {
    disconnected: '未连接',
    connecting: '连接中',
    connected: '已连接',
    error: '连接失败'
  }
  return textMap[status] || '未知'
}

// 跳转到服务器详情页面
const goToServerDetails = (server) => {
  router.push({
    path: `/servers/${server.id}`
  })
}
</script>

<template>
  <div class="server-management">
    <!-- 操作栏 -->
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="handleAddServer">
        添加宿主机
      </el-button>
    </div>

    <!-- 服务器列表 -->
    <div v-if="servers.length === 0" class="empty-state">
      <el-empty description="暂无宿主机配置，请添加宿主机">
        <el-button type="primary" @click="handleAddServer">添加宿主机</el-button>
      </el-empty>
    </div>

    <!-- 服务器卡片网格 -->
    <div v-else class="server-grid">
      <div v-for="server in servers" :key="server.id" class="server-card">
        <div class="card-header">
          <div class="server-info">
            <el-icon :size="24" style="margin-right: 12px;"><Connection /></el-icon>
            <div class="server-details">
              <div class="server-name">
                {{ server.name }}
                <el-tag v-if="server.type === 'localhost'" type="info" size="small" style="margin-left: 8px;">本地</el-tag>
                <el-tag v-else type="success" size="small" style="margin-left: 8px;">远程</el-tag>
              </div>
              <div class="server-host" v-if="server.type === 'ssh'">{{ server.host }}:{{ server.port }}</div>
              <div class="server-host" v-else>
                {{ server.osType === 'darwin' ? 'macOS' : server.osType === 'windows' ? 'Windows' : 'Linux' }} 本地环境
              </div>
            </div>
          </div>
          <el-tag :type="getStatusType(server.status)" size="small">
            {{ getStatusText(server.status) }}
          </el-tag>
        </div>

        <el-divider style="margin: 16px 0;" />

        <div class="card-body">
          <div class="info-row" v-if="server.type === 'ssh'">
            <span class="label">用户名:</span>
            <span class="value">{{ server.username }}</span>
          </div>
          <div class="info-row" v-if="server.type === 'ssh'">
            <span class="label">认证:</span>
            <span class="value">{{ server.privateKey ? '私钥' : '密码' }}</span>
          </div>
          <div class="info-row" v-if="server.type === 'localhost'">
            <span class="label">系统:</span>
            <span class="value">{{ server.osType === 'darwin' ? 'macOS' : server.osType === 'windows' ? 'Windows' : 'Linux' }}</span>
          </div>
          <div class="info-row">
            <span class="label">描述:</span>
            <span class="value">{{ server.description || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="label">环境数量:</span>
            <span class="value">{{ environmentsByServer[server.id]?.length || 0 }} 个</span>
          </div>
        </div>

        <div class="card-footer">
          <el-button
            type="primary"
            size="small"
            :icon="ArrowRight"
            @click="goToServerDetails(server)"
          >
            查看详情
          </el-button>
          <el-button
            size="small"
            :icon="Edit"
            @click="handleEditServer(server)"
          >
            编辑
          </el-button>
          <el-button
            v-if="server.type === 'ssh'"
            size="small"
            :icon="Connection"
            :loading="server.status === 'connecting'"
            @click="handleTestConnection(server)"
          >
            测试连接
          </el-button>
          <el-button
            type="danger"
            size="small"
            :icon="Delete"
            @click="handleDeleteServer(server)"
          >
            删除
          </el-button>
        </div>
      </div>
    </div>

    <!-- 添加/编辑服务器对话框 -->
    <el-dialog
      v-model="serverDialogVisible"
      :title="serverDialogTitle"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="serverFormData"
        :rules="serverFormRules"
        label-width="100px"
      >
        <el-form-item label="宿主机名称" prop="name">
          <el-input v-model="serverFormData.name" placeholder="请输入宿主机名称" />
        </el-form-item>

        <el-form-item label="类型">
          <el-radio-group v-model="serverFormData.type" @change="handleTypeChange">
            <el-radio label="ssh">远程服务器</el-radio>
            <el-radio label="localhost">本地宿主机</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- SSH 相关字段 -->
        <template v-if="isRemoteServer">
          <el-form-item label="服务器地址" prop="host">
            <el-input v-model="serverFormData.host" placeholder="请输入服务器地址" />
          </el-form-item>

          <el-form-item label="SSH端口" prop="port">
            <el-input-number v-model="serverFormData.port" :min="1" :max="65535" controls-position="right" />
          </el-form-item>

          <el-form-item label="用户名" prop="username">
            <el-input v-model="serverFormData.username" placeholder="请输入用户名" />
          </el-form-item>

          <el-form-item label="认证方式">
            <el-radio-group v-model="authType">
              <el-radio label="password">密码</el-radio>
              <el-radio label="privateKey">私钥</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="密码" prop="password" v-if="authType === 'password'">
            <el-input v-model="serverFormData.password" type="password" placeholder="请输入密码" show-password />
          </el-form-item>

          <el-form-item label="私钥路径" prop="privateKey" v-if="authType === 'privateKey'">
            <el-input v-model="serverFormData.privateKey" placeholder="请输入私钥路径，如: ~/.ssh/id_rsa" />
          </el-form-item>
        </template>

        <!-- localhost 相关字段 -->
        <template v-if="!isRemoteServer">
          <el-form-item label="操作系统">
            <el-tag>{{ serverFormData.osType === 'darwin' ? 'macOS' : serverFormData.osType === 'windows' ? 'Windows' : 'Linux' }}</el-tag>
            <span style="margin-left: 12px; color: #909399; font-size: 12px;">（自动检测）</span>
          </el-form-item>
        </template>

        <el-form-item label="描述">
          <el-input v-model="serverFormData.description" type="textarea" :rows="3" placeholder="请输入描述（可选）" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="serverDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleSubmitServer">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.server-management {
  padding: 20px;
  background: #f5f7fa;
  min-height: calc(100vh - 140px);

  .toolbar {
    margin-bottom: 20px;
  }

  .empty-state {
    margin-top: 100px;
    background: #fff;
    border-radius: 8px;
    padding: 40px;
  }

  .server-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 20px;
  }

  .server-card {
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    height: 320px;

    &:hover {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
      transform: translateY(-2px);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      flex-shrink: 0;

      .server-info {
        display: flex;
        align-items: center;
        flex: 1;

        .server-details {
          .server-name {
            font-size: 16px;
            font-weight: 600;
            color: #303133;
            margin-bottom: 4px;
          }

          .server-host {
            font-size: 13px;
            color: #909399;
          }
        }
      }
    }

    .card-body {
      padding: 0 20px 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;

      .info-row {
        display: flex;
        margin-bottom: 12px;

        &:last-child {
          margin-bottom: 0;
        }

        .label {
          min-width: 80px;
          font-size: 13px;
          color: #909399;
        }

        .value {
          font-size: 13px;
          color: #606266;
          flex: 1;
        }
      }
    }

    .card-footer {
      padding: 16px 20px;
      border-top: 1px solid #e4e7ed;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
      margin-top: auto;
      align-items: center;
      min-height: 64px;
    }
  }
}
</style>
