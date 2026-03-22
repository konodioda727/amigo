#!/usr/bin/env bun

/**
 * 发布脚本 - 打包并发布所有包到 npm
 *
 * 用法:
 *   bun run scripts/publish.ts [patch|minor|major]
 *
 * 示例:
 *   bun run scripts/publish.ts patch   # 0.0.1 -> 0.0.2
 *   bun run scripts/publish.ts minor   # 0.0.1 -> 0.1.0
 *   bun run scripts/publish.ts major   # 0.0.1 -> 1.0.0
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const PACKAGES = ["types", "backend"] as const;

type VersionBump = "patch" | "minor" | "major";

const versionBump = (process.argv[2] as VersionBump) || "patch";

if (!["patch", "minor", "major"].includes(versionBump)) {
  console.error("❌ 无效的版本类型，请使用: patch | minor | major");
  process.exit(1);
}

// 读取包的版本号
async function getPackageVersion(pkg: string): Promise<string> {
  const pkgJson = JSON.parse(await readFile(join("packages", pkg, "package.json"), "utf-8"));
  return pkgJson.version;
}

function bumpVersion(version: string, bump: VersionBump): string {
  const [major, minor, patch] = version.split(".").map((part) => Number.parseInt(part, 10));

  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    throw new Error(`无法解析版本号: ${version}`);
  }

  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function updatePackageVersion(pkg: string, version: string) {
  const pkgPath = join("packages", pkg, "package.json");
  const content = await readFile(pkgPath, "utf-8");
  const pkgJson = JSON.parse(content);

  pkgJson.version = version;

  await writeFile(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
}

// 替换 workspace:* 为实际版本号
async function replaceWorkspaceProtocol(pkg: string, versions: Record<string, string>) {
  const pkgPath = join("packages", pkg, "package.json");
  const content = await readFile(pkgPath, "utf-8");
  const pkgJson = JSON.parse(content);

  let modified = false;

  for (const depType of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkgJson[depType];
    if (!deps) continue;

    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        // 从 @amigo-llm/types 提取 types
        const pkgName = name.replace("@amigo-llm/", "");
        const actualVersion = versions[pkgName];
        if (actualVersion) {
          deps[name] = `^${actualVersion}`;
          modified = true;
          console.log(`  📝 ${name}: workspace:* -> ^${actualVersion}`);
        }
      }
    }
  }

  if (modified) {
    await writeFile(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
  }

  return modified;
}

// 恢复 workspace:* 协议
async function restoreWorkspaceProtocol(pkg: string) {
  const pkgPath = join("packages", pkg, "package.json");
  const content = await readFile(pkgPath, "utf-8");
  const pkgJson = JSON.parse(content);

  for (const depType of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkgJson[depType];
    if (!deps) continue;

    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === "string" && name.startsWith("@amigo-llm/")) {
        deps[name] = "workspace:*";
      }
    }
  }

  await writeFile(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");
}

console.log(`\n🚀 开始发布流程 (${versionBump})\n`);

// 1. 安装依赖
console.log("📦 安装依赖...");
await $`bun install`;

// 2. 打包所有包
for (const pkg of PACKAGES) {
  console.log(`\n🔨 打包 @amigo-llm/${pkg}...`);
  await $`bun run build`.cwd(`packages/${pkg}`);
}

// 3. 更新版本号
console.log("\n📝 更新版本号...");
const versions: Record<string, string> = {};
for (const pkg of PACKAGES) {
  const currentVersion = await getPackageVersion(pkg);
  versions[pkg] = bumpVersion(currentVersion, versionBump);
  await updatePackageVersion(pkg, versions[pkg]);
  console.log(`  @amigo-llm/${pkg}: ${versions[pkg]}`);
}

// 4. 替换 workspace:* 为实际版本号
console.log("\n🔄 替换 workspace 协议...");
for (const pkg of PACKAGES) {
  await replaceWorkspaceProtocol(pkg, versions);
}

// 5. 发布
try {
  for (const pkg of PACKAGES) {
    console.log(`\n📤 发布 @amigo-llm/${pkg}@${versions[pkg]}...`);
    await $`npm publish --access public`.cwd(`packages/${pkg}`);
  }
  console.log("\n✅ 所有包发布完成!\n");
} finally {
  // 6. 恢复 workspace:* 协议
  console.log("🔄 恢复 workspace 协议...");
  for (const pkg of PACKAGES) {
    await restoreWorkspaceProtocol(pkg);
  }
}
