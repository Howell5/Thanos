# 视频片段索引系统 - 实现设计

## 概述

本文档描述视频片段索引功能的具体实现方案。用户拖入视频后，系统自动上传并触发异步分析，分析结果存入数据库。Agent 可通过 Tool 查询和检索片段。

---

## 1. 数据库 Schema

### 1.1 视频表 (videos)

```ts
// apps/api/src/db/schema.ts

/**
 * Videos table
 * Stores video assets uploaded to projects with analysis status
 */
export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Storage info
  r2Key: text("r2_key").notNull().unique(),
  r2Url: text("r2_url").notNull(),
  originalFileName: text("original_file_name"),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull().default("video/mp4"),
  // Video metadata
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"), // in seconds
  // Analysis status
  analysisStatus: text("analysis_status").notNull().default("pending"),
  // 'pending' | 'analyzing' | 'done' | 'failed'
  analysisRequest: text("analysis_request"), // prompt used for analysis
  analysisError: text("analysis_error"),
  analyzedAt: timestamp("analyzed_at", { mode: "date", withTimezone: true }),
  // Timestamps
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
```

### 1.2 视频片段表 (video_clips)

```ts
/**
 * Video clips table
 * Stores analyzed clip segments from videos
 */
export const videoClips = pgTable("video_clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  // Time range
  timeRange: text("time_range").notNull(), // "00:05-00:08"
  startTime: integer("start_time").notNull(), // in seconds
  endTime: integer("end_time").notNull(), // in seconds
  // Clip classification
  clipType: text("clip_type").notNull(), // "hook", "品牌露出", "产品展示", etc.
  // Analysis content
  description: text("description").notNull(),
  reason: text("reason").notNull(),
  // Timestamps
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
```

### 1.3 Relations

```ts
export const videosRelations = relations(videos, ({ one, many }) => ({
  project: one(projects, {
    fields: [videos.projectId],
    references: [projects.id],
  }),
  user: one(user, {
    fields: [videos.userId],
    references: [user.id],
  }),
  clips: many(videoClips),
}));

export const videoClipsRelations = relations(videoClips, ({ one }) => ({
  video: one(videos, {
    fields: [videoClips.videoId],
    references: [videos.id],
  }),
}));

// Update projectsRelations to include videos
export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  images: many(aiImages),
  videos: many(videos), // Add this
}));
```

---

## 2. Shared Schemas

### 2.1 视频相关 Schema

