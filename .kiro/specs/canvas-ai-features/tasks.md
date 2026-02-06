# Implementation Plan

## Phase 1: Image-to-Image + Inpainting

- [ ] 1. 完善 Text-to-Image 前端功能
  - [ ] 1.1 验证现有文生图功能是否正常工作
    - 测试 prompt 输入 → API 调用 → 图片显示流程
    - 确认错误处理和 loading 状态正常
    - _Requirements: 1.1, 1.4_

- [ ] 2. 实现 Image-to-Image 后端 API
  - [ ] 2.1 扩展 Vertex AI service 支持图生图
    - 在 `vertex-ai.ts` 添加 `generateImageWithReference` 函数
    - 支持传入 referenceImages 参数（base64 数组）
    - 使用 Imagen 的 image-to-image 能力
    - _Requirements: 1.1, 1.3_

  - [ ] 2.2 扩展 generateImageSchema 支持参考图
    - 在 `packages/shared/src/schemas/ai-image.ts` 添加 `referenceImages` 字段
    - 字段为可选的 base64 字符串数组
    - _Requirements: 1.3_

  - [ ] 2.3 修改 ai-images.ts 路由处理参考图
    - 在 `/generate` 路由中处理 referenceImages 参数
    - 根据是否有参考图调用不同的生成函数
    - _Requirements: 1.1, 1.3_

- [ ] 3. 实现 Image-to-Image 前端功能
  - [ ] 3.1 修改 generateImage 函数支持参考图
    - 在 `use-ai-store.ts` 中扩展 generateImage 方法
    - 将选中图片的 base64 数据作为 referenceImages 传递
    - _Requirements: 1.1, 1.3_

  - [ ] 3.2 在 BottomPromptPanel 中集成图生图逻辑
    - 当有选中图片时，获取其 base64 数据
    - 调用时传递给 generateImage
    - _Requirements: 1.1, 1.2_

- [ ] 4. 实现 Inpainting 后端 API
  - [ ] 4.1 添加 Inpainting API endpoint
    - 新增 `/ai-images/inpaint` POST 路由
    - 接收 imageData、maskData、prompt 参数
    - _Requirements: 2.1, 2.4_

  - [ ] 4.2 实现 Vertex AI inpainting 调用
    - 在 `vertex-ai.ts` 添加 `inpaintImage` 函数
    - 使用 Imagen 的 inpainting/editing 能力
    - _Requirements: 2.4, 2.5_

  - [ ] 4.3 创建 inpaintImageSchema
    - 定义 imageData、maskData、prompt、model 字段
    - 添加验证规则
    - _Requirements: 2.4_

- [ ] 5. 实现 Inpainting 前端 UI
  - [ ] 5.1 创建 InpaintingOverlay 组件
    - 实现画布层叠在选中图片上方
    - 支持鼠标绘制 mask（红色半透明）
    - 支持调整画笔大小
    - _Requirements: 2.2, 2.3_

  - [ ] 5.2 实现 mask 导出为 base64
    - 将 canvas 绘制内容导出为 PNG base64
    - mask 区域为白色，其余为黑色
    - _Requirements: 2.4_

  - [ ] 5.3 扩展 FloatingToolbar 添加 Inpaint 按钮
    - 添加"局部重绘"按钮
    - 点击后进入 inpainting 模式
    - _Requirements: 2.1_

  - [ ] 5.4 在 useAIStore 添加 inpainting 状态管理
    - 添加 editMode: 'normal' | 'inpaint' 状态
    - 添加 inpaintImage action
    - _Requirements: 2.1, 2.6_

  - [ ] 5.5 实现 inpainting 生成流程
    - 退出 inpaint 模式 → 调用 API → 更新图片
    - 处理错误和取消操作
    - _Requirements: 2.5, 2.6_

## Phase 2: Outpainting + Remove BG + Upscale

