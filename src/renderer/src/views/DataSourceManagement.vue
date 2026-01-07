<script setup>
import { ref, computed, onMounted } from 'vue'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import { ElMessage } from 'element-plus'
import { Refresh, CircleCheck, Connection, Plus, Link, Delete, FolderOpened, Check } from '@element-plus/icons-vue'

const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()

// 选中的服务器和环境
const selectedServerId = ref('')
const selectedEnvironmentId = ref('')

// 是否已加载数据源
const dataSourceLoaded = ref(false)

// 当前数据源信息
const condaDataSource = ref(null)
const pipDataSource = ref(null)

// 配置文件路径
const configFilePaths = ref({
  conda: '',
  pip: ''
})

// 加载状态
const loadingConda = ref(false)
const loadingPip = ref(false)
const testingSpeed = ref(false)

// 自定义数据源对话框
const showCondaCustomDialog = ref(false)
const showPipCustomDialog = ref(false)

// 自定义 Conda 配置
const customCondaForm = ref({
  channels: ['']
})

// 自定义 Pip 配置
const customPipForm = ref({
  indexUrl: '',
  extraIndexUrls: ['']
})

// 预设镜像源
const presetMirrors = {
  conda: [
    {
      name: '清华大学',
      value: 'tsinghua',
      channels: ['https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main'],
      description: '教育网推荐，速度快'
    },
    {
      name: '阿里云',
      value: 'aliyun',
      channels: ['https://mirrors.aliyun.com/anaconda/pkgs/main'],
      description: '国内通用镜像'
    },
    {
      name: '中科大',
      value: 'ustc',
      channels: ['https://mirrors.ustc.edu.cn/anaconda/pkgs/main'],
      description: '教育网推荐'
    },
    {
      name: '华为云',
      value: 'huawei',
      channels: ['https://repo.huaweicloud.com/anaconda/pkgs/main'],
      description: '华为云镜像'
    },
    {
      name: '默认源',
      value: 'default',
      channels: [],
      description: 'Anaconda 官方源'
    }
  ],
  pip: [
    {
      name: '清华大学',
      value: 'tsinghua',
      url: 'https://pypi.tuna.tsinghua.edu.cn/simple',
      description: '教育网推荐，速度快'
    },
    {
      name: '阿里云',
      value: 'aliyun',
      url: 'https://mirrors.aliyun.com/pypi/simple/',
      description: '国内通用镜像'
    },
    {
      name: '中科大',
      value: 'ustc',
      url: 'https://pypi.mirrors.ustc.edu.cn/simple/',
      description: '教育网推荐'
    },
    {
      name: '豆瓣',
      value: 'douban',
      url: 'https://pypi.douban.com/simple',
      description: '历史悠久，稳定'
    },
    {
      name: '华为云',
      value: 'huawei',
      url: 'https://repo.huaweicloud.com/repository/pypi/simple',
      description: '华为云镜像'
    },
    {
      name: '默认源',
      value: 'default',
      url: 'https://pypi.org/simple',
      description: 'PyPI 官方源'
    }
  ]
}

// 计算属性
const allEnvironments = computed(() => {
  if (!selectedServerId.value) return []
  return environmentStore.environments.filter(env => env.serverId === selectedServerId.value)
})

const selectedEnvironment = computed(() => {
  return environmentStore.getEnvironmentById(selectedEnvironmentId.value)
})

const selectedServer = computed(() => {
  return serverStore.servers.find(s => s.id === selectedServerId.value)
})

// 计算配置文件路径
const getConfigFilePaths = () => {
  const server = selectedServer.value
  if (!server) return { conda: '', pip: '' }

  const osType = server.osType || 'linux'

  // Conda 配置文件路径
  let condaPath = ''
  if (server.type === 'localhost') {
    // 本地服务器，根据操作系统类型判断
    if (osType === 'windows') {
      condaPath = '%USERPROFILE%\\.condarc'
    } else {
      // darwin (macOS) 或 linux
      condaPath = '~/.condarc'
    }
  } else {
    // SSH 远程服务器，通常是 Linux
    condaPath = '~/.condarc'
  }

  // Pip 配置文件路径
  let pipPath = ''
  if (server.type === 'localhost') {
    if (osType === 'darwin') {
      pipPath = '~/Library/Application Support/pip/pip.conf'
    } else if (osType === 'windows') {
      pipPath = '%APPDATA%\\pip\\pip.ini'
    } else {
      // linux
      pipPath = '~/.pip/pip.conf'
    }
  } else {
    // SSH 远程服务器
    pipPath = '~/.pip/pip.conf'
  }

  return { conda: condaPath, pip: pipPath }
}

