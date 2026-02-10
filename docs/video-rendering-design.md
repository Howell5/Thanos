# AI 视频剪辑渲染系统 — 设计文档

## 一、定位

将 AI Agent 产出的结构化剪辑方案，自动渲染为可发布的营销短视频。

**核心链路**：

```
素材上传 → Gemini 分析(已有) → Agent 生成剪辑方案 → Remotion 渲染 → 成片下载
                                      ↑
                              口播文案 + BGM 选择
```

---

## 二、完整数据流

### 阶段一：素材准备（已完成）

用户上传视频 → R2 存储 → Gemini 分析 → `videoClips` 表存储结构化片段。

每个 clip 包含：`timeRange, content, subjects, actions, scene, shotType, camera, audio, textOnScreen, mood`。

### 阶段二：AI 生成剪辑方案（新增）

Agent 通过 MCP 工具 `search_video_clips` 检索素材，结合用户需求（品牌、时长、风格），输出一份 **EditingPlan JSON**。

关键变化：**剪辑方案不仅包含片段选择和排序，还包含口播文案**。Agent 在理解品牌卖点和素材内容后，同步生成每个片段对应的口播脚本。

```
用户输入：
  "帮我做一个30秒的千岛营销视频，突出拍照查价和新人优惠"

Agent 分析：
  1. search_video_clips 找到相关素材片段
  2. 规划视频结构（开场-功能展示-促销-CTA）
  3. 为每个片段撰写口播文案
  4. 输出 EditingPlan JSON
```

### 阶段三：用户确认与调整

Agent 将 EditingPlan 以可视化卡片形式展示在画布上，用户可以：
- 预览每个片段的视频缩略图
- 阅读和修改口播文案
- 调整片段顺序（拖拽）
- 替换/删除片段
- 选择 BGM

确认后进入渲染。

### 阶段四：Remotion 渲染

EditingPlan JSON → Remotion Composition → FFmpeg 渲染 → MP4 上传 R2 → 返回下载链接。

---

## 三、核心 Schema 定义

### 3.1 EditingPlan（剪辑方案）

这是整个系统的核心数据结构，连接 Agent 输出和 Remotion 输入。

```typescript
// packages/shared/src/schemas/editing-plan.ts

/** 单个片段 */
const editingSegmentSchema = z.object({
  /** 引用的 videoClip ID */
  clipId: z.string().uuid(),
  /** 来源视频 ID */
  videoId: z.string().uuid(),
  /** 视频 R2 URL */
  videoUrl: z.string().url(),
  /** 裁剪起始时间（秒），相对于原视频 */
  startTime: z.number().nonnegative(),
  /** 裁剪结束时间（秒），相对于原视频 */
  endTime: z.number().nonnegative(),
  /** 片段在成片中的用途 */
  purpose: z.string(),
  /** 该片段对应的口播文案（TTS 朗读内容） */
  voiceover: z.string().nullable(),
  /** 画面叠加文字（字幕/标题） */
  textOverlay: z.string().nullable(),
  /** 文字叠加位置 */
  textPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
  /** 转场效果（到下一个片段的过渡） */
  transition: z.enum(["cut", "fade", "dissolve"]).default("cut"),
});

type EditingSegment = z.infer<typeof editingSegmentSchema>;

/** 音频配置 */
const audioConfigSchema = z.object({
  /** BGM 资源 URL（R2 存储） */
  bgmUrl: z.string().url().nullable(),
  /** BGM 音量 0-1 */
  bgmVolume: z.number().min(0).max(1).default(0.2),
  /** 是否静音所有素材原声 */
  muteOriginalAudio: z.boolean().default(true),
  /** 口播音色 ID（TTS 服务的 voice ID） */
  voiceId: z.string().nullable(),
  /** 口播语速倍率 */
  voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
});

type AudioConfig = z.infer<typeof audioConfigSchema>;

/** 完整剪辑方案 */
const editingPlanSchema = z.object({
  /** 方案 ID */
  id: z.string().uuid(),
  /** 所属项目 */
  projectId: z.string().uuid(),
  /** 视频标题 */
  title: z.string(),
  /** 目标时长（秒） */
  targetDuration: z.number().positive(),
  /** 目标宽高比 */
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  /** 分辨率 */
  resolution: z.enum(["720p", "1080p"]).default("1080p"),
  /** 帧率 */
  fps: z.number().int().default(30),
  /** 有序片段列表（顺序即播放顺序） */
  segments: z.array(editingSegmentSchema).min(1),
  /** 音频配置 */
  audio: audioConfigSchema,
  /** Agent 的创作说明（给用户看的） */
  reasoning: z.string(),
  /** 渲染状态 */
  status: z.enum(["draft", "confirmed", "rendering", "done", "failed"]),
  /** 渲染后的成片 URL */
  outputUrl: z.string().url().nullable(),
  /** 渲染错误 */
  renderError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type EditingPlan = z.infer<typeof editingPlanSchema>;
```

