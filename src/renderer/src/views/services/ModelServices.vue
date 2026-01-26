<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import { useModelServiceStore } from '@renderer/store/modelServiceStore'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  Edit,
  Delete,
  VideoPlay,
  VideoPause,
  Refresh,
  View,
  Document,
  Folder,
  Monitor,
  ArrowDown,
  CircleCheck,
  CircleClose,
  FolderOpened
} from '@element-plus/icons-vue'

const router = useRouter()
const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()
const serviceStore = useModelServiceStore()

const dialogVisible = ref(false)
const dialogTitle = ref('添加模型服务')
const isEdit = ref(false)
const loading = ref(false)
const checkingStatus = ref(false)

const formRef = ref(null)
const formData = ref({
  id: '',
  environmentId: '',
  name: '',
  framework: 'vllm',
  gpuIds: [],
  modelPath: '',
  modelName: '',  // 新增：模型名称（可选）
  startCommand: '',
  logPath: '',
  port: 8000
})

// GPU列表
const gpuList = ref([])
const loadingGPUs = ref(false)

// 格式化字节
const formatBytes = (bytes) => {
  if (!bytes) return '-'
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 记录当前使用的框架类型（用于后续更新命令）
const currentFramework = ref('vllm')

// 所有环境列表（过滤掉引用不存在服务器的环境）
const allEnvironments = computed(() => {
  return environmentStore.environments.filter(env => {
    const serverExists = serverStore.servers.some(s => s.id === env.serverId)
    if (!serverExists) {
      console.warn(`环境 ${env.name} 引用了不存在的服务器: ${env.serverId}`)
    }
    return serverExists
  })
})

// 当前选中的环境
const selectedEnvironment = computed(() => {
  return environmentStore.getEnvironmentById(formData.value.environmentId)
})

// 当前选中的服务器（从环境获取）
const selectedServer = computed(() => {
  if (!selectedEnvironment.value) return null
  return serverStore.servers.find(s => s.id === selectedEnvironment.value.serverId)
})

// 监听环境变化，加载GPU列表
watch(() => formData.value.environmentId, async (newEnvironmentId) => {
  if (newEnvironmentId) {
    const env = environmentStore.getEnvironmentById(newEnvironmentId)
    if (env) {
      const server = serverStore.servers.find(s => s.id === env.serverId)
      if (server) {
        // 主进程会自动处理连接
        // 加载GPU列表
        await loadGPUs(server.id)
      }
    }
  } else {
    gpuList.value = []
    formData.value.gpuIds = []
  }
})

// 加载GPU列表
const loadGPUs = async (serverId) => {
  if (!serverId) return

  loadingGPUs.value = true
  try {
    const result = await window.api.ssh.getServerGPUs(serverId)
    if (result.success && result.data) {
      gpuList.value = result.data
    } else {
      gpuList.value = []
    }
  } catch (error) {
    ElMessage.error(`加载GPU列表失败: ${error.message}`)
    gpuList.value = []
  } finally {
    loadingGPUs.value = false
  }
}

const formRules = {
  environmentId: [{ required: true, message: '请选择环境', trigger: 'change' }],
  name: [{ required: true, message: '请输入服务名称', trigger: 'blur' }],
  modelPath: [{ required: true, message: '请输入模型路径', trigger: 'blur' }],
  port: [{ required: true, message: '请输入服务端口', trigger: 'blur' }]
}

// 服务器列表
const servers = computed(() => serverStore.servers)
// 服务列表
const services = computed(() => serviceStore.services)

// 按服务器分组的服务列表
const servicesByServer = computed(() => {
  const grouped = {}
  for (const server of servers.value) {
    grouped[server.id] = {
      server: server,
      services: serviceStore.services.filter(s => {
        const env = environmentStore.getEnvironmentById(s.environmentId)
        return env && env.serverId === server.id
      })
    }
  }
  return grouped
})

// 命令校验状态
const commandValidation = computed(() => {
  return validateCommand(formData.value.startCommand)
})

// 检查所有服务的真实状态
const checkAllServicesStatus = async () => {
  if (services.value.length === 0) return

  checkingStatus.value = true

  // 先将所有服务的状态设置为"检查中"
  for (const service of services.value) {
    serviceStore.updateServiceStatus(service.id, 'checking')
  }

  try {
    // 准备需要检查的服务列表，包含服务器连接信息
    const servicesToCheck = services.value.map(service => {
      const env = environmentStore.getEnvironmentById(service.environmentId)
      if (!env) return null

      const server = servers.value.find(s => s.id === env.serverId)
      if (!server) return null

      return {
        id: service.id,
        serviceId: service.id,
        serverId: env.serverId,
        host: server.host,
        sshPort: server.port,
        username: server.username,
        password: server.password,
        privateKey: server.privateKey,
        port: service.port,
        startCommand: service.startCommand
      }
    }).filter(Boolean)

    if (servicesToCheck.length === 0) {
      checkingStatus.value = false
      return
    }

    // 调用后端批量检查状态
    const result = await window.api.service.checkAllStatus(servicesToCheck)

    if (result.success && result.data) {
      // 更新每个服务的状态
      for (const statusResult of result.data) {
        const service = services.value.find(s => s.id === statusResult.serviceId)
        if (service) {
          if (statusResult.running) {
            // 服务正在运行，更新状态和PID
            serviceStore.updateServiceStatus(service.id, 'running', statusResult.pid)
          } else {
            // 服务未运行
            serviceStore.updateServiceStatus(service.id, 'stopped', null)
          }
        }
      }
    }
  } catch (error) {
    console.error('检查服务状态失败:', error)
    // 检查失败时，将所有服务状态设置为未知/停止
    for (const service of services.value) {
      if (service.status === 'checking') {
        serviceStore.updateServiceStatus(service.id, 'stopped', null)
      }
    }
  } finally {
    checkingStatus.value = false
  }
}

onMounted(() => {
  serverStore.loadServers()
  environmentStore.loadEnvironments()
  serviceStore.loadServices()
  // 不再自动检查服务状态，直接使用缓存的状态
  // 只有点击刷新按钮时才会去服务器检查真实状态
})

// 生成启动命令（根据框架类型）
const generateStartCommand = (framework = 'vllm') => {
  // 记录当前框架类型
  currentFramework.value = framework

  const env = selectedEnvironment.value
  if (!env) {
    ElMessage.warning('请先选择环境')
    return
  }

  const { modelPath, port, gpuIds, logPath, modelName } = formData.value

  let command = ''

  // 构建环境激活命令 - 根据环境类型使用对应的 python 路径
  let envActivateCmd = ''
  if (env.type === 'conda') {
    envActivateCmd = `conda run -n ${env.name} --no-capture-output `
  } else if (env.type === 'uv') {
    envActivateCmd = `uv run `
  } else {
    // system python - 直接使用完整路径
    envActivateCmd = `${env.pythonPath} `
  }

  if (framework === 'vllm') {
    const params = [
      `--tensor-parallel-size ${gpuIds?.length || 1}`,
      '--dtype half',
      '--gpu-memory-utilization 0.9',
      '--host 0.0.0.0',
      `--port ${port || 8000}`
    ]

    // 如果指定了模型名称，添加 --served-model-name 参数
    if (modelName && modelName.trim()) {
      params.push(`--served-model-name ${modelName.trim()}`)
    }

    command = `export CUDA_VISIBLE_DEVICES=${gpuIds?.join(',') || '0'} && nohup ${envActivateCmd}vllm serve ${modelPath || '/path/to/model'} \\\n  ${params.join(' \\\n  ')} > ${logPath || 'model.log'} 2>&1 &`

  } else if (framework === 'lmdeploy') {
    const params = [
      `--tp ${gpuIds?.length || 1}`,
      '--log-level INFO',
      '--dtype auto',
      `--server-port ${port || 8000}`,
      '--backend pytorch'
    ]

    // 如果指定了模型名称，添加 --model-name 参数
    if (modelName && modelName.trim()) {
      params.push(`--model-name ${modelName.trim()}`)
    }

    command = `export CUDA_VISIBLE_DEVICES=${gpuIds?.join(',') || '0'} && nohup ${envActivateCmd}lmdeploy serve api_server ${modelPath || '/path/to/model'} \\\n  ${params.join(' \\\n  ')} > ${logPath || 'model.log'} 2>&1 &`
  }

  formData.value.startCommand = command
}

// 自动生成命令（下拉菜单选择框架后触发）
const handleAutoGenerate = (framework) => {
  generateStartCommand(framework)
  ElMessage.success(`已生成${framework.toUpperCase()}框架的默认命令`)
}

// 更新启动命令中的GPU相关部分
const updateGPUInCommand = () => {
  // 如果右侧命令为空，不执行任何操作
  if (!formData.value.startCommand) return

  const gpuIds = formData.value.gpuIds || []
  const command = formData.value.startCommand

  // 更新或添加 CUDA_VISIBLE_DEVICES
  let updatedCommand = command

  // 检查是否已有 CUDA_VISIBLE_DEVICES
  if (command.includes('CUDA_VISIBLE_DEVICES')) {
    // 替换现有的 GPU 设置
    updatedCommand = command.replace(
      /export CUDA_VISIBLE_DEVICES=[^&]+&&\s*/,
      gpuIds.length > 0 ? `export CUDA_VISIBLE_DEVICES=${gpuIds.join(',')} && ` : ''
    )
  } else {
    // 如果没有 GPU 设置但需要添加
    if (gpuIds.length > 0) {
      // 在 nohup 前插入 GPU 设置
      updatedCommand = command.replace(
        /(nohup\s+)/,
        `export CUDA_VISIBLE_DEVICES=${gpuIds.join(',')} && $1`
      )
    }
  }

  // 同时更新 tensor-parallel-size 或 tp 参数
  if (currentFramework.value === 'vllm') {
    updatedCommand = updatedCommand.replace(
      /--tensor-parallel-size\s+\d+/,
      `--tensor-parallel-size ${gpuIds.length || 1}`
    )
  } else if (currentFramework.value === 'lmdeploy') {
    updatedCommand = updatedCommand.replace(
      /--tp\s+\d+/,
      `--tp ${gpuIds.length || 1}`
    )
  }

  formData.value.startCommand = updatedCommand
}

// 更新启动命令中的端口
const updatePortInCommand = () => {
  // 如果右侧命令为空，不执行任何操作
  if (!formData.value.startCommand) return

  const port = formData.value.port || 8000
  const command = formData.value.startCommand

  let updatedCommand = command

  // 根据框架类型更新对应的端口参数
  if (currentFramework.value === 'vllm') {
    updatedCommand = command.replace(
      /--port\s+\d+/,
      `--port ${port}`
    )
  } else if (currentFramework.value === 'lmdeploy') {
    updatedCommand = command.replace(
      /--server-port\s+\d+/,
      `--server-port ${port}`
    )
  }

  formData.value.startCommand = updatedCommand
}

// 更新启动命令中的模型路径
const updateModelPathInCommand = () => {
  // 如果右侧命令为空，不执行任何操作
  if (!formData.value.startCommand) return

  const modelPath = formData.value.modelPath
  if (!modelPath) return

  const command = formData.value.startCommand

  // 匹配 vllm serve 或 lmdeploy serve api_server 后的路径
  let updatedCommand = command

  if (currentFramework.value === 'vllm') {
    updatedCommand = command.replace(
      /(vllm\s+serve\s+)(\S+)/,
      `$1${modelPath}`
    )
  } else if (currentFramework.value === 'lmdeploy') {
    updatedCommand = command.replace(
      /(lmdeploy\s+serve\s+api_server\s+)(\S+)/,
      `$1${modelPath}`
    )
  }

  formData.value.startCommand = updatedCommand
}

// 更新启动命令中的日志路径
const updateLogPathInCommand = () => {
  // 如果右侧命令为空，不执行任何操作
  if (!formData.value.startCommand) return

  const logPath = formData.value.logPath || 'model.log'
  const command = formData.value.startCommand

  // 使用正则替换命令中的日志路径部分
  // 匹配 > 后面直到 2>&1 & 结束的部分，处理换行符
  const updatedCommand = command.replace(
    /^(.*?>\s*)(\S+)(\s*2>&1\s*&.*)$/s,
    (match, prefix, oldPath, suffix) => {
      return `${prefix}${logPath}${suffix}`
    }
  )

  formData.value.startCommand = updatedCommand
}

// 更新启动命令中的模型名称
const updateModelNameInCommand = () => {
  // 如果右侧命令为空，不执行任何操作
  if (!formData.value.startCommand) return

  const modelName = formData.value.modelName?.trim()
  const command = formData.value.startCommand

  // 确定框架类型
  const framework = currentFramework.value || 'vllm'

  if (framework === 'vllm') {
    let updatedCommand = command

    // 移除旧的 --served-model-name 参数（支持多种格式，包括换行）
    updatedCommand = updatedCommand.replace(/--served-model-name\s+\S+/g, '')

    // 如果有新的模型名称，添加参数
    if (modelName) {
      // 检查命令中是否已有 --served-model-name
      if (!updatedCommand.includes('--served-model-name')) {
        // 尝试在 --host 参数后添加（最理想位置）
        if (updatedCommand.includes('--host')) {
          updatedCommand = updatedCommand.replace(
            /(--host\s+0\.0\.0\.0)/,
            '$1 \\\n  --served-model-name ' + modelName
          )
        }
        // 尝试在 --gpu-memory-utilization 后添加
        else if (updatedCommand.includes('--gpu-memory-utilization')) {
          updatedCommand = updatedCommand.replace(
            /(--gpu-memory-utilization\s+[\d.]+)/,
            '$1 \\\n  --served-model-name ' + modelName
          )
        }
        // 尝试在 --dtype 后添加
        else if (updatedCommand.includes('--dtype')) {
          updatedCommand = updatedCommand.replace(
            /(--dtype\s+\w+)/,
            '$1 \\\n  --served-model-name ' + modelName
          )
        }
        // 最后方案：在 --port 之前添加
        else if (updatedCommand.includes('--port')) {
          updatedCommand = updatedCommand.replace(
            /(\\\n\s*)(--port\s+)/,
            '$1--served-model-name ' + modelName + ' \\\n  $2'
          )
        }
      }
    } else {
      // 模型名称为空，移除参数并清理格式
      updatedCommand = updatedCommand.replace(/--served-model-name\s+\S+/g, '')
      // 清理可能留下的多余空格和换行
      updatedCommand = updatedCommand.replace(/\\\n\s*\\\n/g, '\\\n')
      updatedCommand = updatedCommand.replace(/\s+\\\n\s+/g, ' \\\n  ')
    }

    formData.value.startCommand = updatedCommand

  } else if (framework === 'lmdeploy') {
    let updatedCommand = command

    // 移除旧的 --model-name 参数
    updatedCommand = updatedCommand.replace(/--model-name\s+\S+/g, '')

    // 如果有新的模型名称，添加参数
    if (modelName) {
      // 检查命令中是否已有 --model-name
      if (!updatedCommand.includes('--model-name')) {
        // 尝试在 --backend 参数后添加
        if (updatedCommand.includes('--backend')) {
          updatedCommand = updatedCommand.replace(
            /(--backend\s+\S+)/,
            '$1 \\\n  --model-name ' + modelName
          )
        }
        // 尝试在 --dtype 后添加
        else if (updatedCommand.includes('--dtype')) {
          updatedCommand = updatedCommand.replace(
            /(--dtype\s+\w+)/,
            '$1 \\\n  --model-name ' + modelName
          )
        }
        // 最后方案：在 --server-port 之前添加
        else if (updatedCommand.includes('--server-port')) {
          updatedCommand = updatedCommand.replace(
            /(\\\n\s*)(--server-port\s+)/,
            '$1--model-name ' + modelName + ' \\\n  $2'
          )
        }
      }
    } else {
      // 模型名称为空，移除参数并清理格式
      updatedCommand = updatedCommand.replace(/--model-name\s+\S+/g, '')
      updatedCommand = updatedCommand.replace(/\\\n\s*\\\n/g, '\\\n')
      updatedCommand = updatedCommand.replace(/\s+\\\n\s+/g, ' \\\n  ')
    }

    formData.value.startCommand = updatedCommand
  }
}

// 校验启动命令是否合法
const validateCommand = (command) => {
  if (!command || !command.trim()) {
    return { valid: false, message: '启动命令不能为空' }
  }

  // 检查是否包含vllm或lmdeploy命令
  const hasVllm = command.includes('vllm serve')
  const hasLmdeploy = command.includes('lmdeploy serve api_server')

  if (!hasVllm && !hasLmdeploy) {
    return { valid: false, message: '命令中未找到 vllm serve 或 lmdeploy serve api_server' }
  }

  // 检查是否包含模型路径
  const modelPathMatch = command.match(/(?:vllm serve|lmdeploy serve api_server)\s+(\S+)/)
  if (!modelPathMatch) {
    return { valid: false, message: '未找到模型路径' }
  }

  // 检查是否包含日志重定向
  if (!command.includes('>')) {
    return { valid: false, message: '命令中缺少日志重定向 (> 符号)' }
  }

  // 检查是否包含后台运行符号
  if (!command.includes('&')) {
    return { valid: false, message: '命令中缺少后台运行符号 (& 符号)' }
  }

  // 检查vllm特定参数
  if (hasVllm) {
    if (!command.includes('--port')) {
      return { valid: false, message: 'vllm命令缺少 --port 参数' }
    }
  }

  // 检查lmdeploy特定参数
  if (hasLmdeploy) {
    if (!command.includes('--server-port')) {
      return { valid: false, message: 'lmdeploy命令缺少 --server-port 参数' }
    }
  }

  return { valid: true }
}

// 打开添加对话框
const handleAdd = () => {
  isEdit.value = false
  dialogTitle.value = '添加模型服务'
  resetForm()
  dialogVisible.value = true
}

// 刷新服务列表和状态
const handleRefresh = async () => {
  // 刷新时先重置所有状态为 stopped，然后去服务器检查真实状态
  await serviceStore.loadServicesWithResetStatus()
  await checkAllServicesStatus()
}

// 打开编辑对话框
const handleEdit = async (service) => {
  isEdit.value = true
  dialogTitle.value = '编辑模型服务'
  formData.value = {
    ...service,
    gpuIds: service.gpuIds || [],
    modelName: service.modelName || ''  // 确保加载 modelName
  }

  // 设置当前框架类型（用于后续的命令更新）
  currentFramework.value = service.framework || 'vllm'

  // 加载GPU列表
  if (service.environmentId) {
    const env = environmentStore.getEnvironmentById(service.environmentId)
    if (env) {
      await loadGPUs(env.serverId)
    }
  }

  // 使用已有启动命令
  if (service.startCommand) {
    formData.value.startCommand = service.startCommand
  }

  dialogVisible.value = true
}

// 浏览远程模型路径
const browsingModels = ref(false)
const modelList = ref([])
const modelDialogVisible = ref(false)
const currentPath = ref('/')

const browseRemoteModels = async () => {
  const server = selectedServer.value
  if (!server) {
    ElMessage.warning('请先选择环境')
    return
  }

  // 主进程会自动处理连接
  // 打开对话框并加载根目录
  currentPath.value = '/'
  modelDialogVisible.value = true
  await loadDirectoryContents('/')
}

const loadDirectoryContents = async (path) => {
  const server = selectedServer.value
  if (!server) {
    ElMessage.error('未选择环境')
    return
  }

  browsingModels.value = true
  try {
    const result = await window.api.ssh.listDirectory(
      server.id,
      path
    )

    if (result.success) {
      if (result.data && result.data.data && result.data.data.items && result.data.data.items.length > 0) {
        const { items } = result.data.data

        // 目录在前，文件在后，分别排序
        const dirs = items.filter(item => item.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
        const files = items.filter(item => !item.isDirectory).sort((a, b) => a.name.localeCompare(b.name))

        modelList.value = [...dirs, ...files].map(item => {
          const fullPath = path === '/' || path.endsWith('/') ? `${path}${item.name}` : `${path}/${item.name}`
          return {
            name: item.name,
            fullPath: fullPath,
            isDir: item.isDirectory
          }
        })
      } else {
        modelList.value = []
        ElMessage.info('目录为空')
      }
    } else {
      modelList.value = []
      const errorMsg = result.error || '无法读取目录内容'
      console.error('[loadDirectoryContents] 错误:', errorMsg)
      ElMessage.error(errorMsg)
    }
  } catch (error) {
    console.error('[loadDirectoryContents] 异常:', error)
    ElMessage.error(`浏览目录失败: ${error.message}`)
    modelList.value = []
  } finally {
    browsingModels.value = false
  }
}

const navigateToDirectory = async (item) => {
  if (item.isDir) {
    currentPath.value = item.fullPath
    await loadDirectoryContents(item.fullPath)
  }
}

const handleRowClick = async (item) => {
  if (item.isDir) {
    // 如果是目录，进入目录
    currentPath.value = item.fullPath
    await loadDirectoryContents(item.fullPath)
  }
  // 文件不执行任何操作，只通过按钮选择
}

const navigateUp = async () => {
  if (currentPath.value === '/') return

  const parentPath = currentPath.value.split('/').slice(0, -1).join('/') || '/'
  currentPath.value = parentPath
  await loadDirectoryContents(parentPath)
}

const selectModel = (item) => {
  // 选择文件或目录作为模型路径
  formData.value.modelPath = item.fullPath
  modelDialogVisible.value = false
}

// 删除服务
const handleDelete = async (service) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除服务 "${service.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await serviceStore.deleteService(service.id)
    ElMessage.success('删除成功')
  } catch (error) {
    // 用户取消
  }
}

