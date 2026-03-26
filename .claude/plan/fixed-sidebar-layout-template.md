# Fixed Sidebar Layout 模板与 Yuanbao 适配经验

## 1. 文档目的

本文档记录本次把 Ophel 面板从“浮动面板”演进到“页面内固定侧边栏 + rail”的完整过程，重点沉淀：

- 当前已经验证有效的最小架构模板
- Yuanbao 站点的真实适配路径
- 过程中踩过的坑和失败方案
- 后续适配其他站点时可复用的方法论与排障顺序

本文档不聚焦 UI / UX 交互细节，而聚焦“如何让宿主页面内容稳定避开我们的面板”。

---

## 2. 改造背景

原始形态下，Ophel 面板是浮动面板：

- 面板支持自由拖拽、吸附、收起/展开
- 页面本身支持“页面加宽”
- 当用户把宿主页面加宽后，聊天正文或输入区容易被 Ophel 面板遮住

这个问题在多个站点上都可能出现，但不同站点的 DOM 结构和布局机制差异很大：

- 有的站点正文是普通流式容器
- 有的站点正文宽度由 CSS 变量控制
- 有的站点正文区域由绝对定位 / split pane 控制
- 有的站点输入区和正文区是完全分离的固定层

因此，不能假设“给某一层统一加 `padding-right`”就能解决问题。

---

## 3. 本次最终达成的目标

当前已完成的目标是：

- 引入 `rail + 固定展开 pane` 的新布局形态
- 先在 Yuanbao 上实验
- 页面内容可以稳定避开展开 pane
- 输入区也能同步避让
- 当前效果已验证“可用”

本次还没有完成的内容：

- 交互与视觉细节的优化
- 多站点普适适配
- 将所有旧浮动面板逻辑彻底收敛

所以当前阶段的正确策略是：

1. 先沉淀可靠架构
2. 再优化交互 / UI
3. 再扩站点

---

## 4. 当前代码结构总览

### 4.1 入口能力判断

当前是否启用固定侧边栏布局，不再依赖站点 ID 硬编码，而是依赖适配器是否返回有效的 `getSidebarLayoutConfig()`。

关键位置：

- `src/components/App.tsx`
- `src/adapters/base.ts`

当前逻辑：

1. `adapter.getSidebarLayoutConfig()` 返回配置
2. `hasSidebarLayoutRules(config)` 判断配置是否有有效规则
3. 如果有，则：
   - `MainPanel` 用 `sidebar` 变体
   - `QuickButtons` 用 `rail` 变体
   - `App` 负责向宿主页面注入让位 CSS

这一步的意义很大：

- 后续任何站点只要返回配置，就能进入新布局
- 不需要在 `App.tsx` 里继续写 `if siteId === xxx`

### 4.2 规则式布局模板

当前 `SidebarLayoutConfig` 已收敛为：

```ts
export interface SidebarLayoutRule {
  type: "padding" | "margin" | "inset"
  selectors: string[]
  extraCss?: string
}

export interface SidebarLayoutConfig {
  main: SidebarLayoutRule[]
  composer?: SidebarLayoutRule[]
  obstacles?: SidebarLayoutRule[]
}
```

对应含义：

- `main`
  - 主正文区域如何避让
- `composer`
  - 输入区如何避让
- `obstacles`
  - 宿主固定元素如何避让

规则类型：

- `padding`
  - 给目标元素加 `padding-left/right`
- `margin`
  - 给目标元素加 `margin-left/right`
- `inset`
  - 直接改绝对定位元素的 `left/right`

这个模板的优点是非常具体：

- 站点适配只回答“改哪层”和“怎么改”
- `App` 不需要知道站点内部布局细节
- 比早期那种一堆 selector 字段更稳定、更容易维护

### 4.3 宿主页面样式注入

`src/components/App.tsx` 当前负责：

1. 根据 `panel.width`、`rail width`、gap 计算 `reserveWidth`
2. 写入 `--ophel-sidebar-reserve`
3. 根据 `SidebarLayoutRule` 生成 CSS
4. 注入到一个固定的 `<style id="gh-fixed-sidebar-layout">`

关键 helper：

- `cleanupFixedSidebarLayout`
- `buildSidebarLayoutRuleCss`
- `hasSidebarLayoutRules`

这是当前最值得复用的基础设施。

### 4.4 我们自己的 UI 布局

`MainPanel` 和 `QuickButtons` 已各自支持两个变体：

- legacy
- sidebar / rail

当前只是复用同一组件里的分支逻辑，尚未完全拆分。

关键文件：

