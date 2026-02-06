# 视频片段索引系统 - 实现任务列表

## Phase 1: 数据层

### Task 1.1: 添加 videos 和 video_clips 表 schema
- [ ] 在 `apps/api/src/db/schema.ts` 添加 `videos` 表
- [ ] 在 `apps/api/src/db/schema.ts` 添加 `video_clips` 表
- [ ] 添加 `videosRelations` 和 `videoClipsRelations`
- [ ] 更新 `projectsRelations` 包含 videos
- [ ] 更新 `userRelations` 包含 videos

### Task 1.2: 同步数据库
- [ ] 运行 `pnpm db:push` 同步 schema 到数据库

---

## Phase 2: Shared Schemas

### Task 2.1: 创建视频相关 Schema
- [ ] 创建 `packages/shared/src/schemas/video.ts`
- [ ] 定义 `videoAnalysisStatusSchema`
- [ ] 定义 `videoClipSchema`
- [ ] 定义 `videoResponseSchema`
- [ ] 定义 `createVideoSchema`
- [ ] 定义 `getProjectVideosSchema`
- [ ] 定义 `analyzeVideoSchema`
- [ ] 定义 `searchClipsSchema`
- [ ] 定义 `matchedClipSchema` 和 `searchClipsResponseSchema`
- [ ] 定义 `DEFAULT_VIDEO_ANALYSIS_PROMPT`

### Task 2.2: 导出 Schema
- [ ] 在 `packages/shared/src/index.ts` 导出所有视频相关 schema

---

## Phase 3: API 路由 - 基础 CRUD

### Task 3.1: 创建路由目录结构
- [ ] 创建 `apps/api/src/routes/videos/` 目录
- [ ] 创建 `apps/api/src/routes/videos/index.ts` 路由组合文件

### Task 3.2: 实现 POST /api/videos - 创建视频记录
- [ ] 创建 `apps/api/src/routes/videos/create.ts`
- [ ] 验证用户 session
- [ ] 验证项目所有权
- [ ] 创建 video 记录 (status = 'pending')
- [ ] 返回 videoId

### Task 3.3: 实现 GET /api/videos - 获取项目视频列表
- [ ] 创建 `apps/api/src/routes/videos/list.ts`
- [ ] 支持 projectId 查询参数
- [ ] 支持 includeClips 参数（默认 true）
- [ ] 支持 analysisStatus 过滤

### Task 3.4: 实现 GET /api/videos/:id/status - 获取分析状态
- [ ] 创建 `apps/api/src/routes/videos/status.ts`
- [ ] 返回 analysisStatus, analysisError, clipCount

### Task 3.5: 挂载路由
- [ ] 在 `apps/api/src/index.ts` 挂载 `/api/videos` 路由

---

## Phase 4: 分析服务

### Task 4.1: 实现 XML 解析器
- [ ] 创建 `apps/api/src/lib/clip-parser.ts`
- [ ] 实现 `parseClipTags()` 函数
- [ ] 实现 `timeStrToSeconds()` 辅助函数
- [ ] 添加单元测试

### Task 4.2: 实现 Gemini 视频分析服务
- [ ] 创建 `apps/api/src/services/gemini-video.service.ts`
- [ ] 实现 `analyzeVideoWithGemini()` 函数
- [ ] 处理视频下载
- [ ] 处理大小检查（>20MB 报错，后续实现压缩）

### Task 4.3: 实现异步分析任务
- [ ] 创建 `apps/api/src/services/video-analysis.service.ts`
- [ ] 实现 `triggerVideoAnalysis()` 入口函数
- [ ] 实现 `analyzeVideoBackground()` 后台任务
- [ ] 状态更新：pending → analyzing → done/failed
- [ ] 解析结果写入 video_clips 表

### Task 4.4: 集成分析触发到创建流程
- [ ] 修改 `POST /api/videos` 在创建后触发分析

### Task 4.5: 实现 POST /api/videos/:id/analyze - 手动触发分析
- [ ] 创建 `apps/api/src/routes/videos/analyze.ts`
- [ ] 支持自定义 analysisRequest
- [ ] 验证视频所有权

---

## Phase 5: 搜索功能

### Task 5.1: 实现片段搜索服务
- [ ] 创建 `apps/api/src/services/clip-search.service.ts`
- [ ] 实现 `searchClips()` 函数
- [ ] 聚合项目所有 clips
- [ ] 调用 Gemini 做智能匹配
- [ ] 解析匹配结果

### Task 5.2: 实现 POST /api/videos/search - 搜索 API
- [ ] 创建 `apps/api/src/routes/videos/search.ts`
- [ ] 支持 query, videoIds, clipTypes, maxDuration 参数
- [ ] 返回 reasoning + matchedClips

---

## Phase 6: Agent 集成

### Task 6.1: 定义 Video Tools
- [ ] 创建 `apps/api/src/agent/tools/video-tools.ts`
- [ ] 实现 `get_project_videos` tool
- [ ] 实现 `search_video_clips` tool
- [ ] 实现 `analyze_video` tool

### Task 6.2: 注册 Tools 到 Agent
- [ ] 修改 `apps/api/src/routes/agent.ts`
- [ ] 注册 video tools 到 Claude Agent SDK

### Task 6.3: 测试 Agent 对话流程
- [ ] 测试 "获取视频列表" 场景
- [ ] 测试 "搜索片段" 场景
- [ ] 测试 "触发分析" 场景

---

## Phase 7: 前端集成

### Task 7.1: 扩展节点 Meta 类型
- [ ] 在 `apps/web/src/lib/image-assets.ts` 添加 `VideoMeta` 接口

### Task 7.2: 修改上传流程
- [ ] 修改 `apps/web/src/stores/upload-slice.ts`
- [ ] 视频上传完成后调用 `POST /api/videos`
- [ ] 将返回的 videoId 存入节点 meta

### Task 7.3: [可选] 添加分析状态轮询
- [ ] 创建 `apps/web/src/hooks/use-video-analysis-status.ts`
- [ ] 分析中状态每 3 秒轮询
- [ ] 完成后停止轮询

### Task 7.4: [可选] 添加分析状态 UI 指示
- [ ] 在视频节点上显示分析状态图标
- [ ] pending: 等待中
- [ ] analyzing: 分析中（loading）
- [ ] done: 完成（✓）
- [ ] failed: 失败（重试按钮）

---

## 验收标准

### 功能验收
- [ ] 视频拖入画布后自动上传并触发分析
- [ ] 分析完成后 clips 数据存入数据库
- [ ] Agent 可通过 tool 获取视频列表和片段
- [ ] Agent 可通过 tool 搜索匹配的片段
- [ ] 搜索结果包含匹配分数和理由

### 质量验收
- [ ] 所有 API 有正确的错误处理
- [ ] 分析失败时记录错误信息
- [ ] 前端节点正确关联 videoId
- [ ] 代码通过 lint 检查
- [ ] 关键函数有单元测试