// 启动服务
const handleStart = async (service) => {
  // 显示提示信息，2秒后自动隐藏
  ElMessage({
    message: '正在启动服务，请稍候...',
    type: 'info',
    duration: 2000
  })

  serviceStore.updateServiceStatus(service.id, 'starting')

  try {
    // 获取环境信息
    const env = environmentStore.getEnvironmentById(service.environmentId)
    if (!env) {
      serviceStore.updateServiceStatus(service.id, 'error')
      ElMessage.error('环境信息不存在')
      return
    }

    // 获取服务器信息
    const server = servers.value.find(s => s.id === env.serverId)
    if (!server) {
      serviceStore.updateServiceStatus(service.id, 'error')
      ElMessage.error('服务器信息不存在')
      return
    }

    // 主进程会自动处理连接
    const result = await window.api.service.start(server.id, {
      envType: env.type,
      envName: env.name,
      startCommand: service.startCommand,
      logPath: service.logPath,
      serviceName: service.name
    })

    if (result.success) {
      serviceStore.updateServiceStatus(service.id, 'running', result.data.pid)
      ElMessage.success('服务启动成功')
    } else {
      serviceStore.updateServiceStatus(service.id, 'error')
      ElMessage.error(`启动失败: ${result.error}`)
    }
  } catch (error) {
    serviceStore.updateServiceStatus(service.id, 'error')
    ElMessage.error(`启动失败: ${error.message}`)
  }
}

