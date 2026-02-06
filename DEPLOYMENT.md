# 美股智能分析系统 - 部署说明

## 项目概述

这是一个基于React + TypeScript + Express的全栈美股分析系统，支持实时股票数据查询、技术指标分析和条件选股功能。

## 技术栈

- **前端**: React 19 + TypeScript + Vite + TailwindCSS
- **后端**: Express + tRPC
- **数据库**: MySQL (使用Drizzle ORM)
- **图表**: Lightweight Charts (TradingView)
- **数据源**: Yahoo Finance API
- **认证**: Manus OAuth
- **部署**: Manus Runtime (vite-plugin-manus-runtime)

## 功能特性

### 已实现功能

1. **市场概览**
   - 实时显示道琼斯、标普500、纳斯达克指数
   - 比特币和黄金价格追踪

2. **股票池扩展**
   - 支持239只美股（从用户上传文件解析）
   - 包括：QQQ, SPY, TSLA, NVDA, RGTI, PLTR等热门股票
   - 支持股票搜索和详情查看

3. **技术分析**
   - K线图表（支持多时间周期：1m, 5m, 15m, 30m, 1h, 1d, 1w, 1mo）
   - CD抄底指标 (MACD)
   - 买卖力道分析
   - 黄蓝梯子指标
   - NX指标信号

4. **用户功能**
   - 自选股收藏
   - 条件选股筛选

## 部署到Manus.space

### 方法一：通过Manus平台部署（推荐）

1. 在Manus对话界面中输入：
   ```
   请部署GitHub仓库 JohnnyTenkyo/meigu2.0 到manus.space
   ```

2. Manus会自动：
   - 克隆仓库
   - 安装依赖
   - 配置数据库
   - 构建项目
   - 部署到manus.space
   - 生成访问URL（格式：https://xxx.manus.space）

### 方法二：本地构建后部署

1. **安装依赖**
   ```bash
   pnpm install
   ```

2. **构建项目**
   ```bash
   pnpm run build
   ```

3. **启动生产服务器**
   ```bash
   pnpm run start
   ```

## 环境变量配置

创建 `.env` 文件并配置以下变量：

```env
# 数据库配置（Manus会自动提供）
DATABASE_URL=mysql://user:password@host:port/database

# 服务器配置
PORT=3000
NODE_ENV=production

# Session密钥
SESSION_SECRET=your-secret-key

# Manus OAuth（部署时自动配置）
MANUS_OAUTH_CLIENT_ID=
MANUS_OAUTH_CLIENT_SECRET=
MANUS_OAUTH_REDIRECT_URI=
```

## 数据库Schema

项目使用Drizzle ORM，schema定义在 `drizzle/schema.ts`。

当前包含：
- `users` 表：用户认证和信息

运行数据库迁移：
```bash
pnpm run db:push
```

## 开发模式

启动开发服务器：
```bash
pnpm run dev
```

访问：http://localhost:3000

## 项目结构

```
meigu2.0/
├── client/              # 前端代码
│   ├── src/
│   │   ├── components/  # React组件
│   │   ├── contexts/    # Context providers
│   │   ├── lib/         # 工具函数和API
│   │   └── pages/       # 页面组件
├── server/              # 后端代码
│   ├── _core/           # 核心服务
│   └── routers.ts       # tRPC路由
├── drizzle/             # 数据库schema
├── shared/              # 共享类型定义
└── dist/                # 构建输出
```

## 最新更新

### 2026-02-06
- ✅ 扩展股票池至239只美股
- ✅ 集成Yahoo Finance API
- ✅ 优化搜索功能
- ✅ 完善技术指标显示
- ✅ 准备部署配置

## 访问地址

部署完成后，网站将可通过以下地址访问：
- **Manus域名**: https://[app-id].manus.space
- **自定义域名**: 可在部署后配置

## 支持

如有问题，请查看：
- [Manus文档](https://manus.im/docs)
- [项目Issues](https://github.com/JohnnyTenkyo/meigu2.0/issues)