```ts
// packages/shared/src/schemas/video.ts

import { z } from "zod";

/**
 * Video analysis status
 */
export const videoAnalysisStatusSchema = z.enum([
  "pending",
  "analyzing",
  "done",
  "failed",
]);

export type VideoAnalysisStatus = z.infer<typeof videoAnalysisStatusSchema>;

/**
 * Video clip data (from Gemini analysis)
 */
export const videoClipSchema = z.object({
  id: z.string().uuid(),
  videoId: z.string().uuid(),
  timeRange: z.string(), // "00:05-00:08"
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  clipType: z.string(),
  description: z.string(),
  reason: z.string(),
  createdAt: z.string(),
});

export type VideoClip = z.infer<typeof videoClipSchema>;

/**
 * Video response type (for frontend display)
 */
export const videoResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  r2Url: z.string().url(),
  originalFileName: z.string().nullable(),
  fileSize: z.number().int(),
  mimeType: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  duration: z.number().int().nullable(),
  analysisStatus: videoAnalysisStatusSchema,
  analysisError: z.string().nullable(),
  clips: z.array(videoClipSchema),
  createdAt: z.string(),
});

export type VideoResponse = z.infer<typeof videoResponseSchema>;

/**
 * Schema for creating a video record after upload
 */
export const createVideoSchema = z.object({
  projectId: z.string().uuid(),
  r2Key: z.string().min(1),
  r2Url: z.string().url(),
  originalFileName: z.string().optional(),
  fileSize: z.number().int().positive(),
  mimeType: z.enum(["video/mp4", "video/webm"]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
});

export type CreateVideo = z.infer<typeof createVideoSchema>;

/**
 * Schema for getting project videos
 */
export const getProjectVideosSchema = z.object({
  projectId: z.string().uuid(),
  includeClips: z.coerce.boolean().default(true),
  analysisStatus: videoAnalysisStatusSchema.optional(),
});

export type GetProjectVideos = z.infer<typeof getProjectVideosSchema>;

/**
 * Schema for manual video analysis trigger
 */
export const analyzeVideoSchema = z.object({
  videoId: z.string().uuid(),
  analysisRequest: z.string().min(1).max(2000).optional(),
});

export type AnalyzeVideo = z.infer<typeof analyzeVideoSchema>;

/**
 * Schema for clip search (Agent Tool)
 */
export const searchClipsSchema = z.object({
  projectId: z.string().uuid(),
  query: z.string().min(1).max(1000),
  // Optional filters
  videoIds: z.array(z.string().uuid()).optional(),
  clipTypes: z.array(z.string()).optional(),
  maxDuration: z.number().int().positive().optional(),
});

export type SearchClips = z.infer<typeof searchClipsSchema>;

/**
 * Matched clip result (from LLM search)
 */
export const matchedClipSchema = z.object({
  clipId: z.string().uuid(),
  videoId: z.string().uuid(),
  videoFileName: z.string().nullable(),
  videoUrl: z.string().url(),
  timeRange: z.string(),
  startTime: z.number().int(),
  endTime: z.number().int(),
  clipType: z.string(),
  description: z.string(),
  matchScore: z.number().min(1).max(10),
  matchReason: z.string(),
});

export type MatchedClip = z.infer<typeof matchedClipSchema>;

/**
 * Search clips response
 */
export const searchClipsResponseSchema = z.object({
  reasoning: z.string(),
  matchedClips: z.array(matchedClipSchema),
});

export type SearchClipsResponse = z.infer<typeof searchClipsResponseSchema>;

/**
 * Default analysis prompt for video indexing
 */
export const DEFAULT_VIDEO_ANALYSIS_PROMPT = `
请详细分析这个视频，识别所有有剪辑价值的片段。按以下维度标记：

1. **hook** - 适合作为短视频开场的片段（视觉冲击、悬念、吸引注意力）
2. **产品展示** - 产品全貌或特写镜头
3. **品牌露出** - Logo、品牌名称清晰可见的片段
4. **拆箱/开箱** - 拆封、打开包装的动作
5. **使用演示** - 产品使用过程展示
6. **情绪高点** - 惊喜、满意、兴奋等情绪表达
7. **转场素材** - 适合用作转场的镜头
8. **其他亮点** - 任何有剪辑价值的片段

请尽可能详细地描述每个片段的内容和特征。
`.trim();
```

---

## 3. API 设计

### 3.1 路由结构

```
apps/api/src/routes/
└── videos/
    ├── index.ts      # 路由组合
    ├── create.ts     # POST /videos - 创建视频记录
    ├── list.ts       # GET /videos - 获取项目视频列表
    ├── status.ts     # GET /videos/:id/status - 获取分析状态
    ├── analyze.ts    # POST /videos/:id/analyze - 手动触发分析
    └── search.ts     # POST /videos/search - 搜索片段 (Agent Tool)
```

### 3.2 API 端点

#### POST /api/videos - 创建视频记录

上传完成后调用，创建记录并触发异步分析。

```ts
// Request
{
  projectId: string,
  r2Key: string,
  r2Url: string,
  originalFileName?: string,
  fileSize: number,
  mimeType: "video/mp4" | "video/webm",
  width?: number,
  height?: number,
  duration?: number
}

// Response
{
  success: true,
  data: {
    id: string,           // videoId - 存入前端节点 meta
    analysisStatus: "pending"
  }
}
```

**实现逻辑**：
1. 验证用户权限和项目所有权
2. 创建 video 记录 (status = 'pending')
3. 触发异步分析任务（见 3.3）
4. 返回 videoId

#### GET /api/videos - 获取项目视频列表

```ts
// Query params
{
  projectId: string,
  includeClips?: boolean,  // default: true
  analysisStatus?: "pending" | "analyzing" | "done" | "failed"
}

// Response
{
  success: true,
  data: {
    videos: VideoResponse[]
  }
}
```

