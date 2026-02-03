# Requirements Document

## Introduction

本文档定义了 AI 图片画布的核心功能需求，目标是实现与 Popart 对标的完整 AI 图片编辑能力。功能按优先级分为三个阶段实现：

- **Phase 1（高优先级）**：Image-to-Image、Inpainting
- **Phase 2（中优先级）**：Outpainting、Remove Background、Upscale
- **Phase 3（低优先级）**：Prompt 历史、Undo/Redo 按钮

---

## Requirements

### Requirement 1: Image-to-Image（图生图）

**User Story:** As a 用户, I want 选中画布上的图片作为参考图来生成新的变体, so that 我可以基于现有图片进行迭代创作。

#### Acceptance Criteria

1. WHEN 用户选中一张或多张图片 AND 在底部输入框输入 prompt THEN 系统 SHALL 将选中图片作为参考图传给 AI API
2. WHEN 用户选中图片时 THEN 底部面板 SHALL 显示已选中图片的缩略图预览
3. WHEN 生成请求包含参考图时 THEN 系统 SHALL 在 API 请求中包含图片数据（base64 或 URL）
4. WHEN 生成完成时 THEN 新图片 SHALL 自动放置在参考图旁边（智能避免重叠）
5. IF 选中的图片正在生成中 THEN 系统 SHALL 排除该图片作为参考图

### Requirement 2: Inpainting（局部重绘）

**User Story:** As a 用户, I want 用画笔工具在图片上选择区域并只重新生成该区域, so that 我可以精确修改图片的特定部分而不影响其他区域。

#### Acceptance Criteria

1. WHEN 用户选中一张图片 AND 点击"局部重绘"按钮 THEN 系统 SHALL 进入 inpainting 模式
2. WHEN 处于 inpainting 模式时 THEN 系统 SHALL 显示画笔工具让用户绘制 mask 区域
3. WHEN 用户绘制 mask 区域时 THEN 系统 SHALL 实时显示半透明的选区预览
4. WHEN 用户完成 mask 绘制 AND 输入 prompt AND 点击生成 THEN 系统 SHALL 将原图和 mask 一起发送给 API
5. WHEN inpainting 生成完成 THEN 系统 SHALL 用新生成的内容替换原图中的 mask 区域
6. WHEN 用户按 ESC 或点击取消 THEN 系统 SHALL 退出 inpainting 模式并清除 mask

### Requirement 3: Outpainting（扩展画布）

**User Story:** As a 用户, I want 扩展图片的边界生成新的内容, so that 我可以将图片扩展到更大的尺寸。

#### Acceptance Criteria

1. WHEN 用户选中一张图片 AND 点击"扩展画布"按钮 THEN 系统 SHALL 显示扩展方向选项（上、下、左、右、全部）
2. WHEN 用户选择扩展方向 AND 输入 prompt THEN 系统 SHALL 生成该方向的扩展内容
3. WHEN outpainting 生成完成 THEN 系统 SHALL 将扩展内容与原图无缝拼接成新图片
4. IF 用户选择"全部"方向 THEN 系统 SHALL 同时向四个方向扩展

### Requirement 4: Remove Background（去背景）

**User Story:** As a 用户, I want 一键去除图片背景, so that 我可以得到透明背景的主体图片用于合成。

#### Acceptance Criteria

1. WHEN 用户选中一张图片 AND 点击"去背景"按钮 THEN 系统 SHALL 调用去背景 API
2. WHEN 去背景处理中 THEN 系统 SHALL 显示处理进度指示器
3. WHEN 去背景完成 THEN 系统 SHALL 用透明背景的新图片替换原图
4. IF 去背景失败 THEN 系统 SHALL 显示错误提示并保留原图

### Requirement 5: Upscale（超分辨率放大）

**User Story:** As a 用户, I want 放大图片并保持清晰度, so that 我可以获得更高分辨率的图片用于打印或大屏展示。

#### Acceptance Criteria

1. WHEN 用户选中一张图片 AND 点击"放大"按钮 THEN 系统 SHALL 显示放大倍数选项（2x、4x）
2. WHEN 用户选择放大倍数 THEN 系统 SHALL 调用超分辨率 API
3. WHEN 放大处理中 THEN 系统 SHALL 显示处理进度指示器
4. WHEN 放大完成 THEN 系统 SHALL 用放大后的图片替换原图并更新画布上的尺寸
5. IF 放大后图片尺寸超过限制 THEN 系统 SHALL 提示用户并拒绝操作

### Requirement 6: Prompt 历史与收藏

**User Story:** As a 用户, I want 查看和复用之前使用过的 prompt, so that 我可以快速重复使用效果好的 prompt。

#### Acceptance Criteria

1. WHEN 用户点击 prompt 输入框旁的历史按钮 THEN 系统 SHALL 显示最近使用的 prompt 列表
2. WHEN 用户点击历史 prompt THEN 系统 SHALL 将该 prompt 填入输入框
3. WHEN 用户点击收藏按钮 THEN 系统 SHALL 将当前 prompt 添加到收藏列表
4. WHEN 用户查看收藏列表 THEN 系统 SHALL 显示所有已收藏的 prompt
5. IF prompt 历史超过 50 条 THEN 系统 SHALL 自动删除最早的记录

### Requirement 7: Undo/Redo 按钮

**User Story:** As a 用户, I want 在界面上有撤销和重做按钮, so that 我可以方便地撤销错误操作而不需要记住快捷键。

#### Acceptance Criteria

1. WHEN 画布有可撤销的操作时 THEN Undo 按钮 SHALL 处于可点击状态
2. WHEN 画布有可重做的操作时 THEN Redo 按钮 SHALL 处于可点击状态
3. WHEN 用户点击 Undo 按钮 THEN 系统 SHALL 撤销最近一次操作
4. WHEN 用户点击 Redo 按钮 THEN 系统 SHALL 重做最近一次撤销的操作
5. WHEN 没有可撤销/重做的操作时 THEN 对应按钮 SHALL 显示为禁用状态
