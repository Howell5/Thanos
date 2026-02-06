# 视频素材分析 → 结构化片段索引 → LLM 智能检索 架构文档

本文档描述一套轻量级的视频素材智能分析与检索系统。系统将视频素材发送给 Gemini Flash 进行分析，通过 Prompt Engineering 获得结构化的 `<clip>` XML 标签输出，解析后存储为 JSON 索引，搜索时直接将全部索引数据 + 用户意图发给 Gemini 进行智能匹配。

**核心设计理念**：在中小规模场景（几十个视频、几百个片段）下，无需引入向量数据库，直接利用 LLM 的理解能力进行检索，架构更简单、匹配更精准。

---

## 系统总览

```
┌─────────────────────────────────────────────────────────────┐
│                     Flow 1: 分析 & 索引                      │
│                                                             │
│  视频素材 ──→ 下载 & 压缩(>20MB) ──→ Gemini Flash 分析        │
│                                        │                    │
│                                        ▼                    │
│              解析 <clip> XML 标签 ──→ JSON 索引存储           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     Flow 2: LLM 智能检索                     │
│                                                             │
│  用户意图 + 全部 clips 索引(JSON) ──→ Gemini Flash 判断       │
│                                        │                    │
│                                        ▼                    │
│                   返回匹配的 clip_ids + 匹配理由              │
└─────────────────────────────────────────────────────────────┘
```

---

## Flow 1: 视频素材 → Gemini Flash → 结构化片段索引

### Step 1: 构建分析 Prompt

使用统一的 Prompt 模板，引导 Gemini 输出结构化的 `<clip>` XML 标签。无论用户是单一意图还是多维度分析，都使用同一个模板。

```ts
const VIDEO_ANALYSIS_PROMPT_TEMPLATE = `
请详细分析这个视频的内容，识别并标记所有符合用户需求的片段。

## 用户需求
{user_request}

## 输出格式

对于每个符合条件的片段，使用以下 XML 格式输出：

<clip time="MM:SS-MM:SS" type="片段类型">
  <description>详细描述该片段的内容，包括画面、动作、文字、音频等</description>
  <reason>解释为什么这个片段符合用户需求，有什么特征使其适合该用途</reason>
</clip>

## 标签规则
1. time：时间格式为 MM:SS-MM:SS（如 00:05-00:08）
2. type：片段类型，使用简短的关键词（如：hook、品牌露出、产品展示、拆盒特写）
3. 如果一个片段同时适合多个用途，输出多个独立的 <clip> 标签（时间相同，type 不同）
4. 只标记**明确符合**用户需求的片段，不确定的不要标记
5. description 和 reason 都要详细、具体

## 示例输出

<clip time="00:05-00:08" type="hook">
  <description>产品从黑暗中逐渐亮起的开场镜头，配合神秘音效，画面中心是产品轮廓的剪影</description>
  <reason>强烈的视觉冲击力和悬念感，非常适合作为短视频开场吸引观众注意力</reason>
</clip>

<clip time="00:15-00:20" type="拆盒特写">
  <description>双手从侧面打开包装盒，镜头近距离拍摄开箱动作，可以看到包装内部的保护材料</description>
  <reason>清晰展示拆盒过程，细节丰富，符合开箱视频的标准镜头语言</reason>
</clip>

现在请分析视频并输出符合用户需求的片段。如果没有找到符合条件的片段，请说明原因，不要输出 <clip> 标签。
`
```

### Step 2: 调用 Gemini Flash 分析视频

将视频二进制数据 + Prompt 一起发送给 Gemini Flash，获取包含 `<clip>` 标签的分析结果。

```ts
interface VideoAnalysisResult {
  success: boolean
  analysis: string // Gemini 返回的原始文本，包含 <clip> XML 标签
  model: string
  error?: string
}

async function analyzeVideo(videoUrl: string, userRequest: string): Promise<VideoAnalysisResult> {
  // 1. 下载视频
  const videoBytes = await downloadVideo(videoUrl)

  // 2. 超过 20MB 则压缩（Gemini 限制）
  let processedBytes = videoBytes
  const sizeMB = videoBytes.byteLength / 1024 / 1024
  if (sizeMB > 20) {
    processedBytes = await compressVideo(videoBytes, {
      targetSizeMB: 18,
      crf: 23,
    })
  }

  // 3. 构建 Prompt
  const prompt = VIDEO_ANALYSIS_PROMPT_TEMPLATE.replace('{user_request}', userRequest)

  // 4. 调用 Gemini Flash
  const response = await geminiClient.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ inlineData: { mimeType: 'video/mp4', data: processedBytes } }, { text: prompt }],
  })

  return {
    success: true,
    analysis: response.text,
    model: 'gemini-2.0-flash',
  }
}
```