- [ ] 6. 实现 Outpainting 后端 API
  - [ ] 6.1 添加 Outpainting API endpoint
    - 新增 `/ai-images/outpaint` POST 路由
    - 接收 imageData、direction、prompt 参数
    - _Requirements: 3.1, 3.2_

  - [ ] 6.2 实现 Vertex AI outpainting 调用
    - 根据方向计算新画布尺寸
    - 将原图放置在对应位置，空白区域生成新内容
    - _Requirements: 3.2, 3.3_

- [ ] 7. 实现 Outpainting 前端 UI
  - [ ] 7.1 创建 OutpaintingPanel 组件
    - 显示方向选择 UI（上下左右 + 全部）
    - 点击方向后进入 outpainting 模式
    - _Requirements: 3.1_

  - [ ] 7.2 扩展 FloatingToolbar 添加 Outpaint 按钮
    - 添加"扩展画布"按钮
    - 点击后显示 OutpaintingPanel
    - _Requirements: 3.1_

  - [ ] 7.3 实现 outpainting 生成流程
    - 选择方向 → 输入 prompt → 调用 API → 替换图片
    - _Requirements: 3.2, 3.3, 3.4_

- [ ] 8. 实现 Remove Background 功能
  - [ ] 8.1 添加 Remove Background API endpoint
    - 新增 `/ai-images/remove-bg` POST 路由
    - 接收 imageData 参数
    - _Requirements: 4.1_

  - [ ] 8.2 集成去背景服务
    - 使用 remove.bg API 或类似服务
    - 返回透明背景的 PNG
    - _Requirements: 4.3_

  - [ ] 8.3 扩展 FloatingToolbar 添加去背景按钮
    - 添加"去背景"按钮
    - 显示处理进度
    - _Requirements: 4.1, 4.2_

  - [ ] 8.4 实现去背景结果替换原图
    - 更新 shape 的 asset
    - 保留原图位置和尺寸
    - _Requirements: 4.3, 4.4_

- [ ] 9. 实现 Upscale 功能
  - [ ] 9.1 添加 Upscale API endpoint
    - 新增 `/ai-images/upscale` POST 路由
    - 接收 imageData、scale(2x/4x) 参数
    - _Requirements: 5.1, 5.2_

  - [ ] 9.2 集成超分辨率服务
    - 使用 Real-ESRGAN 或类似服务
    - 支持 2x 和 4x 放大
    - _Requirements: 5.2, 5.3_

  - [ ] 9.3 扩展 FloatingToolbar 添加放大按钮
    - 添加"放大"按钮
    - 显示倍数选择（2x/4x）
    - _Requirements: 5.1_

  - [ ] 9.4 实现放大结果替换原图
    - 更新 shape 尺寸和 asset
    - 检查尺寸限制
    - _Requirements: 5.4, 5.5_

## Phase 3: Prompt History + Undo/Redo

- [ ] 10. 实现 Prompt 历史功能
  - [ ] 10.1 在 useAIStore 添加历史管理
    - 添加 promptHistory 和 favoritePrompts 状态
    - 实现 addToHistory、toggleFavorite actions
    - _Requirements: 6.1, 6.3_

  - [ ] 10.2 实现 localStorage 持久化
    - 保存/加载 prompt 历史到 localStorage
    - key 格式: `thanos:prompt-history:{projectId}`
    - _Requirements: 6.5_

  - [ ] 10.3 创建 PromptHistoryPanel 组件
    - 显示最近使用的 prompt 列表
    - 显示收藏的 prompt 列表
    - 支持点击填入输入框
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ] 10.4 在 BottomPromptPanel 集成历史按钮
    - 添加历史图标按钮
    - 点击显示 PromptHistoryPanel
    - _Requirements: 6.1_

- [ ] 11. 实现 Undo/Redo 按钮
  - [ ] 11.1 在 TopBar 添加 Undo/Redo 按钮
    - 添加撤销和重做图标按钮
    - 根据 tldraw 状态控制按钮禁用状态
    - _Requirements: 7.1, 7.2, 7.5_

  - [ ] 11.2 连接 tldraw undo/redo 方法
    - 调用 editor.undo() 和 editor.redo()
    - 监听 canUndo/canRedo 状态变化
    - _Requirements: 7.3, 7.4_
