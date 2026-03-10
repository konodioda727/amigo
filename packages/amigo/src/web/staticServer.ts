import { existsSync } from "node:fs";
import path from "node:path";
import { serve } from "bun";

const resolveRequestPath = (rootDir: string, pathname: string): string | null => {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidatePath = path.resolve(rootDir, relativePath || "index.html");

  if (!candidatePath.startsWith(rootDir)) {
    return null;
  }

  if (existsSync(candidatePath) && Bun.file(candidatePath).size >= 0) {
    return candidatePath;
  }

  if (!path.extname(relativePath)) {
    return path.join(rootDir, "index.html");
  }

  return null;
};

export const startStaticWebServer = (rootDir: string, port: number) => {
  const server = serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const filePath = resolveRequestPath(rootDir, url.pathname);
      if (!filePath) {
        return new Response("Not Found", { status: 404 });
      }

      return new Response(Bun.file(filePath));
    },
  });

  console.log(`[amigo-web] running at ${server.url}`);
  return server;
};
