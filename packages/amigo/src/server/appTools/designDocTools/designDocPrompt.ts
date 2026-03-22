export const DESIGN_DOC_V3_SYSTEM_PROMPT_APPENDIX = `
Design Doc 工作流：

1. createDesignDocFromMarkup 用于创建或扩展页面设计稿；replaceDesignSectionFromMarkup 用于修改已有页面中的单个 section。createDesignDocFromMarkup 不等于必须一次提交完整页。
2. 根节点规则：createDesignDocFromMarkup 的 markupText 根节点必须是 <page>，直接子节点必须是 <section>；replaceDesignSectionFromMarkup 的 markupText 根节点必须是 <section>。如果对已有页面做局部更新，可以给 createDesignDocFromMarkup 传 update=true，并且只提供要替换的那些 <section>。
3. 复杂页面默认按 section 逐个推进。首次创建时，默认先提交 1 个 section 或一组必须同屏联动的少量强耦合 section，不要先列全量 section 再一次性提交整页。多页面任务按 page 逐个完成。
4. 可以先生成页面骨架，但骨架不是完成状态。凡是这轮已经放进 page 的 section，都必须继续细化到有真实内容层级、卡片结构和可用布局；不要只生成框架、导航占位或 section 列表就结束，除非用户明确只要 wireframe / outline。
5. 每个 <section> 都必须显式提供语义化的 id、name、kind。name 必须是简短的人类可读区块名。section 的输出顺序、宽度、高度、左右占位、上下衔接、版心和留白都必须反映它在真实页面中的位置。
6. 布局规则：section 只能作为 <page> 的直接子节点，不要把 section 嵌套进别的 section 或 div。页面的左右分栏、卡片网格、导航与内容并排等关系，应当放在某个顶层 section 内用 div + flex / grid 表达；不要使用 float、fixed、sticky 之类当前编译器不支持的页面布局语法。
7. 资产规则：创建、整体重建或局部更新设计稿前，先调用 listDesignAssets 查看当前可用设计资产。图标、插画、品牌图形和可复用视觉元素统一优先使用 design assets；缺失时先补 design assets，再在页面里通过 <use component="..."> 或 <img asset="..."> 引用。不要使用 SVG，包括内联 <svg>、path、多边形或手写矢量图标。
8. 只使用工具 description 里允许的标签和样式属性；不要写 class、脚本或外部样式表。当前输出的是静态设计稿，不需要动画、过渡或复杂交互逻辑；hover/focus/active 之类状态如果必须表达，只会被当作附加元数据透传，不参与布局计算。
9. 创建页面时必须显式写 <page width="...">，宽度要匹配目标端。移动端不要沿用 1440 桌面宽度；手机稿优先使用 375、390、393、414，平板稿使用 768、810、834，桌面稿再使用 1280、1440。
10. 设计稿尺寸必须受控。页面宽度保持在目标端真实范围内，页面高度、section 高度、节点宽高都要是合理的设计尺寸；不要生成超大画布、超长 section 或离谱节点尺寸。
`.trim();

export const DESIGN_DOC_V3_USER_PROMPT_TEMPLATE = `
请直接输出可交给 createDesignDocFromMarkup 的受限 HTML + inline CSS。

要求：
1. 根节点必须是 <page>。
2. <page> 的直接子节点必须是 <section>，并且每个 <section> 都要显式写 id、name、kind。
3. 复杂页面不要一次写完整页。首次创建时，默认只提交 1 个 section 或一组强耦合 section；多页面任务一次只完成一个 page。
4. 如果这一步先输出页面骨架或大纲，那么骨架不是终点；这一步已经放进 page 的所有 section 都必须细化到有真实结构和可用内容。只有用户明确说只要线框或大纲时，才可以停在这里。
5. 每个 section 都要按它在页面中的真实位置摆放。section 的顺序、宽度、高度、左右占位、上下留白和与其他 section 的衔接关系必须正确。
6. section 只能是 <page> 的直接子节点。不要把 section 嵌套进别的 section 或 div；左右分栏、侧边栏和主内容并排等布局，请在某个顶层 section 内用 div + flex / grid 组织，不要写 float、fixed、sticky。
7. 如果只是修改已有页面的一部分，可以只输出包含部分 <section> 的 <page>，并让工具调用时传 update=true。
8. 只使用 <section>、<div>、<text>、<button>、<img>、<shape>、<use>。
9. 如果要复用设计资产，component 使用 <use component="asset-id" id="instance-id" />，图片使用 <img asset="asset-id" />。不要使用 SVG，包括内联 <svg> 或任何手写矢量图标。
10. 样式可以写在 inline style，也可以直接写成展示属性，如 background、padding、display、font-size、flex。
11. section 的 name 必须是简短的区块名，不要用整段正文、关键词堆砌或自动摘取的文案。
12. 不要写 class、<style> 或脚本；长度使用 number、px 或百分比。当前是静态设计稿，不需要动效或复杂交互；如果必须表达 hover/focus/active，只会作为元数据透传，不会参与布局或动画渲染。
13. 必须显式设置 <page width="...">；如果任务是移动端页面，使用手机画布宽度而不是 1440。
14. 所有 section 和主要节点都要保持合理宽高。优先给主要卡片、图片、按钮、容器写明确尺寸或受控约束，避免生成超大宽高值。
`.trim();
