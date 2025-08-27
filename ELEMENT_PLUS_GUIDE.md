# Element Plus 集成指南

本项目已成功集成 Element Plus 和自动导入功能。

## 已安装的依赖

- **element-plus**: ^2.11.1 - Element Plus 组件库
- **unplugin-auto-import**: ^20.0.0 - 自动导入 API
- **unplugin-vue-components**: ^29.0.0 - 自动导入组件

## 自动导入功能

### 1. 自动导入的 API
通过 `unplugin-auto-import` 插件，以下 API 无需手动导入即可使用：

- Vue 3 的 Composition API: `ref`, `reactive`, `computed`, `watch`, etc.
- Vue Router: `useRouter`, `useRoute`

### 2. 自动导入的组件
通过 `unplugin-vue-components` 插件，所有 Element Plus 组件都可以直接使用，无需手动导入。

## 使用示例

### 按钮组件
```vue
<template>
  <el-button type="primary">主要按钮</el-button>
  <el-button type="success">成功按钮</el-button>
  <el-button type="warning">警告按钮</el-button>
  <el-button type="danger">危险按钮</el-button>
</template>
```

### 表单组件
```vue
<template>
  <el-form :model="form" label-width="120px">
    <el-form-item label="用户名">
      <el-input v-model="form.username" />
    </el-form-item>
    <el-form-item label="邮箱">
      <el-input v-model="form.email" />
    </el-form-item>
  </el-form>
</template>

<script setup>
const form = reactive({
  username: '',
  email: ''
})
</script>
```

### 消息提示
```vue
<script setup>
import { ElMessage } from 'element-plus'

const showMessage = () => {
  ElMessage.success('操作成功！')
  ElMessage.error('操作失败！')
  ElMessage.warning('警告信息！')
  ElMessage.info('提示信息！')
}
</script>
```

**注意**: `ElMessage`、`ElMessageBox`、`ElNotification` 等函数式组件需要手动导入，组件会自动导入。

### 对话框
```vue
<template>
  <el-button @click="dialogVisible = true">打开对话框</el-button>
  
  <el-dialog v-model="dialogVisible" title="提示">
    <p>这是一个对话框</p>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="dialogVisible = false">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
const dialogVisible = ref(false)
</script>
```

## 开发命令

```bash
# 启动开发服务器
pnpm dev

# 构建应用
pnpm build

# 为特定平台构建
pnpm build:win    # Windows
pnpm build:mac    # macOS
pnpm build:linux  # Linux
```

## 注意事项

1. **样式自动导入**: Element Plus 的样式文件会自动按需导入，无需手动引入
2. **类型声明**: 开发服务器启动后，会在项目根目录生成 `auto-imports.d.ts` 和 `components.d.ts` 文件，提供完整的 TypeScript 支持
3. **组件命名**: 所有 Element Plus 组件都以 `el-` 前缀命名

## 自定义主题

如需自定义主题，可以修改 `src/renderer/src/assets/main.css` 文件，覆盖 Element Plus 的 CSS 变量。

## 更多组件

访问 [Element Plus 官方文档](https://element-plus.org/) 了解更多组件和用法。