#### GET /api/videos/:id/status - 获取单个视频分析状态

用于前端轮询。

```ts
// Response
{
  success: true,
  data: {
    id: string,
    analysisStatus: "pending" | "analyzing" | "done" | "failed",
    analysisError?: string,
    clipCount: number
  }
}
```

#### POST /api/videos/:id/analyze - 手动触发/重新分析

用于自定义分析维度。

```ts
// Request
{
  analysisRequest?: string  // 自定义分析 prompt，不传则用默认
}

// Response
{
  success: true,
  data: {
    message: "Analysis started"
  }
}
```

#### POST /api/videos/search - 搜索片段 (Agent Tool)

```ts
// Request
{
  projectId: string,
  query: string,          // 用户意图，如 "找适合做开场的片段"
  videoIds?: string[],    // 可选：限定特定视频
  clipTypes?: string[],   // 可选：限定片段类型
  maxDuration?: number    // 可选：限制片段时长
}

// Response
{
  success: true,
  data: {
    reasoning: string,    // LLM 的匹配逻辑说明
    matchedClips: [
      {
        clipId: string,
        videoId: string,
        videoFileName: string,
        videoUrl: string,
        timeRange: "00:05-00:08",
        startTime: 5,
        endTime: 8,
        clipType: "hook",
        description: "...",
        matchScore: 9,
        matchReason: "..."
      }
    ]
  }
}
```

---

## 4. 异步分析任务

### 4.1 架构选择

对于 MVP，使用 **简单的后台 Promise + 状态轮询**：

```ts
// apps/api/src/services/video-analysis.service.ts

export async function triggerVideoAnalysis(videoId: string): Promise<void> {
  // 不 await，立即返回让请求完成
  analyzeVideoBackground(videoId).catch((err) => {
    console.error(`[VideoAnalysis] Failed for ${videoId}:`, err);
  });
}

async function analyzeVideoBackground(videoId: string): Promise<void> {
  // 1. 更新状态为 analyzing
  await db.update(videos)
    .set({ analysisStatus: "analyzing", updatedAt: new Date() })
    .where(eq(videos.id, videoId));

  try {
    // 2. 获取视频信息
    const video = await db.query.videos.findFirst({
      where: eq(videos.id, videoId),
    });
    if (!video) throw new Error("Video not found");

    // 3. 调用 Gemini 分析
    const analysisResult = await analyzeVideoWithGemini(
      video.r2Url,
      video.analysisRequest || DEFAULT_VIDEO_ANALYSIS_PROMPT
    );

    // 4. 解析 <clip> XML 标签
    const clips = parseClipTags(analysisResult, videoId);

    // 5. 删除旧的 clips，插入新的
    await db.transaction(async (tx) => {
      await tx.delete(videoClips).where(eq(videoClips.videoId, videoId));
      if (clips.length > 0) {
        await tx.insert(videoClips).values(clips);
      }
      await tx.update(videos)
        .set({
          analysisStatus: "done",
          analyzedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(videos.id, videoId));
    });

  } catch (error) {
    // 6. 记录失败
    await db.update(videos)
      .set({
        analysisStatus: "failed",
        analysisError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId));
  }
}
```

### 4.2 未来扩展

生产环境可升级为：
- **BullMQ + Redis**：任务队列，支持重试、并发控制
- **Temporal**：工作流引擎，适合复杂流程
- **Cloudflare Workers**：边缘计算，低延迟

---

## 5. Gemini 分析实现

### 5.1 分析函数

```ts
// apps/api/src/services/gemini-video.service.ts

const VIDEO_ANALYSIS_PROMPT_TEMPLATE = `
请详细分析这个视频的内容，识别并标记所有符合用户需求的片段。

## 用户需求
{user_request}

## 输出格式

对于每个符合条件的片段，使用以下 XML 格式输出：

<clip time="MM:SS-MM:SS" type="片段类型">
  <description>详细描述该片段的内容</description>
  <reason>解释为什么这个片段符合用户需求</reason>
</clip>