### 3.2 数据库表

```typescript
// apps/api/src/db/schema.ts（新增）

export const editingPlans = pgTable("editing_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  userId: text("user_id").references(() => user.id).notNull(),
  title: text("title").notNull(),
  targetDuration: integer("target_duration").notNull(),
  aspectRatio: text("aspect_ratio").notNull().default("9:16"),
  resolution: text("resolution").notNull().default("1080p"),
  fps: integer("fps").notNull().default(30),
  /** 完整 segments JSON */
  segments: json("segments").notNull(),
  /** 音频配置 JSON */
  audioConfig: json("audio_config").notNull(),
  reasoning: text("reasoning"),
  status: text("status").notNull().default("draft"),
  outputR2Key: text("output_r2_key"),
  outputUrl: text("output_url"),
  renderError: text("render_error"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
```

### 3.3 口播文案生成

口播文案是 EditingPlan 的一部分，由 Agent 在生成剪辑方案时同步产出。不需要单独的 schema，它就是每个 segment 的 `voiceover` 字段。

**Agent 生成逻辑**（在 system prompt 中引导）：

```
你是一个短视频剪辑师。根据用户的营销需求和可用素材片段，生成完整的剪辑方案。

方案必须包含：
1. 片段选择和排序
2. 每个片段的口播文案（简短、有节奏感、适合 TTS 朗读）
3. 画面叠加文字（关键信息强化）

口播文案要求：
- 语句简短，每个片段 1-2 句
- 总字数控制在目标时长 × 4 字/秒以内
- 节奏感强，适合短视频平台
- 与画面内容呼应但不重复画面描述
```

---

## 四、音频处理架构

### 4.1 三层音频模型

```
┌─────────────────────────────────────────────────┐
│ Layer 3: BGM（背景音乐）                          │
│   持续整个视频，音量较低(0.1-0.3)                  │
│   来源：预设音乐库 or 用户上传                     │
├─────────────────────────────────────────────────┤
│ Layer 2: 口播（TTS 合成语音）                      │
│   按片段分段，每段对应 segment.voiceover           │
│   来源：TTS 服务合成                               │
│   音量：1.0（主音频）                              │
├─────────────────────────────────────────────────┤
│ Layer 1: 素材原声                                  │
│   默认全部静音（muteOriginalAudio: true）          │
│   营销视频场景下几乎不需要原声                     │
└─────────────────────────────────────────────────┘
```

### 4.2 TTS 口播合成

**方案选择**：使用在线 TTS 服务（如火山引擎 TTS / Azure TTS / Edge TTS）。

**处理流程**：

```
EditingPlan.segments[].voiceover
  → 按片段拆分文案
  → 逐段调用 TTS API
  → 获得每段音频文件（mp3/wav）
  → 上传 R2 存储
  → 在 Remotion 中按时间轴叠加
```

**Remotion 中的音频编排**：

```tsx
<Composition>
  {/* Layer 3: BGM 全程播放 */}
  <Audio src={plan.audio.bgmUrl} volume={plan.audio.bgmVolume} />

  {segments.map((seg, i) => (
    <Sequence key={i} from={segStartFrame(i)} durationInFrames={segDuration(seg)}>
      {/* Layer 1: 素材视频（静音） */}
      <OffthreadVideo
        src={seg.videoUrl}
        startFrom={sec2frame(seg.startTime)}
        volume={plan.audio.muteOriginalAudio ? 0 : 1}
      />

      {/* Layer 2: 口播音频 */}
      {seg.voiceoverAudioUrl && (
        <Audio src={seg.voiceoverAudioUrl} volume={1} />
      )}

      {/* 文字叠加 */}
      {seg.textOverlay && (
        <TextOverlay text={seg.textOverlay} position={seg.textPosition} />
      )}
    </Sequence>
  ))}
</Composition>
```

### 4.3 BGM 管理

MVP 阶段提供预设 BGM 库：

```typescript
const bgmLibrarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 风格标签 */
  tags: z.array(z.string()),
  /** 时长（秒） */
  duration: z.number(),
  /** R2 URL */
  url: z.string().url(),
  /** 预览 URL（15秒片段） */
  previewUrl: z.string().url(),
});
```

BGM 以静态配置 + R2 存储的方式管理，不需要数据库表。后续可扩展为用户上传。

---

## 五、渲染架构

### 5.1 Remotion 项目结构

