<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useServerStore } from '@renderer/store/serverStore'
import { useEnvironmentStore } from '@renderer/store/environmentStore'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Refresh, Check, Delete, Top, Document, Loading, FolderOpened
} from '@element-plus/icons-vue'

const serverStore = useServerStore()
const environmentStore = useEnvironmentStore()

const loading = ref(false)
const refreshing = ref(false)
const batchUpgrading = ref(false) // 批量升级状态
const dependencies = ref([])
const searchKeyword = ref('') // 搜索关键词
const selectedPackages = ref([]) // 批量选中的包

// 选中的环境
const selectedEnvironmentId = ref('')

// 升级对话框
const upgradeDialogVisible = ref(false)
const upgradingPackage = ref(false)
const currentPackage = ref(null)
const upgradeLogs = ref([]) // 升级日志
const upgradeTaskId = ref('') // 当前升级任务的ID

const upgradeFormData = ref({
  packageName: '',
  upgradeType: 'pypi', // pypi | github
  gitUrl: '',
  branch: 'main'
})

const upgradeFormRules = {
  gitUrl: [
    {
      required: true,
      message: '请输入GitHub仓库地址',
      trigger: 'blur'
    }
  ],
  branch: [
    {
      required: true,
      message: '请输入分支名称',
      trigger: 'blur'
    }
  ]
}

// 服务器列表
const servers = computed(() => serverStore.servers)

// 所有环境列表（过滤掉引用不存在服务器的环境）
const allEnvironments = computed(() => {
  return environmentStore.environments.filter(env => {
    const serverExists = servers.value.some(s => s.id === env.serverId)
    if (!serverExists) {
      console.warn(`环境 ${env.name} 引用了不存在的服务器: ${env.serverId}`)
    }
    return serverExists
  })
})

// 获取当前选中的环境
const selectedEnvironment = computed(() => {
  return environmentStore.getEnvironmentById(selectedEnvironmentId.value)
})

// 获取当前选中的服务器
const selectedServer = computed(() => {
  if (!selectedEnvironment.value) return null
  return servers.value.find(s => s.id === selectedEnvironment.value.serverId)
})

// 过滤后的依赖列表
const filteredDependencies = computed(() => {
  if (!searchKeyword.value) {
    return dependencies.value
  }
  const keyword = searchKeyword.value.toLowerCase()
  return dependencies.value.filter(pkg =>
    pkg.name.toLowerCase().includes(keyword)
  )
})

// 加载依赖列表
const loadDependencies = async () => {
  if (!selectedEnvironment.value || !selectedServer.value) {
    ElMessage.warning('请先选择环境')
    return
  }

  loading.value = true
  dependencies.value = []

  try {
    // 主进程会自动处理连接
    // 获取多种命令尝试方式
    const commands = getPipListCommands(selectedEnvironment.value)
    let lastError = ''

    for (const command of commands) {
      const result = await window.api.ssh.execCommand(selectedServer.value.id, command)

      if (result.success && result.stdout && result.stdout.trim()) {
        dependencies.value = parsePipList(result.stdout)
        // 异步获取包大小，不阻塞界面显示
        fetchPackageSizes(dependencies.value).catch(() => {
          // 静默失败，不影响主要功能
        })
        loading.value = false
        return
      }
      lastError = result.stderr || result.error || lastError
    }

    // 所有命令都失败了
    ElMessage.error(`获取依赖列表失败: ${lastError || '未知错误'}`)
  } catch (error) {
    ElMessage.error(`获取依赖列表失败: ${error.message}`)
  } finally {
    loading.value = false
  }
}