## 规则
1. time：时间格式为 MM:SS-MM:SS（如 00:05-00:08）
2. type：使用简短关键词（如：hook、品牌露出、产品展示）
3. 只标记明确符合需求的片段
4. description 和 reason 都要详细具体

现在请分析视频并输出符合条件的片段。
`;

export async function analyzeVideoWithGemini(
  videoUrl: string,
  userRequest: string
): Promise<string> {
  // 1. 下载视频
  const response = await fetch(videoUrl);
  const videoBuffer = await response.arrayBuffer();

  // 2. 检查大小，超过 20MB 需要压缩
  const sizeMB = videoBuffer.byteLength / 1024 / 1024;
  let processedBuffer = videoBuffer;
  if (sizeMB > 20) {
    // TODO: 实现视频压缩（使用 ffmpeg-wasm 或外部服务）
    throw new Error("Video too large for analysis. Max 20MB supported.");
  }

  // 3. 构建 prompt
  const prompt = VIDEO_ANALYSIS_PROMPT_TEMPLATE.replace(
    "{user_request}",
    userRequest
  );

  // 4. 调用 Gemini
  const geminiResponse = await geminiClient.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        inlineData: {
          mimeType: "video/mp4",
          data: Buffer.from(processedBuffer).toString("base64")
        }
      },
      { text: prompt },
    ],
  });

  return geminiResponse.text();
}
```

### 5.2 XML 解析函数

```ts
// apps/api/src/lib/clip-parser.ts

interface ClipData {
  videoId: string;
  timeRange: string;
  startTime: number;
  endTime: number;
  clipType: string;
  description: string;
  reason: string;
}

export function parseClipTags(analysisText: string, videoId: string): ClipData[] {
  const clipPattern = /<clip\s+time="([^"]+)"\s+type="([^"]+)">([\s\S]*?)<\/clip>/g;
  const descPattern = /<description>([\s\S]*?)<\/description>/;
  const reasonPattern = /<reason>([\s\S]*?)<\/reason>/;

  const clips: ClipData[] = [];

  let match: RegExpExecArray | null;
  while ((match = clipPattern.exec(analysisText)) !== null) {
    const [, timeRange, clipType, innerContent] = match;
    const [startStr, endStr] = timeRange.split("-");

    const startTime = timeStrToSeconds(startStr.trim());
    const endTime = timeStrToSeconds(endStr.trim());

    const descMatch = descPattern.exec(innerContent);
    const reasonMatch = reasonPattern.exec(innerContent);

    clips.push({
      videoId,
      timeRange: timeRange.trim(),
      startTime,
      endTime,
      clipType: clipType.trim(),
      description: descMatch ? descMatch[1].trim() : "",
      reason: reasonMatch ? reasonMatch[1].trim() : "",
    });
  }

  return clips;
}

function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  throw new Error(`Invalid time format: ${timeStr}`);
}
```

---

## 6. Agent Tool 集成

### 6.1 Tool 定义

在 Claude Agent SDK 中注册自定义 tools：

```ts
// apps/api/src/agent/tools/video-tools.ts

export const videoTools = {
  // Tool 1: 获取项目视频列表
  get_project_videos: {
    description: "获取当前项目的所有视频素材及其分析状态和片段信息",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "项目 ID" },
      },
      required: ["projectId"],
    },
    handler: async ({ projectId }: { projectId: string }) => {
      const videoList = await db.query.videos.findMany({
        where: eq(videos.projectId, projectId),
        with: { clips: true },
      });
      return { videos: videoList };
    },
  },

  // Tool 2: 搜索片段
  search_video_clips: {
    description: "根据用户意图搜索匹配的视频片段",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "项目 ID" },
        query: { type: "string", description: "搜索意图，如'找适合做开场的片段'" },
        videoIds: { type: "array", items: { type: "string" }, description: "可选：限定特定视频" },
      },
      required: ["projectId", "query"],
    },
    handler: async (params: SearchClips) => {
      return await searchClips(params);
    },
  },

  // Tool 3: 触发视频分析
  analyze_video: {
    description: "触发对指定视频的分析（如果尚未分析或需要重新分析）",
    parameters: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "视频 ID" },
        analysisRequest: { type: "string", description: "可选：自定义分析维度" },
      },
      required: ["videoId"],
    },
    handler: async ({ videoId, analysisRequest }: AnalyzeVideo) => {
      await triggerVideoAnalysis(videoId, analysisRequest);
      return { message: "Analysis started", videoId };
    },
  },
};
```

