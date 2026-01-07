<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Menu as IconMenu, Setting, Document, Promotion, Monitor, ArrowLeft, ArrowRight, Bell, User, Reading, ShoppingBag, Download, ChatDotRound, Connection } from '@element-plus/icons-vue'
import MinimizedDownloads from '@renderer/views/market/MinimizedDownloads.vue'
import { useModelHubStore } from '@renderer/store/modelHubStore'

const router = useRouter()
const route = useRoute()
const collapsed = ref(false)
const activeMenu = ref('servers')

// 下载面板显示状态
const showDownloadsPanel = ref(false)

// 下载任务管理
const modelHubStore = useModelHubStore()

// 正在下载的任务数量
const downloadingCount = computed(() => {
  return modelHubStore.downloadTasks.filter(task => task.status === 'downloading').length
})

// 加载下载任务
onMounted(async () => {
  await modelHubStore.loadDownloadTasks()
})

const menuItems = [
  { key: 'servers', label: '环境管理', icon: Monitor, path: '/servers' },
  { key: 'services', label: '模型服务', icon: IconMenu, path: '/services' },
  { key: 'logs', label: '日志监控', icon: Document, path: '/logs' },
  { key: 'market', label: '模型市场', icon: ShoppingBag, path: '/market' },
  { key: 'model-tests', label: '模型测试', icon: ChatDotRound, path: '/model-tests' },
  { key: 'datasource', label: '数据源管理', icon: Connection, path: '/datasource' },
  { key: 'upgrade', label: '环境升级', icon: Promotion, path: '/upgrade' },
  { key: 'docs', label: '脚本文档', icon: Reading, path: '/docs' },
  { key: 'settings', label: '系统设置', icon: Setting, path: '/settings' }
]

const handleMenuSelect = (key) => {
  // 根据 key 找到对应的菜单项
  const menuItem = menuItems.find(item => item.key === key)
  if (menuItem) {
    router.push(menuItem.path)
  }
}

onMounted(() => {
  // 根据当前路由设置活动菜单项
  const currentItem = menuItems.find(item => item.path === route.path)
  if (currentItem) {
    activeMenu.value = currentItem.key
  }
})

// 监听路由变化，更新活动菜单项
watch(
  () => route.path,
  (newPath) => {
    const currentItem = menuItems.find(item => item.path === newPath)
    if (currentItem) {
      activeMenu.value = currentItem.key
    }
  },
  { immediate: true }
)
</script>

<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
    <el-aside :width="collapsed ? '64px' : '200px'" class="sidebar">
      <div class="logo-container">
        <h2 v-if="!collapsed">VLLM 管理</h2>
        <span v-else>V</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        class="sidebar-menu"
        @select="handleMenuSelect"
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="item.key"
          :index="item.key"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <div class="collapse-btn" @click="collapsed = !collapsed">
        <el-icon><ArrowRight v-if="collapsed" /><ArrowLeft v-else /></el-icon>
      </div>
    </el-aside>

    <!-- 主内容区 -->
    <el-container>
      <!-- 顶部栏 -->
      <el-header class="header">
        <div class="header-title">
          <h3>{{ menuItems.find(item => item.key === activeMenu)?.label || '' }}</h3>
        </div>
        <div class="header-actions">
          <el-badge :value="downloadingCount" :hidden="downloadingCount === 0" type="primary">
            <el-button circle @click="showDownloadsPanel = !showDownloadsPanel">
              <el-icon><Download /></el-icon>
            </el-button>
          </el-badge>
          <el-button circle>
            <el-icon><Bell /></el-icon>
          </el-button>
          <el-button circle>
            <el-icon><User /></el-icon>
          </el-button>
        </div>
      </el-header>

      <!-- 主要内容 -->
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" :key="Component?.type?.name || 'default'" />
        </router-view>
      </el-main>
    </el-container>

    <!-- 最小化下载面板 -->
    <MinimizedDownloads
      :visible="showDownloadsPanel"
      @update:visible="showDownloadsPanel = $event"
      @close="showDownloadsPanel = false"
    />
  </el-container>
</template>

<style lang="scss" scoped>
.layout-container {
  height: 100vh;
  background: #f5f7fa;
}

.sidebar {
  background: #304156;
  color: #fff;
  transition: width 0.3s;
  display: flex;
  flex-direction: column;
  position: relative;

  .logo-container {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    h2 {
      color: #fff;
      font-size: 18px;
      margin: 0;
    }

    span {
      font-size: 24px;
      font-weight: bold;
    }
  }

  .sidebar-menu {
    flex: 1;
    border: none;
    background: transparent;

    :deep(.el-menu-item) {
      color: #bfcbd9;

      &:hover {
        background-color: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      &.is-active {
        background-color: #409eff;
        color: #fff;
      }
    }
  }

  .collapse-btn {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    transition: background 0.3s;

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
  }
}

.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);

  .header-title {
    h3 {
      margin: 0;
      font-size: 18px;
      color: #303133;
    }
  }

  .header-actions {
    display: flex;
    gap: 12px;
  }
}

.main-content {
  padding: 20px;
  overflow-y: auto;
}
</style>