// 获取 pip list 命令（返回多种尝试方式）
const getPipListCommands = (env) => {
  const pipPath = env.pipPath

  if (env.type === 'conda') {
    // 尝试多种方式来执行 conda pip list
    return [
      // 使用环境中的 pip
      `${pipPath} list --format=json`,
      // 尝试 conda run
      `bash -l -c "conda run -n ${env.name} --no-capture-output pip list --format=json"`,
      `bash -c "source ~/.bashrc && conda run -n ${env.name} --no-capture-output pip list --format=json"`,
      // 尝试常见 conda 路径
      `~/miniconda3/bin/conda run -n ${env.name} --no-capture-output pip list --format=json`,
      `~/anaconda3/bin/conda run -n ${env.name} --no-capture-output pip list --format=json`,
      `~/miniforge3/bin/conda run -n ${env.name} --no-capture-output pip list --format=json`,
      // 尝试直接使用环境中的 pip
      `~/miniconda3/envs/${env.name}/bin/pip list --format=json`,
      `~/anaconda3/envs/${env.name}/bin/pip list --format=json`,
      `~/miniforge3/envs/${env.name}/bin/pip list --format=json`
    ]
  } else if (env.type === 'uv') {
    return [
      `uv pip list --format=json`,
      `~/.local/bin/uv pip list --format=json`,
      `${pipPath} list --format=json`
    ]
  }
  // system python
  return [
    `${pipPath} list --format=json`,
    `pip3 list --format=json`,
    `pip list --format=json`
  ]
}

// 获取 pip list 命令（兼容旧代码，返回第一个命令）
const getPipListCommand = (env) => {
  const commands = getPipListCommands(env)
  return commands[0]
}

// 解析 pip list 输出
const parsePipList = (output) => {
  try {
    // 尝试解析 JSON 格式
    const data = JSON.parse(output)
    if (Array.isArray(data)) {
      return data.map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        size: null // 大小需要后续通过 pip show 获取
      }))
    }
  } catch (e) {
    // 如果 JSON 解析失败，尝试解析文本格式
    const lines = output.split('\n')
    const packages = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('Package') || trimmed.startsWith('---')) {
        continue
      }

      const parts = trimmed.split(/\s+/)
      if (parts.length >= 2) {
        packages.push({
          name: parts[0],
          version: parts[1],
          size: null
        })
      }
    }

    return packages
  }
}

// 格式化包大小
const formatPackageSize = (sizeBytes) => {
  if (!sizeBytes || sizeBytes === 0) return '-'
  const size = parseInt(sizeBytes)
  if (isNaN(size)) return '-'

  if (size >= 1024 * 1024 * 1024) {
    return (size / (1024 * 1024 * 1024)).toFixed(2) + ' G'
  } else if (size >= 1024 * 1024) {
    return (size / (1024 * 1024)).toFixed(2) + ' M'
  } else if (size >= 1024) {
    return (size / 1024).toFixed(2) + ' K'
  }
  return size + ' B'
}

// 获取包大小（使用 pip show + du -sh）
const fetchPackageSizes = async (packages) => {
  if (packages.length === 0) return

  try {
    // 批量获取包大小
    for (const pkg of packages) {
      try {
        // 使用 pip show 获取包的 Location 信息
        const commands = getPipShowCommands(pkg.name, selectedEnvironment.value)
        let location = ''

        for (const command of commands) {
          const result = await window.api.ssh.execCommand(selectedServer.value.id, command)

          if (result.success && result.stdout) {
            // 解析 Location 字段
            const locationMatch = result.stdout.match(/Location:\s*(.+)/)
            if (locationMatch) {
              location = locationMatch[1].trim()
              break
            }
          }
        }

        if (!location) {
          // 如果无法获取 Location，尝试其他方式
          continue
        }

        // 使用 du -sh 获取包目录大小
        const duCommand = `du -sb "${location}/${pkg.name}" 2>/dev/null | cut -f1`
        const duResult = await window.api.ssh.execCommand(selectedServer.value.id, duCommand)

        if (duResult.success && duResult.stdout && duResult.stdout.trim()) {
          const sizeBytes = parseInt(duResult.stdout.trim())
          if (!isNaN(sizeBytes)) {
            pkg.size = sizeBytes
          }
        }
      } catch (e) {
        // 单个包失败不影响其他包
      }
    }
  } catch (e) {
    console.warn('获取包大小失败:', e)
  }
}

