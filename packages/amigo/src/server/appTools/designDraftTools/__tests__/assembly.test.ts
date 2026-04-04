import { describe, expect, it } from "bun:test";
import {
  assembleDraftFromLayout,
  assembleDraftFromLayoutProgressive,
  extractLayoutSlotHtml,
} from "../assembly";

describe("design draft assembly", () => {
  it("extracts and replaces module slots by data-module-id", () => {
    const layout = `
      <main class="min-h-screen bg-stone-50">
        <section data-module-id="hero" class="px-8 py-16">
          <div class="h-40 rounded-3xl border border-dashed border-slate-300"></div>
        </section>
        <section data-module-id="features" class="px-8 py-10">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="h-28 rounded-3xl border border-dashed border-slate-300"></div>
          </div>
        </section>
      </main>
    `;

    expect(extractLayoutSlotHtml(layout, "hero")).toContain('data-module-id="hero"');

    const result = assembleDraftFromLayout(layout, {
      hero: '<section data-module-id="hero" class="px-8 py-16"><div class="rounded-3xl bg-black text-white">Hero</div></section>',
      features:
        '<section data-module-id="features" class="px-8 py-10"><div class="grid gap-4 md:grid-cols-3"><article class="rounded-3xl bg-white">Feature</article></div></section>',
    });

    expect(result.moduleOrder).toEqual(["hero", "features"]);
    expect(result.content).toContain(">Hero<");
    expect(result.content).toContain(">Feature<");
  });

  it("keeps unfinished module slots during progressive assembly", () => {
    const layout = `
      <main>
        <section data-module-id="hero"><div class="h-40"></div></section>
        <section data-module-id="features"><div class="h-28"></div></section>
      </main>
    `;

    const result = assembleDraftFromLayoutProgressive(layout, {
      hero: '<section data-module-id="hero"><div class="bg-black">Hero</div></section>',
    });

    expect(result.content).toContain('data-module-id="hero"');
    expect(result.content).toContain(">Hero<");
    expect(result.content).toContain('data-module-id="features"');
    expect(result.moduleOrder).toEqual(["hero", "features"]);
  });
});