```
apps/video/                          # 新 workspace
├── src/
│   ├── compositions/
│   │   └── marketing-video.tsx      # 营销视频 Composition
│   ├── components/
│   │   ├── text-overlay.tsx         # 文字叠加组件
│   │   ├── transition.tsx           # 转场效果组件
│   │   └── watermark.tsx            # 水印组件
│   ├── lib/
│   │   ├── plan-to-props.ts         # EditingPlan → Remotion props 转换
│   │   └── frame-utils.ts           # 时间/帧数换算工具
│   ├── root.tsx                     # Remotion 根组件
│   └── index.ts                     # 入口
├── package.json
└── tsconfig.json
```

### 5.2 渲染方式

**服务端渲染**（非浏览器端）：

```typescript
// apps/api/src/services/video-render.service.ts

interface IVideoRenderService {
  /** 启动渲染任务 */
  startRender(plan: EditingPlan): Promise<{ renderId: string }>;
  /** 查询渲染进度 */
  getRenderProgress(renderId: string): Promise<{ progress: number; status: string }>;
  /** 取消渲染 */
  cancelRender(renderId: string): Promise<void>;
}
```

**渲染流程**：

```
1. API 收到渲染请求
2. 预处理：TTS 口播合成（并行处理所有片段）
3. 构建 Remotion inputProps（包含所有 URL 和时间参数）
4. 调用 @remotion/renderer 的 renderMedia()
5. 输出 MP4 → 上传 R2
6. 更新 editingPlans 表状态
7. 通知前端（SSE 或轮询）
```

### 5.3 渲染进度通知

复用现有的 SSE 架构，新增消息类型：

```typescript
| { type: "render_progress"; renderId: string; progress: number }  // 0-1
| { type: "render_done"; renderId: string; outputUrl: string }
| { type: "render_error"; renderId: string; error: string }
```

---

## 六、Agent MCP 工具扩展

在现有 `video-tools.ts` 基础上新增：

### 6.1 `create_editing_plan`

Agent 分析完素材后调用此工具，创建剪辑方案。

```typescript
tool(
  "create_editing_plan",
  "Create a video editing plan with segment selection, voiceover scripts, and audio config",
  {
    title: z.string(),
    targetDuration: z.number().positive(),
    aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
    segments: z.array(z.object({
      clipId: z.string().uuid(),
      startTime: z.number().nonnegative(),
      endTime: z.number().nonnegative(),
      purpose: z.string(),
      voiceover: z.string().nullable(),
      textOverlay: z.string().nullable(),
      transition: z.enum(["cut", "fade", "dissolve"]).default("cut"),
    })),
    audio: z.object({
      muteOriginalAudio: z.boolean().default(true),
      bgmVolume: z.number().min(0).max(1).default(0.2),
    }),
    reasoning: z.string(),
  },
  async (args) => {
    // 1. 验证所有 clipId 存在且属于当前项目
    // 2. 自动填充 videoId, videoUrl（从 clip 关联的 video 获取）
    // 3. 存入 editingPlans 表，status = "draft"
    // 4. 返回 plan ID
  }
);
```

### 6.2 `render_video`

用户确认方案后触发渲染。

```typescript
tool(
  "render_video",
  "Start rendering a confirmed editing plan into a final video",
  {
    planId: z.string().uuid(),
  },
  async (args) => {
    // 1. 读取 plan，验证 status === "confirmed"
    // 2. 调用 videoRenderService.startRender()
    // 3. 返回 renderId
  }
);
```

---

## 七、UI 交互设计

### 7.1 剪辑方案卡片（画布上）

Agent 生成方案后，在画布上创建一个 **EditingPlanCard** shape：

```
┌─────────────────────────────────────┐
│ 🎬 千岛营销视频 (30s)    [确认渲染] │
├─────────────────────────────────────┤
│                                     │
│  1. [缩略图] 0:00-0:01             │
│     用途：开场吸引                   │
│     口播：潮玩党必备神器！            │
│                                     │
│  2. [缩略图] 0:01-0:03             │
│     用途：产品展示                   │
│     口播：盲盒开箱，惊喜不断          │
│                                     │
│  3. [缩略图] 0:03-0:08             │
│     用途：品牌引入                   │
│     口播：千岛App，潮玩人的购物天堂   │
│                                     │
│  ... (可滚动)                       │
│                                     │
├─────────────────────────────────────┤
│ 🔊 BGM: 活力节奏 ▶ 预览   [更换]   │
│ 🎙️ 口播: 全部静音素材 + TTS合成     │
│ 📐 9:16 竖屏 | 1080p | 30fps      │
└─────────────────────────────────────┘
```

### 7.2 交互操作

| 操作 | 行为 |
|------|------|
| 点击片段缩略图 | 弹出预览播放器，播放该时间段 |
| 编辑口播文案 | 直接在卡片内 inline 编辑 |
| 拖拽片段 | 调整播放顺序 |
| 删除片段 | 从方案中移除 |
| 更换 BGM | 弹出 BGM 选择面板 |
| 点击"确认渲染" | 锁定方案 → 触发渲染 → 显示进度条 |

