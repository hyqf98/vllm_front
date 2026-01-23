<template>
  <div class="server-details">
    <div class="header">
      <el-page-header :title="server?.name || '服务器详情'" @back="goBack">
        <template #content>
          <div class="header-content">
            <div class="server-name">
              {{ server?.name }}
              <el-tag v-if="server?.type === 'localhost'" type="info" size="small" style="margin-left: 8px;">本地</el-tag>
              <el-tag v-else type="success" size="small" style="margin-left: 8px;">远程</el-tag>
            </div>
            <el-tag :type="getStatusType(server?.status)" size="small" class="status-tag">
              {{ getStatusText(server?.status) }}
            </el-tag>
          </div>
        </template>
        <template #extra>
          <el-button
            v-if="server?.type !== 'localhost'"
            :type="detailPageConnectionStatus === 'connected' ? 'success' : 'default'"
            :icon="Connection"
            :loading="connecting"
            @click="toggleConnection"
          >
            {{ detailPageConnectionStatus === 'connected' ? '断开连接' : '连接' }}
          </el-button>
          <el-button type="primary" :icon="Refresh" :loading="loading" @click="refreshServerInfo">
            刷新
          </el-button>
        </template>
      </el-page-header>
    </div>

    <el-divider />

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="info-card">
          <template #header>
            <div class="card-header">
              <span>服务器基础信息</span>
            </div>
          </template>

          <div class="card-content">
            <div v-if="loading && !serverInfo.os && !serverInfo.cpu && !serverInfo.memory" class="loading-data">
              <el-empty description="正在加载服务器信息..." />
            </div>
            <div v-else>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="宿主机名称">
                  {{ server?.name }}
                </el-descriptions-item>
                <el-descriptions-item v-if="server?.type === 'ssh'" label="服务器地址">
                  {{ server?.host }}:{{ server?.port }}
                </el-descriptions-item>
                <el-descriptions-item v-if="server?.type === 'ssh'" label="用户名">
                  {{ server?.username }}
                </el-descriptions-item>
                <el-descriptions-item v-if="server?.type === 'localhost'" label="类型">
                  本地宿主机
                </el-descriptions-item>
                <el-descriptions-item v-if="server?.type === 'localhost'" label="操作系统">
                  {{ server?.osType === 'darwin' ? 'macOS' : server?.osType === 'windows' ? 'Windows' : 'Linux' }}
                </el-descriptions-item>
                <el-descriptions-item label="描述">
                  {{ server?.description || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="连接状态">
                  <el-tag :type="getStatusType(server?.status)" size="small">
                    {{ getStatusText(server?.status) }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="系统信息">
                  {{ serverInfo?.os?.name }} {{ serverInfo?.os?.version }}
                </el-descriptions-item>
                <el-descriptions-item label="内存总量">
                  {{ formatBytes(serverInfo?.memory?.total) || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="内存使用率">
                  <el-progress
                    :percentage="parseFloat(serverInfo?.memory?.usagePercent) || 0"
                    :status="getMemoryStatus(parseFloat(serverInfo?.memory?.usagePercent))"
                  />
                  <span class="memory-info">
                    已用: {{ formatBytes(serverInfo?.memory?.used) }} /
                    总计: {{ formatBytes(serverInfo?.memory?.total) }}
                  </span>
                </el-descriptions-item>
                <el-descriptions-item label="磁盘信息">
                  <div class="disk-container">
                    <div v-for="(disk, index) in serverInfo?.disks || []" :key="index" class="disk-item">
                      <div class="disk-path">{{ disk.mount || disk.path }}</div>
                      <el-progress
                        :percentage="parseFloat(disk.usagePercent) || 0"
                        :status="getDiskStatus(parseFloat(disk.usagePercent))"
                      />
                      <span class="disk-info">
                        已用: {{ formatBytes(disk.used) }} /
                        总计: {{ formatBytes(disk.total) }}
                      </span>
                      <el-divider v-if="index < (serverInfo?.disks?.length || 0) - 1" class="disk-divider" />
                    </div>
                  </div>
                </el-descriptions-item>
              </el-descriptions>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="info-card">
          <template #header>
            <div class="card-header">
              <el-tabs v-model="hardwareTab" type="card" size="small">
                <el-tab-pane label="CPU" name="cpu" />
                <el-tab-pane label="GPU" name="gpu" />
              </el-tabs>
            </div>
          </template>

          <div class="card-content">
            <!-- CPU 信息 -->
            <div v-if="hardwareTab === 'cpu'" class="hardware-content">
              <div v-if="serverInfo?.cpu" class="hardware-container">
                <el-descriptions :column="1" border>
                  <el-descriptions-item label="CPU 型号">
                    {{ serverInfo.cpu.model || '-' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="核心数">
                    {{ serverInfo.cpu.cores || '-' }} 核
                  </el-descriptions-item>
                  <el-descriptions-item label="线程数">
                    {{ serverInfo.cpu.threads || '-' }} 线程
                  </el-descriptions-item>
                  <el-descriptions-item label="架构">
                    {{ serverInfo.cpu.arch || '-' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="主频">
                    {{ serverInfo.cpu.frequency || '-' }} GHz
                  </el-descriptions-item>
                  <el-descriptions-item label="使用率">
                    <el-progress
                      :percentage="serverInfo.cpu.usagePercent || 0"
                      :status="getCPUUsageStatus(serverInfo.cpu.usagePercent)"
                    />
                    <span class="memory-info">{{ serverInfo.cpu.usagePercent || 0 }}%</span>
                  </el-descriptions-item>
                  <el-descriptions-item label="温度">
                    <span :class="getTempStatusClass(serverInfo.cpu.temperature)">
                      {{ serverInfo.cpu.temperature || '-' }}°C
                    </span>
                  </el-descriptions-item>
                </el-descriptions>
              </div>
              <div v-else class="no-hardware-info">
                <el-empty description="暂无 CPU 信息" />
              </div>
            </div>

            <!-- GPU 信息 -->
            <div v-else class="hardware-content">
              <div v-if="serverInfo?.gpus && serverInfo.gpus.length > 0" class="gpu-container">
                <div v-for="(gpu, index) in serverInfo.gpus" :key="index" class="gpu-item">
                  <el-descriptions :column="1" border>
                    <el-descriptions-item label="GPU 名称">
                      {{ gpu.name }}
                    </el-descriptions-item>
                    <el-descriptions-item label="GPU ID">
                      {{ gpu.id }}
                    </el-descriptions-item>
                    <el-descriptions-item label="显存总量">
                      {{ formatBytes(gpu.memoryTotal) }}
                    </el-descriptions-item>
                    <el-descriptions-item label="显存使用">
                      <el-progress
                        :percentage="gpu.memoryUsagePercent || 0"
                        :status="getGPUMemoryStatus(gpu.memoryUsagePercent)"
                      />
                      <span class="gpu-memory-info">
                        已用: {{ formatBytes(gpu.memoryUsed) }} /
                        总计: {{ formatBytes(gpu.memoryTotal) }}
                      </span>
                    </el-descriptions-item>
                    <el-descriptions-item label="GPU 使用率">
                      <el-progress
                        :percentage="gpu.gpuUtil || 0"
                        :status="getGPUUtilStatus(gpu.gpuUtil)"
                      />
                      <span>{{ gpu.gpuUtil || 0 }}%</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="温度">
                      <span :class="getTempStatusClass(gpu.temperature)">
                        {{ gpu.temperature || '-' }}°C
                      </span>
                    </el-descriptions-item>
                    <el-descriptions-item label="功耗">
                      {{ gpu.powerDraw || '-' }}W / {{ gpu.powerLimit || '-' }}W
                    </el-descriptions-item>
                    <el-descriptions-item label="风扇转速">
                      {{ gpu.fanSpeed || '-' }}%
                    </el-descriptions-item>
                  </el-descriptions>
                  <el-divider v-if="index < serverInfo.gpus.length - 1" />
                </div>
              </div>
              <div v-else class="no-gpu-info">
                <el-empty description="暂无 GPU 信息" />
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 环境管理区域 -->
    <el-divider style="margin: 20px 0;" />
    <div class="environments-section">
      <div class="section-header">
        <h3>环境管理</h3>
        <el-button type="primary" :icon="Plus" @click="handleAddEnvironment">
          新增环境
        </el-button>
      </div>

      <div v-if="serverEnvironments.length === 0" class="empty-state">
        <el-empty description="暂无环境配置，请添加环境">
          <el-button type="primary" @click="handleAddEnvironment">新增环境</el-button>
        </el-empty>
      </div>

      <div v-else class="environments-grid">
        <div v-for="env in serverEnvironments" :key="env.id" class="environment-card">
          <div class="env-card-header">
            <div class="env-info">
              <el-icon :size="20" style="margin-right: 8px;"><FolderOpened /></el-icon>
              <span class="env-name">{{ env.name || getEnvTypeText(env.type) }}</span>
            </div>
            <el-tag :type="getEnvTypeTag(env.type)" size="small">
              {{ getEnvTypeText(env.type) }}
            </el-tag>
          </div>

          <div class="env-card-body">
            <!-- conda 类型：显示环境路径和环境名称 -->
            <template v-if="env.type === 'conda'">
              <div class="env-info-row">
                <span class="label">环境路径:</span>
                <span class="value">{{ env.path }}</span>
              </div>
              <div class="env-info-row">
                <span class="label">环境名称:</span>
                <span class="value">{{ env.name }}</span>
              </div>
            </template>

            <!-- uv 类型：显示环境路径 -->
            <template v-else-if="env.type === 'uv'">
              <div class="env-info-row">
                <span class="label">环境路径:</span>
                <span class="value">{{ env.path }}</span>
              </div>
            </template>

            <!-- system 类型：显示 python 和 pip 路径 -->
            <template v-else-if="env.type === 'system'">
              <div class="env-info-row">
                <span class="label">Python 路径:</span>
                <span class="value">{{ env.pythonPath }}</span>
              </div>
              <div class="env-info-row">
                <span class="label">Pip 路径:</span>
                <span class="value">{{ env.pipPath }}</span>
              </div>
            </template>

            <div class="env-info-row" v-if="env.description">
              <span class="label">描述:</span>
              <span class="value">{{ env.description }}</span>
            </div>
          </div>

          <div class="env-card-footer">
            <el-button
              size="small"
              :icon="Edit"
              @click="handleEditEnvironment(env)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              size="small"
              :icon="Delete"
              @click="handleDeleteEnvironment(env)"
            >
              删除
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 文件管理区域 -->
    <el-divider style="margin: 20px 0;" />
    <div class="file-manager-section">
      <div class="section-header">
        <h3>文件管理</h3>
      </div>

      <div class="file-manager-container">
        <FileManager
          v-if="detailPageConnectionStatus === 'connected'"
          :server-id="server?.id"
        />
        <div v-else class="connect-prompt">
          <el-empty description="请先连接服务器以使用文件管理功能">
            <el-button type="primary" @click="connectToServer">立即连接</el-button>
          </el-empty>
        </div>
      </div>
    </div>

    <!-- 新增/编辑环境对话框 -->
    <el-dialog
      v-model="envDialogVisible"
      :title="envDialogTitle"
      width="700px"
      :close-on-click-modal="false"
    >
      <!-- 后台扫描提示 -->
      <div v-if="detectingPaths" class="detecting-hint">
        <el-icon :size="16" class="is-loading"><Refresh /></el-icon>
        <span>正在后台检测环境路径，您可以先手动输入...</span>
      </div>

      <!-- 检测到的路径 -->
      <div v-if="detectedPaths.length > 0" class="detected-paths">
        <div class="detected-title">检测到的环境：</div>
        <el-tag
          v-for="(path, index) in detectedPaths"
          :key="index"
          class="detected-tag"
          @click="handleSelectDetectedPath(path)"
        >
          {{ path.displayName || path.name }}
        </el-tag>
      </div>

      <el-form
        ref="envFormRef"
        :model="envFormData"
        :rules="envFormRules"
        label-width="120px"
        :style="detectedPaths.length > 0 ? 'margin-top: 20px;' : ''"
      >
          <el-form-item label="环境类型" prop="type">
            <el-radio-group v-model="envFormData.type" @change="handleEnvTypeChange">
              <el-radio label="conda">Conda</el-radio>
              <el-radio label="uv">UV</el-radio>
              <el-radio label="system">系统 Python</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item
            v-if="envFormData.type === 'conda' || envFormData.type === 'uv'"
            label="环境路径"
            prop="path"
            :required="envFormData.type === 'conda' || envFormData.type === 'uv'"
          >
            <el-input
              v-model="envFormData.path"
              placeholder="conda: ~/miniconda3 | uv: ~/.local"
              @input="handlePathInput"
            />
          </el-form-item>

          <!-- 只有 conda 类型才显示环境名称 -->
          <el-form-item
            v-if="envFormData.type === 'conda'"
            label="环境名称"
            prop="name"
            required
          >
            <el-select
              v-model="envFormData.name"
              placeholder="请选择或输入环境名称"
              filterable
              allow-create
              style="width: 100%"
              @change="handleEnvNameChange"
            >
              <el-option
                v-for="option in getEnvNameOptions()"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>

          <!-- 只有 system 类型才显示 Python 和 Pip 路径 -->
          <el-form-item
            v-if="envFormData.type === 'system'"
            label="Python 路径"
            prop="pythonPath"
            required
          >
            <el-input v-model="envFormData.pythonPath" placeholder="例如: /usr/bin/python3" />
          </el-form-item>

          <el-form-item
            v-if="envFormData.type === 'system'"
            label="Pip 路径"
            prop="pipPath"
            required
          >
            <el-input v-model="envFormData.pipPath" placeholder="例如: /usr/bin/pip3" />
          </el-form-item>

          <el-form-item label="描述">
            <el-input v-model="envFormData.description" type="textarea" :rows="2" placeholder="请输入描述（可选）" />
          </el-form-item>
        </el-form>

      <template #footer>
        <el-button @click="envDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="envLoading" @click="handleSubmitEnvironment">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Connection, Plus, Edit, Delete, FolderOpened } from '@element-plus/icons-vue'
import FileManager from '@renderer/components/FileManager.vue'

const router = useRouter()
const route = useRoute()
const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()

const loading = ref(false)
const connecting = ref(false)
const serverInfo = ref({})
const detailPageConnectionStatus = ref('disconnected')
const hardwareTab = ref('cpu') // CPU/GPU 选项卡

// 环境管理相关
const envDialogVisible = ref(false)
const envDialogTitle = ref('新增环境')
const isEnvEdit = ref(false)
const envLoading = ref(false)
const detectingPaths = ref(false)
const detectedPaths = ref([])
const condaEnvList = ref([]) // 当前 conda 路径的环境列表
const envFormRef = ref(null)

const envFormData = ref({
  id: '',
  serverId: '',
  name: '',
  type: 'conda',
  path: '',
  pythonPath: '',
  pipPath: '',
  description: ''
})

const envFormRules = {
  name: [
    {
      validator: (rule, value, callback) => {
        // 只有 conda 类型才需要验证 name
        if (envFormData.value.type === 'conda') {
          if (!value || !value.trim()) {
            callback(new Error('请选择或输入环境名称'))
          } else {
            callback()
          }
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ],
  type: [{ required: true, message: '请选择环境类型', trigger: 'change' }],
  path: [
    {
      validator: (rule, value, callback) => {
        // conda 和 uv 类型需要验证 path
        if (envFormData.value.type === 'conda' || envFormData.value.type === 'uv') {
          if (!value || !value.trim()) {
            callback(new Error('请输入环境路径'))
          } else {
            callback()
          }
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  pythonPath: [
    {
      validator: (rule, value, callback) => {
        // 只有 system 类型需要验证 pythonPath
        if (envFormData.value.type === 'system') {
          if (!value || !value.trim()) {
            callback(new Error('请输入或选择 Python 路径'))
          } else {
            callback()
          }
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  pipPath: [
    {
      validator: (rule, value, callback) => {
        // 只有 system 类型需要验证 pipPath
        if (envFormData.value.type === 'system') {
          if (!value || !value.trim()) {
            callback(new Error('请输入或选择 Pip 路径'))
          } else {
            callback()
          }
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 获取当前服务器
const server = computed(() => {
  const serverId = route.params.id
  return serverStore.servers.find(s => s.id === serverId)
})

// 获取当前服务器的环境列表
const serverEnvironments = computed(() => {
  if (!server.value) return []
  return environmentStore.getEnvironmentsByServerId(server.value.id)
})

// 获取服务器信息
const getServerInfo = async () => {
  if (!server.value) {
    ElMessage.error('服务器不存在')
    return
  }

  loading.value = true
  try {
    // 主进程会自动处理连接
    const baseInfo = await window.api.ssh.getServerInfo(server.value.id)

    if (baseInfo.success) {
      serverInfo.value = baseInfo.data
      detailPageConnectionStatus.value = 'connected'
      serverStore.updateServerStatus(server.value.id, 'connected')
    } else {
      ElMessage.error(`获取服务器信息失败: ${baseInfo.error}`)
      detailPageConnectionStatus.value = 'error'
      serverStore.updateServerStatus(server.value.id, 'error')
    }
  } catch (error) {
    ElMessage.error(`获取服务器信息失败: ${error.message}`)
    detailPageConnectionStatus.value = 'error'
    serverStore.updateServerStatus(server.value.id, 'error')
  } finally {
    loading.value = false
  }
}

// 刷新服务器信息
const refreshServerInfo = async () => {
  // 主进程会自动处理连接
  await getServerInfo()
}

// 返回上一页
const goBack = () => {
  router.back()
}

// 切换连接状态
const toggleConnection = async () => {
  if (detailPageConnectionStatus.value === 'connected') {
    await disconnectServer()
  } else {
    await connectToServer()
  }
}

// 连接服务器
const connectToServer = async () => {
  if (!server.value) {
    ElMessage.error('服务器不存在')
    return
  }

  // localhost 不需要连接
  if (server.value.type === 'localhost') {
    detailPageConnectionStatus.value = 'connected'
    serverStore.updateServerStatus(server.value.id, 'connected')
    ElMessage.success('本地宿主机已就绪')
    return
  }

  connecting.value = true
  try {
    const connectResult = await window.api.ssh.connect({
      serverId: server.value.id,
      type: server.value.type || 'ssh',
      host: server.value.host,
      port: server.value.port,
      username: server.value.username,
      password: server.value.password,
      privateKey: server.value.privateKey
    })

    if (!connectResult.success) {
      ElMessage.error(`连接服务器失败: ${connectResult.error}`)
      detailPageConnectionStatus.value = 'error'
      serverStore.updateServerStatus(server.value.id, 'error')
      return
    }

    detailPageConnectionStatus.value = 'connected'
    serverStore.updateServerStatus(server.value.id, 'connected')
    ElMessage.success('服务器连接成功')
  } catch (error) {
    ElMessage.error(`连接服务器失败: ${error.message}`)
    detailPageConnectionStatus.value = 'error'
    serverStore.updateServerStatus(server.value.id, 'error')
  } finally {
    connecting.value = false
  }
}

// 断开服务器连接
const disconnectServer = async () => {
  if (server.value) {
    // localhost 不需要断开
    if (server.value.type === 'localhost') {
      detailPageConnectionStatus.value = 'disconnected'
      ElMessage.success('本地宿主机已断开')
      return
    }

    try {
      await window.api.ssh.disconnect(server.value.id)
    } catch (error) {
      // 忽略断开连接的错误
    }
    detailPageConnectionStatus.value = 'disconnected'
    ElMessage.success('服务器已断开')
  }
}

// ==================== 环境管理 ====================

// 打开新增环境对话框
const handleAddEnvironment = () => {
  isEnvEdit.value = false
  envDialogTitle.value = '新增环境'
  resetEnvForm()
  envFormData.value.serverId = server.value.id

  // 立即打开对话框，不等待扫描完成
  envDialogVisible.value = true

  // 后台异步检测路径，不阻塞用户操作
  detectEnvironmentPaths()
}

// 打开编辑环境对话框
const handleEditEnvironment = (environment) => {
  isEnvEdit.value = true
  envDialogTitle.value = '编辑环境'
  envFormData.value = { ...environment }
  detectedPaths.value = []

  // 立即打开对话框，不等待扫描完成
  envDialogVisible.value = true

  // 后台异步检测路径，不阻塞用户操作
  detectEnvironmentPaths()
}

// 删除环境
const handleDeleteEnvironment = async (environment) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除环境 "${environment.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await environmentStore.deleteEnvironment(environment.id)
    ElMessage.success('删除成功')
  } catch (error) {
    // 用户取消
  }
}

// 检测环境路径
const detectEnvironmentPaths = async () => {
  detectingPaths.value = true
  detectedPaths.value = []

  try {
    // 主进程会自动处理连接，直接调用 detectEnvironments API
    const result = await window.api.ssh.detectEnvironments(server.value.id)

    if (result.success && result.data) {
      // 转换为组件需要的格式
      const allPaths = []

      // conda 环境：只显示一个选项，不包含具体环境名称
      if (result.data.conda && result.data.conda.length > 0) {
        result.data.conda.forEach(env => {
          allPaths.push({
            type: 'conda',
            path: env.path,
            displayName: `Conda (${env.path})`
          })
        })
      }

      // uv 环境
      if (result.data.uv && result.data.uv.length > 0) {
        result.data.uv.forEach(env => {
          allPaths.push({
            type: 'uv',
            path: env.path,
            name: env.name,
            displayName: `UV: ${env.name}`
          })
        })
      }

      // system python
      if (result.data.system && result.data.system.length > 0) {
        result.data.system.forEach(env => {
          allPaths.push({
            type: 'system',
            path: env.pythonPath,
            name: env.name,
            displayName: env.name,
            pythonPath: env.pythonPath,
            pipPath: env.pipPath
          })
        })
      }

      detectedPaths.value = allPaths

      if (allPaths.length > 0) {
        ElMessage.success(`检测到 ${allPaths.length} 个环境`)
      } else {
        ElMessage.warning('未检测到任何环境')
      }
    } else {
      ElMessage.error(`检测环境失败: ${result.error || '未知错误'}`)
    }
  } catch (error) {
    ElMessage.error(`检测环境失败: ${error.message}`)
  } finally {
    detectingPaths.value = false
  }
}

// 选择检测到的路径
const handleSelectDetectedPath = async (detectedPath) => {
  envFormData.value.type = detectedPath.type

  // 根据类型设置字段
  if (detectedPath.type === 'conda') {
    // conda: 设置路径，然后获取环境列表
    envFormData.value.path = detectedPath.path
    await fetchCondaEnvList(detectedPath.path)
  } else if (detectedPath.type === 'uv') {
    // uv: 只需要环境路径
    envFormData.value.path = detectedPath.path
  } else if (detectedPath.type === 'system') {
    // system: 设置 python 和 pip 路径
    envFormData.value.pythonPath = detectedPath.pythonPath || detectedPath.path
    envFormData.value.pipPath = detectedPath.pipPath || (detectedPath.pythonPath?.replace('python', 'pip'))
  }
}

// 环境类型改变时清空相关字段
const handleEnvTypeChange = async () => {
  const type = envFormData.value.type

  // 清空 conda 环境列表
  condaEnvList.value = []

  // 根据类型清空字段
  if (type === 'conda') {
    // conda：清空路径、环境名称，不需要 python 和 pip 路径
    envFormData.value.path = ''
    envFormData.value.name = ''
  } else if (type === 'uv') {
    // uv：只需要环境路径
    envFormData.value.path = ''
  } else {
    // system：只需要 python 和 pip 路径
    envFormData.value.pythonPath = ''
    envFormData.value.pipPath = ''
  }

  // 清除表单验证状态
  if (envFormRef.value) {
    envFormRef.value.clearValidate()
  }
}

// 获取环境名称/路径下拉框选项
const getEnvNameOptions = () => {
  const type = envFormData.value.type

  if (type === 'conda') {
    // conda：使用从指定路径获取的环境列表
    return condaEnvList.value.map(name => ({ label: name, value: name }))
  } else if (type === 'uv') {
    // uv：显示检测到的脚本执行路径
    const uvDetected = detectedPaths.value.filter(p => p.type === 'uv')
    const paths = []
    for (const detected of uvDetected) {
      if (detected.envNames) {
        detected.envNames.forEach(path => paths.push({ label: path, value: path }))
      }
    }
    return paths
  } else {
    // system：显示检测到的脚本执行路径
    const systemDetected = detectedPaths.value.filter(p => p.type === 'system')
    const paths = []
    for (const detected of systemDetected) {
      if (detected.envNames) {
        detected.envNames.forEach(path => paths.push({ label: path, value: path }))
      }
    }
    return paths
  }
}

// 环境名称改变时（仅 conda 类型使用）
const handleEnvNameChange = () => {
  const type = envFormData.value.type
  const name = envFormData.value.name

  // conda 类型不需要设置 python 和 pip 路径
  // 这里保留空函数，避免移除 @change 事件导致的问题
}

// 从指定 conda 路径获取环境列表
const fetchCondaEnvList = async (condaPath) => {
  if (!server.value?.id || !condaPath) {
    return
  }

  try {
    // 使用新的 getCondaEnvironments API
    const result = await window.api.ssh.getCondaEnvironments(server.value.id, condaPath)

    if (result.success && result.data && result.data.length > 0) {
      condaEnvList.value = result.data
      ElMessage.success(`获取到 ${result.data.length} 个 conda 环境`)

      // 如果当前选择的环境名不在列表中，重置为第一个环境
      if (!condaEnvList.value.includes(envFormData.value.name)) {
        envFormData.value.name = condaEnvList.value[0] || 'base'
      }
    } else {
      ElMessage.warning(`获取环境列表失败: ${result.error || '未知错误'}`)
      // 默认提供 base 环境
      condaEnvList.value = ['base']
      if (!envFormData.value.name) {
        envFormData.value.name = 'base'
      }
    }
  } catch (error) {
    ElMessage.error(`获取环境列表失败: ${error.message}`)
    condaEnvList.value = ['base']
    if (!envFormData.value.name) {
      envFormData.value.name = 'base'
    }
  }
}

// 路径输入处理（带防抖）
let pathInputTimer = null
const handlePathInput = () => {
  clearTimeout(pathInputTimer)

  const type = envFormData.value.type
  const path = envFormData.value.path

  // 只有 conda 类型且有路径时才获取环境列表
  if (type === 'conda' && path && path.trim()) {
    pathInputTimer = setTimeout(() => {
      fetchCondaEnvList(path)
    }, 800) // 800ms 防抖
  }
}

// 提交环境表单
const handleSubmitEnvironment = async () => {
  try {
    await envFormRef.value.validate()
  } catch (error) {
    return
  }

  envLoading.value = true
  try {
    const data = { ...envFormData.value }

    // 对于 uv 和 system 类型，name 字段不需要，使用 pythonPath 作为标识
    if (data.type === 'uv' || data.type === 'system') {
      data.name = data.pythonPath
    }

    if (isEnvEdit.value) {
      await environmentStore.updateEnvironment(data.id, data)
      ElMessage.success('更新成功')
    } else {
      await environmentStore.addEnvironment(data)
      ElMessage.success('添加成功')
    }

    envDialogVisible.value = false
  } catch (error) {
    ElMessage.error(`操作失败: ${error.message}`)
  } finally {
    envLoading.value = false
  }
}

// 重置环境表单
const resetEnvForm = () => {
  envFormData.value = {
    id: '',
    serverId: '',
    name: '',
    type: 'conda',
    path: '',
    pythonPath: '',
    pipPath: '',
    description: ''
  }
  detectedPaths.value = []
  condaEnvList.value = []
  envFormRef.value?.resetFields()
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

// 格式化字节数
const formatBytes = (bytes) => {
  if (!bytes) return '-'
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取内存状态
const getMemoryStatus = (usagePercent) => {
  if (!usagePercent) return undefined
  if (usagePercent > 90) return 'exception'
  if (usagePercent > 70) return 'warning'
  return undefined
}

// 获取CPU使用率状态
const getCPUUsageStatus = (usagePercent) => {
  if (!usagePercent) return undefined
  if (usagePercent > 90) return 'exception'
  if (usagePercent > 70) return 'warning'
  return undefined
}

// 获取磁盘状态
const getDiskStatus = (usagePercent) => {
  if (!usagePercent) return undefined
  if (usagePercent > 90) return 'exception'
  if (usagePercent > 70) return 'warning'
  return undefined
}

// 获取GPU显存状态
const getGPUMemoryStatus = (usagePercent) => {
  if (!usagePercent) return undefined
  if (usagePercent > 90) return 'exception'
  if (usagePercent > 70) return 'warning'
  return undefined
}

// 获取GPU使用率状态
const getGPUUtilStatus = (utilPercent) => {
  if (!utilPercent) return undefined
  if (utilPercent > 90) return 'exception'
  if (utilPercent > 70) return 'warning'
  return undefined
}

// 获取温度状态类
const getTempStatusClass = (temp) => {
  if (!temp) return ''
  if (temp > 80) return 'temp-high'
  if (temp > 70) return 'temp-medium'
  return 'temp-normal'
}

// 获取环境类型标签
const getEnvTypeTag = (type) => {
  const tagMap = {
    conda: 'success',
    uv: 'warning',
    system: 'info'
  }
  return tagMap[type] || ''
}

// 获取环境类型文本
const getEnvTypeText = (type) => {
  const textMap = {
    conda: 'Conda',
    uv: 'UV',
    system: '系统'
  }
  return textMap[type] || type
}

onMounted(async () => {
  environmentStore.loadEnvironments()
  // 尝试连接服务器
  await connectToServer()
  // 如果连接成功，再获取服务器信息
  if (detailPageConnectionStatus.value === 'connected') {
    // 等待一小段时间以确保连接完全建立
    await new Promise(resolve => setTimeout(resolve, 500))
    await getServerInfo()
  }
})

// 组件卸载时断开连接
onUnmounted(async () => {
  await disconnectServer()
})
</script>

<style lang="scss" scoped>
.server-details {
  padding: 20px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-y: auto;

  .header {
    margin-bottom: 20px;
    flex-shrink: 0;

    .header-content {
      display: flex;
      align-items: center;
      gap: 12px;

      .server-name {
        font-size: 18px;
        font-weight: 600;
      }

      .status-tag {
        height: 24px;
        padding: 0 8px;
        line-height: 22px;
      }
    }
  }

  .el-row {
    flex-shrink: 0;
    margin-bottom: 20px;
  }

  .info-card {
    height: 500px;
    display: flex;
    flex-direction: column;
    margin-bottom: 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e4e7ed;
    background: #ffffff;

    :deep(.el-card__header) {
      flex-shrink: 0;
      background: #f5f7fa;
      padding: 16px 20px;
      border-bottom: 1px solid #e4e7ed;

      .card-header {
        font-weight: 600;
        font-size: 15px;
        color: #303133;
        display: flex;
        align-items: center;

        :deep(.el-tabs) {
          flex: 1;

          .el-tabs__header {
            margin: 0;
          }

          .el-tabs__nav {
            border: none;
          }

          .el-tabs__item {
            padding: 0 16px;
            height: 28px;
            line-height: 28px;
            font-size: 13px;
          }
        }
      }
    }

    :deep(.el-card__body) {
      display: flex;
      flex-direction: column;
      padding: 0;
      background: #ffffff;
      overflow: hidden;
      flex: 1;
    }

    .card-content {
      padding: 20px;
      background: #ffffff;
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;

      &::-webkit-scrollbar {
        width: 8px;
      }

      &::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 4px;
        margin: 4px;
      }

      &::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 4px;
        transition: background 0.3s ease;

        &:hover {
          background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
        }
      }
    }

    .memory-info,
    .disk-info,
    .gpu-memory-info {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      color: #909399;
    }

    .disk-container {
      max-height: 200px;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 8px;

      &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      &::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 3px;
      }

      &::-webkit-scrollbar-thumb {
        background-color: #dcdfe6;
        border-radius: 3px;

        &:hover {
          background-color: #c0c4cc;
        }
      }

      .disk-item {
        margin-bottom: 12px;

        &:last-child {
          margin-bottom: 0;
        }

        .disk-divider {
          margin: 12px 0 0 0;
          border-color: #e4e7ed;
        }

        .disk-path {
          font-weight: 500;
          margin-bottom: 4px;
          font-size: 13px;
          color: #606266;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
        }

        .el-progress {
          margin-bottom: 4px;

          :deep(.el-progress__text) {
            font-size: 11px !important;
          }
        }

        .disk-info {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          color: #909399;
        }
      }
    }

    .gpu-container {
      padding-right: 10px;
      max-height: 420px;
      overflow-y: auto;
      overflow-x: hidden;

      &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      &::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 3px;
      }

      &::-webkit-scrollbar-thumb {
        background-color: #dcdfe6;
        border-radius: 3px;

        &:hover {
          background-color: #c0c4cc;
        }
      }
    }

    .gpu-item {
      margin-bottom: 20px;
    }

    .hardware-container {
      padding-right: 10px;
      max-height: 420px;
      overflow-y: auto;
      overflow-x: hidden;

      &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      &::-webkit-scrollbar-track {
        background: #f5f5f5;
        border-radius: 3px;
      }

      &::-webkit-scrollbar-thumb {
        background-color: #dcdfe6;
        border-radius: 3px;

        &:hover {
          background-color: #c0c4cc;
        }
      }
    }

    .hardware-content {
      display: flex;
      flex-direction: column;
    }

    .no-hardware-info {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px 0;
    }

    .no-gpu-info {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px 0;
    }

    .temp-normal {
      color: #67c23a;
    }

    .temp-medium {
      color: #e6a23c;
    }

    .temp-high {
      color: #f56c6c;
    }
  }

  .environments-section {
    flex-shrink: 0;
    margin-bottom: 40px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
    }

    .empty-state {
      background: #fff;
      border-radius: 12px;
      padding: 60px 0;
      text-align: center;
    }

    .environments-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 20px;
    }

    .environment-card {
      background: #fff;
      border: 1px solid #e4e7ed;
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.3s ease;
      height: 220px;
      display: flex;
      flex-direction: column;

      &:hover {
        border-color: #667eea;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        transform: translateY(-2px);
      }

      .env-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: #f5f7fa;
        border-bottom: 1px solid #e4e7ed;
        flex-shrink: 0;
        min-height: 56px;

        .env-info {
          display: flex;
          align-items: center;

          .env-name {
            font-size: 15px;
            font-weight: 600;
            color: #303133;
          }
        }
      }

      .env-card-body {
        padding: 16px 20px;
        flex: 1;
        overflow-y: auto;
        min-height: 0;

        .env-info-row {
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
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
      }

      .env-card-footer {
        padding: 12px 20px;
        border-top: 1px solid #e4e7ed;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        align-items: center;
        flex-shrink: 0;
        min-height: 56px;
      }
    }
  }

  .file-manager-section {
    flex-shrink: 0;
    margin-bottom: 40px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
    }

    .file-manager-container {
      background: #fff;
      border-radius: 12px;
      border: 1px solid #e4e7ed;
      overflow: hidden;
      min-height: 400px;

      .connect-prompt {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
      }
    }
  }

  .detecting-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: #f0f9ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    color: #1e40af;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .detected-paths {
    margin-bottom: 16px;

    .detected-title {
      font-size: 13px;
      color: #606266;
      margin-bottom: 8px;
    }

    .detected-tag {
      margin-right: 8px;
      margin-bottom: 8px;
      cursor: pointer;

      &:hover {
        opacity: 0.8;
      }
    }
  }
}
</style>