// 获取 pip show 命令（返回多种尝试方式）
const getPipShowCommands = (packageName, env) => {
  const pipPath = env.pipPath

  if (env.type === 'conda') {
    return [
      `${pipPath} show ${packageName}`,
      `bash -l -c "conda run -n ${env.name} --no-capture-output pip show ${packageName}"`,
      `bash -c "source ~/.bashrc && conda run -n ${env.name} --no-capture-output pip show ${packageName}"`,
      `~/miniconda3/envs/${env.name}/bin/pip show ${packageName}`,
      `~/anaconda3/envs/${env.name}/bin/pip show ${packageName}`,
      `~/miniforge3/envs/${env.name}/bin/pip show ${packageName}`
    ]
  } else if (env.type === 'uv') {
    return [
      `uv pip show ${packageName}`,
      `~/.local/bin/uv pip show ${packageName}`,
      `${pipPath} show ${packageName}`
    ]
  }
  return [
    `${pipPath} show ${packageName}`,
    `pip3 show ${packageName}`,
    `pip show ${packageName}`
  ]
}

// 获取 site-packages 路径的命令
const getSitePackagesCommands = (env) => {
  const pythonPath = env.pythonPath

  if (env.type === 'conda') {
    return [
      `${pythonPath} -c 'import site; print(site.getsitepackages()[0])'`,
      `bash -l -c "conda run -n ${env.name} --no-capture-output python -c 'import site; print(site.getsitepackages()[0])'"`,
      `bash -c "source ~/.bashrc && conda run -n ${env.name} --no-capture-output python -c 'import site; print(site.getsitepackages()[0])'"`,
      `~/miniconda3/envs/${env.name}/bin/python -c 'import site; print(site.getsitepackages()[0])'`,
      `~/anaconda3/envs/${env.name}/bin/python -c 'import site; print(site.getsitepackages()[0])'`
    ]
  } else if (env.type === 'uv') {
    return [
      `${pythonPath} -c 'import site; print(site.getsitepackages()[0])'`,
      `python3 -c 'import site; print(site.getsitepackages()[0])'`
    ]
  }
  return [
    `${pythonPath} -c 'import site; print(site.getsitepackages()[0])'`,
    `python3 -c 'import site; print(site.getsitepackages()[0])'`,
    `python -c 'import site; print(site.getsitepackages()[0])'`
  ]
}

// 获取包大小的 du 命令
const getDuCommand = (sitePackagesPath, packageName) => {
  // 使用 du 命令计算目录大小，单位为 KB
  // -s: 只显示总计
  // -k: 以 KB 为单位
  return `du -sk -apparent-size "${sitePackagesPath}/${packageName}" 2>/dev/null | cut -f1`
}

// 删除依赖
const handleDelete = async (pkg) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除 ${pkg.name} (${pkg.version}) 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    loading.value = true

    const commands = getPipUninstallCommands(pkg.name, selectedEnvironment.value)
    let lastError = ''

    for (const command of commands) {
      const result = await window.api.ssh.execCommand(selectedServer.value.id, command)

      if (result.success) {
        ElMessage.success(`${pkg.name} 删除成功`)
        await loadDependencies()
        return
      }
      lastError = result.stderr || result.error || lastError
    }

    ElMessage.error(`删除失败: ${lastError || '未知错误'}`)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(`删除失败: ${error.message}`)
    }
  } finally {
    loading.value = false
  }
}

// 批量删除依赖
const handleBatchDelete = async () => {
  if (selectedPackages.value.length === 0) {
    ElMessage.warning('请先选择要删除的包')
    return
  }

  const packageNames = selectedPackages.value.map(p => p.name).join(', ')

  try {
    await ElMessageBox.confirm(
      `确定要删除以下 ${selectedPackages.value.length} 个包吗？\n\n${packageNames}`,
      '批量删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true
      }
    )

    loading.value = true

    // 构建批量卸载命令
    const packageList = selectedPackages.value.map(p => p.name).join(' ')
    const commands = getPipBatchUninstallCommands(packageList, selectedEnvironment.value)
    let lastError = ''

    for (const command of commands) {
      const result = await window.api.ssh.execCommand(selectedServer.value.id, command)

      if (result.success) {
        ElMessage.success(`成功删除 ${selectedPackages.value.length} 个包`)
        selectedPackages.value = []
        await loadDependencies()
        return
      }
      lastError = result.stderr || result.error || lastError
    }

    ElMessage.error(`批量删除失败: ${lastError || '未知错误'}`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(`批量删除失败: ${error.message}`)
    }
  } finally {
    loading.value = false
  }
}

