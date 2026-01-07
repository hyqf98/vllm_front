import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      component: () => import("@renderer/views/Layout.vue"),
      redirect: "/servers",
      children: [
        {
          path: "servers",
          name: "环境管理",
          component: () => import("@renderer/views/servers/ServerManagement.vue"),
        },
        {
          path: "servers/:id",
          name: "环境详情",
          component: () => import("@renderer/views/servers/ServerDetails.vue"),
          props: true
        },
        {
          path: "services",
          name: "模型服务",
          component: () => import("@renderer/views/services/ModelServices.vue"),
        },
        {
          path: "logs",
          name: "日志监控",
          component: () => import("@renderer/views/logs/LogViewer.vue"),
        },
        {
          path: "market",
          name: "模型市场",
          component: () => import("@renderer/views/market/ModelMarket.vue"),
        },
        {
          path: "model-tests",
          name: "模型测试",
          component: () => import("@renderer/views/model-tests/ModelTests.vue"),
        },
        {
          path: "model-tests/chat/:testId?",
          name: "聊天测试",
          component: () => import("@renderer/views/model-tests/ChatTestPanel.vue"),
          props: true
        },
        {
          path: "datasource",
          name: "数据源管理",
          component: () => import("@renderer/views/DataSourceManagement.vue"),
        },
        {
          path: "upgrade",
          name: "环境升级",
          component: () => import("@renderer/views/upgrade/FrameworkUpgrade.vue"),
        },
        {
          path: "docs",
          name: "脚本文档",
          component: () => import("@renderer/views/docs/ScriptDocs.vue"),
        },
        {
          path: "settings",
          name: "系统设置",
          component: () => import("@renderer/views/settings/Settings.vue"),
        }
      ]
    }
  ]
})

export default router;
