/**
 * NVIDIA GPU 处理器
 * 使用 nvidia-smi 命令管理 NVIDIA 显卡
 */
import BaseGPUHandler from './base-gpu-handler.js'

class NvidiaGPUHandler extends BaseGPUHandler {
  /**
   * 获取 GPU 厂商名称
   */
  getVendorName() {
    return 'nvidia'
  }

  /**
   * 获取检测命令
   */
  getCheckCommand() {
    return 'nvidia-smi --version'
  }

  /**
   * 获取所有 GPU 进程的 PID 列表
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array<number>>} PID 列表
   */
  async getGPUProcessPIDs(serverId) {
    try {
      const cmd = 'nvidia-smi --query-compute-apps=pid --format=csv,noheader'
      const result = await this.sshManager.execCommand(serverId, cmd)

      if (result.success && result.stdout.trim()) {
        return result.stdout.trim()
          .split('\n')
          .map(line => parseInt(line.trim(), 10))
          .filter(pid => !isNaN(pid))
      }

      return []
    } catch (error) {
      return []
    }
  }

  /**
   * 获取所有 GPU 上的进程列表
   * @param {string} serverId - 服务器ID
   * @returns {Promise<Array<Object>>} 进程列表
   */
  async getAllGPUProcesses(serverId) {
    try {
      // 使用 nvidia-smi 获取所有 GPU 进程的详细信息
      // 格式: gpu_bus_id, pid, process_name, used_memory
      const cmd = 'nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits'
      const result = await this.sshManager.execCommand(serverId, cmd)

      if (result.success && result.stdout.trim()) {
        const processes = []
        const lines = result.stdout.trim().split('\n')

        for (const line of lines) {
          const parts = line.split(',').map(p => p.trim())
          if (parts.length >= 3) {
            const pid = parseInt(parts[0], 10)
            const processName = parts[1]
            const usedMemory = parseInt(parts[2], 10)

            if (!isNaN(pid)) {
              // 获取完整的命令行
              const commandLine = await this.getProcessCommandLine(serverId, pid)

              processes.push({
                pid,
                name: processName,
                command: commandLine,
                gpuMemory: usedMemory,
                vendor: 'nvidia'
              })
            }
          }
        }

        return processes
      }

      return []
    } catch (error) {
      return []
    }
  }

  /**
   * 获取 GPU 进程的详细信息
   * @param {string} serverId - 服务器ID
   * @param {number} pid - 进程PID
   * @returns {Promise<Object>} 进程信息
   */
  async getGPUProcessInfo(serverId, pid) {
    try {
      const processes = await this.getAllGPUProcesses(serverId)
      return processes.find(p => p.pid === parseInt(pid.toString())) || null
    } catch (error) {
      return null
    }
  }

  /**
   * 检查 GPU 进程是否匹配指定的服务配置
   * @param {string} serverId - 服务器ID
   * @param {Object} process - GPU 进程信息
   * @param {Object} serviceConfig - 服务配置
   * @param {string} serviceConfig.modelPath - 模型路径
   * @param {string} serviceConfig.port - 端口号
   * @param {number} serviceConfig.pid - 主进程PID
   * @returns {Promise<boolean>} 是否匹配
   */
  async isProcessMatchService(serverId, process, serviceConfig) {
    const { modelPath, port, pid } = serviceConfig

    // 条件0：进程名称是 VLLM::Worker_TP，说明这是 VLLM 的 worker 进程
    // 需要通过其他方式确认它属于当前服务
    if (process.name && process.name.includes('VLLM::Worker_TP')) {
      // 方法1：如果有主进程 PID，检查进程组
      if (pid) {
        try {
          const isSameGroup = await this.isSameProcessGroup(serverId, pid, process.pid)
          if (isSameGroup) {
            return true
          }

          // 方法2：检查父子关系（worker 可能是主进程的子进程）
          const ppidResult = await this.sshManager.execCommand(serverId, `ps -o ppid -p ${process.pid} --no-headers`)
          if (ppidResult.success && ppidResult.stdout.trim()) {
            const ppid = parseInt(ppidResult.stdout.trim(), 10)
            // 如果父进程是主进程 PID，或者是主进程的子进程
            if (ppid === parseInt(pid.toString())) {
              return true
            }
          }
        } catch (error) {
          // 继续其他检查
        }
      }

      // 方法3：如果有端口，尝试从进程环境变量或打开的文件描述符中获取信息
      if (port) {
        try {
          // 检查进程打开的端口
          const portCheckCmd = `lsof -p ${process.pid} -a -i TCP -sTCP:LISTEN 2>/dev/null | grep ":${port}"`
          const portResult = await this.sshManager.execCommand(serverId, portCheckCmd)
          if (portResult.success && portResult.stdout.trim()) {
            return true
          }
        } catch (error) {
          // 继续其他检查
        }
      }

      // 方法4：如果命令行包含任何相关信息
      if (process.command) {
        // 检查是否包含 vllm 关键字
        if (process.command.toLowerCase().includes('vllm')) {
          // 进一步检查
          if (modelPath && process.command.includes(modelPath)) {
            return true
          }
          if (port && process.command.includes(port.toString())) {
            return true
          }
        }
      }

      // 方法5：检查进程启动时间，如果是最近启动的 VLLM worker 且我们有主进程 PID，
      // 可以假设它属于当前服务（这个方法不够精确，但可以作为最后手段）
      if (pid) {
        try {
          const startTimeResult = await this.sshManager.execCommand(
            serverId,
            `ps -p ${pid},${process.pid} -o lstart --no-headers`
          )
          if (startTimeResult.success && startTimeResult.stdout.trim()) {
            const lines = startTimeResult.stdout.trim().split('\n')
            if (lines.length === 2) {
              // 如果启动时间相同或非常接近，认为是同一个服务
              return true
            }
          }
        } catch (error) {
          // 继续其他检查
        }
      }
    }

    // 条件1：命令行包含模型路径（最精确）
    if (modelPath && process.command && process.command.includes(modelPath)) {
      return true
    }

    // 条件2：命令行包含端口号，且是 vllm/lmdeploy 进程
    if (port && process.command && process.command.includes(port.toString())) {
      if (process.command.includes('vllm') || process.command.includes('lmdeploy')) {
        return true
      }
    }

    // 条件3：检查是否是同一进程组
    if (pid && process.pid) {
      const isSameGroup = await this.isSameProcessGroup(serverId, pid, process.pid)
      if (isSameGroup) {
        return true
      }
    }

    return false
  }
}

export default NvidiaGPUHandler
