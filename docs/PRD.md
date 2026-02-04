# CCC (Claude Infinite Canvas) - 产品需求文档

## 一、产品愿景

**一句话定位**：AI 驱动的无限画布创意工具，让人和 AI Agent 在同一个空间里协作。

**核心理念**：「共享工作空间」
- 人的视角：在画布上组织、排列、创作内容
- Agent 的视角：看到画布内容，理解空间关系，执行操作、留下产出
- 两者在同一空间协作，而非各自在各自的界面里

---

## 二、目标用户与场景

### 目标用户
- 需要做竞品分析、方案对比、架构梳理的产品/运营
- 需要快速生成 PPT 和演示材料的职场人士
- 需要 AI 辅助整理信息和头脑风暴的知识工作者

### 核心场景
| 场景 | 用户需求 | 产品价值 |
|------|---------|---------|
| 竞品分析 | 收集多个产品信息并对比 | AI 自动生成多张独立卡片，空间排列便于对比 |
| PPT 制作 | 快速生成演示大纲和页面 | 三阶段流程：产品收集 → 大纲 → 页面 → 导出 |
| 头脑风暴 | 快速发散和整理想法 | 卡片创建、连线、分组，空间布局表达关系 |
| 素材管理 | 收集和整理视觉素材 | AI 图片/视频生成 + 素材库集成（规划中） |

---

## 三、核心功能

### 3.1 无限画布系统

**基于 tldraw 2.4，10 种自定义 Shape**：

| Shape 类型 | 功能 | 状态 |
|-----------|------|------|
| ProductCard | 产品信息卡片（折叠/展开，含来源） | ✅ |
| AgentCard | Agent 对话卡片（思考链、工具调用） | ✅ |
| Comment | 双向沟通气泡（Agent 提问，用户选择） | ✅ |
| OutlineCard | PPT 大纲卡片 | ✅ |
| PageCard | PPT 页面预览 | ✅ |
| TableCard | 数据表格（多 sheet 支持） | ✅ |
| DocCard | 文档卡片 | ✅ |
| FileCard | 导出文件卡片 | ✅ |
| AIImage | AI 生成的图片/视频 | ✅ |
| AIWorkingZone | 工作区域指示器（扫描线动画） | ✅ |

### 3.2 AI Agent 系统

**Agent 编排核心**：
- **意图检测**：深研/大纲/导出/总结等指令自动路由
- **API 调用**：直接 Anthropic API 或服务器中继（SSE 流式）
- **工具系统**：6 个核心工具
  - `create_card` - 创建信息卡片
  - `create_table` - 创建数据表格
  - `ask_user` - 向用户提问
  - `create_slide` - 创建 PPT 页面
  - `create_connection` - 创建关系连线
  - `create_group` - 创建分组

**交互设计**：
- 画布操作即沟通：删除="不要"，框选="基于这些做"，拖到一起="对比"
- 多任务并行：状态条显示多个任务进度
- 双向对话：Agent 通过 Comment 提问，用户点击选择反馈

### 3.3 PPT 工作流（三阶段）

```
Phase 1: 产品收集
├── 用户输入主题
├── AI 搜索并生成 6-8 张产品卡片
└── 完成后弹出 Comment："组织成大纲？"

Phase 2: 大纲生成
├── 用户确认后生成 OutlineCard
├── 显示 PPT 结构和页码
└── Comment："生成页面？"

Phase 3: 页面生成
├── 生成多个 PageCard
├── 支持预览和调整
└── FileCard 提供导出按钮
```

### 3.4 多格式导出

| 格式 | 工具 | 数据来源 |
|------|------|---------|
| PPTX | pptxgenjs | PageCard + Outline |
| XLSX | xlsx | TableCard / ProductCard |
| PDF | jspdf + html2canvas | 任意 shape |
| PNG | tldraw exportToBlob | 选中区域 |

### 3.5 AI 图片/视频生成

**支持的模型**：
- Gemini: `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`
- Seedream: `doubao-seedream-4-5`, `doubao-seedream-4-0`

**生成参数**：
- 图片：宽高比、Lora（最多 6 个）、参考图（最多 10 张）
- 视频：时长（3/5/10s）、质量、分辨率、音声

---

## 四、技术架构

### 前端
- **框架**：React 18 + TypeScript 5.2
- **画布**：tldraw 2.4
- **构建**：Vite 5 + Tailwind CSS 4
- **存储**：IndexedDB（项目持久化）

### 后端（中继服务）
- **服务**：Node.js 原生 HTTP（端口 3001）
- **功能**：代理 Claude CLI 调用，SSE 流式返回
- **文件处理**：支持图片/PDF/Markdown 上传

### AI 集成
- **对话**：Claude API（Anthropic）
- **图片**：多模型支持（Gemini、Seedream）
- **System Prompt**：定义工具、格式规范、PPT 优先规则

---

## 五、关键设计决策

### 5.1 画布 vs 对话的差异

| 维度 | 传统对话 AI | Canvas Agent |
|------|-----------|-------------|
| 产出物 | 文字，读完就滚走 | 独立卡片，可拖、可删、可展开 |
| 上下文 | 线性聊天记录 | 空间布局，同时可见 |
| 用户操作 | 只能打字 | 选中、框选、拖拽 = 空间沟通 |
| 信任验证 | 看引用 | 来源标记、一键查看原文 |

### 5.2 信息层级设计

三层递进阅读，避免认知超载：
1. **扫一眼**：名称 + 一句话 tagline + 标签
2. **快速校验**：来源摘要 + 信任标记
3. **深入阅读**：展开详情 + 完整报告 + 原文链接

### 5.3 事件驱动通信

Shape 无法访问 React Context，通过轻量事件系统解耦：
- `GENERATE_PAGES` - 大纲 → 开始生成页面
- `COMMENT_ACTION` - Comment → 用户选择反馈
- `USER_COMMENT_ON_SHAPE` - 用户对卡片发起修改

---

## 六、发展路线图

### Phase 0（已完成）✅
- tldraw 画布基础
- 10 种自定义 Shape
- Agent 工具系统
- PPT/Excel/PDF 导出
- 项目持久化

### Phase 1（进行中）
- Claude 直连 API（非 CLI）
- JSON 解析鲁棒性优化
- 多任务并行显示

### Phase 2（规划中）
- `read_canvas()` - Claude 了解画布全局
- `read_selection()` - Claude 只读用户框选
- 「框选 + 一句话」交互

### Phase 3（规划中）- 视频编辑整合
- 对接 asset-manager-agent 后端
- 新增 4 个 Shape：VideoClip、Timeline、VideoPreview、AssetLibrary
- Remotion 渲染集成

---

## 七、成功指标

| 指标 | 目标 |
|------|------|
| 卡片生成成功率 | > 95% |
| PPT 流程完成率 | > 80% |
| JSON 解析成功率 | > 99%（5 种策略） |
| 页面加载时间 | < 2s |
| 导出文件生成时间 | < 5s |

---

## 八、关键文件清单

| 文件 | 职责 |
|------|------|
| `src/hooks/useAgentOrchestrator.ts` | Agent 编排核心（~4500 行） |
| `src/components/tldraw-poc/*.tsx` | 10 种自定义 Shape |
| `src/utils/agentEvents.ts` | 事件系统 |
| `src/utils/pptExport.ts` | PPT 导出 |
| `server/index.mjs` | Relay 服务器 |
| `server/canvas-system-prompt.md` | Claude System Prompt |
| `docs/DEVELOPER_GUIDE.md` | 开发者文档 |
| `docs/plans/` | 规划文档 |