#### Gemini 返回示例

```xml
这个视频的内容分析如下：

00:00-00:04 片段：黑色画面缓缓过渡到产品logo

<clip time="00:05-00:08" type="hook">
  <description>产品从黑暗中逐渐亮起的开场镜头，配合神秘音效，画面中心是产品轮廓的剪影</description>
  <reason>强烈的视觉冲击力和悬念感，非常适合作为短视频开场吸引观众注意力</reason>
</clip>

00:09-00:14 片段：产品外包装全景展示

<clip time="00:15-00:20" type="拆盒特写">
  <description>双手从侧面打开包装盒，镜头近距离拍摄开箱动作，可以看到包装内部的保护材料</description>
  <reason>清晰展示拆盒过程，细节丰富，符合开箱视频的标准镜头语言</reason>
</clip>

<clip time="00:41-00:44" type="品牌露出">
  <description>产品正面 logo 占据画面中心，光线均匀打在品牌标识上，背景虚化突出主体</description>
  <reason>品牌标识清晰突出，适合用于品牌宣传或片尾展示</reason>
</clip>
```

### Step 3: 解析 `<clip>` XML 标签

使用正则表达式从 Gemini 返回的原始文本中提取结构化片段数据。

```ts
interface ClipData {
  clip_id: string // 自动生成：{asset_id}_{start}_{end}
  asset_id: string // 所属视频 ID
  time_range: string // "00:05-00:08"
  start_time: number // 5 (秒)
  end_time: number // 8 (秒)
  type: string // "hook"
  description: string // 片段描述
  reason: string // 匹配理由
  created_at: string // ISO 时间戳
}

function parseClipTags(analysisText: string, assetId: string): ClipData[] {
  // 匹配完整的 <clip> 标签及其内容
  const clipPattern = /<clip\s+time="([^"]+)"\s+type="([^"]+)">([\s\S]*?)<\/clip>/g
  // 匹配内部的子标签
  const descPattern = /<description>([\s\S]*?)<\/description>/
  const reasonPattern = /<reason>([\s\S]*?)<\/reason>/

  const clips: ClipData[] = []

  let match: RegExpExecArray | null
  while ((match = clipPattern.exec(analysisText)) !== null) {
    const [, timeRange, clipType, innerContent] = match
    const [startStr, endStr] = timeRange.split('-')

    const startTime = timeStrToSeconds(startStr.trim())
    const endTime = timeStrToSeconds(endStr.trim())

    // 提取 description 和 reason
    const descMatch = descPattern.exec(innerContent)
    const reasonMatch = reasonPattern.exec(innerContent)

    const description = descMatch ? descMatch[1].trim() : ''
    const reason = reasonMatch ? reasonMatch[1].trim() : ''

    // 生成唯一 clip_id
    const clipId = `${assetId}_${String(startTime).padStart(4, '0')}_${String(endTime).padStart(4, '0')}`

    clips.push({
      clip_id: clipId,
      asset_id: assetId,
      time_range: timeRange.trim(),
      start_time: startTime,
      end_time: endTime,
      type: clipType.trim(),
      description,
      reason,
      created_at: new Date().toISOString(),
    })
  }

  return clips
}

function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(':')
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  }
  throw new Error(`Invalid time format: ${timeStr}`)
}
```

### Step 4: JSON 索引存储

将解析后的片段数据存储为 JSON 文件，按 workspace 隔离。