- `src/components/MainPanel.tsx`
- `src/components/QuickButtons.tsx`

---

## 5. Yuanbao 当前有效的最小配置

当前 Yuanbao 的配置非常简单：

```ts
getSidebarLayoutConfig(): SidebarLayoutConfig {
  return {
    main: [
      {
        type: "inset",
        selectors: [".agent-dialogue__content-split-pane"],
      },
    ],
    composer: [
      {
        type: "padding",
        selectors: ["#search-bar"],
      },
    ],
  }
}
```

这套规则之所以有效，是因为：

- Yuanbao 的主对话可视区域真正由 `.agent-dialogue__content-split-pane` 控制
- 该层是绝对定位布局，适合直接改 `right`
- 输入区 `#search-bar` 是独立区域，适合单独加 `padding-right`

也就是说，Yuanbao 的成功关键不是“抓到了很多容器”，而是：

**抓到了真正决定主内容可视区的那一层。**

---

## 6. 这次试错过程中走过的弯路

这一部分非常重要。后续适配其他站点时，优先避免重蹈这些覆辙。

### 6.1 失败路线一：只改内层内容容器

早期尝试中，我们先给类似 `.agent-dialogue__content` 这样的内容容器加 `padding-right`。

问题：

- 这层不一定是最终决定主内容宽度/位置的层
- 如果正文真正的宽度和位置由更外层壳、CSS 变量或绝对定位层控制，那么只改内层容器会出现：
  - 内容还是被遮住
  - 左右留白异常
  - 只在内部缩窄，整体没有真正让开

结论：

- 内层内容容器通常不是第一优先级
- 优先找“主布局控制层”

### 6.2 失败路线二：同时修改多层嵌套容器

后面为了解决“还遮住”的问题，尝试过把同一份 `reserveWidth` 同时打到多层：

- `.yb-layout__content`
- `.agent-dialogue`
- `.agent-dialogue__content-wrapper`
- `.agent-dialogue__content`

结果：

- 同一笔让位在多层嵌套里重复叠加
- 主内容区域被压缩得过窄
- 右侧大面积空白
- 页面布局明显异常

结论：

- 一个站点里，真正应该动的“主层”通常只有 1 层
- 不要抱着“多打一层总会生效”的心态乱加 selector

### 6.3 失败路线三：修改根 CSS 变量

Yuanbao 还尝试过修改类似：

- `--hunyuan-chat-list-width`
- `--hunyuan-chat-list-max-width`

理论上这似乎能“整体收窄正文”，但实践里风险很高：

- 根变量经常影响多处布局
- 很难准确判断所有依赖它的地方
- 一旦叠加外层 `padding`，就很容易双重扣减
- 甚至可能直接把内容区打没

结论：

- 根变量改写不应作为主路径
- 只能作为最后的特殊补丁

### 6.4 失败路线四：改外层 layout shell

还尝试过直接改外层 `.yb-layout__content` 一类容器。

风险：

- 外层壳可能不仅承载正文，还承载整体页布局
- 改坏后会影响整页对齐、滚动、吸顶元素、工具条位置

结论：

- 除非确认该层就是正文主容器，否则不要优先动外层 shell

### 6.5 失败路线五：内容缩窄后继续居中

有一次看起来“右边还是遮住”，继续打补丁后发现左边距明显变大。

本质上是：

- 内容变窄了
- 但宿主布局仍按居中规则排版
- 所以并不是把内容整体推到左侧，而是左右同时留白

结论：

- 如果站点正文是绝对定位 / split pane，优先用 `inset`
- 这样比“缩窄后再让浏览器居中”可靠得多

---

## 7. 为什么当前方案有效

当前方案有效的原因可以总结成三点：

### 7.1 命中了真正的主布局控制层

不是去改内容块本身，而是改 `.agent-dialogue__content-split-pane`。

这类层通常有这些特征：

- `position: absolute`
- `left: 0; right: 0`
- 控制整个消息区域的可视宽度

这时直接改 `right`，相当于从布局层就把空间让出来。

### 7.2 输入区独立处理

正文和输入区往往不是同一个层级。

所以正确思路是：

- 主内容：单独规则
- 输入区：单独规则

不要假设“正文让位后输入区会自动对齐”。

### 7.3 不再试图用一个万能字段覆盖所有情况

旧结构把很多试错期能力都暴露成了字段：

- `contentSelectors`
- `insetSelectors`
- `variableSelectors`
- `pinContentToAvailableEdge`

这种设计的问题是：

- 容易把临时补丁当成正式能力
- 后续适配其他站点时，开发者会困惑到底该填哪个字段