// 停止服务
const handleStop = async (service) => {
  // 显示提示信息，2秒后自动隐藏
  ElMessage({
    message: '正在停止服务，请稍候...',
    type: 'info',
    duration: 2000
  })

  serviceStore.updateServiceStatus(service.id, 'stopping')

  try {
    // 获取环境信息
    const env = environmentStore.getEnvironmentById(service.environmentId)
    if (!env) {
      serviceStore.updateServiceStatus(service.id, 'running')
      ElMessage.error('环境信息不存在')
      return
    }

    // 获取服务器信息
    const server = servers.value.find(s => s.id === env.serverId)
    if (!server) {
      serviceStore.updateServiceStatus(service.id, 'running')
      ElMessage.error('服务器信息不存在')
      return
    }

    // 主进程会自动处理连接
    const result = await window.api.service.stop(
      server.id,
      service.pid,
      service.startCommand
    )

    if (result.success) {
      serviceStore.updateServiceStatus(service.id, 'stopped', null)
      ElMessage.success(result.data.message || '服务已停止')
    } else {
      serviceStore.updateServiceStatus(service.id, 'running')
      ElMessage.error(`停止失败: ${result.error}`)
    }
  } catch (error) {
    serviceStore.updateServiceStatus(service.id, 'running')
    ElMessage.error(`停止失败: ${error.message}`)
  }
}