// 批量升级依赖
const handleBatchUpgrade = async () => {
  if (!selectedEnvironment.value || !selectedServer.value) {
    ElMessage.warning('请先选择环境')
    return
  }

  // 只升级选中的包
  if (selectedPackages.value.length === 0) {
    ElMessage.warning('请先选择要升级的包')
    return
  }

  try {
    const packageNames = selectedPackages.value.map(p => p.name).join(', ')

    await ElMessageBox.confirm(
      `确定要升级以下 ${selectedPackages.value.length} 个包吗？\n\n${packageNames}\n\n这将从 PyPI 升级这些包到最新版本，可能需要较长时间。`,
      '批量升级确认',
      {
        confirmButtonText: '确定升级',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    batchUpgrading.value = true

    const successPackages = []
    const failedPackages = []

    // 只升级选中的包
    for (const pkg of selectedPackages.value) {
      try {
        const commands = getPipUpgradeCommands(pkg.name, 'pypi', selectedEnvironment.value, '', '')
        let lastError = ''

        for (const command of commands) {
          const result = await window.api.ssh.execCommand(selectedServer.value.id, command)

          if (result.success) {
            successPackages.push(pkg.name)
            break
          }
          lastError = result.stderr || result.error || lastError
        }

        if (!successPackages.includes(pkg.name)) {
          failedPackages.push({ name: pkg.name, error: lastError })
        }
      } catch (error) {
        failedPackages.push({ name: pkg.name, error: error.message })
      }
    }

    // 显示结果
    if (failedPackages.length === 0) {
      ElMessage.success(`批量升级完成！成功升级 ${successPackages.length} 个包`)
      selectedPackages.value = []
    } else {
      ElMessage.warning(
        `批量升级完成！成功 ${successPackages.length} 个，失败 ${failedPackages.length} 个`
      )
      console.warn('升级失败的包:', failedPackages)
    }

    await loadDependencies()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(`批量升级失败: ${error.message}`)
    }
  } finally {
    batchUpgrading.value = false
  }
}

// 表格选择变化处理
const handleSelectionChange = (selection) => {
  selectedPackages.value = selection
}

// 获取批量卸载命令
const getPipBatchUninstallCommands = (packageList, env) => {
  const pipPath = env.pipPath

  if (env.type === 'conda') {
    return [
      `${pipPath} uninstall -y ${packageList}`,
      `bash -l -c "conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageList}"`,
      `bash -c "source ~/.bashrc && conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageList}"`,
      `bash -c "source ~/.bash_profile && conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageList}"`,
      `~/miniconda3/bin/conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageList}`,
      `~/anaconda3/bin/conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageList}`,
      `~/miniforge3/bin/conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageList}`,
      `~/miniconda3/envs/${env.name}/bin/pip uninstall -y ${packageList}`,
      `~/anaconda3/envs/${env.name}/bin/pip uninstall -y ${packageList}`,
      `~/miniforge3/envs/${env.name}/bin/pip uninstall -y ${packageList}`
    ]
  } else if (env.type === 'uv') {
    return [
      `uv pip uninstall -y ${packageList}`,
      `~/.local/bin/uv pip uninstall -y ${packageList}`,
      `${pipPath} uninstall -y ${packageList}`
    ]
  }
  return [
    `${pipPath} uninstall -y ${packageList}`,
    `pip3 uninstall -y ${packageList}`,
    `pip uninstall -y ${packageList}`
  ]
}

// 获取 pip uninstall 命令（返回多种尝试方式）
const getPipUninstallCommands = (packageName, env) => {
  const pipPath = env.pipPath

  if (env.type === 'conda') {
    return [
      `${pipPath} uninstall -y ${packageName}`,
      `bash -l -c "conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageName}"`,
      `bash -c "source ~/.bashrc && conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageName}"`,
      `bash -c "source ~/.bash_profile && conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageName}"`,
      `~/miniconda3/bin/conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageName}`,
      `~/anaconda3/bin/conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageName}`,
      `~/miniforge3/bin/conda run -n ${env.name} --no-capture-output pip uninstall -y ${packageName}`,
      `~/miniconda3/envs/${env.name}/bin/pip uninstall -y ${packageName}`,
      `~/anaconda3/envs/${env.name}/bin/pip uninstall -y ${packageName}`,
      `~/miniforge3/envs/${env.name}/bin/pip uninstall -y ${packageName}`
    ]
  } else if (env.type === 'uv') {
    return [
      `uv pip uninstall -y ${packageName}`,
      `~/.local/bin/uv pip uninstall -y ${packageName}`,
      `${pipPath} uninstall -y ${packageName}`
    ]
  }
  return [
    `${pipPath} uninstall -y ${packageName}`,
    `pip3 uninstall -y ${packageName}`,
    `pip uninstall -y ${packageName}`
  ]
}

// 获取 pip uninstall 命令（兼容旧代码，返回第一个命令）
const getPipUninstallCommand = (packageName, env) => {
  const commands = getPipUninstallCommands(packageName, env)
  return commands[0]
}

// 打开升级对话框
const openUpgradeDialog = (pkg) => {
  currentPackage.value = pkg
  upgradeFormData.value = {
    packageName: pkg.name,
    upgradeType: 'pypi',
    gitUrl: '',
    branch: 'main'
  }
  upgradeLogs.value = [] // 清空日志
  upgradeDialogVisible.value = true
}

// 添加日志
const appendLog = (message, type = 'info') => {
  const timestamp = new Date().toLocaleTimeString()
  upgradeLogs.value.push({
    timestamp,
    message,
    type
  })
  // 自动滚动到底部
  nextTick(() => {
    const logContainer = document.querySelector('.upgrade-logs-container')
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight
    }
  })
}

