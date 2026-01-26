# GPU 进程管理功能设计文档

## 1. 概述

在服务器详情页的环境管理模块中新增 GPU 进程管理功能，允许用户查看和管理当前服务器 GPU 上运行的所有进程，支持批量终止进程。

**创建日期:** 2025-01-26
**状态:** 设计完成，待实施

## 2. 功能需求

### 2.1 核心功能
- 显示当前服务器 GPU 上运行的所有进程
- 显示进程 PID、命令、显存占用
- 支持单个终止进程
- 支持批量选择并终止多个进程
- 兼容多种显卡类型（NVIDIA、AMD、Intel）

### 2.2 用户交互
1. 在服务器详情页的 GPU 选项卡中点击"查看进程"按钮
2. 弹出对话框显示进程列表
3. 用户可以勾选进程进行批量操作
4. 支持刷新进程列表

## 3. 架构设计

### 3.1 组件结构

```
ServerDetails.vue (已有)
  └── GPUProcessManager.vue (新增，对话框组件)
```

### 3.2 UI 布局

```
┌─────────────────────────────────────────────────────┐
│ GPU 进程管理 - [服务器名称]      [刷新] [×]         │
├─────────────────────────────────────────────────────┤
│ [NVIDIA] [刷新按钮]                                 │
├─────────────────────────────────────────────────────┤
│ ┌───┬────────┬───────────┬────────────────────┐    │
│ │   │ PID    │ 显存占用  │ 命令               │    │
│ ├───┼────────┼───────────┼────────────────────┤    │
│ │☑ │ 12345  │ 2.34 GB   │ python train.py    │    │
│ │☐ │ 12346  │ 1.80 GB   │ python inference.py│    │
│ └───┴────────┴───────────┴────────────────────┘    │
├─────────────────────────────────────────────────────┤
│ [批量终止选中(2)]              [关闭]               │
└─────────────────────────────────────────────────────┘
```

## 4. API 设计

### 4.1 Preload API

**文件:** `src/preload/index.js`

```javascript
const gpuAPI = {
  getProcesses: (serverId) => ipcRenderer.invoke('gpu:getProcesses', serverId),
  killProcess: (serverId, pid) => ipcRenderer.invoke('gpu:killProcess', serverId, pid),
  killBatchProcesses: (serverId, pids) => ipcRenderer.invoke('gpu:killBatchProcesses', serverId, pids)
}

contextBridge.exposeInMainWorld('api', {
  gpu: gpuAPI
})
```

### 4.2 IPC Handlers

**文件:** `src/main/index.js`

```javascript
ipcMain.handle('gpu:getProcesses', async (event, serverId) => {
  return await sshManager.getGPUProcesses(serverId)
})

ipcMain.handle('gpu:killProcess', async (event, serverId, pid) => {
  return await sshManager.killGPUProcess(serverId, pid)
})

ipcMain.handle('gpu:killBatchProcesses', async (event, serverId, pids) => {
  return await sshManager.killGPUBatchProcesses(serverId, pids)
})
```

## 5. 数据结构

### 5.1 进程数据结构

```javascript
{
  pid: 12345,              // 进程 ID
  command: 'python train.py',  // 进程命令
  memoryUsed: 2500000000,   // 显存占用（字节）
  memoryFormatted: '2.34 GB',  // 格式化显存
  gpuId: 0,                 // GPU ID
  user: 'username'          // 用户名
}
```

### 5.2 API 响应结构

```javascript
// 获取进程成功
{
  success: true,
  gpuType: 'nvidia',  // 'nvidia' | 'amd' | 'intel'
  processes: [...]
}

// 获取进程失败
{
  success: false,
  error: '错误信息'
}
```

## 6. 显卡兼容性

### 6.1 NVIDIA (nvidia-smi)

**检测命令:**
```bash
nvidia-smi --version
```

**查询进程:**
```bash
nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader,nounits
```

**输出格式:**
```
12345, 2500
12346, 1800
```

**获取进程命令:**
```bash
ps -p 12345 -o command=
```

### 6.2 AMD (rocm-smi)

**检测命令:**
```bash
rocm-smi --version
```

**查询进程:**
```bash
rocm-smi --showmemuse --showpid
```

**输出格式:**
```
GPU[0]:
  PID: 12345
  Memory: 2500 MB
  Command: python
```

### 6.3 Intel (intel_gpu_top)

**检测命令:**
```bash
intel_gpu_top --help
```

**查询进程:**
```bash
intel_gpu_top -J
```

