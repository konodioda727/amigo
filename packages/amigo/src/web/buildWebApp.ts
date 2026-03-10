import path from "node:path";
import plugin from "bun-plugin-tailwind";

export const webOutdir = path.join(process.cwd(), "dist", "web");

type BuildWebAppOptions = {
  defineNodeEnv: "development" | "production";
  minify: boolean;
  sourcemap: Bun.BuildConfig["sourcemap"];
  watch?: Bun.BuildConfig["watch"];
};

export const buildWebApp = async ({
  defineNodeEnv,
  minify,
  sourcemap,
  watch,
}: BuildWebAppOptions) =>
  Bun.build({
    entrypoints: [path.resolve("src", "web", "index.html")],
    outdir: webOutdir,
    plugins: [plugin],
    minify,
    target: "browser",
    sourcemap,
    define: {
      "process.env.NODE_ENV": JSON.stringify(defineNodeEnv),
    },
    watch,
  });
