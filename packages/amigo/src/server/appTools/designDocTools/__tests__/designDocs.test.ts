import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolExecutionContext } from "@amigo-llm/types";
import { setGlobalState } from "../../../../../../backend/src/globalState";
import {
  listDesignAssetsTool,
  readDesignAssetTool,
  upsertStoredDesignAsset,
  upsertStoredDesignComponent,
} from "../designAssets";
import {
  createDesignDocFromMarkupTool,
  listDesignDocsTool,
  readDesignDocTool,
  readStoredDesignDoc,
  writeStoredDesignDoc,
} from "../designDocs";
import { compileDesignDocFromMarkup } from "../designMarkupCompiler";
import { writePenpotBinding } from "../penpotBindings";
import { syncDesignDocToPenpot } from "../penpotSync";

const createContext = (taskId = "task-1"): ToolExecutionContext =>
  ({ taskId }) as ToolExecutionContext;

const createMarkup = () =>
  `
<page name="暗黑博客" path="/" width="1200" min-height="1200" style="background:#121212">
  <section id="header-section" name="头部导航栏" kind="header" style="height:80px;padding:16px 32px;display:flex;flex-direction:row;justify-content:space-between;align-items:center;background:#121212">
    <text id="logo" style="font-size:28px;font-weight:700;color:#6366F1">DarkBlog</text>
    <div id="nav" style="display:flex;flex-direction:row;gap:20px">
      <text id="nav-home" style="font-size:16px;color:#E2E8F0">首页</text>
      <text id="nav-about" style="font-size:16px;color:#94A3B8">关于</text>
    </div>
  </section>
  <section id="hero-section" name="Hero区域" kind="content" style="padding:48px 32px;display:flex;flex-direction:column;gap:20px;background:#121212">
    <text id="hero-title" style="font-size:48px;font-weight:700;line-height:56px;color:#FFFFFF">Hi, I'm Alex</text>
    <text id="hero-subtitle" style="font-size:24px;line-height:32px;color:#94A3B8">全栈开发者 | 技术写作者</text>
    <button id="hero-cta" style="width:160px;height:48px;background:#3B82F6;color:#FFFFFF;border-radius:8px;font-size:16px;font-weight:600">查看我的文章</button>
  </section>
  <section id="posts-section" name="文章列表区域" kind="content" style="padding:40px 32px;display:flex;flex-direction:column;gap:24px;background:#121212">
    <text id="posts-title" style="font-size:36px;font-weight:700;color:#FFFFFF">最新文章</text>
    <div id="post-card-1" style="width:100%;padding:24px;background:#1E1E2E;border:1px solid #313244;border-radius:12px;display:flex;flex-direction:column;gap:8px">
      <text id="post-title-1" style="font-size:28px;font-weight:600;color:#C678DD">前端性能优化实战</text>
      <text id="post-meta-1" style="font-size:14px;color:#6C7086">2026-03-10 · 前端 · 8分钟阅读</text>
      <text id="post-excerpt-1" style="font-size:16px;line-height:24px;color:#CDD6F4">本文详细讲解了现代 Web 应用中的性能瓶颈和针对性的优化策略。</text>
    </div>
  </section>
  <section id="footer-section" name="底部信息栏" kind="footer" style="padding:32px;display:flex;flex-direction:column;gap:8px;background:#121212">
    <text id="footer-copy" style="font-size:14px;color:#94A3B8">© 2026 Alex. All rights reserved.</text>
  </section>
</page>
`.trim();

const createBareAttrMarkup = () =>
  `
<page name="暗黑风格个人博客" background="#121212" width="1440">
  <section id="content-section" name="主内容区" display="flex" gap="48px" padding="48px 64px">
    <div id="posts-column" flex="3" display="flex" flex-direction="column" gap="24px">
      <text id="posts-title" font-size="24px" font-weight="600" color="#ffffff">最新文章</text>
      <div id="post-card" background="#1e1e1e" padding="24px" border-radius="8px" border="1px solid #333" display="flex" flex-direction="column" gap="12px">
        <text id="post-title" font-size="20px" font-weight="600" color="#ffffff">React 18 并发渲染实战指南</text>
      </div>
    </div>
    <div id="sidebar-column" flex="1" display="flex" flex-direction="column" gap="24px">
      <div id="author-card" background="#1e1e1e" padding="24px" border-radius="8px" border="1px solid #333" display="flex" flex-direction="column" align-items="center" gap="12px">
        <shape id="avatar" type="circle" width="80px" height="80px" background="#bb86fc"></shape>
        <text id="author-name" font-size="18px" font-weight="600" color="#ffffff">Amigo</text>
      </div>
    </div>
  </section>
</page>
`.trim();