// 清理事件监听器
const cleanupStreamListeners = () => {
  if (upgradeTaskId.value) {
    window.electron.ipcRenderer.removeListener('ssh:stream:data', handleStreamData)
    window.electron.ipcRenderer.removeListener('ssh:stream:close', handleStreamClose)
    upgradeTaskId.value = ''
  }
}

// 处理流式数据
const handleStreamData = (event, data) => {
  if (data.taskId === upgradeTaskId.value) {
    if (data.stdout) {
      appendLog(data.stdout, 'stdout')
    }
    if (data.stderr) {
      appendLog(data.stderr, 'stderr')
    }
  }
}

// 处理流式关闭
const handleStreamClose = (event, data) => {
  if (data.taskId === upgradeTaskId.value) {
    const success = data.code === 0
    if (success) {
      appendLog(`\n✓ 升级完成！退出代码: ${data.code}`, 'success')
      ElMessage.success(`${upgradeFormData.value.packageName} 升级成功`)
      setTimeout(async () => {
        upgradeDialogVisible.value = false
        await loadDependencies()
      }, 1000)
    } else {
      appendLog(`\n✗ 升级失败！退出代码: ${data.code}`, 'error')
      ElMessage.error(`${upgradeFormData.value.packageName} 升级失败`)
    }
    upgradingPackage.value = false
    cleanupStreamListeners()
  }
}

// 执行升级（流式）
const handleUpgrade = async () => {
  upgradingPackage.value = true
  upgradeLogs.value = [] // 清空日志

  // 生成唯一任务ID
  upgradeTaskId.value = `upgrade-${Date.now()}`

  // 注册事件监听器
  window.electron.ipcRenderer.on('ssh:stream:data', handleStreamData)
  window.electron.ipcRenderer.on('ssh:stream:close', handleStreamClose)

  try {
    const commands = getPipUpgradeCommands(
      upgradeFormData.value.packageName,
      upgradeFormData.value.upgradeType,
      selectedEnvironment.value,
      upgradeFormData.value.gitUrl,
      upgradeFormData.value.branch
    )

    appendLog(`开始升级 ${upgradeFormData.value.packageName}...`, 'info')
    appendLog(`升级方式: ${upgradeFormData.value.upgradeType}`, 'info')

    // 只尝试第一个命令（流式执行）
    const command = commands[0]
    appendLog(`执行命令: ${command}`, 'command')

    const result = await window.api.ssh.execCommandStream(
      selectedServer.value.id,
      command,
      upgradeTaskId.value
    )

    if (!result.success) {
      appendLog(`启动命令失败: ${result.error}`, 'error')
      ElMessage.error(`启动升级失败: ${result.error}`)
      upgradingPackage.value = false
      cleanupStreamListeners()
    }
  } catch (error) {
    appendLog(`异常: ${error.message}`, 'error')
    ElMessage.error(`升级失败: ${error.message}`)
    upgradingPackage.value = false
    cleanupStreamListeners()
  }
}