```ts
interface ClipIndex {
  workspace_id: string
  clips: ClipData[]
  updated_at: string
}

// 索引文件路径: ./clip_index_data/{workspace_id}/clips.json

async function saveClipsToIndex(workspaceId: string, newClips: ClipData[]): Promise<void> {
  const indexPath = `./clip_index_data/${workspaceId}/clips.json`

  // 读取现有索引
  let existingIndex: ClipIndex
  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    existingIndex = JSON.parse(content)
  } catch {
    existingIndex = {
      workspace_id: workspaceId,
      clips: [],
      updated_at: new Date().toISOString(),
    }
  }

  // 合并新片段（按 clip_id 去重，新的覆盖旧的）
  const clipMap = new Map<string, ClipData>()
  for (const clip of existingIndex.clips) {
    clipMap.set(clip.clip_id, clip)
  }
  for (const clip of newClips) {
    clipMap.set(clip.clip_id, clip)
  }

  // 保存更新后的索引
  const updatedIndex: ClipIndex = {
    workspace_id: workspaceId,
    clips: Array.from(clipMap.values()),
    updated_at: new Date().toISOString(),
  }

  await fs.mkdir(`./clip_index_data/${workspaceId}`, { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(updatedIndex, null, 2))
}
```

### Step 5: 完整 Flow 1 调用链

```ts
async function analyzeAndIndexAsset(workspaceId: string, assetId: string, videoUrl: string, userRequest: string): Promise<ClipData[]> {
  // 1. 调用 Gemini Flash 分析视频
  const analysisResult = await analyzeVideo(videoUrl, userRequest)

  if (!analysisResult.success) {
    throw new Error(analysisResult.error)
  }

  // 2. 解析 <clip> XML 标签
  const clipsData = parseClipTags(analysisResult.analysis, assetId)

  if (clipsData.length === 0) {
    console.log('未找到符合条件的片段')
    return []
  }

  // 3. 保存到 JSON 索引
  await saveClipsToIndex(workspaceId, clipsData)

  console.log(`成功索引 ${clipsData.length} 个片段`)
  return clipsData
}
```

---

## Flow 2: 用户意图 → LLM 智能检索 → Clip 选择

### 核心思路

在中小规模场景下，直接将**全部 clips 索引 + 用户意图**发送给 Gemini，让 LLM 理解用户需求并返回最匹配的片段。

**优势**：

- 无需向量数据库，架构更简单
- LLM 能理解复杂的语义关系和上下文
- 匹配更精准，支持模糊查询和多条件组合
- 可以解释匹配理由

### Step 1: 搜索接口定义

```ts
interface SearchResult {
  success: boolean
  clips: MatchedClip[]
  reasoning: string // LLM 的整体判断说明
}

interface MatchedClip {
  clip_id: string
  asset_id: string
  time_range: string
  type: string
  description: string
  reason: string // 原始分析时的理由
  match_score: number // 匹配度 1-10
  match_reason: string // 本次匹配的理由
}

interface SearchFilters {
  asset_ids?: string[] // 限定特定素材
  max_duration?: number // 限制片段时长（秒）
  types?: string[] // 限定片段类型
}
```

### Step 2: 构建搜索 Prompt

```ts
const CLIP_SEARCH_PROMPT_TEMPLATE = `
你是一个视频片段检索助手。根据用户需求，从已索引的片段中找出最匹配的片段。

## 用户需求
{user_query}

## 可用片段索引
{clips_json}

## 过滤条件（可选）
{filters_json}

## 任务
1. 理解用户的真实需求和意图
2. 从片段索引中找出所有符合需求的片段
3. 按匹配程度排序，最匹配的排在前面
4. 为每个匹配的片段给出匹配度评分（1-10）和匹配理由

## 输出格式
请以 JSON 格式返回：

{
  "reasoning": "整体判断说明，解释你的匹配逻辑",
  "matched_clips": [
    {
      "clip_id": "片段ID",
      "match_score": 8,
      "match_reason": "为什么这个片段符合用户需求"
    }
  ]
}

## 注意事项
1. 只返回确实符合用户需求的片段，不要勉强匹配
2. 如果没有任何片段符合，返回空数组并说明原因
3. match_score 评分标准：
   - 9-10：完美匹配用户需求
   - 7-8：很好地符合需求
   - 5-6：部分符合需求
   - 1-4：勉强相关（一般不应返回）
4. 只返回 JSON，不要添加其他内容
`
```

### Step 3: 执行搜索