---

## 7. 前端集成

### 7.1 上传流程修改

```ts
// apps/web/src/stores/upload-slice.ts (修改)

// 视频上传完成后，额外调用 /api/videos 创建记录
async function onVideoUploadComplete(
  projectId: string,
  r2Key: string,
  r2Url: string,
  file: File,
  dimensions: { width: number; height: number }
): Promise<string> {
  const response = await api.api.videos.$post({
    json: {
      projectId,
      r2Key,
      r2Url,
      originalFileName: file.name,
      fileSize: file.size,
      mimeType: file.type as "video/mp4" | "video/webm",
      width: dimensions.width,
      height: dimensions.height,
    },
  });

  const json = await response.json();
  if (!json.success) throw new Error(json.error.message);

  return json.data.id; // videoId
}
```

### 7.2 节点 Meta 扩展

```ts
// apps/web/src/lib/image-assets.ts (扩展)

export interface VideoMeta {
  source: "video";
  videoId: string;           // 关联数据库记录
  analysisStatus?: "pending" | "analyzing" | "done" | "failed";
  originalFileName?: string;
  duration?: number;
  // Index signature for JsonObject compatibility
  [key: string]: string | number | boolean | undefined;
}
```

### 7.3 分析状态轮询（可选）

```ts
// apps/web/src/hooks/use-video-analysis-status.ts

export function useVideoAnalysisStatus(videoId: string | null) {
  return useQuery({
    queryKey: ["video-status", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      const res = await api.api.videos[":id"].status.$get({
        param: { id: videoId },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error.message);
      return json.data;
    },
    enabled: !!videoId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // 分析中时每 3 秒轮询，完成后停止
      if (data?.analysisStatus === "analyzing" || data?.analysisStatus === "pending") {
        return 3000;
      }
      return false;
    },
  });
}
```

---

## 8. 实现顺序

### Phase 1: 数据层
1. [ ] 添加 `videos` 和 `video_clips` 表 schema
2. [ ] 添加 relations
3. [ ] 运行 `pnpm db:push`

### Phase 2: Shared Schemas
4. [ ] 创建 `packages/shared/src/schemas/video.ts`
5. [ ] 导出到 `packages/shared/src/index.ts`

### Phase 3: API 路由
6. [ ] 创建 `POST /api/videos` - 创建记录
7. [ ] 创建 `GET /api/videos` - 列表查询
8. [ ] 创建 `GET /api/videos/:id/status` - 状态查询

### Phase 4: 分析服务
9. [ ] 实现 `video-analysis.service.ts` - 异步分析
10. [ ] 实现 `gemini-video.service.ts` - Gemini 调用
11. [ ] 实现 `clip-parser.ts` - XML 解析

### Phase 5: 搜索功能
12. [ ] 创建 `POST /api/videos/search` - 片段搜索
13. [ ] 集成 Gemini 智能匹配

### Phase 6: Agent 集成
14. [ ] 注册 video tools 到 Agent
15. [ ] 测试 Agent 对话流程

### Phase 7: 前端集成
16. [ ] 修改上传流程，视频上传后调用 /api/videos
17. [ ] 扩展节点 meta 存储 videoId
18. [ ] [可选] 添加分析状态 UI 指示

---

## 9. 注意事项

### 9.1 视频大小限制
- Gemini Flash 限制：20MB
- 超过需要压缩（后续实现）
- 当前上传限制：50MB（见 `MAX_VIDEO_UPLOAD_SIZE`）

### 9.2 分析耗时
- 预计 10-30 秒/视频
- 使用异步 + 状态轮询，不阻塞用户

### 9.3 错误处理
- 分析失败时记录 `analysisError`
- 前端可显示失败状态，允许重试

### 9.4 并发控制
- MVP 不限制并发
- 生产环境应使用任务队列控制并发数
