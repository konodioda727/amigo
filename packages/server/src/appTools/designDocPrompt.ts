export const DESIGN_DOC_V3_SYSTEM_PROMPT_APPENDIX = `
Design Doc v3 填写指南：

当任务涉及页面、组件、布局或视觉样式时，先产出 design doc v3，再写代码。

如果该页面已经存在 design doc：
1. 先使用 readDesignDoc 读取现有 content。
2. 先判断这次需求属于“局部修改”还是“整稿重写”。
3. 如果只是局部 section、局部 node、局部文案、局部样式或少量 token 变更，必须优先使用 editDesignDoc + startLine/endLine 做局部替换；行号以 content 中的行号为准。
4. 如果判断必须整稿重写，先向用户说明为什么不能局部修改，并征求用户意见；在用户明确同意前，不要整份重写设计稿。
5. 局部修改时，保持 page、section id、node id 稳定，不要无意义重命名。

v3 只保留 3 个根字段：
1. page
2. designTokens
3. sections

这不是产品说明文档，也不是创意 brief。
这是可直接映射到 Penpot 和代码的设计稿数据。

最重要的要求：
1. 所有 node 的 x/y/width/height 必须是最终布局结果。
2. 不要把多个同层节点都写成 x=0、y=0，除非它们真的重叠。
3. layout 只用于解释布局逻辑，不能代替最终坐标。
4. 即使 section 使用 stack 或 grid，也必须把每个 node 的最终位置展开写出来。
5. node.x 和 node.y 表示相对父容器的最终坐标；section 顶层 node 相对 section 左上角。

字段填写顺序：
1. page
2. designTokens
3. sections

字段填写要求：
1. page
   - name: 页面名称
   - path: 路由，可选
   - width: 画布宽度，number，例如 1440
   - minHeight: 页面最小高度，number，例如 2400
   - background: 页面背景色，十六进制颜色

2. designTokens
   - colors: 颜色 token，值全部用十六进制颜色
   - spacing: 间距 token，值全部用 number
   - radius: 圆角 token，值全部用 number
   - typography: 字体 token，每项包含 fontFamily/fontSize/fontWeight/lineHeight
   - lineHeight 使用最终像素值整数，例如 24、32、72，不要写 1.2、1.5 这类倍率，也不要写 24.5 这类小数

3. sections
   - sections 是从上到下排列的页面区块
   - 每个 section 必须包含 id/name/kind/y/height/layout/nodes
   - y 和 height 必须是最终数值，不能留空
   - layout.mode 只填写 absolute、stack、grid
   - layout.direction 只填写 horizontal、vertical
   - layout.alignX 和 layout.alignY 只填写 start、center、end、stretch
   - layout.padding 写成 { top, right, bottom, left }，四个值都用 number

4. nodes
   - 每个 node 都必须能直接映射到设计工具
   - 必填 id/name/type/x/y/width/height
   - type 只使用 container、text、button、image、shape
   - 如果需要图层顺序，填写 zIndex，number 越大越在上层
   - 只有 section 使用 nodes 数组；node 自己不能写 nodes
   - 如果 container 或其他 node 需要包含子节点，使用 children 数组，不要写 nodes
   - text/button 节点填写真实 text
   - image 节点填写 assetUrl；没有真实素材时也要填占位 URL；如果图片展示方式重要，填写 imageFit，值只填 cover、contain、fill
   - shape 节点如果形状重要，填写 shapeKind，值只填 rect、ellipse、line
   - style 只能填写这些字段：fill、fills、stroke、radius、opacity、textColor、fontToken、fontSize、fontWeight、align、shadow
   - 文本对齐只能使用 style.align，值只填 left、center、right；不要写 textAlign
   - style.fill 也填写对象，例如 { "type": "solid", "color": "#B9924C", "opacity": 1 }
   - style.stroke 也填写对象，例如 { "color": "#2A2F36", "width": 1, "opacity": 1 }
   - style.shadow 也填写对象，例如 { "x": 0, "y": 12, "blur": 32, "color": "#000000", "opacity": 0.18 }
   - style.fill.color 使用十六进制颜色

输出前自检：
1. 根字段是否只有 page、designTokens、sections
2. 所有 number 字段是否都使用数值
3. 所有颜色是否都是十六进制
4. 每个 section 是否都有 y 和 height
5. 每个 node 是否都有最终 x/y/width/height
6. 同一父容器下的兄弟节点是否根据布局要求被展开到不同位置，而不是全部堆在左上角
7. text/button/image 节点是否都填了真实可展示内容
8. style.fill 是否使用对象，fill.color 是否为十六进制
9. typography.lineHeight 是否全部使用整数像素值，而不是倍率或小数
10. 如果是已有设计稿迭代，这次修改是否应该走 startLine/endLine 局部替换，而不是整份重写
11. 如果判断必须整稿重写，是否已经先向用户说明原因并得到同意
`.trim();