````ts
async function searchClipsByIntent(workspaceId: string, userQuery: string, filters: SearchFilters = {}, topK: number = 10): Promise<SearchResult> {
  // 1. 读取全部索引
  const indexPath = `./clip_index_data/${workspaceId}/clips.json`
  let clipIndex: ClipIndex

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    clipIndex = JSON.parse(content)
  } catch {
    return {
      success: false,
      clips: [],
      reasoning: '索引为空，请先分析视频素材',
    }
  }

  // 2. 应用前置过滤（减少发送给 LLM 的数据量）
  let filteredClips = clipIndex.clips

  if (filters.asset_ids?.length) {
    filteredClips = filteredClips.filter((c) => filters.asset_ids!.includes(c.asset_id))
  }
  if (filters.max_duration) {
    filteredClips = filteredClips.filter((c) => c.end_time - c.start_time <= filters.max_duration!)
  }
  if (filters.types?.length) {
    filteredClips = filteredClips.filter((c) => filters.types!.includes(c.type))
  }

  if (filteredClips.length === 0) {
    return {
      success: false,
      clips: [],
      reasoning: '没有符合过滤条件的片段',
    }
  }

  // 3. 构建 Prompt
  const prompt = CLIP_SEARCH_PROMPT_TEMPLATE.replace('{user_query}', userQuery)
    .replace('{clips_json}', JSON.stringify(filteredClips, null, 2))
    .replace('{filters_json}', JSON.stringify(filters, null, 2))

  // 4. 调用 Gemini
  const response = await geminiClient.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  })

  // 5. 解析响应
  const responseText = response.text.trim()
  let parsedResponse: {
    reasoning: string
    matched_clips: Array<{
      clip_id: string
      match_score: number
      match_reason: string
    }>
  }

  try {
    // 清理可能的 markdown 代码块标记
    let jsonText = responseText
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7)
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3)
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3)
    }
    parsedResponse = JSON.parse(jsonText.trim())
  } catch (e) {
    return {
      success: false,
      clips: [],
      reasoning: `解析响应失败: ${e}`,
    }
  }

  // 6. 组装完整结果
  const clipMap = new Map(filteredClips.map((c) => [c.clip_id, c]))
  const matchedClips: MatchedClip[] = []

  for (const match of parsedResponse.matched_clips.slice(0, topK)) {
    const clipData = clipMap.get(match.clip_id)
    if (clipData) {
      matchedClips.push({
        clip_id: clipData.clip_id,
        asset_id: clipData.asset_id,
        time_range: clipData.time_range,
        type: clipData.type,
        description: clipData.description,
        reason: clipData.reason,
        match_score: match.match_score,
        match_reason: match.match_reason,
      })
    }
  }

  return {
    success: true,
    clips: matchedClips,
    reasoning: parsedResponse.reasoning,
  }
}
````

### Step 4: 使用示例

```ts
// 示例 1: 简单查询
const result1 = await searchClipsByIntent('workspace_123', '找适合作为抖音开场的片段')
// 返回所有 type 为 "hook" 或描述中包含开场特征的片段

// 示例 2: 复杂查询
const result2 = await searchClipsByIntent(
  'workspace_123',
  '找一些展示产品细节的镜头，最好能看清品牌 logo',
  { max_duration: 5 }, // 限制时长不超过 5 秒
)
// LLM 理解 "产品细节" + "品牌 logo" 的组合需求

// 示例 3: 多条件组合
const result3 = await searchClipsByIntent('workspace_123', '从这两个视频里找拆箱相关的片段', { asset_ids: ['video_001', 'video_002'] })
```

---

## 完整调用流程示意