// 获取 pip install/upgrade 命令（返回多种尝试方式）
const getPipUpgradeCommands = (packageName, upgradeType, env, gitUrl, branch) => {
  let installPkg = ''

  if (upgradeType === 'github') {
    // 从 GitHub 安装
    let url = gitUrl
    if (branch) {
      url = `git+${gitUrl.replace('.git', '')}@${branch}#egg=${packageName}`
    } else {
      url = `git+${gitUrl}#egg=${packageName}`
    }
    installPkg = url
  } else {
    // 从 PyPI 升级
    installPkg = packageName
  }

  return getInstallCommands(installPkg, env, true)
}

// 获取 pip install/upgrade 命令（兼容旧代码，返回第一个命令）
const getPipUpgradeCommand = (packageName, upgradeType, env, gitUrl, branch) => {
  const commands = getPipUpgradeCommands(packageName, upgradeType, env, gitUrl, branch)
  return commands[0]
}

// 获取安装命令（返回多种尝试方式）
const getInstallCommands = (packageName, env, isUpgrade = false) => {
  const action = isUpgrade ? 'install --upgrade' : 'install'
  const pipPath = env.pipPath

  if (env.type === 'conda') {
    return [
      `${pipPath} ${action} ${packageName}`,
      `bash -l -c "conda run -n ${env.name} --no-capture-output pip ${action} ${packageName}"`,
      `bash -c "source ~/.bashrc && conda run -n ${env.name} --no-capture-output pip ${action} ${packageName}"`,
      `bash -c "source ~/.bash_profile && conda run -n ${env.name} --no-capture-output pip ${action} ${packageName}"`,
      `~/miniconda3/bin/conda run -n ${env.name} --no-capture-output pip ${action} ${packageName}`,
      `~/anaconda3/bin/conda run -n ${env.name} --no-capture-output pip ${action} ${packageName}`,
      `~/miniforge3/bin/conda run -n ${env.name} --no-capture-output pip ${action} ${packageName}`,
      `~/miniconda3/envs/${env.name}/bin/pip ${action} ${packageName}`,
      `~/anaconda3/envs/${env.name}/bin/pip ${action} ${packageName}`,
      `~/miniforge3/envs/${env.name}/bin/pip ${action} ${packageName}`
    ]
  } else if (env.type === 'uv') {
    return [
      `uv pip ${action} ${packageName}`,
      `~/.local/bin/uv pip ${action} ${packageName}`,
      `${pipPath} ${action} ${packageName}`
    ]
  }
  return [
    `${pipPath} ${action} ${packageName}`,
    `pip3 ${action} ${packageName}`,
    `pip ${action} ${packageName}`
  ]
}

// 获取安装命令（兼容旧代码，返回第一个命令）
const getInstallCommand = (packageName, env, isUpgrade = false) => {
  const commands = getInstallCommands(packageName, env, isUpgrade)
  return commands[0]
}

// 获取服务器名称
const getServerName = (serverId) => {
  const server = servers.value.find((s) => s.id === serverId)
  return server ? server.name : '未知'
}

// 格式化日志消息（处理特殊字符）
const formatLogMessage = (message) => {
  if (!message) return ''
  // 转义 HTML 特殊字符
  let formatted = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // 保留换行符
  formatted = formatted.replace(/\n/g, '<br>')
  return formatted
}

// 环境改变时自动加载依赖列表
watch(selectedEnvironmentId, async (newEnvId) => {
  if (newEnvId) {
    dependencies.value = []
    // 检查选中的环境是否在过滤后的列表中
    const envExists = allEnvironments.value.some(e => e.id === newEnvId)
    if (envExists) {
      await loadDependencies()
    } else {
      // 环境不存在（可能是脏数据），清空选择
      ElMessage.warning('选中的环境不存在，已自动清除')
      selectedEnvironmentId.value = ''
      dependencies.value = []
    }
  }
})