现在的规则式模板更贴近真实问题：

- 目标层是谁
- 用什么方式让位

---

## 8. 后续适配其他站点的推荐方法

这一节是最重要的操作手册。

### 8.1 先判定站点属于哪一类

对新站点，先看正文主区域属于哪种布局：

1. 普通流式容器
2. 独立宽度容器（`max-width` / `margin: 0 auto`）
3. 绝对定位 pane / split pane
4. 根变量控制宽度
5. 多层 fixed / sticky 宿主布局

推荐优先级：

1. `inset`
2. `padding`
3. `margin`
4. 根变量补丁（尽量最后）

### 8.2 识别“真正主层”的方法

在 DevTools 里，不要先点内容文本，先沿着布局层往上看。

重点观察：

- 谁控制正文可视区宽度
- 谁控制左/右 inset
- 谁是 `position: absolute`
- 谁的变化会让整块消息区域一起移动

常见误判：

- 文本容器
- markdown 容器
- message item 列表容器
- 只是内部滚动容器

这些层大多数不是最终该动的层。

### 8.3 站点适配的推荐流程

建议严格按下面顺序：

1. 找主布局层
   - 优先确认能否用 `inset`
2. 找输入区层
   - 单独补 `padding`
3. 找宿主固定障碍物
   - 必要时放进 `obstacles`
4. 本地验证：
   - 面板收起
   - 面板展开
   - 左/右位置切换
   - 宽度变化
   - 页面加宽开/关
5. 最后才考虑站点特殊补丁

### 8.4 不建议的默认动作

以下动作不应作为默认选项：

- 同时修改多层容器
- 同时改外层壳 + 根变量 + 内层容器
- 先上“全局页面加 padding-right”
- 看到居中就先改 `margin-left/right`

这些都容易引发级联副作用。

---

## 9. 推荐的调试与验证清单

适配新站点时，至少逐项验证：

### 9.1 正常态

- 面板关闭时，页面布局和原站点一致
- 面板展开时，正文完全不被遮住
- 输入区完全不被遮住
- 宿主滚动条位置正常

### 9.2 边界态

- rail 在左侧
- rail 在右侧
- pane 宽度变大
- 页面加宽功能开启
- 窗口尺寸变窄

### 9.3 交互态

- 新会话
- 大纲跳转
- 设置弹窗
- 工具菜单弹出
- 面板展开/收起快速切换

### 9.4 失败症状与判断

症状：右侧仍被遮挡  
判断：主布局层没打中，或只改了内层容器

症状：左侧空白也明显变大  
判断：内容被缩窄后仍继续居中

症状：正文只剩一条窄列  
判断：让位被多层叠加扣减

症状：整页内容几乎消失  
判断：改坏了外层 shell 或根变量

症状：正文正常但输入区被遮  
判断：输入区不是主层的一部分，需要单独规则

---

## 10. 当前模板的局限与后续建议

### 10.1 当前模板已经足够做第二站点

对大多数站点，当前模板应该足够：

- `main`
- `composer`
- `obstacles`
- `type = inset | padding | margin`

这是当前阶段最合理的复杂度。

### 10.2 暂时不要重新引入根变量补丁

除非未来明确遇到某个站点：

- 主正文完全由变量控制
- 又不存在更可靠的主布局层

否则不要把“变量覆盖”重新加回模板主路径。

### 10.3 未来可做的进一步整理

后续可以继续优化：

1. 把 `buildSidebarLayoutRuleCss` 提取到独立模块
2. 把固定侧边栏布局注入 effect 抽成 hook
3. 将 `MainPanel` / `QuickButtons` 的 legacy 与 sidebar 分支拆组件
4. 删除旧实验阶段遗留的无用注释和状态分支

但这些都应在“当前效果稳定”基础上做，而不是现在立刻大拆。

---

## 11. 推荐的下一步实施顺序

建议严格按这个顺序继续：

1. 保持当前模板不变
2. 优化 rail / pane 的交互与 UI
3. 选第二个站点适配
4. 复用本文流程做 selector 分析与规则落地
5. 每适配完一个站点，都把经验追加到本文或拆分站点文档

---

## 12. 一句话经验总结

固定侧边栏适配的关键，不是“给页面加右边距”，而是：

**找到真正控制正文可视区的主布局层，并只在那一层做最小必要改动。**

对于 Yuanbao，这个层是：

- `.agent-dialogue__content-split-pane`

对于其他站点，也应始终先回答这个问题：

**“谁才是这个站点真正的主布局层？”**