```
┌─────────────────────────────────────────────────────────────┐
│                        分析阶段                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户：分析这个视频，找出适合作为 hook 和品牌露出的片段        │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────┐               │
│  │          Gemini Flash 视频分析           │               │
│  │  输入: 视频 + Prompt                     │               │
│  │  输出: <clip> XML 标签                   │               │
│  └─────────────────────────────────────────┘               │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────┐               │
│  │          解析 XML + 存储 JSON            │               │
│  │  clips.json:                            │               │
│  │  [                                      │               │
│  │    { clip_id, type, description, ... }, │               │
│  │    { clip_id, type, description, ... }  │               │
│  │  ]                                      │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                        搜索阶段                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户：找适合作为开场的片段                                   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────┐               │
│  │          Gemini Flash 智能匹配           │               │
│  │  输入: 用户意图 + clips.json             │               │
│  │  输出: matched_clips + reasoning         │               │
│  └─────────────────────────────────────────┘               │
│                          │                                  │
│                          ▼                                  │
│  返回匹配结果:                                               │
│  - clip_id: video_001_0005_0008                             │
│  - type: hook                                               │
│  - match_score: 9                                           │
│  - match_reason: 开场镜头视觉冲击力强，完美符合需求           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 关键设计决策

### 1. 为什么不用向量数据库？

| 对比项     | 向量数据库方案                 | LLM 直接匹配方案      |
| ---------- | ------------------------------ | --------------------- |
| 架构复杂度 | 需要 ChromaDB + Embedding 模型 | 只需 JSON 文件        |
| 依赖项     | BGE/OpenAI Embedding           | 无额外依赖            |
| 语义理解   | 向量相似度（模糊）             | LLM 精准理解          |
| 复杂查询   | 需要多次查询或后处理           | 一次调用解决          |
| 调试难度   | 向量相似度难解释               | LLM 返回匹配理由      |
| 适用规模   | 大规模（万级以上）             | 中小规模（百级~千级） |

**结论**：在几十个视频、几百个片段的场景下，LLM 直接匹配方案更简单、更精准。

### 2. 为什么用统一的 Prompt 模板？

- 单一意图（如"找 hook"）和多维度分析（如"找 hook、品牌露出、产品展示"）本质上都是"按需求标记片段"
- 统一模板减少代码复杂度，避免维护两套逻辑
- LLM 能自动理解用户需求的复杂程度

### 3. 为什么用 XML 子标签？

```xml
<!-- 旧格式：Markdown 混合 -->
<clip time="00:05-00:08" type="hook">
**片段描述**: 开场镜头...
**分析理由**: 视觉冲击力强...
</clip>

<!-- 新格式：纯 XML -->
<clip time="00:05-00:08" type="hook">
  <description>开场镜头...</description>
  <reason>视觉冲击力强...</reason>
</clip>
```

**优势**：

- 解析逻辑统一，全部用正则或 XML parser
- 结构更清晰，不依赖 Markdown 格式
- 嵌套层次明确，易于扩展字段

### 4. 搜索结果的可解释性

LLM 返回的每个匹配结果都包含：

- `match_score`：1-10 的匹配度评分
- `match_reason`：具体的匹配理由

这让用户（和调试者）能理解"为什么返回这个片段"，比向量相似度分数更直观。

---

## 配置参数

| 配置项       | 值               | 说明                |
| ------------ | ---------------- | ------------------- |
| Gemini 模型  | gemini-2.0-flash | 快速且支持视频分析  |
| 视频大小限制 | 20MB             | 超过自动压缩到 18MB |
| 索引存储格式 | JSON             | 按 workspace 隔离   |
| 搜索返回数量 | 默认 Top 10      | 可配置              |
| 匹配度阈值   | >= 5             | 低于 5 分一般不返回 |

---

## 扩展能力

### 1. 增量分析

同一视频可以多次分析（不同需求），新片段会合并到索引中，按 `clip_id` 去重。

### 2. 多 Asset 搜索

搜索时可以通过 `filters.asset_ids` 限定特定视频，或不限定搜索全部。

### 3. 片段类型过滤

可以通过 `filters.types` 只搜索特定类型的片段（如只看 "hook" 类型）。

### 4. 时长限制

可以通过 `filters.max_duration` 限制返回片段的最大时长。

---

## 辅助 Prompt 模板

### 批量分析多个视频

如果需要一次性分析多个视频，可以分批调用 `analyzeAndIndexAsset`，索引会自动合并。

### 自定义分析维度

用户可以在 `userRequest` 中指定任意维度：

```ts
await analyzeAndIndexAsset(workspaceId, assetId, videoUrl, '请从以下维度分析视频：1. 适合作为 hook 的片段 2. 产品特写镜头 3. 有文字露出的片段 4. 情绪高涨的片段')
```

Gemini 会自动识别这些维度并为每个符合条件的片段打上对应的 `type` 标签。