// URL 验证规则
const urlValidator = (rule, value, callback) => {
  if (!value) {
    callback()
    return
  }
  try {
    new URL(value)
    callback()
  } catch (error) {
    callback(new Error('请输入有效的 URL'))
  }
}

// 表单验证规则
const condaRules = {
  channels: [
    {
      validator: (rule, value, callback) => {
        if (!value || value.length === 0 || value.every(v => !v)) {
          callback(new Error('请至少添加一个 Channel'))
          return
        }
        const validUrls = value.filter(v => v)
        for (const url of validUrls) {
          try {
            new URL(url)
          } catch (error) {
            callback(new Error('请输入有效的 URL'))
            return
          }
        }
        callback()
      },
      trigger: 'blur'
    }
  ]
}

const pipRules = {
  indexUrl: [
    { required: true, message: '请输入 Index URL', trigger: 'blur' },
    { validator: urlValidator, trigger: 'blur' }
  ],
  extraIndexUrls: [
    {
      validator: (rule, value, callback) => {
        if (!value || value.length === 0 || value.every(v => !v)) {
          callback()
          return
        }
        for (const url of value) {
          if (url) {
            try {
              new URL(url)
            } catch (error) {
              callback(new Error('请输入有效的 URL'))
              return
            }
          }
        }
        callback()
      },
      trigger: 'blur'
    }
  ]
}

// 加载数据源（点击确定按钮后）
const loadDataSources = async () => {
  if (!selectedServerId.value || !selectedEnvironment.value) {
    ElMessage.warning('请先选择服务器和环境')
    return
  }

  // 清空之前的数据
  condaDataSource.value = null
  pipDataSource.value = null
  dataSourceLoaded.value = false

  // 获取配置文件路径
  configFilePaths.value = getConfigFilePaths()

  // 加载数据源
  await Promise.all([loadCondaDataSource(), loadPipDataSource()])
  dataSourceLoaded.value = true
}