describe("design doc markup flow", () => {
  let tempStorageRoot = "";
  let tempCacheRoot = "";

  beforeEach(() => {
    tempStorageRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-design-doc-storage-"));
    tempCacheRoot = mkdtempSync(path.join(os.tmpdir(), "amigo-design-doc-cache-"));
    setGlobalState("globalStoragePath", tempStorageRoot);
    setGlobalState("globalCachePath", tempCacheRoot);
  });

  afterEach(() => {
    rmSync(tempStorageRoot, { recursive: true, force: true });
    rmSync(tempCacheRoot, { recursive: true, force: true });
  });

  it("compiles restricted markup into a valid design doc", () => {
    const compiled = compileDesignDocFromMarkup(createMarkup());

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.page.name).toBe("暗黑博客");
    expect(compiled.document?.sections).toHaveLength(4);
    expect(compiled.document?.sections[0]?.nodes[1]).toMatchObject({
      id: "nav",
      type: "container",
    });
    expect(compiled.document?.sections[0]?.nodes[1]?.x).toBeGreaterThan(500);
    expect(compiled.document?.sections[2]?.nodes[1]).toMatchObject({
      id: "post-card-1",
      type: "container",
      width: 1136,
    });
    expect(compiled.document?.sections[2]?.nodes[1]?.style).toMatchObject({
      radius: 12,
    });
  });

  it("measures CJK navigation and brand text without collapsing widths", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="中文博客" width="1440" background="#FFFFFF">
        <section
          id="header"
          name="头部导航"
          kind="header"
          style="height:108px;padding:24px 48px;display:flex;flex-direction:row;justify-content:space-between;align-items:center"
        >
          <div id="brand" style="display:flex;flex-direction:row;align-items:center;gap:12px">
            <shape id="brand-mark" type="circle" width="48" height="48" background="#10B981"></shape>
            <text id="brand-name" style="font-size:48px;font-weight:700;color:#111827">青柠博客</text>
          </div>
          <div id="nav" style="display:flex;flex-direction:row;align-items:center;gap:32px">
            <text id="nav-home" style="font-size:16px;color:#10B981">首页</text>
            <text id="nav-categories" style="font-size:16px;color:#6B7280">文章分类</text>
            <text id="nav-about" style="font-size:16px;color:#6B7280">关于我</text>
            <text id="nav-board" style="font-size:16px;color:#6B7280">留言板</text>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const sectionNodes = compiled.document?.sections[0]?.nodes || [];
    const brand = sectionNodes.find((node) => node.id === "brand");
    const nav = sectionNodes.find((node) => node.id === "nav");
    const brandName = brand?.children?.find((node) => node.id === "brand-name");
    const navHome = nav?.children?.find((node) => node.id === "nav-home");
    const navCategories = nav?.children?.find((node) => node.id === "nav-categories");

    expect(brandName?.width).toBeGreaterThanOrEqual(180);
    expect(brand?.width).toBeGreaterThanOrEqual(240);
    expect(navHome?.width).toBeGreaterThanOrEqual(30);
    expect(navCategories?.width).toBeGreaterThanOrEqual(60);
    expect(nav?.width).toBeGreaterThanOrEqual(220);
  });

  it("stores text nodes as fixed text boxes", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="文本尺寸规则" width="1200" background="#FFFFFF">
        <section id="hero" name="Hero区" kind="hero" style="padding:32px">
          <text id="title-auto" style="font-size:32px;font-weight:700;color:#111827">自动宽度标题</text>
          <text id="title-fixed" style="width:320px;font-size:32px;font-weight:700;color:#111827">固定宽度标题</text>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const nodes = compiled.document?.sections[0]?.nodes || [];
    const autoText = nodes.find((node) => node.id === "title-auto");
    const fixedText = nodes.find((node) => node.id === "title-fixed");

    expect(autoText?.props?.textGrowType).toBe("fixed");
    expect(fixedText?.props?.textGrowType).toBe("fixed");
  });

  it("treats plain-text div and li elements as text nodes", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="语义文本页" width="1200" background="#FFFFFF">
        <section id="header" name="头部导航" kind="header" style="padding:24px 32px;display:flex;justify-content:space-between;align-items:center">
          <div id="brand" style="font-size:24px;font-weight:700;color:#2C7A7B">小森林博客</div>
          <ul id="nav" style="display:flex;gap:24px;margin:0;padding:0">
            <li id="nav-home" style="font-size:16px;color:#4A5568">首页</li>
            <li id="nav-about" style="font-size:16px;color:#4A5568">关于我</li>
          </ul>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const nodes = compiled.document?.sections[0]?.nodes || [];
    expect(nodes[0]).toMatchObject({
      id: "brand",
      type: "text",
      text: "小森林博客",
      style: {
        textColor: "#2C7A7B",
        fontSize: 24,
        fontWeight: 700,
      },
    });
    expect(nodes[1]?.children?.[0]).toMatchObject({
      id: "nav-home",
      type: "text",
      text: "首页",
    });
  });

  it("lets explicit heading styles override raw tag defaults", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="标题样式页" width="1200" background="#FFFFFF">
        <section id="content" name="内容区" kind="content" style="padding:32px">
          <h3 id="card-title" style="font-size:18px;font-weight:600;color:#2D3748">标题</h3>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "card-title",
      type: "text",
      style: {
        fontSize: 18,
        fontWeight: 600,
        textColor: "#2D3748",
      },
    });
  });

  it("inherits section text alignment for direct text and centers intrinsic buttons", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Center Hero" width="1200" background="#F8FFF9">
        <section
          id="hero"
          name="Hero区"
          kind="hero"
          style="padding:64px 32px;background:linear-gradient(135deg,#e6fffa 0%,#f0fff4 100%);text-align:center"
        >
          <h1 id="hero-title" style="font-size:40px;font-weight:700;color:#2D3748">记录生活与思考的小角落</h1>
          <button id="hero-cta" style="padding:12px 32px;background:#48BB78;color:white;border-radius:24px;font-size:16px">
            浏览所有文章
          </button>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const nodes = compiled.document?.sections[0]?.nodes || [];
    expect(compiled.document?.sections[0]?.background).toBe("#F0FFF4");
    expect(nodes[0]).toMatchObject({
      id: "hero-title",
      type: "text",
      style: {
        align: "center",
      },
      props: {
        textGrowType: "fixed",
      },
    });
    expect(nodes[1]?.type).toBe("button");
    expect((nodes[1]?.width || 0) < 400).toBe(true);
    expect((nodes[1]?.x || 0) > 300).toBe(true);
  });

  it("promotes boxed text pills into container plus text child", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="标签页" width="1200" background="#FFFFFF">
        <section id="content" name="内容区" kind="content" style="padding:32px">
          <span
            id="tag-reading"
            style="display:inline-block;padding:4px 12px;background-color:#FEF3C7;color:#92400E;border-radius:999px;font-size:12px"
          >
            读书感悟
          </span>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const pill = compiled.document?.sections[0]?.nodes[0];
    expect(pill).toMatchObject({
      id: "tag-reading",
      type: "container",
      style: {
        fill: {
          type: "solid",
          color: "#FEF3C7",
        },
        radius: 999,
      },
    });
    expect(pill?.children?.[0]).toMatchObject({
      type: "text",
      text: "读书感悟",
      style: {
        textColor: "#92400E",
        fontSize: 12,
        align: "center",
      },
      props: {
        textGrowType: "auto-height",
      },
    });
    expect((pill?.children?.[0]?.y || 0) > 4).toBe(true);
  });

  it("defaults boxed text pill labels to dark centered text when color is omitted", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="默认标签页" width="1200" background="#FFFFFF">
        <section id="content" name="内容区" kind="content" style="padding:32px">
          <span
            id="tag-cloud"
            style="padding:4px 12px;background-color:#DBEAFE;border-radius:999px;font-size:12px"
          >
            云原生
          </span>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const label = compiled.document?.sections[0]?.nodes[0]?.children?.[0];
    expect(label).toMatchObject({
      type: "text",
      style: {
        textColor: "#111111",
        align: "center",
      },
      props: {
        textGrowType: "auto-height",
      },
    });
  });

  it("preserves rgba background opacity for boxed text pills", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="透明标签页" width="1200" background="#FFFFFF">
        <section id="content" name="内容区" kind="content" style="padding:32px">
          <span
            id="tag-frontend"
            style="padding:4px 12px;background:rgba(99, 102, 241, 0.2);color:#6366f1;border-radius:20px;font-size:12px;font-weight:600"
          >
            前端
          </span>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const pill = compiled.document?.sections[0]?.nodes[0];
    expect(pill?.style?.fill).toMatchObject({
      type: "solid",
      color: "#6366F1",
      opacity: 0.2,
    });
    expect(pill?.children?.[0]).toMatchObject({
      type: "text",
      style: {
        textColor: "#6366F1",
        align: "center",
      },
    });
  });

  it("promotes boxed plain div text into a badge container with a text child", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="加号标签页" width="375" background="#0F172A">
        <section id="content" name="内容区" kind="content">
          <div id="plus" style="width:24px;height:24px;background:#FE2C55;border-radius:999px;font-size:18px">+</div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "plus",
      type: "container",
      style: {
        fill: {
          type: "solid",
          color: "#FE2C55",
        },
        radius: 999,
      },
      children: [
        {
          id: "plus-label",
          type: "text",
          text: "+",
          style: {
            textColor: "#111111",
            fontSize: 18,
            align: "center",
          },
          props: {
            textGrowType: "auto-height",
          },
        },
      ],
    });
  });

  it("normalizes plain text div blocks into text nodes instead of 1px containers", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="文本块页面" width="375" background="#0F172A">
        <section id="content" name="内容区" kind="content">
          <div id="username" style="font-size:15px;font-weight:600;margin-bottom:8px">@抖音用户</div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "username",
      type: "text",
      text: "@抖音用户",
      style: {
        fontSize: 15,
        fontWeight: 600,
      },
    });
    expect((compiled.document?.sections[0]?.nodes[0]?.height || 0) > 1).toBe(true);
  });

  it("rejects unsupported tags early", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Broken">
        <table></table>
      </page>
    `);

    expect(compiled.document).toBeNull();
    expect(compiled.errors[0]).toContain("不支持的标签");
  });

  it("rejects escaped markup early", () => {
    const compiled = compileDesignDocFromMarkup(`
      &lt;page name="Broken"&gt;
        &lt;section id="hero" name="Hero" kind="hero"&gt;&lt;/section&gt;
      &lt;/page&gt;
    `);

    expect(compiled.document).toBeNull();
    expect(compiled.errors[0]).toContain("不能是转义后的 HTML");
  });

  it("rejects unknown style properties inside inline style declarations", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Broken">
        <section id="hero" name="Hero" kind="hero">
          <text id="title" style="clip-path:circle(50%);overflow:hidden;box-sizing:border-box">Hello</text>
        </section>
      </page>
    `);

    expect(compiled.document).toBeNull();
    expect(compiled.errors[0]).toContain("style 不支持的属性: clip-path");
  });

  it("rejects unsupported presentational attributes early", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Broken">
        <section
          id="hero"
          name="Hero"
          kind="hero"
          writing-mode="vertical-rl"
        >
          <text id="title">Hello</text>
        </section>
      </page>
    `);

    expect(compiled.document).toBeNull();
    expect(compiled.errors.join(" | ")).toContain("不支持的属性");
    expect(compiled.errors.join(" | ")).toContain("writing-mode");
  });

  it("supports margin shorthand including auto centering", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Centered Page" width="1440" background="#121212">
        <section id="content" name="内容区" kind="content" padding="40 0">
          <div id="panel" width="800" margin="0 auto" padding="24" background="#1e1e1e">
            <text id="title" font-size="24" color="#ffffff">Centered Panel</text>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const panel = compiled.document?.sections[0]?.nodes[0];
    expect(panel).toMatchObject({
      id: "panel",
      type: "container",
      width: 800,
    });
    expect((panel?.x || 0) > 250).toBe(true);
  });

  it("preserves section x and width for centered content regions", async () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Centered Sections" width="1440" background="#FFFFFF">
        <section
          id="header"
          name="头部导航"
          kind="header"
          style="width:100%;max-width:1200px;margin:0 auto;padding:24px 32px;display:flex;justify-content:space-between;align-items:center"
        >
          <text id="brand">小森林博客</text>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]).toMatchObject({
      id: "header",
      x: 120,
      width: 1200,
    });

    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "centered-sections-page",
        markupText: `
          <page name="Centered Sections" width="1440" background="#FFFFFF">
            <section
              id="header"
              name="头部导航"
              kind="header"
              style="width:100%;max-width:1200px;margin:0 auto;padding:24px 32px;display:flex;justify-content:space-between;align-items:center"
            >
              <text id="brand">小森林博客</text>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "centered-sections-page" },
      context: createContext(),
    });

    expect(String(readResult.toolResult.content || "")).toContain("width:1200px");
    expect(String(readResult.toolResult.content || "")).toContain("margin:0 auto");
  });

  it("supports min-width as a real layout constraint and preserves it in markup", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "min-width-page",
        markupText: `
          <page name="Min Width Page" width="1200" background="#FFFFFF">
            <section id="hero" name="Hero区" kind="content" padding="24">
              <div id="panel" min-width="640" width="50%" background="#F3F4F6" padding="24">
                <text id="title">Hello</text>
              </div>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "min-width-page");
    const panel = stored?.validation.document?.sections[0]?.nodes[0];
    expect((panel?.width || 0) >= 640).toBe(true);
    expect(panel?.props).toMatchObject({
      minWidth: "640px",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "min-width-page" },
      context: createContext(),
    });

    expect(String(readResult.toolResult.content || "")).toContain("min-width:640px");
  });

  it("supports aspect-ratio as a real layout constraint and preserves it in markup", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "aspect-ratio-page",
        markupText: `
          <page name="Aspect Ratio Page" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" style="padding:32px">
              <img
                id="hero-image"
                src="https://picsum.photos/seed/aspect/1200/800"
                style="width:320px;aspect-ratio:16 / 9;border-radius:16px"
              />
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "aspect-ratio-page");
    const image = stored?.validation.document?.sections[0]?.nodes[0];
    expect(image?.props).toMatchObject({
      aspectRatio: "1.7777777777777777",
    });
    expect(image?.width).toBe(320);
    expect(image?.height).toBe(180);

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "aspect-ratio-page" },
      context: createContext(),
    });
    expect(String(readResult.toolResult.content || "")).toContain(
      "aspect-ratio:1.7777777777777777",
    );
  });

  it("supports max-height as a real layout constraint and preserves it in markup", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "max-height-page",
        markupText: `
          <page name="Max Height Page" width="1200" background="#FFFFFF">
            <section id="hero" name="Hero区" kind="content" padding="24">
              <div id="panel" width="640" height="480" max-height="240" background="#F3F4F6" padding="24">
                <text id="title">Hello</text>
              </div>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "max-height-page");
    const panel = stored?.validation.document?.sections[0]?.nodes[0];
    expect((panel?.height || 0) <= 240).toBe(true);
    expect(panel?.props).toMatchObject({
      maxHeight: "240px",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "max-height-page" },
      context: createContext(),
    });

    expect(String(readResult.toolResult.content || "")).toContain("max-height:240px");
  });

  it("supports rem, em, vh, and vw units without collapsing layout", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Units Page" width="100vw" min-height="100vh" background="#0f172a">
        <section id="hero" name="Hero区" kind="hero" style="padding:6rem 5%">
          <text id="title" style="font-size:3.5rem;font-weight:800;line-height:1.2">分享技术思考，记录成长轨迹</text>
          <text id="subtitle" style="font-size:1.25rem;line-height:1.6;max-width:37.5rem">专注于前端开发、AI应用、架构设计的技术博客。</text>
          <button id="cta" style="padding:0.875rem 2rem;border-radius:0.75rem;font-size:1rem">浏览全部文章</button>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.page.width).toBe(1440);
    expect(compiled.document?.page.minHeight).toBeGreaterThanOrEqual(1200);

    const section = compiled.document?.sections[0];
    const title = section?.nodes[0];
    const subtitle = section?.nodes[1];
    const button = section?.nodes[2];

    expect((section?.height || 0) > 200).toBe(true);
    expect(title?.style?.fontSize).toBe(56);
    expect((title?.height || 0) > 50).toBe(true);
    expect(subtitle?.style?.fontSize).toBe(20);
    expect((subtitle?.width || 0) > 500).toBe(true);
    expect(button?.style?.fontSize).toBe(16);
    expect((button?.height || 0) > 40).toBe(true);
    expect((button?.width || 0) > 100).toBe(true);
  });

  it("supports <br> inside text nodes as explicit line breaks", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Line Break Page" width="1200" background="#121212">
        <section id="hero" name="Hero区" kind="hero" padding="32">
          <text id="hero-title" font-size="32" line-height="40" color="#ffffff">
            第一行<br/>第二行
          </text>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "hero-title",
      type: "text",
      text: "第一行\n第二行",
    });
    expect((compiled.document?.sections[0]?.nodes[0]?.height || 0) >= 80).toBe(true);
  });

  it("supports textarea and input controls by compiling them into control containers", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Form Page" width="1200" background="#ffffff">
        <section id="contact" name="联系表单" kind="content" padding="32" gap="16">
          <label id="message-label">留言内容</label>
          <textarea id="message" rows="4" placeholder="请输入你的留言"></textarea>
          <input id="email" type="email" placeholder="请输入邮箱" />
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const nodes = compiled.document?.sections[0]?.nodes || [];
    expect(nodes[1]).toMatchObject({
      id: "message",
      type: "container",
      props: {
        controlType: "textarea",
        placeholder: "请输入你的留言",
        rows: 4,
      },
    });
    expect(nodes[1]?.children?.[0]).toMatchObject({
      type: "text",
      text: "请输入你的留言",
    });
    expect(nodes[2]).toMatchObject({
      id: "email",
      type: "container",
      props: {
        controlType: "input",
        inputType: "email",
        placeholder: "请输入邮箱",
      },
    });
  });

  it("supports select controls by compiling them into control containers", async () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Form Page" width="1200" background="#ffffff">
        <section id="contact" name="联系表单" kind="content" padding="32" gap="16">
          <select id="category" value="tech">
            <option value="life">生活</option>
            <option value="tech" selected>技术</option>
          </select>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const node = compiled.document?.sections[0]?.nodes[0];
    expect(node).toMatchObject({
      id: "category",
      type: "container",
      props: {
        controlType: "select",
        selectedValue: "tech",
      },
    });
    expect(node?.children?.[0]).toMatchObject({
      type: "text",
      text: "技术",
    });

    await createDesignDocFromMarkupTool.invoke({
      context: createContext(),
      params: {
        pageId: "select-page",
        markupText: `
          <page name="Form Page" width="1200" background="#ffffff">
            <section id="contact" name="联系表单" kind="content" padding="32" gap="16">
              <select id="category" value="tech">
                <option value="life">生活</option>
                <option value="tech" selected>技术</option>
              </select>
            </section>
          </page>
        `.trim(),
      },
    });

    const readResult = await readDesignDocTool.invoke({
      context: createContext(),
      params: { pageId: "select-page" },
    });
    expect(String(readResult.toolResult.content || "")).toContain("<select ");
    expect(String(readResult.toolResult.content || "")).toContain('value="tech"');
    expect(String(readResult.toolResult.content || "")).toContain(">技术</option>");
  });

  it("supports simple equal-column grid layout", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Grid Page" width="1200" background="#121212">
        <section id="gallery" name="作品区" kind="content" padding="32">
          <div id="grid" display="grid" grid-template-columns="repeat(2, 1fr)" row-gap="24" column-gap="16">
            <div id="card-1" background="#1e1e1e" padding="24"><text id="t1">A</text></div>
            <div id="card-2" background="#1e1e1e" padding="24"><text id="t2">B</text></div>
            <div id="card-3" background="#1e1e1e" padding="24"><text id="t3">C</text></div>
            <div id="card-4" background="#1e1e1e" padding="24"><text id="t4">D</text></div>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const grid = compiled.document?.sections[0]?.nodes[0];
    expect(grid).toMatchObject({
      id: "grid",
      type: "container",
    });
    expect(grid?.children).toHaveLength(2);
    expect(grid?.children?.[0]?.children).toHaveLength(2);
    expect(grid?.children?.[1]?.children).toHaveLength(2);
  });

  it("supports mixed fixed and flexible grid columns like 1fr 320px", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Mixed Grid Page" width="1280" background="#121212">
        <section id="content" name="内容区" kind="content" style="padding:32px">
          <div id="grid" style="display:grid;grid-template-columns:1fr 320px;column-gap:24px">
            <div id="main" style="background:#1e1e1e;height:240px"></div>
            <div id="sidebar" style="background:#0f172a;height:240px"></div>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const grid = compiled.document?.sections[0]?.nodes[0];
    const row = grid?.children?.[0];
    const main = row?.children?.[0];
    const sidebar = row?.children?.[1];

    expect(grid).toMatchObject({
      id: "grid",
      type: "container",
    });
    expect(row?.children).toHaveLength(2);
    expect(sidebar?.width).toBe(320);
    expect((main?.width || 0) > (sidebar?.width || 0)).toBe(true);
    expect(sidebar?.props).toMatchObject({
      flexGrow: "0",
      flexShrink: "0",
      flexBasis: "320px",
      minWidth: "320px",
    });
  });

  it("keeps max-width auto-centered wrappers from collapsing to content width", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Centered Wrapper Page" width="1440" background="#0F172A">
        <section id="posts" name="文章区" kind="content" style="padding:80px 8%">
          <div id="wrapper" style="max-width:1200px;margin:0 auto">
            <div id="header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:48px">
              <h2 style="font-size:32px;font-weight:700;margin:0;color:#F8FAFC">最新文章</h2>
              <a href="#" style="font-size:16px;color:#6366F1;text-decoration:none">查看全部 →</a>
            </div>
            <div id="grid" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:24px">
              <div id="card-1" style="height:280px;background:#1E293B;border-radius:16px"></div>
              <div id="card-2" style="height:280px;background:#1E293B;border-radius:16px"></div>
              <div id="card-3" style="height:280px;background:#1E293B;border-radius:16px"></div>
            </div>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const wrapper = compiled.document?.sections[0]?.nodes[0];
    const grid = wrapper?.children?.[1];
    const row = grid?.children?.[0];
    const firstCard = row?.children?.[0];

    expect(wrapper?.width).toBeGreaterThan(1000);
    expect(grid?.width).toBeGreaterThan(1000);
    expect(firstCard?.width).toBeGreaterThan(300);
  });

  it("allows list-style on list containers and preserves it in markup", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "list-style-page",
        markupText: `
          <page name="List Style Page" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" padding="32">
              <ul id="meta-list" style="list-style:disc inside;gap:12px">
                <li id="item-1"><text id="label-1">第一项</text></li>
                <li id="item-2"><text id="label-2">第二项</text></li>
              </ul>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "list-style-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      listStyle: "disc inside",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "list-style-page" },
      context: createContext(),
    });

    expect(String(readResult.toolResult.content || "")).toContain("list-style:disc inside");
  });

  it("accepts font-family, font-style, and border-left/right declarations", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Style Page" width="1200" background="#ffffff">
        <section id="hero" name="Hero区" kind="content" padding="32">
          <div id="panel" border-left="4px solid #2563EB" background="#F8FAFC" padding="24">
            <text id="headline" font-family="Georgia, serif" font-style="italic" font-size="24">
              Styled headline
            </text>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]?.style).toMatchObject({
      stroke: {
        color: "#2563EB",
        width: 4,
      },
    });
    expect(compiled.document?.sections[0]?.nodes[0]?.children?.[0]?.props).toMatchObject({
      fontFamily: "Georgia, serif",
      fontStyle: "italic",
    });
  });

  it("supports outline and preserves it in markup while approximating it as stroke", async () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Outline Page" width="1200" background="#FFFFFF">
        <section id="content" name="内容区" kind="content" style="padding:32px">
          <div
            id="outlined-card"
            style="width:320px;height:120px;background:#F8FAFC;outline:2px solid #6366F1;border-radius:16px"
          ></div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    const card = compiled.document?.sections[0]?.nodes[0];
    expect(card?.style?.stroke).toMatchObject({
      color: "#6366F1",
      width: 2,
    });
    expect(card?.props?.outline).toBe("2px solid #6366F1");

    await createDesignDocFromMarkupTool.invoke({
      context: createContext(),
      params: {
        pageId: "outline-page",
        markupText: `
          <page name="Outline Page" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" style="padding:32px">
              <div
                id="outlined-card"
                style="width:320px;height:120px;background:#F8FAFC;outline:2px solid #6366F1;border-radius:16px"
              ></div>
            </section>
          </page>
        `.trim(),
      },
    });
    const readResult = await readDesignDocTool.invoke({
      context: createContext(),
      params: { pageId: "outline-page" },
    });
    expect(String(readResult.toolResult.content || "")).toContain("outline:2px solid #6366F1");
  });

  it("supports min-height, directional padding, alt, text-decoration, cursor, transform, animation, and transition", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Rich Style Page" width="1200" background="#ffffff" min-height="1600">
        <section id="hero" name="Hero区" kind="content" min-height="320" padding-left="40" padding-right="24" padding-top="32" padding-bottom="16">
          <img id="cover" src="https://picsum.photos/400/300" alt="封面插图" width="320" height="240" />
          <text
            id="cta"
            text-decoration="underline"
            cursor="pointer"
            transform="translateY(-4px) scale(1.02)"
            animation="pulse 2s ease-in-out infinite"
            transition="all 0.2s ease"
          >
            Read more
          </text>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.page.minHeight).toBe(1600);
    expect((compiled.document?.sections[0]?.height || 0) >= 320).toBe(true);
    expect(compiled.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      alt: "封面插图",
    });
    expect(compiled.document?.sections[0]?.nodes[1]?.props).toMatchObject({
      textDecoration: "underline",
      cursor: "pointer",
      transform: "translateY(-4px) scale(1.02)",
      animation: "pulse 2s ease-in-out infinite",
      transition: "all 0.2s ease",
    });
  });

  it("supports box-sizing but rejects unknown CSS declarations in tool input", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      context: createContext(),
      params: {
        pageId: "passthrough-style-page",
        markupText: `
          <page name="透传样式页" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" style="padding:32px">
              <div
                id="card"
                style="width:320px;height:120px;padding:16px;box-sizing:border-box;mix-blend-mode:screen;isolation:isolate;background:#111827;color:#FFFFFF"
              >
                透传样式内容
              </div>
            </section>
          </page>
        `.trim(),
      },
    });

    expect(createResult.toolResult.success).toBe(false);
    expect(createResult.toolResult.validationErrors[0]).toContain(
      "style 不支持的属性: mix-blend-mode",
    );
  });

  it("supports absolute positioning, z-index, overflow, and background-clip", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Positioned Page" width="1200" background="#101010">
        <section id="hero" name="Hero区" kind="content" style="min-height:360px;position:relative;overflow:hidden">
          <div
            id="badge"
            style="position:absolute;top:24px;right:32px;z-index:5;background:#2563EB;background-clip:text;overflow:hidden;padding:12px 16px;border-radius:999px"
          >
            <text id="badge-text" color="#ffffff">Featured</text>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "badge",
      type: "container",
      zIndex: 5,
      props: {
        overflow: "hidden",
        backgroundClip: "text",
      },
    });
    expect((compiled.document?.sections[0]?.nodes[0]?.x || 0) > 900).toBe(true);
    expect((compiled.document?.sections[0]?.nodes[0]?.y || 0) >= 20).toBe(true);
  });

  it("passes through backdrop-filter and webkit text clipping styles", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "glass-card-page",
        markupText: `
          <page name="Glass Card Page" width="1200" background="#101010">
            <section id="hero" name="Hero区" kind="content" padding="32">
              <div
                id="glass-card"
                backdrop-filter="blur(16px)"
                background="rgba(255,255,255,0.08)"
                border="1px solid rgba(255,255,255,0.12)"
                padding="24"
                border-radius="20"
              >
                <text
                  id="gradient-title"
                  background="linear-gradient(90deg,#60A5FA,#A78BFA)"
                  background-clip="text"
                  -webkit-background-clip="text"
                  -webkit-text-fill-color="transparent"
                  font-size="32"
                  font-weight="700"
                >
                  Gradient Title
                </text>
              </div>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "glass-card-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      backdropFilter: "blur(16px)",
    });
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.children?.[0]?.props).toMatchObject({
      backgroundClip: "text",
      webkitTextFillColor: "transparent",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "glass-card-page" },
      context: createContext(),
    });

    expect(readResult.toolResult.success).toBe(true);
    expect(String(readResult.toolResult.content || "")).toContain("backdrop-filter:blur(16px)");
    expect(String(readResult.toolResult.content || "")).toContain("background-clip:text");
    expect(String(readResult.toolResult.content || "")).toContain("-webkit-background-clip:text");
    expect(String(readResult.toolResult.content || "")).toContain(
      "-webkit-text-fill-color:transparent",
    );
  });

  it("allows and preserves arbitrary -webkit-* declarations like line clamp metadata", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "webkit-metadata-page",
        markupText: `
          <page name="Webkit Metadata Page" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" padding="32">
              <text
                id="excerpt"
                width="360"
                color="#334155"
                style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis"
              >
                这是一段用于测试 webkit 私有样式声明是否会被放行并完整保留的摘要内容。
              </text>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "webkit-metadata-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      "-webkit-line-clamp": "2",
      "-webkit-box-orient": "vertical",
      textOverflow: "ellipsis",
      overflow: "hidden",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "webkit-metadata-page" },
      context: createContext(),
    });

    expect(String(readResult.toolResult.content || "")).toContain("-webkit-line-clamp:2");
    expect(String(readResult.toolResult.content || "")).toContain("-webkit-box-orient:vertical");
  });

  it("supports background-image, box-shadow, and text-overflow as first-class style data", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "rich-style-page",
        markupText: `
          <page name="Rich Style Page" width="1200" background="#F8FAFC">
            <section id="hero" name="Hero区" kind="content" padding="32">
              <div
                id="hero-card"
                width="640"
                min-height="320"
                background="#FFFFFF"
                background-image="url(https://picsum.photos/seed/card/1200/800)"
                background-size="cover"
                background-position="center top"
                box-shadow="0 24px 48px rgba(15, 23, 42, 0.18)"
                border-radius="24"
                padding="24"
              >
                <text
                  id="hero-summary"
                  width="320"
                  text-overflow="ellipsis"
                  color="#0F172A"
                  font-size="18"
                >
                  这是一段会被标记为文本溢出处理的摘要内容
                </text>
              </div>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "rich-style-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.style).toMatchObject({
      shadow: {
        x: 0,
        y: 24,
        blur: 48,
        color: "#0F172A",
      },
    });
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.style?.fill).toMatchObject({
      type: "image",
      assetUrl: "https://picsum.photos/seed/card/1200/800",
    });
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      backgroundSize: "cover",
      backgroundPosition: "center top",
    });
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.children?.[0]?.props).toMatchObject({
      textOverflow: "ellipsis",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "rich-style-page" },
      context: createContext(),
    });

    expect(readResult.toolResult.success).toBe(true);
    expect(String(readResult.toolResult.content || "")).toContain(
      "background-image:url(https://picsum.photos/seed/card/1200/800)",
    );
    expect(String(readResult.toolResult.content || "")).toContain("background-size:cover");
    expect(String(readResult.toolResult.content || "")).toContain("background-position:center top");
    expect(String(readResult.toolResult.content || "")).toContain("box-shadow:0px 24px 48px");
    expect(String(readResult.toolResult.content || "")).toContain("text-overflow:ellipsis");
  });

  it("supports vertical-align and overflow-y and preserves them in markup", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "vertical-overflow-page",
        markupText: `
          <page name="Vertical Overflow Page" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" padding="32">
              <div
                id="scroll-panel"
                width="320"
                height="120"
                overflow-y="auto"
                background="#F8FAFC"
                border="1px solid #E2E8F0"
              >
                <text id="label" vertical-align="middle" color="#0F172A" font-size="16">
                  可滚动容器标题
                </text>
              </div>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "vertical-overflow-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      overflowY: "auto",
    });
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.children?.[0]?.props).toMatchObject({
      textGrowType: "fixed",
      verticalAlign: "middle",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "vertical-overflow-page" },
      context: createContext(),
    });

    expect(readResult.toolResult.success).toBe(true);
    expect(String(readResult.toolResult.content || "")).toContain("overflow-y:auto");
    expect(String(readResult.toolResult.content || "")).toContain("vertical-align:middle");
  });

  it("supports white-space and preserves it in markup", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "white-space-page",
        markupText: `
          <page name="White Space Page" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" padding="32">
              <text
                id="code-line"
                width="320"
                white-space="pre-wrap"
                color="#111827"
                font-size="14"
                line-height="22"
              >
                const answer = 42;
              </text>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "white-space-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      whiteSpace: "pre-wrap",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "white-space-page" },
      context: createContext(),
    });

    expect(readResult.toolResult.success).toBe(true);
    expect(String(readResult.toolResult.content || "")).toContain("white-space:pre-wrap");
  });

  it("supports page theme metadata, letter-spacing, and preformatted text", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "theme-pre-page",
        markupText: `
          <page name="Theme Page" theme="tech-dark" width="1200" background="#0F172A">
            <section id="hero" name="Hero区" kind="hero" padding="32">
              <text id="tracking-title" style="font-size:32px;letter-spacing:2px;color:#FFFFFF">TECH BLOG</text>
              <pre id="code-snippet">const answer = 42;
  console.log(answer);</pre>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);
    const stored = readStoredDesignDoc("task-1", "theme-pre-page");
    expect(stored?.validation.document?.page.theme).toBe("tech-dark");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.style).toMatchObject({
      letterSpacing: 2,
    });
    expect(stored?.validation.document?.sections[0]?.nodes[1]?.props).toMatchObject({
      preformatted: true,
      textGrowType: "fixed",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "theme-pre-page" },
      context: createContext(),
    });

    expect(String(readResult.toolResult.content || "")).toContain('theme="tech-dark"');
    expect(String(readResult.toolResult.content || "")).toContain("letter-spacing:2px");
    expect(String(readResult.toolResult.content || "")).toContain("<pre ");
    expect(String(readResult.toolResult.content || "")).toContain("  console.log(answer);");
  });

  it("preserves named colors like white and transparent in compiled styles", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Named Colors Page" width="1200" background="#F8FAFC">
        <section id="content" name="内容区" kind="content" padding="32">
          <div
            id="card"
            background="white"
            border="1px solid #E2E8F0"
            border-radius="16"
            box-shadow="0 2px 8px rgba(101, 195, 148, 0.1)"
            padding="24"
          >
            <button
              id="ghost-button"
              background="transparent"
              color="white"
              border="1px solid #65C394"
              border-radius="24"
              padding="12 20"
            >
              了解更多
            </button>
          </div>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]?.style).toMatchObject({
      fill: {
        type: "solid",
        color: "#FFFFFF",
      },
      shadow: {
        x: 0,
        y: 2,
        blur: 8,
      },
    });
    expect(compiled.document?.sections[0]?.nodes[0]?.children?.[0]?.style).toMatchObject({
      fill: {
        type: "solid",
        color: "#00000000",
      },
      textColor: "#FFFFFF",
    });
  });

  it("passes through hover/focus/active metadata without failing validation", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "interactive-metadata-page",
        markupText: `
          <page name="Interactive Metadata" width="1200" background="#101010">
            <section id="hero" name="Hero区" kind="content" padding="32">
              <button
                id="cta"
                hover-background="#2563EB"
                hover-color="#FFFFFF"
                focus-ring="2px solid #93C5FD"
                active-scale="0.98"
              >
                立即开始
              </button>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "interactive-metadata-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      "hover-background": "#2563EB",
      "hover-color": "#FFFFFF",
      "focus-ring": "2px solid #93C5FD",
      "active-scale": "0.98",
    });

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "interactive-metadata-page" },
      context: createContext(),
    });
    expect(readResult.toolResult.content).toContain('hover-background="#2563EB"');
    expect(readResult.toolResult.content).toContain('focus-ring="2px solid #93C5FD"');
  });

  it("allows hover/focus/active metadata on non-button elements too", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "stateful-card-page",
        markupText: `
          <page name="Stateful Card" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" padding="24">
              <div
                id="card"
                background="#FFFFFF"
                border="1px solid #E5E7EB"
                hover-background="#F9FAFB"
                focus-border="#2563EB"
                active-scale="0.98"
                padding="24"
              >
                <text id="title">Card</text>
              </div>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);
    const stored = readStoredDesignDoc("task-1", "stateful-card-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      "hover-background": "#F9FAFB",
      "focus-border": "#2563EB",
      "active-scale": "0.98",
    });
  });

  it("allows hover/focus/active declarations inside style strings too", async () => {
    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "state-style-string-page",
        markupText: `
          <page name="State Style String" width="1200" background="#FFFFFF">
            <section id="content" name="内容区" kind="content" padding="24">
              <a
                id="nav-link"
                style="color:#334155;hover-color:#10B981;focus-ring:2px solid #A7F3D0;active-scale:0.98"
              >
                首页
              </a>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);
    const stored = readStoredDesignDoc("task-1", "state-style-string-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      "hover-color": "#10B981",
      "focus-ring": "2px solid #A7F3D0",
      "active-scale": "0.98",
    });
  });

  it("does not derive section names from section body text", () => {
    const compiled = compileDesignDocFromMarkup(`
      <page name="Test Page">
        <section id="about-section" style="padding:32px">
          <text id="about-title" style="font-size:24px">我 的 博客 与 生活 随笔</text>
        </section>
      </page>
    `);

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.id).toBe("about-section");
    expect(compiled.document?.sections[0]?.name).toBe("about-section");
  });

  it("supports bare presentational attributes and flex ratios", () => {
    const compiled = compileDesignDocFromMarkup(createBareAttrMarkup());

    expect(compiled.errors).toEqual([]);
    const contentSection = compiled.document?.sections[0];
    expect(contentSection?.nodes[0]).toMatchObject({
      id: "posts-column",
      type: "container",
    });
    expect(contentSection?.nodes[1]).toMatchObject({
      id: "sidebar-column",
      type: "container",
    });
    expect((contentSection?.nodes[0]?.width || 0) > (contentSection?.nodes[1]?.width || 0)).toBe(
      true,
    );
    expect(contentSection?.nodes[1]?.children?.[0]).toMatchObject({
      id: "author-card",
      type: "container",
    });
  });

  it("supports flex-grow, flex-shrink, and flex-basis as real layout constraints and preserves them in markup", async () => {
    const markup = `
      <page name="Flex Page" width="1200" style="background:#ffffff">
        <section id="hero" name="Hero" kind="hero" style="padding:40px">
          <div id="row" style="display:flex; gap:20px; width:800px">
            <div id="left" style="width:200px; height:120px; background:#e2e8f0; flex-shrink:0"></div>
            <div id="right" style="height:120px; background:#cbd5e1; flex-grow:1; flex-shrink:1; flex-basis:300px"></div>
          </div>
        </section>
      </page>
    `;

    const createResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "flex-layout-page",
        title: "Flex Layout Page",
        markupText: markup,
      },
      context: createContext(),
    });

    expect(createResult.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "flex-layout-page");
    const row = stored?.stored.document.sections[0]?.nodes[0];
    const left = row?.children?.[0];
    const right = row?.children?.[1];

    expect(left?.width).toBe(200);
    expect(left?.props?.flexShrink).toBe("0");
    expect(right?.props?.flexGrow).toBe("1");
    expect(right?.props?.flexShrink).toBe("1");
    expect(right?.props?.flexBasis).toBe("300px");
    expect(right?.width).toBe(580);

    const readResult = await readDesignDocTool.invoke({
      params: { pageId: "flex-layout-page" },
      context: createContext(),
    });
    expect(String(readResult.toolResult.content || "")).toContain("flex-grow:1");
    expect(String(readResult.toolResult.content || "")).toContain("flex-shrink:1");
    expect(String(readResult.toolResult.content || "")).toContain("flex-basis:300px");
  });

  it('expands component assets via <use component="...">', () => {
    const component = upsertStoredDesignComponent("task-1", {
      id: "blog/post-card",
      name: "文章卡片",
      markupText: `
        <component id="post-card" name="文章卡片" display="flex" flex-direction="column" gap="8" padding="24" background="#1E1E2E" border-radius="12">
          <text id="title" font-size="28px" font-weight="600" color="#C678DD">文章标题</text>
          <text id="excerpt" font-size="16px" color="#CDD6F4">文章摘要</text>
        </component>
      `,
    });

    const compiled = compileDesignDocFromMarkup(
      `
        <page name="组件复用页面" background="#121212">
          <section id="posts-section" name="文章列表区" kind="content" padding="40 32">
            <use component="blog/post-card" id="post-card-1" />
          </section>
        </page>
      `,
      {
        components: [component],
      },
    );

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "post-card-1",
      type: "container",
      props: {
        componentRef: "blog/post-card",
        componentInstanceId: "post-card-1",
      },
    });
    expect(compiled.document?.sections[0]?.nodes[0]?.children?.[0]?.id).toBe("post-card-1-title");
  });

  it("supports inline <components> definitions inside <page> and persists them as component assets", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "inline-components-page",
        markupText: `
          <page name="内联组件页面" width="1200" background="#121212">
            <components>
              <component id="blog/post-card" name="文章卡片" style="display:flex;flex-direction:column;gap:8px;padding:24px;background:#1E1E2E;border-radius:12px">
                <text id="title" style="font-size:28px;font-weight:600;color:#C678DD">文章标题</text>
                <text id="excerpt" style="font-size:16px;color:#CDD6F4">文章摘要</text>
              </component>
            </components>
            <section id="posts-section" name="文章列表区" kind="content" style="padding:40px 32px">
              <use component="blog/post-card" id="post-card-1" />
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(true);

    const stored = readStoredDesignDoc("task-1", "inline-components-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "post-card-1",
      props: {
        componentRef: "blog/post-card",
        componentInstanceId: "post-card-1",
      },
    });

    const asset = readDesignAssetTool
      ? await readDesignAssetTool.invoke({
          params: { assetId: "blog/post-card" },
          context: createContext(),
        })
      : null;
    expect(asset?.toolResult.success).toBe(true);
    expect(asset?.toolResult.asset).toMatchObject({
      id: "blog/post-card",
      type: "component",
    });
    expect(String(asset?.toolResult.asset?.markupText || "")).toContain("<component ");
  });

  it('resolves image assets via <img asset="...">', () => {
    upsertStoredDesignAsset("task-1", {
      type: "image",
      id: "blog/hero-cover",
      name: "Hero封面图",
      url: "https://cdn.example.com/blog/hero-cover.jpg",
      width: 1440,
      height: 960,
    });

    const compiled = compileDesignDocFromMarkup(
      `
        <page name="图片资产页面" background="#121212">
          <section id="hero-section" name="Hero区" kind="hero" padding="32">
            <img id="hero-cover" asset="blog/hero-cover" width="480" height="320" />
          </section>
        </page>
      `,
      {
        images: [
          {
            id: "blog/hero-cover",
            url: "https://cdn.example.com/blog/hero-cover.jpg",
            width: 1440,
            height: 960,
          },
        ],
      },
    );

    expect(compiled.errors).toEqual([]);
    expect(compiled.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "hero-cover",
      type: "image",
      assetUrl: "https://cdn.example.com/blog/hero-cover.jpg",
      props: {
        assetRef: "blog/hero-cover",
      },
    });
  });

  it("rejects oversized page dimensions", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "oversized-page",
        markupText: `
          <page name="超大画布" width="5000" min-height="1200" background="#FFFFFF">
            <section id="hero" name="Hero区" kind="hero" style="padding:32px">
              <text id="title" style="font-size:32px;color:#111827">超大画布</text>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.validationErrors[0]).toContain("page.width");
  });

  it("rejects oversized node dimensions", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "oversized-node-page",
        markupText: `
          <page name="超大节点" width="1200" min-height="1200" background="#FFFFFF">
            <section id="hero" name="Hero区" kind="hero" style="padding:32px">
              <div id="giant-card" style="width:800px;height:16000px;background:#E2E8F0"></div>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.validationErrors[0]).toContain("height");
  });

  it("rejects unsupported float-based section layouts", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "float-layout-page",
        markupText: `
          <page name="Float Layout" width="1440" min-height="900" background="#FFFFFF">
            <section id="sidebar" name="侧边栏" kind="sidebar" style="width:240px;height:600px;float:left;background:#F8FAFC"></section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.validationErrors[0]).toContain("style 不支持的属性: float");
  });

  it("rejects nested sections that are not direct page children", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "nested-section-page",
        markupText: `
          <page name="Nested Sections" width="1440" min-height="900" background="#FFFFFF">
            <section id="main" name="主内容区" kind="content" style="padding:24px">
              <section id="nested" name="嵌套区块" kind="content" style="padding:16px">
                <text id="title">不合法嵌套</text>
              </section>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.validationErrors[0]).toContain(
      "<section> 只能作为 <page> 的直接子节点",
    );
  });

  it("creates and stores a design doc from markup", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "personal-blog-dark",
        title: "暗黑风格个人博客网站设计稿",
        markupText: createMarkup(),
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(true);
    expect(result.toolResult.penpotSync).toBeDefined();

    const stored = readStoredDesignDoc("task-1", "personal-blog-dark");
    expect(stored?.validation.valid).toBe(true);
    if (!stored?.validation.valid || !stored.validation.document) {
      throw new Error("expected stored design doc to be valid");
    }
    expect(stored.validation.document.sections).toHaveLength(4);
    expect(stored.validation.document.sections[3]?.nodes[0]).toMatchObject({
      id: "footer-copy",
      type: "text",
    });
  });

  it("supports partial page updates via createDesignDocFromMarkup(update=true)", async () => {
    await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "personal-blog-dark",
        title: "暗黑风格个人博客网站设计稿",
        markupText: createMarkup(),
      },
      context: createContext(),
    });

    const updateResult = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "personal-blog-dark",
        update: true,
        markupText: `
          <page>
            <section id="hero-section" name="Hero区域" kind="content" style="padding:48px 32px;display:flex;flex-direction:column;gap:24px;background:#121212">
              <text id="hero-title" style="font-size:52px;font-weight:700;color:#FFFFFF">Hi, I'm Updated Alex</text>
              <text id="hero-subtitle" style="font-size:24px;line-height:32px;color:#94A3B8">博客与设计实验</text>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(updateResult.toolResult.success).toBe(true);
    const stored = readStoredDesignDoc("task-1", "personal-blog-dark");
    const sections = stored?.validation.document?.sections || [];
    expect(sections).toHaveLength(4);
    expect(sections[1]?.id).toBe("hero-section");
    expect(sections[1]?.nodes[0]).toMatchObject({
      id: "hero-title",
      text: "Hi, I'm Updated Alex",
    });
    expect(sections[0]?.id).toBe("header-section");
    expect(sections[2]?.id).toBe("posts-section");
  });

  it("fails when markup leaves placeholder content", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "placeholder-page",
        markupText: `
          <page name="Placeholder" width="1200" style="background:#101010">
            <section id="hero" style="padding:32px">
              <text id="hero-title" style="font-size:32px;color:#FFFFFF">TODO</text>
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.validationErrors[0]).toContain("占位文本");
  });

  it("allows placeholder image urls in draft design docs", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "placeholder-image-page",
        markupText: `
          <page name="Placeholder Image" width="1200" style="background:#101010">
            <section id="hero" name="Hero区" kind="hero" style="padding:32px">
              <img id="hero-cover" src="https://picsum.photos/1200/800" width="480" height="320" />
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(true);
    const stored = readStoredDesignDoc("task-1", "placeholder-image-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]).toMatchObject({
      id: "hero-cover",
      type: "image",
      assetUrl: "https://picsum.photos/1200/800",
    });
  });

  it("lists and reads stored design assets", async () => {
    upsertStoredDesignComponent("task-1", {
      id: "blog/post-card",
      name: "文章卡片",
      description: "博客文章卡片组件",
      tags: ["blog", "card"],
      markupText: `<component id="post-card"><text id="title">Title</text></component>`,
    });
    upsertStoredDesignAsset("task-1", {
      type: "image",
      id: "blog/cover",
      name: "博客封面图",
      description: "首页 hero 封面图",
      tags: ["blog", "cover"],
      url: "https://cdn.example.com/blog/cover.jpg",
      thumbnailUrl: "https://cdn.example.com/blog/cover-thumb.jpg",
      width: 1600,
      height: 900,
    });

    const listResult = await listDesignAssetsTool.invoke({
      params: {},
      context: createContext(),
    });
    expect(listResult.toolResult.success).toBe(true);
    expect(listResult.toolResult.assets.length).toBeGreaterThanOrEqual(2);
    expect(
      listResult.toolResult.assets.find((asset) => asset.id === "blog/post-card"),
    ).toMatchObject({
      id: "blog/post-card",
      type: "component",
    });
    expect(listResult.toolResult.assets.find((asset) => asset.id === "blog/cover")).toMatchObject({
      id: "blog/cover",
      type: "image",
      url: "https://cdn.example.com/blog/cover.jpg",
    });

    const readResult = await readDesignAssetTool.invoke({
      params: {
        assetId: "blog/post-card",
      },
      context: createContext(),
    });
    expect(readResult.toolResult.success).toBe(true);
    expect(readResult.toolResult.asset).toMatchObject({
      id: "blog/post-card",
      markupText: `<component id="post-card"><text id="title">Title</text></component>`,
    });

    const readImageResult = await readDesignAssetTool.invoke({
      params: {
        assetId: "blog/cover",
      },
      context: createContext(),
    });
    expect(readImageResult.toolResult.success).toBe(true);
    expect(readImageResult.toolResult.asset).toMatchObject({
      id: "blog/cover",
      type: "image",
      url: "https://cdn.example.com/blog/cover.jpg",
    });
  });

  it("includes built-in icon assets in the design asset list", async () => {
    const listResult = await listDesignAssetsTool.invoke({
      params: {},
      context: createContext(),
    });

    expect(listResult.toolResult.success).toBe(true);
    expect(listResult.toolResult.assets.find((asset) => asset.id === "icon/search")).toMatchObject({
      id: "icon/search",
      type: "image",
    });

    const readResult = await readDesignAssetTool.invoke({
      params: {
        assetId: "icon/search",
      },
      context: createContext(),
    });

    expect(readResult.toolResult.success).toBe(true);
    expect(readResult.toolResult.asset).toMatchObject({
      id: "icon/search",
      type: "image",
      width: 24,
      height: 24,
    });
  });

  it("allows built-in icon assets to be referenced during design doc creation", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "icon-asset-page",
        markupText: `
          <page width="375" min-height="812" style="background:#000">
            <section id="hero" name="Hero区" kind="hero" style="padding:24px">
              <img id="search-icon" asset="icon/search" width="24" height="24" />
              <img id="music-icon" asset="icon/music" width="24" height="24" />
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(true);
    const stored = readStoredDesignDoc("task-1", "icon-asset-page");
    const nodes = stored?.validation.document?.sections[0]?.nodes || [];
    expect(nodes.find((node) => node.id === "search-icon")).toMatchObject({
      type: "image",
      assetUrl: "https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons/search.svg",
    });
    expect(nodes.find((node) => node.id === "music-icon")).toMatchObject({
      type: "image",
      assetUrl: "https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons/music.svg",
    });
  });

  it("accepts filter as pass-through style metadata", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "filter-style-page",
        markupText: `
          <page width="375" min-height="812" style="background:#000">
            <section id="hero" name="Hero区" kind="hero" style="padding:24px">
              <img id="search-icon" src="https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons/search.svg" style="width:24px;height:24px;filter:invert(1)" />
            </section>
          </page>
        `,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(true);
    const stored = readStoredDesignDoc("task-1", "filter-style-page");
    expect(stored?.validation.document?.sections[0]?.nodes[0]?.props).toMatchObject({
      filter: "invert(1)",
    });
  });

  it("accepts markup wrapped in a single CDATA block", async () => {
    const result = await createDesignDocFromMarkupTool.invoke({
      params: {
        pageId: "cdata-page",
        markupText: `<![CDATA[
          <page width="375" min-height="812" style="background:#000">
            <section id="hero" name="Hero区" kind="hero" style="padding:24px">
              <text>内容</text>
            </section>
          </page>
        ]]>`,
      },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(true);
  });

  it("reuses an existing Penpot file by adding a new page for another design doc", async () => {
    process.env.PENPOT_BASE_URL = "http://localhost:9001";
    process.env.PENPOT_ACCESS_TOKEN = "token";
    process.env.PENPOT_TEAM_ID = "team-1";
    process.env.PENPOT_PROJECT_ID = "project-1";

    writeStoredDesignDoc("task-1", "home-page", {
      schemaVersion: 3,
      pageId: "home-page",
      title: "首页",
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
      document: compileDesignDocFromMarkup(createMarkup()).document!,
    });
    writePenpotBinding(
      "task-1",
      "home-page",
      "http://localhost:9001/#/workspace?team-id=team-1&project-id=project-1&file-id=file-shared&page-id=page-home",
    );

    writeStoredDesignDoc("task-1", "article-page", {
      schemaVersion: 3,
      pageId: "article-page",
      title: "文章页",
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
      document: compileDesignDocFromMarkup(
        `
          <page name="文章页" width="1200" style="background:#111111">
            <section id="article-hero" name="文章头图区" kind="hero" style="padding:32px">
              <text id="article-title" style="font-size:36px;color:#FFFFFF">Article</text>
            </section>
          </page>
        `,
      ).document!,
    });

    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      fetchCalls.push({ url, body });

      if (url.includes("/get-file")) {
        return new Response(
          JSON.stringify({
            id: "file-shared",
            revn: 3,
            vern: 7,
            data: {
              pages: ["page-home"],
              pagesIndex: {
                "page-home": {
                  id: "page-home",
                  name: "首页",
                  objects: {
                    "00000000-0000-0000-0000-000000000000": {
                      id: "00000000-0000-0000-0000-000000000000",
                      shapes: [],
                    },
                  },
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/update-file")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      const result = await syncDesignDocToPenpot("task-1", "article-page");
      expect(result.fileId).toBe("file-shared");
      expect(result.pageId).not.toBe("page-home");

      const updateFileCall = fetchCalls.find((call) => call.url.includes("/update-file"));
      expect(updateFileCall).toBeDefined();
      const changes = Array.isArray(updateFileCall?.body.changes)
        ? (updateFileCall?.body.changes as Array<Record<string, unknown>>)
        : [];
      expect(changes[0]).toMatchObject({
        type: "add-page",
        id: result.pageId,
        name: "文章页",
      });
      expect(changes[1]).toMatchObject({
        type: "mod-page",
        id: result.pageId,
        name: "文章页",
      });

      const binding = readStoredDesignDoc("task-1", "article-page");
      expect(binding?.penpotBinding).toMatchObject({
        fileId: "file-shared",
        penpotPageId: result.pageId,
      });
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.PENPOT_BASE_URL;
      delete process.env.PENPOT_ACCESS_TOKEN;
      delete process.env.PENPOT_TEAM_ID;
      delete process.env.PENPOT_PROJECT_ID;
    }
  });

  it("syncs stored design assets into dedicated Penpot asset pages", async () => {
    process.env.PENPOT_BASE_URL = "http://localhost:9001";
    process.env.PENPOT_ACCESS_TOKEN = "token";
    process.env.PENPOT_TEAM_ID = "team-1";
    process.env.PENPOT_PROJECT_ID = "project-1";

    writeStoredDesignDoc("task-1", "home-page", {
      schemaVersion: 3,
      pageId: "home-page",
      title: "首页",
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
      document: compileDesignDocFromMarkup(createMarkup()).document!,
    });

    upsertStoredDesignComponent("task-1", {
      id: "blog/post-card",
      name: "文章卡片",
      markupText: `
        <component id="post-card" name="文章卡片" style="display:flex;flex-direction:column;gap:8px;padding:24px;background:#1E1E2E;border-radius:12px">
          <text id="title" style="font-size:28px;font-weight:600;color:#C678DD">文章标题</text>
          <text id="excerpt" style="font-size:16px;color:#CDD6F4">文章摘要</text>
        </component>
      `,
    });
    upsertStoredDesignAsset("task-1", {
      type: "image",
      id: "blog/cover",
      name: "封面图片",
      url: "https://cdn.example.com/blog/cover.jpg",
      width: 1200,
      height: 800,
    });

    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      fetchCalls.push({ url, body });

      if (url.includes("/create-file")) {
        return new Response(
          JSON.stringify({
            id: "file-home",
            revn: 1,
            vern: 1,
            data: {
              pages: ["page-home"],
              pagesIndex: {
                "page-home": {
                  id: "page-home",
                  name: "首页",
                  objects: {
                    "00000000-0000-0000-0000-000000000000": {
                      id: "00000000-0000-0000-0000-000000000000",
                      shapes: [],
                    },
                  },
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/get-file")) {
        return new Response(
          JSON.stringify({
            id: "file-home",
            revn: 2,
            vern: 2,
            data: {
              pages: ["page-home"],
              pagesIndex: {
                "page-home": {
                  id: "page-home",
                  name: "首页",
                  objects: {
                    "00000000-0000-0000-0000-000000000000": {
                      id: "00000000-0000-0000-0000-000000000000",
                      shapes: [],
                    },
                  },
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/create-file-media-object-from-url")) {
        return new Response(
          JSON.stringify({
            id: "media-cover",
            width: 1200,
            height: 800,
            mtype: "image/jpeg",
            mediaId: "media-raw-cover",
            thumbnailId: "media-thumb-cover",
            name: "cover.jpg",
            isLocal: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/update-file")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      await syncDesignDocToPenpot("task-1", "home-page");

      const updateFileCall = fetchCalls.find((call) => call.url.includes("/update-file"));
      expect(updateFileCall).toBeDefined();
      expect(
        fetchCalls.some(
          (call) =>
            call.url.includes("/create-file-media-object-from-url") &&
            call.body.url === "https://cdn.example.com/blog/cover.jpg",
        ),
      ).toBe(true);
      const changes = Array.isArray(updateFileCall?.body.changes)
        ? (updateFileCall?.body.changes as Array<Record<string, unknown>>)
        : [];

      expect(
        changes.some(
          (change) => change.type === "add-page" && change.name === "Amigo Assets · Components",
        ),
      ).toBe(true);
      expect(
        changes.some(
          (change) => change.type === "add-page" && change.name === "Amigo Assets · Images",
        ),
      ).toBe(true);
      expect(
        changes.some(
          (change) => change.type === "mod-page" && change.name === "Amigo Assets · Components",
        ),
      ).toBe(true);
      expect(
        changes.some(
          (change) => change.type === "mod-page" && change.name === "Amigo Assets · Images",
        ),
      ).toBe(true);
      expect(
        changes.some(
          (change) =>
            change.type === "add-component" && change.name === "文章卡片" && change.path === "blog",
        ),
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.PENPOT_BASE_URL;
      delete process.env.PENPOT_ACCESS_TOKEN;
      delete process.env.PENPOT_TEAM_ID;
      delete process.env.PENPOT_PROJECT_ID;
    }
  });

  it("returns Penpot page binding info when reading design docs", async () => {
    writeStoredDesignDoc("task-1", "home-page", {
      schemaVersion: 3,
      pageId: "home-page",
      title: "首页",
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z",
      document: compileDesignDocFromMarkup(createMarkup()).document!,
    });
    writePenpotBinding(
      "task-1",
      "home-page",
      "http://localhost:9001/#/workspace?team-id=team-1&project-id=project-1&file-id=file-shared&page-id=page-home",
    );

    const detailResult = await readDesignDocTool.invoke({
      params: { pageId: "home-page" },
      context: createContext(),
    });
    expect(detailResult.toolResult.success).toBe(true);
    expect(detailResult.toolResult.penpotBinding).toMatchObject({
      fileId: "file-shared",
      penpotPageId: "page-home",
    });
    expect(detailResult.toolResult.content).toContain("<page ");
    expect(detailResult.toolResult.content).toContain("<section ");
    expect(detailResult.toolResult.content).not.toContain('"sections"');

    const indexResult = await listDesignDocsTool.invoke({
      params: {},
      context: createContext(),
    });
    expect(indexResult.toolResult.availableDocs[0]).toMatchObject({
      pageId: "home-page",
      penpotBinding: {
        fileId: "file-shared",
        penpotPageId: "page-home",
      },
    });
  });

  it("requires pageId when reading a design doc", async () => {
    const result = await readDesignDocTool.invoke({
      params: { pageId: "" },
      context: createContext(),
    });

    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.validationErrors[0]).toContain("pageId 不能为空");
  });
});