export const DESIGN_DOC_V3_USER_PROMPT_TEMPLATE = `
请先生成一个可执行的 design doc v3，再继续后续实现。

要求：
1. 直接输出 JSON object。
2. 根字段只能有 page、designTokens、sections。
3. 这是给 Penpot 和代码消费的设计稿，不是页面说明文案。
4. 所有 x/y/width/height 都必须是最终布局结果。
5. 即使使用 stack 或 grid，也必须把每个 node 的最终位置展开写出来。
6. 不要让同层多个节点默认都落在 x=0、y=0。
7. 所有尺寸、坐标、字号、间距、圆角都使用 number。
8. typography.lineHeight 也使用最终整数像素值，例如 24、32、72，不要写 1.2、1.5 这类倍率，也不要写 24.5 这类小数。
9. 所有颜色使用十六进制。
10. sections 里的每个 node 都要能直接画到设计工具里。
11. layout.mode 只填 absolute、stack、grid。
12. layout.direction 只填 horizontal、vertical。
13. layout.padding 如果需要，写成 { "top": 0, "right": 0, "bottom": 0, "left": 0 }。
14. 如果需要填充色，style.fill 写成对象，例如 { "type": "solid", "color": "#B9924C", "opacity": 1 }。
15. style 只能使用这些键：fill、fills、stroke、radius、opacity、textColor、fontToken、fontSize、fontWeight、align、shadow。
16. 如果需要阴影，style.shadow 必须写成对象，例如 { "x": 0, "y": 12, "blur": 32, "color": "#000000", "opacity": 0.18 }，不能直接写字符串。
17. 文本对齐只能写 style.align，不能写 textAlign。
18. 只有 section 才能写 nodes；普通 node 如果需要嵌套子节点，使用 children。
19. 如果需要描边，style.stroke 必须写成对象，不能直接写字符串颜色。
20. 如果需要图层顺序，写 zIndex。
21. image 节点如果展示方式重要，写 imageFit，值只填 cover、contain、fill。
22. shape 节点如果形状重要，写 shapeKind，值只填 rect、ellipse、line。

请按照这个结构填写：
{
  "page": {
    "name": "页面名称",
    "path": "/optional-path",
    "width": 1440,
    "minHeight": 2400,
    "background": "#0B0D10"
  },
  "designTokens": {
    "colors": {
      "bg": "#0B0D10",
      "surface": "#13171C",
      "text": "#F5F7FA",
      "muted": "#98A2B3",
      "accent": "#6EE7F2"
    },
    "spacing": {
      "xs": 8,
      "sm": 12,
      "md": 16,
      "lg": 24,
      "xl": 40,
      "2xl": 64
    },
    "radius": {
      "sm": 8,
      "md": 16,
      "lg": 24,
      "full": 999
    },
    "typography": {
      "display": {
        "fontFamily": "Inter",
        "fontSize": 64,
        "fontWeight": 700,
        "lineHeight": 72
      },
      "heading": {
        "fontFamily": "Inter",
        "fontSize": 40,
        "fontWeight": 600,
        "lineHeight": 48
      },
      "body": {
        "fontFamily": "Inter",
        "fontSize": 16,
        "fontWeight": 400,
        "lineHeight": 24
      },
      "button": {
        "fontFamily": "Inter",
        "fontSize": 16,
        "fontWeight": 500,
        "lineHeight": 24
      }
    }
  },
  "sections": [
    {
      "id": "hero",
      "name": "Hero",
      "kind": "hero",
      "y": 0,
      "height": 760,
      "background": "#0B0D10",
      "layout": {
        "mode": "absolute",
        "padding": {
          "top": 0,
          "right": 0,
          "bottom": 0,
          "left": 0
        }
      },
      "nodes": [
        {
          "id": "hero-title",
          "name": "Hero Title",
          "type": "text",
          "x": 120,
          "y": 120,
          "width": 640,
          "height": 160,
          "zIndex": 2,
          "text": "Write the actual headline here",
          "style": {
            "textColor": "#F5F7FA",
            "fontToken": "display",
            "align": "left"
          }
        },
        {
          "id": "hero-subtitle",
          "name": "Hero Subtitle",
          "type": "text",
          "x": 120,
          "y": 312,
          "width": 560,
          "height": 72,
          "text": "Write the supporting copy here",
          "style": {
            "textColor": "#98A2B3",
            "fontToken": "body",
            "align": "left"
          }
        },
        {
          "id": "hero-primary-cta",
          "name": "Primary CTA",
          "type": "button",
          "x": 120,
          "y": 424,
          "width": 220,
          "height": 56,
          "zIndex": 2,
          "text": "Get Started",
          "style": {
            "fill": {
              "type": "solid",
              "color": "#6EE7F2",
              "opacity": 1
            },
            "stroke": {
              "color": "#0B0D10",
              "width": 1,
              "opacity": 0.12
            },
            "textColor": "#0B0D10",
            "fontToken": "button",
            "radius": 16
          }
        },
        {
          "id": "hero-visual",
          "name": "Hero Visual",
          "type": "image",
          "x": 820,
          "y": 100,
          "width": 480,
          "height": 560,
          "zIndex": 1,
          "assetUrl": "https://example.com/placeholder-hero.png",
          "imageFit": "cover",
          "style": {
            "radius": 24
          }
        },
        {
          "id": "hero-copy-group",
          "name": "Hero Copy Group",
          "type": "container",
          "x": 120,
          "y": 120,
          "width": 640,
          "height": 360,
          "children": [
            {
              "id": "hero-copy-title",
              "name": "Hero Copy Title",
              "type": "text",
              "x": 0,
              "y": 0,
              "width": 640,
              "height": 160,
              "text": "Write the actual headline here",
              "style": {
                "textColor": "#F5F7FA",
                "fontToken": "display",
                "align": "left"
              }
            }
          ]
        }
      ]
    }
  ]
}
`.trim();