// 监听对话框关闭，清理事件监听器
watch(upgradeDialogVisible, (newValue) => {
  if (!newValue && !upgradingPackage.value) {
    // 对话框关闭且没有正在进行的升级时，清理监听器
    cleanupStreamListeners()
  }
})

onMounted(() => {
  serverStore.loadServers()
  environmentStore.loadEnvironments()
})
</script>

<template>
  <div class="environment-upgrade">
    <!-- 环境选择 -->
    <el-card shadow="never" class="selection-card">
      <template #header>
        <div class="card-header">
          <h3>环境依赖管理</h3>
        </div>
      </template>

      <el-form :inline="true" label-width="100px">
        <el-form-item label="选择环境">
          <el-select
            v-model="selectedEnvironmentId"
            placeholder="请选择环境"
            style="width: 300px"
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

        <el-form-item>
          <el-button
            type="primary"
            :disabled="!selectedEnvironmentId"
            :loading="loading"
            @click="loadDependencies"
          >
            查看依赖
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 依赖列表 -->
    <el-card shadow="never" class="deps-card" v-if="selectedEnvironmentId">
      <template #header>
        <div class="card-header">
          <div class="header-info">
            <span>依赖列表</span>
            <el-tag size="small" type="info" v-if="selectedEnvironment">
              <el-icon :size="14" style="margin-right: 4px;">
                <FolderOpened />
              </el-icon>
              {{ getServerName(selectedEnvironment.serverId) }} / {{ selectedEnvironment.name }} ({{ selectedEnvironment.type }})
            </el-tag>
            <el-tag size="small" type="success" v-if="dependencies.length > 0">
              共 {{ dependencies.length }} 个包
              <span v-if="searchKeyword">（筛选后 {{ filteredDependencies.length }} 个）</span>
            </el-tag>
            <el-tag size="small" type="warning" v-if="selectedPackages.length > 0">
              已选择 {{ selectedPackages.length }} 个
            </el-tag>
          </div>
          <div class="header-actions">
            <el-button
              v-if="selectedPackages.length > 0"
              type="danger"
              size="small"
              :icon="Delete"
              @click="handleBatchDelete"
            >
              批量删除 ({{ selectedPackages.length }})
            </el-button>
            <el-button
              type="success"
              size="small"
              :icon="Top"
              :loading="batchUpgrading"
              :disabled="selectedPackages.length === 0 || loading"
              @click="handleBatchUpgrade"
            >
              {{ batchUpgrading ? '批量升级中...' : `批量升级 (${selectedPackages.length})` }}
            </el-button>
            <el-input
              v-model="searchKeyword"
              placeholder="搜索包名称"
              :prefix-icon="Document"
              clearable
              style="width: 250px"
              size="small"
            />
          </div>
        </div>
      </template>

      <div v-loading="loading" class="deps-container">
        <el-table
          :data="filteredDependencies"
          style="width: 100%"
          height="500"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="55" />

          <el-table-column prop="name" label="包名称" min-width="200" sortable>
            <template #default="{ row }">
              <div class="package-name">
                <el-icon :size="16" style="margin-right: 8px;">
                  <Document />
                </el-icon>
                {{ row.name }}
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="version" label="当前版本" width="120" sortable />

          <el-table-column label="大小" width="100" align="right">
            <template #default="{ row }">
              {{ formatPackageSize(row.size) }}
            </template>
          </el-table-column>

          <el-table-column label="操作" align="right" width="250">
            <template #default="{ row }">
              <el-button
                type="primary"
                size="small"
                :icon="Top"
                @click="openUpgradeDialog(row)"
              >
                升级
              </el-button>
              <el-button
                type="danger"
                size="small"
                :icon="Delete"
                @click="handleDelete(row)"
              >
                卸载
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="filteredDependencies.length === 0 && !loading" class="empty-deps">
          <el-empty :description="searchKeyword ? '未找到匹配的包' : '暂无依赖数据'" />
        </div>
      </div>
    </el-card>

    <!-- 升级对话框 -->
    <el-dialog
      v-model="upgradeDialogVisible"
      :title="`升级 ${upgradeFormData.packageName}`"
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="upgradeFormRef"
        :model="upgradeFormData"
        :rules="upgradeFormRules"
        label-width="100px"
      >
        <el-form-item label="包名称">
          <el-input v-model="upgradeFormData.packageName" disabled />
        </el-form-item>

        <el-divider />

        <el-form-item label="升级方式">
          <el-radio-group v-model="upgradeFormData.upgradeType" :disabled="upgradingPackage">
            <el-radio label="pypi">从 PyPI 升级（推荐）</el-radio>
            <el-radio label="github">从 GitHub 分支升级</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="upgradeFormData.upgradeType === 'github'">
          <el-form-item label="仓库地址" prop="gitUrl">
            <el-input
              v-model="upgradeFormData.gitUrl"
              placeholder="例如: https://github.com/vllm-project/vllm.git"
              :disabled="upgradingPackage"
            />
          </el-form-item>

          <el-form-item label="分支名称" prop="branch">
            <el-input
              v-model="upgradeFormData.branch"
              placeholder="例如: main 或 dev"
              :disabled="upgradingPackage"
            />
          </el-form-item>
        </template>

        <el-alert
          v-if="upgradeFormData.upgradeType === 'pypi'"
          title="将从 PyPI 安装最新版本"
          type="info"
          :closable="false"
          show-icon
          style="margin-top: 12px"
        />

        <el-alert
          v-else
          title="将从指定的 GitHub 分支安装，可能包含未发布的功能"
          type="warning"
          :closable="false"
          show-icon
          style="margin-top: 12px"
        />

        <!-- 升级日志显示区域 -->
        <div v-if="upgradeLogs.length > 0 || upgradingPackage" class="upgrade-logs-wrapper">
          <el-divider />
          <div class="logs-header">
            <span>升级日志</span>
            <el-tag v-if="upgradingPackage" type="primary" size="small">执行中...</el-tag>
          </div>
          <div class="upgrade-logs-container">
            <div
              v-for="(log, index) in upgradeLogs"
              :key="index"
              :class="['log-line', `log-${log.type}`]"
            >
              <span class="log-time">{{ log.timestamp }}</span>
              <span class="log-content" v-html="formatLogMessage(log.message)"></span>
            </div>
            <div v-if="upgradingPackage && upgradeLogs.length === 0" class="log-line log-info">
              <span class="log-content">正在初始化...</span>
            </div>
          </div>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="upgradeDialogVisible = false" :disabled="upgradingPackage">取消</el-button>
        <el-button
          type="primary"
          :loading="upgradingPackage"
          @click="handleUpgrade"
        >
          {{ upgradingPackage ? '升级中...' : '开始升级' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.environment-upgrade {
  padding: 16px;

  .selection-card,
  .deps-card {
    margin-bottom: 16px;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }

      .header-info {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
    }
  }

  .deps-container {
    .package-name {
      display: flex;
      align-items: center;
      font-family: monospace;
      font-weight: 600;
    }

    .empty-deps {
      padding: 40px 0;
      text-align: center;
    }
  }
}

// 升级日志样式
.upgrade-logs-wrapper {
  .logs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 600;
    color: #303133;
  }

  .upgrade-logs-container {
    background: #1e1e1e;
    border-radius: 6px;
    padding: 12px;
    max-height: 300px;
    overflow-y: auto;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;

    .log-line {
      display: flex;
      margin-bottom: 4px;

      &.log-info .log-content {
        color: #60a5fa;
      }

      &.log-stdout .log-content {
        color: #e5e7eb;
      }

      &.log-stderr .log-content {
        color: #fca5a5;
      }

      &.log-command .log-content {
        color: #fbbf24;
      }

      &.log-success .log-content {
        color: #4ade80;
        font-weight: 600;
      }

      &.log-error .log-content {
        color: #f87171;
        font-weight: 600;
      }

      .log-time {
        color: #6b7280;
        margin-right: 8px;
        flex-shrink: 0;
        font-size: 12px;
      }

      .log-content {
        flex: 1;
        word-break: break-all;
        white-space: pre-wrap;
      }
    }

    // 滚动条样式
    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: #2d2d2d;
      border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: #555;
      border-radius: 4px;

      &:hover {
        background: #666;
      }
    }
  }
}
</style>
