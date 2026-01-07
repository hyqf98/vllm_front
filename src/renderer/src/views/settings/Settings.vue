<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, FolderOpened } from '@element-plus/icons-vue'

const settings = ref({
  autoConnect: false,
  checkUpdateOnStart: true,
  logRetentionDays: 7,
  defaultLogLines: 100,
  theme: 'light'
})

const dataPath = ref('')
const clearingData = ref(false)

const handleSave = () => {
  localStorage.setItem('vllm_settings', JSON.stringify(settings.value))
  ElMessage.success('设置已保存')
}

const handleReset = () => {
  settings.value = {
    autoConnect: false,
    checkUpdateOnStart: true,
    logRetentionDays: 7,
    defaultLogLines: 100,
    theme: 'light'
  }
  ElMessage.info('设置已重置')
}

// 加载设置
const loadSettings = () => {
  const saved = localStorage.getItem('vllm_settings')
  if (saved) {
    try {
      settings.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }
}

// 加载数据路径
const loadDataPath = async () => {
  try {
    const result = await window.api.data.getPath()
    if (result.success && result.data) {
      dataPath.value = result.data
    }
  } catch (error) {
    console.error('获取数据路径失败:', error)
  }
}

// 打开数据目录
const openDataFolder = async () => {
  const { shell } = require('electron')
  if (dataPath.value) {
    shell.openPath(dataPath.value)
  }
}

// 一键清理数据
const handleClearAllData = async () => {
  try {
    await ElMessageBox.confirm(
      '此操作将删除所有持久化数据，包括服务器配置、模型服务等，且无法恢复。确定要继续吗？',
      '警告',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        distinguishCancelAndClose: true
      }
    )

    clearingData.value = true

    const result = await window.api.data.clearAll()

    if (result.success) {
      ElMessage.success('数据已清理完成，请重启应用')
      // 刷新页面
      setTimeout(() => {
        location.reload()
      }, 1500)
    } else {
      ElMessage.error(`清理失败: ${result.error || '未知错误'}`)
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(`清理失败: ${error.message}`)
    }
  } finally {
    clearingData.value = false
  }
}

loadSettings()
loadDataPath()

</script>

<template>
  <div class="settings-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>系统设置</h3>
        </div>
      </template>

      <el-form :model="settings" label-width="150px">
        <el-divider content-position="left">连接设置</el-divider>

        <el-form-item label="启动时自动连接">
          <el-switch v-model="settings.autoConnect" />
          <span class="form-desc">启动应用时自动连接到已配置的服务器</span>
        </el-form-item>

        <el-divider content-position="left">更新设置</el-divider>

        <el-form-item label="启动时检查更新">
          <el-switch v-model="settings.checkUpdateOnStart" />
          <span class="form-desc">启动应用时自动检查版本更新</span>
        </el-form-item>

        <el-divider content-position="left">日志设置</el-divider>

        <el-form-item label="日志保留天数">
          <el-input-number
            v-model="settings.logRetentionDays"
            :min="1"
            :max="30"
            controls-position="right"
          />
          <span class="form-desc">本地日志文件保留天数</span>
        </el-form-item>

        <el-form-item label="默认日志行数">
          <el-input-number
            v-model="settings.defaultLogLines"
            :min="50"
            :max="1000"
            :step="50"
            controls-position="right"
          />
          <span class="form-desc">日志查看器默认显示的行数</span>
        </el-form-item>

        <el-divider content-position="left">外观设置</el-divider>

        <el-form-item label="主题">
          <el-radio-group v-model="settings.theme">
            <el-radio label="light">浅色</el-radio>
            <el-radio label="dark">深色</el-radio>
            <el-radio label="auto">跟随系统</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-divider />

        <el-form-item>
          <el-button type="primary" @click="handleSave">保存设置</el-button>
          <el-button @click="handleReset">恢复默认</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据管理 -->
    <el-card shadow="never" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <h3>数据管理</h3>
        </div>
      </template>

      <div class="data-management">
        <div class="data-info">
          <div class="info-item">
            <span class="label">数据存储路径:</span>
            <span class="value">{{ dataPath || '未加载' }}</span>
          </div>
        </div>

        <el-divider />

        <div class="data-actions">
          <el-button :icon="FolderOpened" @click="openDataFolder">
            打开数据目录
          </el-button>
          <el-button
            type="danger"
            :icon="Delete"
            :loading="clearingData"
            @click="handleClearAllData"
          >
            一键清理所有数据
          </el-button>
        </div>

        <el-alert
          title="注意"
          type="warning"
          :closable="false"
          show-icon
          style="margin-top: 16px"
        >
          <template #default>
            <ul class="tips-list">
              <li>数据目录包含所有服务器配置、模型服务配置等持久化数据</li>
              <li>清理操作将删除所有数据且无法恢复，请谨慎操作</li>
              <li>建议在清理前先打开数据目录备份重要配置</li>
            </ul>
          </template>
        </el-alert>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <h3>关于</h3>
        </div>
      </template>

      <div class="about-info">
        <div class="info-item">
          <span class="label">应用名称:</span>
          <span class="value">VLLM 模型服务管理工具</span>
        </div>
        <div class="info-item">
          <span class="label">版本号:</span>
          <span class="value">v1.0.0</span>
        </div>
        <div class="info-item">
          <span class="label">框架支持:</span>
          <span class="value">VLLM, LMDeploy</span>
        </div>
        <div class="info-item">
          <span class="label">技术栈:</span>
          <span class="value">Electron + Vue 3 + Element Plus</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
.settings-page {
  max-width: 800px;

  .card-header {
    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
  }

  .form-desc {
    margin-left: 12px;
    color: #909399;
    font-size: 12px;
  }

  .data-management {
    .data-info {
      .info-item {
        display: flex;
        padding: 8px 0;

        .label {
          min-width: 120px;
          color: #909399;
          font-size: 14px;
        }

        .value {
          flex: 1;
          color: #303133;
          font-size: 14px;
          font-family: monospace;
        }
      }
    }

    .data-actions {
      display: flex;
      gap: 12px;
    }

    .tips-list {
      margin: 8px 0 0 0;
      padding-left: 20px;

      li {
        margin-bottom: 6px;
        color: #606266;
        font-size: 13px;
        line-height: 1.6;

        &:last-child {
          margin-bottom: 0;
        }
      }
    }
  }

  .about-info {
    .info-item {
      display: flex;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      .label {
        min-width: 120px;
        color: #909399;
        font-size: 14px;
      }

      .value {
        flex: 1;
        color: #303133;
        font-size: 14px;
        font-weight: 500;
      }
    }
  }
}
</style>