// 加载 Conda 数据源
const loadCondaDataSource = async () => {
  if (!selectedServerId.value || !selectedEnvironment.value) return

  loadingConda.value = true
  try {
    const result = await window.api.datasource.getConda(
      selectedServerId.value,
      selectedEnvironment.value.type,
      selectedEnvironment.value.name
    )
    if (result.success) {
      condaDataSource.value = result.data
    } else {
      ElMessage.error(`加载 Conda 数据源失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`加载 Conda 数据源失败: ${error.message}`)
  } finally {
    loadingConda.value = false
  }
}

// 加载 Pip 数据源
const loadPipDataSource = async () => {
  if (!selectedServerId.value || !selectedEnvironment.value) return

  loadingPip.value = true
  try {
    const result = await window.api.datasource.getPip(
      selectedServerId.value,
      selectedEnvironment.value.type,
      selectedEnvironment.value.name
    )
    if (result.success) {
      pipDataSource.value = result.data
    } else {
      ElMessage.error(`加载 Pip 数据源失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`加载 Pip 数据源失败: ${error.message}`)
  } finally {
    loadingPip.value = false
  }
}

// 刷新所有数据源
const refreshAll = () => {
  if (dataSourceLoaded.value) {
    loadDataSources()
  }
}

// 应用 Conda 预设镜像
const applyCondaPreset = async (preset) => {
  if (!selectedServerId.value) return

  loadingConda.value = true
  try {
    const channels = preset.value === 'default' ? [] : preset.channels
    const result = await window.api.datasource.setConda(selectedServerId.value, channels)
    if (result.success) {
      ElMessage.success(`已切换到 ${preset.name}`)
      await loadCondaDataSource()
    } else {
      ElMessage.error(`切换失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`切换失败: ${error.message}`)
  } finally {
    loadingConda.value = false
  }
}

// 应用 Pip 预设镜像
const applyPipPreset = async (preset) => {
  if (!selectedServerId.value) return

  loadingPip.value = true
  try {
    const url = preset.url
    const result = await window.api.datasource.setPip(selectedServerId.value, url, [])
    if (result.success) {
      ElMessage.success(`已切换到 ${preset.name}`)
      await loadPipDataSource()
    } else {
      ElMessage.error(`切换失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`切换失败: ${error.message}`)
  } finally {
    loadingPip.value = false
  }
}

// 打开自定义 Conda 对话框
const openCondaCustomDialog = () => {
  // 预填充当前配置
  if (condaDataSource.value && condaDataSource.value.channels && condaDataSource.value.channels.length > 0) {
    customCondaForm.value.channels = [...condaDataSource.value.channels]
  } else {
    customCondaForm.value.channels = ['']
  }
  showCondaCustomDialog.value = true
}

// 添加 Conda Channel
const addCondaChannel = () => {
  customCondaForm.value.channels.push('')
}

// 删除 Conda Channel
const removeCondaChannel = (index) => {
  if (customCondaForm.value.channels.length > 1) {
    customCondaForm.value.channels.splice(index, 1)
  }
}

// 应用自定义 Conda 配置
const applyCustomConda = async () => {
  if (!selectedServerId.value) return

  // 验证至少有一个非空 URL
  const validChannels = customCondaForm.value.channels.filter(c => c.trim())
  if (validChannels.length === 0) {
    ElMessage.error('请至少添加一个有效的 Channel URL')
    return
  }

  loadingConda.value = true
  try {
    const result = await window.api.datasource.setConda(selectedServerId.value, validChannels)
    if (result.success) {
      ElMessage.success('自定义 Conda 数据源配置成功')
      showCondaCustomDialog.value = false
      await loadCondaDataSource()
    } else {
      ElMessage.error(`配置失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`配置失败: ${error.message}`)
  } finally {
    loadingConda.value = false
  }
}

// 打开自定义 Pip 对话框
const openPipCustomDialog = () => {
  // 预填充当前配置
  if (pipDataSource.value) {
    customPipForm.value.indexUrl = pipDataSource.value.indexUrl || 'https://pypi.org/simple'
    customPipForm.value.extraIndexUrls = pipDataSource.value.extraIndexUrls || ['']
  } else {
    customPipForm.value.indexUrl = 'https://pypi.org/simple'
    customPipForm.value.extraIndexUrls = ['']
  }
  showPipCustomDialog.value = true
}

// 添加 Pip Extra Index URL
const addPipExtraUrl = () => {
  customPipForm.value.extraIndexUrls.push('')
}

// 删除 Pip Extra Index URL
const removePipExtraUrl = (index) => {
  if (customPipForm.value.extraIndexUrls.length > 1) {
    customPipForm.value.extraIndexUrls.splice(index, 1)
  }
}

// 应用自定义 Pip 配置
const applyCustomPip = async () => {
  if (!selectedServerId.value) return

  // 验证 Index URL
  if (!customPipForm.value.indexUrl.trim()) {
    ElMessage.error('请输入 Index URL')
    return
  }

  try {
    new URL(customPipForm.value.indexUrl)
  } catch (error) {
    ElMessage.error('Index URL 格式不正确')
    return
  }

  loadingPip.value = true
  try {
    // 过滤空 URL
    const extraUrls = customPipForm.value.extraIndexUrls.filter(u => u.trim())

    const result = await window.api.datasource.setPip(
      selectedServerId.value,
      customPipForm.value.indexUrl,
      extraUrls
    )
    if (result.success) {
      ElMessage.success('自定义 Pip 数据源配置成功')
      showPipCustomDialog.value = false
      await loadPipDataSource()
    } else {
      ElMessage.error(`配置失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`配置失败: ${error.message}`)
  } finally {
    loadingPip.value = false
  }
}

// 恢复默认源
const restoreDefault = async (sourceType) => {
  if (!selectedServerId.value) return

  const loading = sourceType === 'conda' ? loadingConda : loadingPip
  loading.value = true
  try {
    const result = await window.api.datasource.restoreDefault(selectedServerId.value, sourceType)
    if (result.success) {
      ElMessage.success('已恢复默认数据源')
      if (sourceType === 'conda') {
        await loadCondaDataSource()
      } else {
        await loadPipDataSource()
      }
    } else {
      ElMessage.error(`恢复失败: ${result.error}`)
    }
  } catch (error) {
    ElMessage.error(`恢复失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// 测试数据源速度
const testSpeed = async (url) => {
  if (!selectedServerId.value) return

  testingSpeed.value = true
  try {
    const result = await window.api.datasource.testSpeed(selectedServerId.value, url)
    if (result.success) {
      ElMessage.success(`连接成功，耗时: ${result.data.time}ms`)
      return result.data.time
    } else {
      ElMessage.error(`测试失败: ${result.error}`)
      return null
    }
  } catch (error) {
    ElMessage.error(`测试失败: ${error.message}`)
    return null
  } finally {
    testingSpeed.value = false
  }
}

// 获取当前 Conda 镜像名称
const getCurrentCondaMirror = computed(() => {
  if (!condaDataSource.value) return '未知'
  if (condaDataSource.value.isDefault) return '默认源'
  const channels = condaDataSource.value.channels || []
  if (channels.length === 0) return '默认源'

  // 检查是否匹配预设镜像
  for (const preset of presetMirrors.conda) {
    if (preset.value !== 'default' && channels.some(c => c.includes(preset.channels[0].split('/')[3]))) {
      return preset.name
    }
  }
  return '自定义'
})

// 获取当前 Pip 镜像名称
const getCurrentPipMirror = computed(() => {
  if (!pipDataSource.value) return '未知'
  if (!pipDataSource.value.hasCustomConfig) return '默认源'

  const url = pipDataSource.value.indexUrl || ''
  // 检查是否匹配预设镜像
  for (const preset of presetMirrors.pip) {
    if (url.includes(preset.value) || url === preset.url) {
      return preset.name
    }
  }
  return '自定义'
})

// 监听环境变化
const onSelectionChange = () => {
  // 切换选择时清空数据源状态，不自动加载
  dataSourceLoaded.value = false
  condaDataSource.value = null
  pipDataSource.value = null
}

// 初始化
onMounted(async () => {
  await serverStore.loadServers()
  await environmentStore.loadEnvironments()

  // 如果有服务器，默认选中第一个
  if (serverStore.servers.length > 0) {
    selectedServerId.value = serverStore.servers[0].id
    const envs = allEnvironments.value
    if (envs.length > 0) {
      selectedEnvironmentId.value = envs[0].id
    }
  }
})
</script>

<template>
  <div class="datasource-management">
    <div class="page-header">
      <h2>数据源管理</h2>
      <p>管理 Conda 和 Pip 的数据源，选择合适的镜像源可以加快包下载速度</p>
    </div>

    <!-- 服务器和环境选择 -->
    <div class="selection-area">
      <div class="selection-item">
        <label>选择服务器:</label>
        <el-select
          v-model="selectedServerId"
          placeholder="请选择服务器"
          @change="onSelectionChange"
          style="width: 300px"
        >
          <el-option
            v-for="server in serverStore.servers"
            :key="server.id"
            :label="server.name"
            :value="server.id"
          >
            <span>{{ server.name }}</span>
            <span style="float: right; color: #8492a6; font-size: 12px">
              {{ server.type === 'localhost' ? '本地' : 'SSH' }}
            </span>
          </el-option>
        </el-select>
      </div>

      <div class="selection-item">
        <label>选择环境:</label>
        <el-select
          v-model="selectedEnvironmentId"
          placeholder="请选择环境"
          :disabled="!selectedServerId"
          @change="onSelectionChange"
          style="width: 300px"
        >
          <el-option
            v-for="env in allEnvironments"
            :key="env.id"
            :label="`${env.name} (${env.type})`"
            :value="env.id"
          />
        </el-select>
      </div>

      <el-button
        type="primary"
        :icon="Check"
        :disabled="!selectedServerId || !selectedEnvironmentId"
        @click="loadDataSources"
      >
        确定
      </el-button>

      <el-button
        v-if="dataSourceLoaded"
        :icon="Refresh"
        @click="refreshAll"
      >
        刷新
      </el-button>
    </div>

    <!-- 配置文件路径信息 -->
    <div v-if="dataSourceLoaded" class="config-paths">
      <div class="path-item">
        <el-icon><FolderOpened /></el-icon>
        <span class="path-label">Conda 配置文件:</span>
        <el-tag type="info" size="small">{{ configFilePaths.conda }}</el-tag>
      </div>
      <div class="path-item">
        <el-icon><FolderOpened /></el-icon>
        <span class="path-label">Pip 配置文件:</span>
        <el-tag type="info" size="small">{{ configFilePaths.pip }}</el-tag>
      </div>
    </div>

    <!-- 数据源配置区域 -->
    <div v-if="dataSourceLoaded" class="datasource-content">
      <!-- Conda 数据源 -->
      <div class="datasource-section">
        <div class="section-header">
          <div class="header-title">
            <el-icon><Connection /></el-icon>
            <h3>Conda 数据源</h3>
          </div>
          <el-tag v-if="condaDataSource" :type="condaDataSource.isDefault ? 'info' : 'success'">
            {{ getCurrentCondaMirror }}
          </el-tag>
        </div>

        <div v-if="loadingConda" class="loading-state">
          <el-icon class="is-loading"><Refresh /></el-icon>
          <span>加载中...</span>
        </div>

        <div v-else-if="condaDataSource" class="section-content">
          <div class="current-config">
            <h4>当前配置</h4>
            <div class="config-info">
              <div v-if="condaDataSource.isDefault" class="info-item">
                <el-icon><CircleCheck /></el-icon>
                <span>使用默认配置</span>
              </div>
              <div v-else class="info-item">
                <el-icon><CircleCheck /></el-icon>
                <span>自定义配置</span>
              </div>
              <div v-if="condaDataSource.channels && condaDataSource.channels.length > 0" class="channels-list">
                <div class="label">Channels:</div>
                <el-tag
                  v-for="(channel, index) in condaDataSource.channels"
                  :key="index"
                  type="info"
                  size="small"
                  style="margin: 4px"
                >
                  {{ channel }}
                </el-tag>
              </div>
            </div>
          </div>

          <div class="preset-mirrors">
            <h4>快速切换镜像</h4>
            <div class="mirror-list">
              <div
                v-for="preset in presetMirrors.conda"
                :key="preset.value"
                class="mirror-item"
                :class="{ active: getCurrentCondaMirror === preset.name }"
              >
                <div class="mirror-info">
                  <div class="mirror-name">{{ preset.name }}</div>
                  <div class="mirror-desc">{{ preset.description }}</div>
                </div>
                <el-button
                  size="small"
                  :type="getCurrentCondaMirror === preset.name ? 'primary' : 'default'"
                  @click="applyCondaPreset(preset)"
                  :disabled="loadingConda"
                >
                  {{ getCurrentCondaMirror === preset.name ? '当前使用' : '应用' }}
                </el-button>
              </div>
            </div>
          </div>

          <div class="custom-source">
            <el-button type="primary" :icon="Plus" @click="openCondaCustomDialog" :disabled="loadingConda">
              自定义数据源
            </el-button>
            <el-button @click="restoreDefault('conda')" :disabled="loadingConda">
              恢复默认源
            </el-button>
          </div>
        </div>
      </div>

      <!-- Pip 数据源 -->
      <div class="datasource-section">
        <div class="section-header">
          <div class="header-title">
            <el-icon><Connection /></el-icon>
            <h3>Pip 数据源</h3>
          </div>
          <el-tag v-if="pipDataSource" :type="pipDataSource.hasCustomConfig ? 'success' : 'info'">
            {{ getCurrentPipMirror }}
          </el-tag>
        </div>

        <div v-if="loadingPip" class="loading-state">
          <el-icon class="is-loading"><Refresh /></el-icon>
          <span>加载中...</span>
        </div>

        <div v-else-if="pipDataSource" class="section-content">
          <div class="current-config">
            <h4>当前配置</h4>
            <div class="config-info">
              <div class="info-item">
                <el-icon><CircleCheck /></el-icon>
                <span v-if="pipDataSource.hasCustomConfig">自定义配置</span>
                <span v-else>使用默认配置</span>
              </div>
              <div v-if="pipDataSource.indexUrl" class="info-item">
                <div class="label">Index URL:</div>
                <el-tag type="info" size="small">{{ pipDataSource.indexUrl }}</el-tag>
              </div>
              <div v-if="pipDataSource.extraIndexUrls && pipDataSource.extraIndexUrls.length > 0" class="info-item">
                <div class="label">Extra Index URLs:</div>
                <el-tag
                  v-for="(url, index) in pipDataSource.extraIndexUrls"
                  :key="index"
                  type="info"
                  size="small"
                  style="margin: 4px"
                >
                  {{ url }}
                </el-tag>
              </div>
            </div>
          </div>

          <div class="preset-mirrors">
            <h4>快速切换镜像</h4>
            <div class="mirror-list">
              <div
                v-for="preset in presetMirrors.pip"
                :key="preset.value"
                class="mirror-item"
                :class="{ active: getCurrentPipMirror === preset.name }"
              >
                <div class="mirror-info">
                  <div class="mirror-name">{{ preset.name }}</div>
                  <div class="mirror-desc">{{ preset.description }}</div>
                </div>
                <el-button
                  size="small"
                  :type="getCurrentPipMirror === preset.name ? 'primary' : 'default'"
                  @click="applyPipPreset(preset)"
                  :disabled="loadingPip"
                >
                  {{ getCurrentPipMirror === preset.name ? '当前使用' : '应用' }}
                </el-button>
              </div>
            </div>
          </div>

          <div class="custom-source">
            <el-button type="primary" :icon="Plus" @click="openPipCustomDialog" :disabled="loadingPip">
              自定义数据源
            </el-button>
            <el-button @click="restoreDefault('pip')" :disabled="loadingPip">
              恢复默认源
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 - 等待选择 -->
    <div v-else class="empty-state">
      <div class="empty-content">
        <el-icon :size="64"><Connection /></el-icon>
        <p>请选择服务器和环境，然后点击"确定"按钮加载数据源配置</p>
      </div>
    </div>

    <!-- 自定义 Conda 数据源对话框 -->
    <el-dialog
      v-model="showCondaCustomDialog"
      title="自定义 Conda 数据源"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="custom-dialog-content">
        <div class="form-item">
          <label>Channels:</label>
          <div class="url-list">
            <div v-for="(channel, index) in customCondaForm.channels" :key="index" class="url-input-group">
              <el-input
                v-model="customCondaForm.channels[index]"
                placeholder="请输入 Channel URL，例如: https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main"
                :prefix-icon="Link"
              >
                <template #append>
                  <el-button
                    :icon="Delete"
                    @click="removeCondaChannel(index)"
                    :disabled="customCondaForm.channels.length === 1"
                  >
                    删除
                  </el-button>
                </template>
              </el-input>
            </div>
            <el-button type="dashed" :icon="Plus" @click="addCondaChannel" style="width: 100%; margin-top: 8px">
              添加 Channel
            </el-button>
          </div>
        </div>

        <div class="tips">
          <h5>常用 Conda 镜像源:</h5>
          <ul>
            <li>清华大学: https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main</li>
            <li>阿里云: https://mirrors.aliyun.com/anaconda/pkgs/main</li>
            <li>中科大: https://mirrors.ustc.edu.cn/anaconda/pkgs/main</li>
            <li>华为云: https://repo.huaweicloud.com/anaconda/pkgs/main</li>
          </ul>
        </div>
      </div>

      <template #footer>
        <el-button @click="showCondaCustomDialog = false">取消</el-button>
        <el-button type="primary" @click="applyCustomConda" :loading="loadingConda">
          应用配置
        </el-button>
      </template>
    </el-dialog>

    <!-- 自定义 Pip 数据源对话框 -->
    <el-dialog
      v-model="showPipCustomDialog"
      title="自定义 Pip 数据源"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="custom-dialog-content">
        <div class="form-item">
          <label>Index URL (主数据源):</label>
          <el-input
            v-model="customPipForm.indexUrl"
            placeholder="请输入 Index URL，例如: https://pypi.tuna.tsinghua.edu.cn/simple"
            :prefix-icon="Link"
          />
        </div>

        <div class="form-item">
          <label>Extra Index URLs (额外数据源，可选):</label>
          <div class="url-list">
            <div v-for="(url, index) in customPipForm.extraIndexUrls" :key="index" class="url-input-group">
              <el-input
                v-model="customPipForm.extraIndexUrls[index]"
                placeholder="请输入额外的 Index URL"
                :prefix-icon="Link"
              >
                <template #append>
                  <el-button
                    @click="removePipExtraUrl(index)"
                    :disabled="customPipForm.extraIndexUrls.length === 1"
                  >
                    删除
                  </el-button>
                </template>
              </el-input>
            </div>
            <el-button type="dashed" :icon="Plus" @click="addPipExtraUrl" style="width: 100%; margin-top: 8px">
              添加额外数据源
            </el-button>
          </div>
        </div>

        <div class="tips">
          <h5>常用 Pip 镜像源:</h5>
          <ul>
            <li>清华大学: https://pypi.tuna.tsinghua.edu.cn/simple</li>
            <li>阿里云: https://mirrors.aliyun.com/pypi/simple/</li>
            <li>中科大: https://pypi.mirrors.ustc.edu.cn/simple/</li>
            <li>豆瓣: https://pypi.douban.com/simple</li>
            <li>华为云: https://repo.huaweicloud.com/repository/pypi/simple</li>
          </ul>
        </div>
      </div>

      <template #footer>
        <el-button @click="showPipCustomDialog = false">取消</el-button>
        <el-button type="primary" @click="applyCustomPip" :loading="loadingPip">
          应用配置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.datasource-management {
  padding: 20px;
  height: 100%;
  overflow-y: auto;

  .page-header {
    margin-bottom: 24px;

    h2 {
      font-size: 24px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 8px;
    }

    p {
      font-size: 14px;
      color: #909399;
      margin: 0;
    }
  }

  .selection-area {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: white;
    border-radius: 8px;
    margin-bottom: 20px;

    .selection-item {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-size: 14px;
        color: #606266;
        white-space: nowrap;
      }
    }
  }

  .config-paths {
    display: flex;
    gap: 20px;
    padding: 16px;
    background: #f0f9ff;
    border-left: 4px solid #409eff;
    border-radius: 6px;
    margin-bottom: 20px;

    .path-item {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;

      .el-icon {
        color: #409eff;
        font-size: 18px;
      }

      .path-label {
        font-size: 13px;
        font-weight: 600;
        color: #303133;
      }
    }
  }

  .datasource-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .datasource-section {
    background: white;
    border-radius: 8px;
    padding: 20px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e4e7ed;

      .header-title {
        display: flex;
        align-items: center;
        gap: 8px;

        h3 {
          font-size: 18px;
          font-weight: 600;
          color: #303133;
          margin: 0;
        }
      }
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 40px;
      color: #909399;

      .el-icon {
        font-size: 20px;
      }
    }

    .section-content {
      h4 {
        font-size: 14px;
        font-weight: 600;
        color: #606266;
        margin-bottom: 12px;
      }

      .current-config {
        margin-bottom: 24px;
        padding: 16px;
        background: #f5f7fa;
        border-radius: 6px;

        .config-info {
          .info-item {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;

            &:last-child {
              margin-bottom: 0;
            }

            .el-icon {
              color: #67c23a;
            }

            .label {
              font-size: 12px;
              color: #909399;
              margin-right: 8px;
            }
          }

          .channels-list {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #e4e7ed;
          }
        }
      }

      .preset-mirrors {
        margin-bottom: 20px;

        .mirror-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mirror-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border: 1px solid #e4e7ed;
          border-radius: 6px;
          transition: all 0.2s;

          &:hover {
            border-color: #409eff;
            background: #f0f7ff;
          }

          &.active {
            border-color: #409eff;
            background: #ecf5ff;
          }

          .mirror-info {
            .mirror-name {
              font-size: 14px;
              font-weight: 600;
              color: #303133;
              margin-bottom: 4px;
            }

            .mirror-desc {
              font-size: 12px;
              color: #909399;
            }
          }
        }
      }

      .custom-source {
        display: flex;
        gap: 12px;
      }
    }
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    background: white;
    border-radius: 8px;

    .empty-content {
      text-align: center;
      color: #909399;

      .el-icon {
        margin-bottom: 16px;
        opacity: 0.5;
      }

      p {
        font-size: 14px;
        margin: 0;
      }
    }
  }

  // 自定义对话框样式
  .custom-dialog-content {
    .form-item {
      margin-bottom: 20px;

      label {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: #303133;
        margin-bottom: 8px;
      }

      .url-list {
        .url-input-group {
          margin-bottom: 8px;

          &:last-child {
            margin-bottom: 0;
          }
        }
      }
    }

    .tips {
      padding: 16px;
      background: #f0f9ff;
      border-left: 4px solid #409eff;
      border-radius: 4px;

      h5 {
        font-size: 14px;
        font-weight: 600;
        color: #303133;
        margin: 0 0 8px 0;
      }

      ul {
        margin: 0;
        padding-left: 20px;
        font-size: 13px;
        color: #606266;
        line-height: 1.8;

        li {
          margin-bottom: 4px;

          &:last-child {
            margin-bottom: 0;
          }
        }
      }
    }
  }
}
</style>
