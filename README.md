# VLLM 模型服务管理工具

一个基于 Electron + Vue 3 + Element Plus 开发的远程 VLLM/LMDeploy 大模型服务可视化管理工具。

## 功能特性

### 1. 服务器管理
- ✅ 添加/编辑/删除远程服务器配置
- ✅ 支持密码认证和私钥认证
- ✅ SSH 连接测试
- ✅ 服务器状态实时监控

### 2. 模型服务配置
- ✅ 支持 VLLM 和 LMDeploy 两种框架
- ✅ 支持 Conda 和 UV 虚拟环境
- ✅ 自定义启动命令和参数
- ✅ 可视化配置界面
- ✅ 自动生成启动命令

### 3. 服务控制
- ✅ 一键启动/停止模型服务
- ✅ 实时显示服务运行状态
- ✅ 服务状态监控
- ✅ 进程管理

### 4. 日志监控
- ✅ 实时查看服务运行日志
- ✅ 支持自动刷新
- ✅ 可调整显示行数
- ✅ 日志内容下载
- ✅ 暗色主题日志显示

### 5. 环境升级
- ✅ 框架版本查看
- ✅ 从 PyPI 升级
- ✅ 从 GitHub 指定分支升级
- ✅ 批量升级管理

## 技术栈

- **前端框架**: Vue 3 + Composition API
- **UI 组件库**: Element Plus
- **桌面框架**: Electron
- **状态管理**: Pinia
- **路由**: Vue Router
- **构建工具**: Electron Vite
- **SSH 连接**: ssh2

## 项目结构

```
vllm_front/
├── src/
│   ├── main/                    # 主进程
│   │   ├── index.js            # 主进程入口
│   │   └── ssh-manager.js      # SSH 连接管理
│   ├── preload/                 # 预加载脚本
│   │   └── index.js            # API 暴露
│   └── renderer/                # 渲染进程
│       └── src/
│           ├── views/          # 页面组件
│           │   ├── Layout.vue                      # 主布局
│           │   ├── servers/ServerManagement.vue    # 服务器管理
│           │   ├── services/ModelServices.vue      # 模型服务
│           │   ├── logs/LogViewer.vue             # 日志监控
│           │   ├── upgrade/FrameworkUpgrade.vue   # 环境升级
│           │   └── settings/Settings.vue           # 系统设置
│           ├── store/          # 状态管理
│           │   ├── serverStore.js        # 服务器状态
│           │   └── modelServiceStore.js  # 服务状态
│           ├── router/         # 路由配置
│           └── App.vue         # 根组件
└── package.json
```

## 开发指南

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
# 构建所有平台
npm run build

# 仅构建 Windows
npm run build:win

# 仅构建 macOS
npm run build:mac

# 仅构建 Linux
npm run build:linux
```

## 使用说明

### 1. 配置服务器

1. 进入"服务器管理"页面
2. 点击"添加服务器"按钮
3. 填写服务器信息：
   - 服务器名称
   - 服务器地址
   - SSH 端口（默认 22）
   - 用户名
   - 认证方式（密码或私钥）
4. 点击"测试连接"验证配置

### 2. 配置模型服务

1. 进入"模型服务"页面
2. 点击"添加模型服务"按钮
3. 填写服务配置：
   - 选择服务器
   - 选择框架（VLLM 或 LMDeploy）
   - 选择环境类型（Conda 或 UV）
   - 输入环境名称
   - 输入模型路径
   - 配置服务端口
   - 设置日志路径
   - 添加自定义参数（可选）
4. 系统会自动生成启动命令

### 3. 启动服务

1. 在"模型服务"页面找到要启动的服务
2. 点击"启动"按钮
3. 服务启动后状态会变为"运行中"

### 4. 查看日志

1. 进入"日志监控"页面
2. 选择要查看的服务
3. 设置显示行数
4. 可开启"自动刷新"实时监控
5. 支持下载日志文件

### 5. 升级框架

1. 进入"环境升级"页面
2. 选择要升级的服务
3. 选择升级方式：
   - PyPI 升级（推荐）：安装最新稳定版
   - GitHub 分支升级：从指定分支安装
4. 点击"开始升级"

## 数据存储

应用使用 localStorage 存储配置数据：

- `vllm_servers`: 服务器配置列表
- `vllm_services`: 模型服务配置列表
- `vllm_settings`: 系统设置

## SSH 连接说明

### 密码认证

直接输入 SSH 密码即可。

### 私钥认证

输入私钥文件的完整路径，例如：
- macOS/Linux: `/Users/username/.ssh/id_rsa`
- Windows: `C:\\Users\\username\\.ssh\\id_rsa`

## 常见问题

### Q: 连接服务器失败？
A: 请检查：
- 服务器地址和端口是否正确
- 用户名和密码/私钥是否正确
- 服务器是否开启 SSH 服务
- 网络连接是否正常

### Q: 服务启动失败？
A: 请检查：
- 环境名称是否正确
- 模型路径是否存在
- 端口是否被占用
- 启动命令是否正确

### Q: 无法查看日志？
A: 请检查：
- 日志路径是否正确
- 服务是否已启动
- 是否有读取权限

## 后续开发计划

- [ ] 支持批量服务管理
- [ ] 服务性能监控
- [ ] 日志搜索和过滤
- [ ] 配置导入导出
- [ ] 多语言支持
- [ ] 主题切换
- [ ] 自动更新检查

## License

MIT

## 作者

Haijun

## 反馈与贡献

欢迎提交 Issue 和 Pull Request！