// 查看日志
const handleViewLogs = (service) => {
  // 跳转到日志页面并传递服务ID
  router.push({
    path: '/logs',
    query: { serviceId: service.id }
  })
}

// 提交表单
const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    // 获取环境信息
    const env = environmentStore.getEnvironmentById(formData.value.environmentId)
    if (!env) {
      ElMessage.error('环境信息不存在')
      return
    }

    // 构建提交数据，添加 serverId、envType、envName 字段
    const data = {
      ...formData.value,
      gpuIds: formData.value.gpuIds || [],
      serverId: env.serverId,
      envType: env.type,
      envName: env.name
    }

    if (isEdit.value) {
      await serviceStore.updateService(data.id, data)
      ElMessage.success('更新成功')
    } else {
      await serviceStore.addService(data)
      ElMessage.success('添加成功')
    }

    dialogVisible.value = false
  } catch (error) {
    ElMessage.error(`操作失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// 重置表单
const resetForm = () => {
  formData.value = {
    id: '',
    environmentId: '',
    name: '',
    framework: 'vllm',
    gpuIds: [],
    modelPath: '',
    modelName: '',  // 新增：模型名称
    startCommand: '',
    logPath: '',
    port: 8000
  }
  gpuList.value = []
  formRef.value?.resetFields()
}

// 获取服务器名称
const getServerName = (serverId) => {
  const server = servers.value.find((s) => s.id === serverId)
  return server ? server.name : '未知'
}

// 获取状态标签类型
const getStatusType = (status) => {
  const statusMap = {
    stopped: 'info',
    starting: 'warning',
    running: 'success',
    stopping: 'warning',
    checking: 'warning',
    error: 'danger'
  }
  return statusMap[status] || ''
}

// 获取状态文本
const getStatusText = (status) => {
  const textMap = {
    stopped: '已停止',
    starting: '启动中',
    running: '运行中',
    stopping: '停止中',
    checking: '检查中',
    error: '错误'
  }
  return textMap[status] || '未知'
}

// 获取环境显示名称
const getEnvironmentDisplayName = (service) => {
  const env = environmentStore.getEnvironmentById(service.environmentId)
  if (!env) return '未知环境'
  return `${env.type} / ${env.name}`
}

// 判断是否可以启动
const canStart = (service) => {
  return service.status === 'stopped' || service.status === 'error'
}

// 判断是否可以停止
const canStop = (service) => {
  return service.status === 'running'
}

// 判断是否在检查状态
const isChecking = (service) => {
  return service.status === 'checking'
}
</script>

<template>
  <div class="service-management">
    <!-- 操作栏 -->
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="handleAdd">
        添加模型服务
      </el-button>
      <el-button :icon="Refresh" :loading="checkingStatus" @click="handleRefresh">
        刷新
      </el-button>
    </div>

    <!-- 服务列表 -->
    <div v-if="services.length === 0" class="empty-state">
      <el-empty description="暂无模型服务配置，请添加服务">
        <el-button type="primary" @click="handleAdd">添加服务</el-button>
      </el-empty>
    </div>

    <!-- 按服务器分组的卡片布局 -->
    <div v-else class="server-groups">
      <div v-for="group in Object.values(servicesByServer)" :key="group.server.id" class="server-group">
        <!-- 服务器头部 -->
        <div class="server-header">
          <div class="server-info">
            <el-icon :size="20" style="margin-right: 8px;"><Monitor /></el-icon>
            <span class="server-name">{{ group.server.name }}</span>
            <el-tag size="small" :type="group.server.status === 'connected' ? 'success' : 'info'" style="margin-left: 8px;">
              {{ group.server.host }}:{{ group.server.port }}
            </el-tag>
          </div>
          <div class="server-stats">
            <span class="service-count">{{ group.services.length }} 个服务</span>
          </div>
        </div>

        <!-- 服务卡片网格 -->
        <div v-if="group.services.length > 0" class="services-grid">
          <div v-for="service in group.services" :key="service.id" class="service-card">
            <div class="card-header">
              <div class="service-name">{{ service.name }}</div>
              <el-tag :type="getStatusType(service.status)" size="small">
                <el-icon v-if="service.status === 'checking'" :size="12" style="margin-right: 4px;" class="is-loading">
                  <Refresh />
                </el-icon>
                {{ getStatusText(service.status) }}
              </el-tag>
            </div>

            <div class="card-body">
              <div class="service-info-row">
                <span class="label">框架:</span>
                <el-tag :type="service.framework === 'vllm' ? 'primary' : 'success'" size="small">
                  {{ service.framework.toUpperCase() }}
                </el-tag>
              </div>

              <div class="service-info-row">
                <span class="label">环境:</span>
                <div class="value-with-icon">
                  <el-icon :size="14"><FolderOpened /></el-icon>
                  <span class="value">{{ getEnvironmentDisplayName(service) }}</span>
                </div>
              </div>

              <div class="service-info-row">
                <span class="label">模型:</span>
                <span class="value model-path" :title="service.modelPath">{{ service.modelPath }}</span>
              </div>

              <div class="service-info-row">
                <span class="label">端口:</span>
                <span class="value">{{ service.port }}</span>
              </div>

              <div class="service-info-row" v-if="service.logPath">
                <span class="label">日志:</span>
                <span class="value log-path" :title="service.logPath">{{ service.logPath }}</span>
              </div>
            </div>

            <div class="card-footer">
              <el-button
                v-if="canStart(service)"
                type="success"
                size="small"
                :icon="VideoPlay"
                :loading="service.status === 'starting'"
                :disabled="isChecking(service)"
                @click="handleStart(service)"
              >
                启动
              </el-button>
              <el-button
                v-if="canStop(service)"
                type="warning"
                size="small"
                :icon="VideoPause"
                :loading="service.status === 'stopping'"
                :disabled="isChecking(service)"
                @click="handleStop(service)"
              >
                停止
              </el-button>
              <el-button
                size="small"
                :icon="Document"
                :disabled="isChecking(service)"
                @click="handleViewLogs(service)"
              >
                日志
              </el-button>
              <el-button
                size="small"
                :icon="Edit"
                :disabled="isChecking(service)"
                @click="handleEdit(service)"
              >
                编辑
              </el-button>
              <el-button
                type="danger"
                size="small"
                :icon="Delete"
                :disabled="isChecking(service)"
                @click="handleDelete(service)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>

        <div v-else class="no-services">
          <el-empty description="该服务器暂无模型服务" :image-size="80" />
        </div>
      </div>
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="1200px"
      :close-on-click-modal="false"
    >
      <div class="dialog-container">
        <!-- 左侧表单 -->
        <div class="form-panel">
          <el-form
            ref="formRef"
            :model="formData"
            :rules="formRules"
            label-width="100px"
          >
            <el-form-item label="服务名称" prop="name">
              <el-input v-model="formData.name" placeholder="请输入服务名称" />
            </el-form-item>

            <el-form-item label="选择环境" prop="environmentId">
              <el-select
                v-model="formData.environmentId"
                placeholder="请选择环境"
                style="width: 100%"
                filterable
              >
                <el-option
                  v-for="env in allEnvironments"
                  :key="env.id"
                  :label="`${getServerName(env.serverId)} / ${env.name} (${env.type})`"
                  :value="env.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="GPU选择" prop="gpuIds">
              <el-select
                v-model="formData.gpuIds"
                placeholder="请选择GPU（可多选）"
                style="width: 100%"
                :loading="loadingGPUs"
                multiple
                collapse-tags
                collapse-tags-tooltip
                @change="updateGPUInCommand"
              >
                <el-option
                  v-for="gpu in gpuList"
                  :key="gpu.id"
                  :label="`${gpu.name} - 可用: ${formatBytes(gpu.memoryAvailable)}`"
                  :value="gpu.id"
                >
                  <div class="gpu-option">
                    <div class="gpu-name">
                      <el-icon :size="16" style="margin-right: 4px;"><Monitor /></el-icon>
                      {{ gpu.name }}
                    </div>
                    <div class="gpu-info">
                      <el-progress
                        :percentage="gpu.memoryUsagePercent || 0"
                        :show-text="false"
                        :stroke-width="4"
                        style="width: 80px; margin: 0 8px;"
                      />
                      <span class="gpu-memory-text">
                        {{ formatBytes(gpu.memoryAvailable) }} / {{ formatBytes(gpu.memoryTotal) }}
                      </span>
                    </div>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="模型路径" prop="modelPath">
              <el-input
                v-model="formData.modelPath"
                placeholder="请输入模型路径"
                @change="updateModelPathInCommand"
              >
                <template #append>
                  <el-button
                    :icon="View"
                    @click="browseRemoteModels"
                    :loading="browsingModels"
                  >
                    浏览
                  </el-button>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="模型名称">
              <el-input
                v-model="formData.modelName"
                placeholder="可选，用于 API 调用时的模型标识"
                @change="updateModelNameInCommand"
              >
                <template #append>
                  <el-tooltip content="指定后在 API 中使用此名称调用模型，如 vllm 使用 --served-model-name，lmdeploy 使用 --model-name" placement="top">
                    <el-icon style="cursor: help;">
                      <Document />
                    </el-icon>
                  </el-tooltip>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="服务端口" prop="port">
              <el-input-number
                v-model="formData.port"
                :min="1"
                :max="65535"
                controls-position="right"
                @change="updatePortInCommand"
              />
            </el-form-item>

            <el-form-item label="日志路径" prop="logPath">
              <el-input
                v-model="formData.logPath"
                placeholder="例如: /tmp/model_service.log"
                @change="updateLogPathInCommand"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- 右侧命令预览 -->
        <div class="command-panel">
          <div class="command-header">
            <span>启动命令预览</span>
            <div class="command-actions">
              <el-dropdown @command="handleAutoGenerate">
                <el-button
                  size="small"
                  type="primary"
                >
                  自动生成
                  <el-icon style="margin-left: 4px;">
                    <ArrowDown />
                  </el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="vllm">VLLM</el-dropdown-item>
                    <el-dropdown-item command="lmdeploy">LMDeploy</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
          <el-input
            v-model="formData.startCommand"
            type="textarea"
            :rows="25"
            placeholder="启动命令将在此处生成，可自由编辑"
            class="command-textarea"
          />
          <!-- 命令校验状态提示 -->
          <div v-if="formData.startCommand" class="command-validation" :class="{ 'is-valid': commandValidation.valid, 'is-invalid': !commandValidation.valid }">
            <el-icon v-if="commandValidation.valid" :size="14" style="margin-right: 4px;">
              <CircleCheck />
            </el-icon>
            <el-icon v-else :size="14" style="margin-right: 4px;">
              <CircleClose />
            </el-icon>
            <span>{{ commandValidation.valid ? '命令格式正确' : commandValidation.message }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 模型路径选择对话框 -->
    <el-dialog
      v-model="modelDialogVisible"
      :title="`选择模型路径 - ${currentPath}`"
      width="600px"
    >
      <div class="path-navigation">
        <el-button
          :icon="Document"
          @click="navigateUp"
          :disabled="currentPath === '/'"
          size="small"
          style="margin-right: 8px;"
        >
          上级目录
        </el-button>
        <span class="current-path">当前路径: {{ currentPath }}</span>
      </div>
      <el-divider />
      <el-scrollbar height="400px">
        <el-empty v-if="modelList.length === 0" description="未找到模型，请手动输入路径" />
        <el-table
          v-else
          :data="modelList"
          @row-dblclick="navigateToDirectory"
          @row-click="handleRowClick"
          style="width: 100%"
          row-key="name"
        >
          <el-table-column prop="name" label="名称" width="300">
            <template #default="{ row }">
              <div class="model-item">
                <el-icon :size="16" style="margin-right: 8px;">
                  <Folder v-if="row.isDir" />
                  <Document v-else />
                </el-icon>
                <span>{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="fullPath" label="完整路径" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button
                type="success"
                size="small"
                @click.stop="selectModel(row)"
              >
                选择
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-scrollbar>
      <template #footer>
        <el-button @click="modelDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.service-management {
  padding: 20px;
  background: #f5f7fa;
  min-height: calc(100vh - 140px);

  .toolbar {
    margin-bottom: 20px;
    display: flex;
    gap: 12px;
  }

  .empty-state {
    margin-top: 100px;
    background: #fff;
    border-radius: 8px;
    padding: 40px;
  }

  .server-groups {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .server-group {
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    transition: box-shadow 0.3s ease;

    &:hover {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    }

    .server-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;

      .server-info {
        display: flex;
        align-items: center;

        .server-name {
          font-size: 16px;
          font-weight: 600;
        }
      }

      .server-stats {
        .service-count {
          font-size: 14px;
          opacity: 0.9;
        }
      }
    }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 16px;
      padding: 20px;
    }

    .no-services {
      padding: 40px 20px;
      text-align: center;
    }

    .service-card {
      border: 1px solid #e4e7ed;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.3s ease;

      &:hover {
        border-color: #667eea;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        transform: translateY(-2px);
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #f5f7fa;
        border-bottom: 1px solid #e4e7ed;

        .service-name {
          font-size: 15px;
          font-weight: 600;
          color: #303133;
        }
      }

      .card-body {
        padding: 16px;

        .service-info-row {
          display: flex;
          align-items: center;
          margin-bottom: 10px;

          &:last-child {
            margin-bottom: 0;
          }

          .label {
            min-width: 50px;
            font-size: 13px;
            color: #909399;
            margin-right: 8px;
          }

          .value {
            font-size: 13px;
            color: #606266;
            flex: 1;

            &.model-path,
            &.log-path {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          }

          .value-with-icon {
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 1;

            .value {
              flex: 1;
            }
          }
        }
      }

      .card-footer {
        padding: 12px 16px;
        border-top: 1px solid #e4e7ed;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
    }
  }
}

// 对话框左右布局
.dialog-container {
  display: flex;
  gap: 20px;
  min-height: 600px;

  .form-panel {
    flex: 1;
    overflow-y: auto;
    padding-right: 10px;

    // 滚动条样式
    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background-color: #dcdfe6;
      border-radius: 3px;

      &:hover {
        background-color: #c0c4cc;
      }
    }

    :deep(.el-form-item__label) {
      font-weight: 500;
    }
  }

  .command-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #f5f7fa;
    border-radius: 8px;
    padding: 16px;

    .command-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-weight: 500;
      color: #303133;

      .command-actions {
        display: flex;
        gap: 8px;
      }
    }

    .command-textarea {
      flex: 1;

      :deep(.el-textarea__inner) {
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
        font-size: 13px;
        line-height: 1.6;
        background-color: #ffffff;
        border-color: #dcdfe6;

        &:focus {
          border-color: #409eff;
        }
      }
    }

    .command-validation {
      display: flex;
      align-items: center;
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;

      &.is-valid {
        background-color: #f0f9ff;
        color: #67c23a;
        border: 1px solid #b3e19d;
      }

      &.is-invalid {
        background-color: #fef0f0;
        color: #f56c6c;
        border: 1px solid #fbc4c4;
      }
    }
  }
}

.path-navigation {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.current-path {
  font-size: 14px;
  color: #606266;
  word-break: break-all;
}

.model-item {
  display: flex;
  align-items: center;
}

.gpu-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .gpu-name {
    display: flex;
    align-items: center;
    font-weight: 500;
  }

  .gpu-info {
    display: flex;
    align-items: center;
    margin-left: 16px;

    .gpu-memory-text {
      font-size: 12px;
      color: #909399;
      white-space: nowrap;
    }
  }
}
</style>