**输出格式:** JSON

### 6.4 检测策略

```javascript
const gpuDetection = [
  { type: 'nvidia', command: 'command -v nvidia-smi' },
  { type: 'amd', command: 'command -v rocm-smi' },
  { type: 'intel', command: 'command -v intel_gpu_top' }
]

// 依次尝试，第一个可用的即为当前显卡类型
```

## 7. SSH Manager 方法

**文件:** `src/main/ssh-manager.js`

### 7.1 getGPUProcesses

```javascript
/**
 * 获取 GPU 进程列表
 * @param {string} serverId - 服务器 ID
 * @returns {Promise<{success: boolean, gpuType: string, processes: array, error: string}>}
 */
async getGPUProcesses(serverId) {
  // 1. 检测显卡类型
  // 2. 执行对应命令
  // 3. 解析输出
  // 4. 获取进程命令
  // 5. 返回格式化数据
}
```

### 7.2 killGPUProcess

```javascript
/**
 * 终止单个 GPU 进程
 * @param {string} serverId - 服务器 ID
 * @param {number} pid - 进程 ID
 * @returns {Promise<{success: boolean, error: string}>}
 */
async killGPUProcess(serverId, pid) {
  // 执行 kill -9 <pid>
}
```

### 7.3 killGPUBatchProcesses

```javascript
/**
 * 批量终止 GPU 进程
 * @param {string} serverId - 服务器 ID
 * @param {number[]} pids - 进程 ID 数组
 * @returns {Promise<{success: boolean, killed: array, failed: array, error: string}>}
 */
async killGPUBatchProcesses(serverId, pids) {
  // 批量执行 kill -9
  // 返回成功和失败的列表
}
```

## 8. 组件实现要点

### 8.1 GPUProcessManager.vue

**Props:**
- `serverId: string` - 服务器 ID
- `visible: boolean` - 对话框显示状态
- `gpus: array` - 显卡信息数组

**State:**
- `loading: boolean` - 加载状态
- `processes: array` - 进程列表
- `selectedPids: array` - 选中的进程 ID
- `gpuType: string` - 检测到的显卡类型

**方法:**
- `loadProcesses()` - 加载进程列表
- `refresh()` - 刷新进程列表
- `handleKillProcess(pid)` - 处理单个进程终止
- `handleKillBatch()` - 处理批量终止
- `formatMemory(bytes)` - 格式化显存显示

### 8.2 ServerDetails.vue 修改

在 GPU 选项卡中添加按钮：

```vue
<template>
  <div class="gpu-header-actions">
    <el-button
      type="primary"
      size="small"
      :icon="Monitor"
      @click="showGPUProcessManager = true"
    >
      查看进程
    </el-button>
  </div>
</template>
```

## 9. 错误处理

| 场景 | 处理方式 |
|------|----------|
| 无显卡 | 显示友好提示"未检测到支持的显卡" |
| 无进程 | 显示空状态"当前无 GPU 进程运行" |
| 命令不存在 | 自动尝试下一种显卡类型 |
| 权限不足 | 提示需要 sudo 权限 |
| 杀进程失败 | 显示具体错误信息 |
| 网络超时 | 显示超时提示，提供重试选项 |

## 10. 安全考虑

1. **二次确认**: 杀进程前弹出确认对话框
2. **批量限制**: 限制单次最多终止 20 个进程
3. **警告提示**: 提示终止进程可能导致数据丢失
4. **权限验证**: 检查用户是否有权限操作进程

## 11. 实施计划

### Phase 1: 基础结构
- [ ] 创建 GPUProcessManager.vue 组件
- [ ] 添加 preload API
- [ ] 添加 IPC handlers

### Phase 2: SSH Manager 实现
- [ ] 实现显卡类型检测
- [ ] 实现 NVIDIA 进程查询
- [ ] 实现 AMD 进程查询
- [ ] 实现 Intel 进程查询

### Phase 3: 进程管理
- [ ] 实现单个进程终止
- [ ] 实现批量进程终止
- [ ] 添加错误处理

### Phase 4: UI 完善
- [ ] 在 ServerDetails 中集成
- [ ] 添加样式和动画
- [ ] 添加空状态提示
- [ ] 添加加载状态

### Phase 5: 测试
- [ ] 测试 NVIDIA 显卡
- [ ] 测试 AMD 显卡（如有环境）
- [ ] 测试 Intel 显卡（如有环境）
- [ ] 测试边界情况和错误处理
