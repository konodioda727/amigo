import { describe, expect, it } from "bun:test";
import { validateLayoutSkeletonSource } from "../layoutSource";

describe("layoutSource validation", () => {
  it("accepts grayscale placeholder skeletons", () => {
    const source = `
      <main class="min-h-screen bg-white">
        <section data-module-id="hero" class="px-12 py-16">
          <div class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div class="space-y-4">
              <div class="h-10 w-56 rounded bg-zinc-800"></div>
              <div class="h-4 w-full rounded bg-zinc-300"></div>
              <div class="h-4 w-4/5 rounded bg-zinc-300"></div>
              <div class="flex gap-3 pt-4">
                <div class="h-11 w-32 rounded bg-zinc-900"></div>
                <div class="h-11 w-28 rounded border border-zinc-400 bg-white"></div>
              </div>
            </div>
            <div class="h-[320px] rounded-3xl border border-zinc-300 bg-zinc-100"></div>
          </div>
        </section>
      </main>
    `;

    expect(validateLayoutSkeletonSource(source)).toEqual([]);
  });

  it("rejects full documents, visible text, and colorful styles", () => {
    const source = `
      <!DOCTYPE html>
      <html>
        <body class="bg-white">
          <section data-module-id="hero" class="bg-blue-600">
            <h1 class="text-white">Explore More</h1>
          </section>
        </body>
      </html>
    `;

    const errors = validateLayoutSkeletonSource(source);
    expect(errors).toContain(
      "布局骨架只能提交 HTML 片段，禁止输出 html/head/body/script/style 等完整文档标签",
    );
    expect(errors).toContain("布局骨架中不允许使用彩色 class，只能使用黑白灰和中性色");
    expect(errors).toContain(
      "布局骨架中不允许包含可见文字，标题/正文/按钮/价格/品牌名等都必须改成占位块",
    );
  });
});