### 7.3 渲染状态展示

渲染中：卡片底部显示进度条 + 预估时间
渲染完成：卡片变为播放器模式，可直接预览成片 + 下载按钮

---

## 八、实现分期

### Phase 1: 最小闭环（无 UI 编辑）

**目标**：Agent 生成方案 → 自动渲染 → 产出视频（含口播）

- 定义 EditingPlan schema
- 新增 `editingPlans` 数据库表
- 新增 `create_editing_plan` MCP 工具
- 搭建 `apps/video` Remotion 项目
- 实现基础 Composition（视频拼接 + 文字叠加）
- 集成火山引擎 TTS，口播音频按片段合成
- Remotion 中混合三层音频（静音原声 + TTS 口播 + BGM）
- 实现服务端渲染流程（renderMedia → R2 上传）

**验证标准**：能通过 Agent 对话 → 产出一个带口播、BGM 和字幕的完整营销视频

### Phase 2: UI 编辑能力

- EditingPlanCard 画布 shape
- 片段预览播放器
- 口播文案 inline 编辑
- 片段顺序拖拽
- BGM 选择面板
- 多种 TTS 音色选择
- 渲染进度展示

### Phase 3: 高级功能

- 转场效果（fade, dissolve）
- 品牌水印模板
- 多种视频模板（竖屏/横屏/方形）
- 视频模板库（预设结构 + 样式）
- 批量渲染

---

## 九、技术选型说明

### 为什么 Remotion 而非 FFmpeg 脚本？

| 维度 | FFmpeg | Remotion |
|------|--------|----------|
| 文字叠加 | drawtext 滤镜，调试痛苦 | React 组件，CSS 控制 |
| 动画效果 | 几乎不可能 | spring(), interpolate() |
| 模板化 | shell 脚本，难以复用 | React 组件，天然可复用 |
| 中文字体 | 字体路径配置复杂 | 标准 CSS @font-face |
| 预览 | 无法预览，必须完整渲染 | Remotion Player 实时预览 |
| 技术栈 | 异构（shell + node） | 同构（TypeScript 全栈） |

### TTS 服务：火山引擎 TTS

使用火山引擎语音合成服务，中文效果最优。

**接入方式**：火山引擎 OpenAPI，HTTP 调用
**环境变量**：
```bash
VOLCENGINE_TTS_APP_ID=...        # 应用 ID
VOLCENGINE_TTS_ACCESS_TOKEN=...  # 访问令牌
```

**服务封装**：
```typescript
// apps/api/src/services/tts.service.ts
interface ITTSService {
  /** 合成单段口播音频，返回 R2 URL */
  synthesize(text: string, voiceId: string, speed?: number): Promise<string>;
  /** 批量合成（并行），返回每段的 R2 URL */
  batchSynthesize(segments: { text: string; voiceId: string }[]): Promise<string[]>;
  /** 可用音色列表 */
  listVoices(): Promise<{ id: string; name: string; gender: string; sample: string }[]>;
}

---

## 十、数据流总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  1. 用户上传视频                                                      │
│     └→ R2 存储 → videos 表                                           │
│                                                                      │
│  2. Gemini 分析视频                                                   │
│     └→ 结构化片段 → videoClips 表                                     │
│        (content, subjects, actions, scene, audio, mood...)           │
│                                                                      │
│  3. 用户发起剪辑请求                                                  │
│     "帮我做一个30秒千岛营销视频"                                       │
│     └→ Agent 调用 search_video_clips 检索素材                        │
│     └→ Agent 调用 create_editing_plan 生成方案                       │
│        {                                                             │
│          segments: [                                                 │
│            { clipId, startTime, endTime, voiceover, textOverlay },  │
│            ...                                                       │
│          ],                                                          │
│          audio: { muteOriginalAudio: true, bgmUrl, bgmVolume },    │
│        }                                                             │
│     └→ editingPlans 表 (status: "draft")                             │
│                                                                      │
│  4. 用户确认方案                                                      │
│     └→ editingPlans.status → "confirmed"                             │
│                                                                      │
│  5. 渲染流程                                                         │
│     └→ [Phase 2] TTS 合成口播音频 → R2 存储                          │
│     └→ EditingPlan → Remotion inputProps                             │
│     └→ renderMedia() → MP4                                           │
│     └→ MP4 上传 R2                                                   │
│     └→ editingPlans.status → "done", outputUrl 更新                  │
│                                                                      │
│  6. 用户下载/分享                                                     │
│     └→ 从 R2 CDN 下载成片                                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```
