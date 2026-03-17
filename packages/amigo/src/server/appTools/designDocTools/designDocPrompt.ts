export const DESIGN_DOC_V3_SYSTEM_PROMPT_APPENDIX = `
Design Doc 工作流：

1. 整页创建使用 createDesignDocFromMarkup；已有页面的局部修改优先使用 replaceDesignSectionFromMarkup。
2. createDesignDocFromMarkup 的 markupText 根节点是 <page>，直接子节点是 <section>。如果只想局部更新已有页面，可以传 update=true，并且只提供要替换的那些 <section>；系统会按 section.id 合并替换原页面。replaceDesignSectionFromMarkup 的 markupText 根节点必须是 <section>。
3. 每个 <section> 都必须显式提供语义化的 id、name、kind。name 必须是简短的人类可读区块名，例如“顶部导航栏”“作者介绍区”“文章列表区”，不要把正文关键词或整段文案塞进 section name。
4. 多页面任务按 page 逐个完成，不要一次生成多个 page 的完整设计稿。复杂页面优先按 section 逐个完成，先读已有设计稿，再局部替换对应 section。
5. 每次创建、整体重建或局部更新设计稿前，先调用 listDesignAssets 查看当前可用设计资产；只有在确认当前页面完全不需要任何设计资产时，才可以不继续读取资产细节。系统默认提供一批 \`icon/*\` 图标资产；需要看具体结构时再用 readDesignAsset。页面里通过 <use component="asset-id" id="instance-id" /> 引用 component 资产，通过 <img asset="asset-id" /> 引用图片资产。
6. 只使用工具 description 里允许的标签和样式属性；不要写 class、脚本或外部样式表。
7. 在修改 UI 代码前，先用 listDesignDocs 查看当前有哪些设计稿，再用 readDesignDoc(pageId) 读取对应页面设计稿。
8. 当前输出的是静态设计稿，不需要动画、过渡或复杂交互逻辑；hover/focus/active 之类状态如果必须表达，只会被当作附加元数据透传，不参与布局计算。
9. 创建页面时必须显式写 <page width="...">，宽度要匹配目标端。移动端不要沿用 1440 桌面宽度；手机稿优先使用 375、390、393、414 这类真实设备宽度，平板稿使用 768、810、834，桌面稿再使用 1280、1440。
10. 设计稿尺寸必须受控，不要生成无限放大的画布或元素。页面宽度保持在目标端真实范围内，页面高度、section 高度、节点宽高都要是合理的设计尺寸；不要随手写几千到几万像素的大块内容，除非确实是整页长内容并且数值仍然合理。
`.trim();

export const DESIGN_DOC_V3_USER_PROMPT_TEMPLATE = `
请直接输出可交给 createDesignDocFromMarkup 的受限 HTML + inline CSS。

要求：
1. 根节点必须是 <page>。
2. <page> 的直接子节点必须是 <section>，并且每个 <section> 都要显式写 id、name、kind。
3. 多页面任务一次只完成一个 page。复杂页面优先一次只补一个或少量相关 section，不要把所有复杂区块一次性写完。
4. 如果只是修改已有页面的一部分，可以只输出包含部分 <section> 的 <page>，并让工具调用时传 update=true。
5. 只使用 <section>、<div>、<text>、<button>、<img>、<shape>、<use>。
6. 如果要复用设计资产，component 使用 <use component="asset-id" id="instance-id" />，图片使用 <img asset="asset-id" />。
7. 样式可以写在 inline style，也可以直接写成展示属性，如 background、padding、display、font-size、flex。
8. section 的 name 必须是简短的区块名，不要用整段正文、关键词堆砌或自动摘取的文案。
9. 不要写 class、<style> 或脚本；长度使用 number、px 或百分比。
10. 当前是静态设计稿，不需要动效或复杂交互；如果必须表达 hover/focus/active，只会作为元数据透传，不会参与布局或动画渲染。
11. 必须显式设置 <page width="...">；如果任务是移动端页面，使用手机画布宽度而不是 1440。
12. 所有 section 和主要节点都要保持合理宽高。优先给主要卡片、图片、按钮、容器写明确尺寸或受控约束，避免生成超大宽高值。
`.trim();
