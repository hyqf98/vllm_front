<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Document, Refresh, Link, ArrowRight } from '@element-plus/icons-vue'

const activeTab = ref('vllm')
const showTips = ref(false)

// 文档URL配置
const docUrls = {
  vllm: 'https://docs.vllm.com.cn/',
  lmdeploy: 'https://lmdeploy.readthedocs.io/zh-cn/latest/'
}

const currentUrl = computed(() => docUrls[activeTab.value])

const onIframeLoad = (event) => {
  // iframe加载完成
}

const openInNewTab = () => {
  window.open(currentUrl.value, '_blank')
}

const refreshIframe = () => {
  const webview = document.querySelector('.doc-frame webview')
  if (webview) {
    webview.reload()
  }
}

// 监听窗口大小变化
const handleResize = () => {
  // 可以在这里添加额外的调整逻辑
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="script-docs">
    <!-- 头部 -->
    <div class="docs-header">
      <div class="header-left">
        <el-icon :size="22" class="header-icon">
          <Document />
        </el-icon>
        <h1 class="header-title">脚本命令文档</h1>
      </div>
      <div class="header-right">
        <el-button
          :icon="Refresh"
          @click="refreshIframe"
          size="small"
        >
          刷新
        </el-button>
        <el-button
          :icon="Link"
          type="primary"
          @click="openInNewTab"
          size="small"
        >
          在浏览器打开
        </el-button>
        <el-button
          :icon="ArrowRight"
          @click="showTips = !showTips"
          size="small"
          text
        >
          {{ showTips ? '隐藏提示' : '使用提示' }}
        </el-button>
      </div>
    </div>

    <!-- 使用说明折叠面板 -->
    <el-collapse-transition>
      <div v-show="showTips" class="usage-tips">
        <div class="tips-content">
          <div class="tips-grid">
            <div class="tip-item">
              <div class="tip-icon">📑</div>
              <div class="tip-text">切换标签页可查看不同框架的文档</div>
            </div>
            <div class="tip-item">
              <div class="tip-icon">🌐</div>
              <div class="tip-text">点击"在浏览器打开"可在新窗口中查看完整文档</div>
            </div>
            <div class="tip-item">
              <div class="tip-icon">⚡</div>
              <div class="tip-text">使用 Electron webview 组件加载文档</div>
            </div>
            <div class="tip-item">
              <div class="tip-icon">🚀</div>
              <div class="tip-text">VLLM 是高性能的大语言模型推理框架</div>
            </div>
            <div class="tip-item">
              <div class="tip-icon">🛠️</div>
              <div class="tip-text">LMDeploy 是全栈 LLM 任务工具包</div>
            </div>
          </div>
        </div>
      </div>
    </el-collapse-transition>

    <!-- 文档内容区域 -->
    <div class="docs-content">
      <!-- 侧边栏标签 -->
      <div class="docs-sidebar">
        <div
          v-for="(url, key) in docUrls"
          :key="key"
          :class="['doc-tab', { active: activeTab === key }]"
          @click="activeTab = key"
        >
          <div class="tab-icon">{{ key === 'vllm' ? '🚀' : '🛠️' }}</div>
          <div class="tab-info">
            <div class="tab-name">{{ key.toUpperCase() }}</div>
            <div class="tab-desc">{{ key === 'vllm' ? '推理框架' : '工具包' }}</div>
          </div>
        </div>
      </div>

      <!-- 文档展示区域 -->
      <div class="docs-main">
        <div class="doc-frame">
          <webview
            v-show="activeTab === 'vllm'"
            :src="docUrls.vllm"
            class="webview-embed"
            partition="persist:webview-docs"
            allowpopups="true"
            @load-commit="onIframeLoad"
          ></webview>
          <webview
            v-show="activeTab === 'lmdeploy'"
            :src="docUrls.lmdeploy"
            class="webview-embed"
            partition="persist:webview-docs"
            allowpopups="true"
            @load-commit="onIframeLoad"
          ></webview>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.script-docs {
  padding: 16px;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);

  .docs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    margin-bottom: 12px;
    flex-shrink: 0;
    height: 56px;

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;

      .header-icon {
        color: #667eea;
      }

      .header-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #303133;
      }
    }

    .header-right {
      display: flex;
      gap: 8px;
    }
  }

  .usage-tips {
    margin-bottom: 12px;
    flex-shrink: 0;

    .tips-content {
      padding: 16px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);

      .tips-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 12px;

        .tip-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 8px;
          transition: all 0.3s ease;

          &:hover {
            background: #e9ecef;
          }

          .tip-icon {
            font-size: 20px;
            flex-shrink: 0;
          }

          .tip-text {
            font-size: 12px;
            color: #606266;
            line-height: 1.4;
          }
        }
      }
    }
  }

  .docs-content {
    // 固定高度：确保占据大部分视口高度
    height: 700px;
    display: flex;
    gap: 12px;
    overflow: hidden;

    .docs-sidebar {
      width: 160px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;

      .doc-tab {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: #fff;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

        &:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }

        &.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);

          .tab-icon {
            filter: brightness(0) invert(1);
          }

          .tab-info {
            .tab-name {
              color: #fff;
            }

            .tab-desc {
              color: rgba(255, 255, 255, 0.8);
            }
          }
        }

        .tab-icon {
          font-size: 20px;
          flex-shrink: 0;
        }

        .tab-info {
          flex: 1;

          .tab-name {
            font-size: 14px;
            font-weight: 600;
            color: #303133;
            margin-bottom: 2px;
          }

          .tab-desc {
            font-size: 11px;
            color: #909399;
          }
        }
      }
    }

    .docs-main {
      flex: 1;
      min-width: 0;
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      display: flex;
      flex-direction: column;

      .doc-frame {
        width: 100%;
        height: 700px;
        position: relative;

        webview {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }
      }
    }
  }
}
</style>
