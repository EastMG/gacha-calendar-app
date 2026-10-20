#!/usr/bin/env node
/**
 * 生成 **可静态托管、可安装** 的 PWA 产物到 `dist/`。
 *
 * 没有打包器：只要 tsc 编译 + 拷文件。产物结构刻意与开发服务器**完全一致**，
 * 这样 `npm run dev` 看到的就是线上形态，不会出现"本地好、部署坏"。
 *
 *   dist/
 *   ├─ index.html                （相对路径引用，支持部署到子路径）
 *   ├─ styles.css
 *   ├─ manifest.webmanifest
 *   ├─ sw.js                     （由 sw.template.js 注入版本与预缓存清单）
 *   ├─ icons/*.png
 *   ├─ data/latest.json          （抓取快照，由 tools/refresh-data.mjs 生成）
 *   ├─ build/…                   （tsc 产物）
 *   ├─ vendor/core.mjs           （上游 core，供 import map 使用）
 *   └─ .nojekyll                 （GitHub Pages 不要用 Jekyll 处理）
 *
 * 用法：node tools/build-pwa.mjs
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = resolve(ROOT, "dist");
const PREVIEW = resolve(ROOT, "apps/preview");

function log(message) {
  console.log(`  ${message}`);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(dirname(to));
  copyFileSync(from, to);
}

function copyDir(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else copyFile(src, dst);
  }
}

/** 递归列出 dist 下所有文件（相对 dist 的 POSIX 路径） */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(relative(DIST, full).split(sep).join("/"));
  }
  return out;
}

function makeVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  return `${pkg.version}-${Date.now().toString(36)}`;
}

function main() {
  console.log("二游日历 · 构建 PWA");
  console.log("─".repeat(48));

  // 1) 清空产物
  rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);

  // 2) 编译 TS
  log("tsc …");
  const tsc = resolve(ROOT, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd: ROOT, stdio: "inherit" });

  // 3) 静态文件
  const staticFiles = ["index.html", "styles.css", "manifest.webmanifest"];
  for (const name of staticFiles) {
    copyFile(join(PREVIEW, name), join(DIST, name));
    log(`copy ${name}`);
  }

  const iconsDir = join(PREVIEW, "icons");
  if (existsSync(iconsDir)) {
    copyDir(iconsDir, join(DIST, "icons"));
    log(`copy icons/ (${readdirSync(iconsDir).length} 个)`);
  } else {
    console.warn("  ⚠️ 缺少 icons/，先跑 python tools/make-icons.py");
  }

  // 4) 编译产物
  const buildDir = resolve(ROOT, "build");
  if (!existsSync(buildDir)) throw new Error("build/ 不存在，tsc 可能失败了");
  copyDir(buildDir, join(DIST, "build"));
  log("copy build/");

  // 5) 上游 core（import map 指向它）
  const corePath = resolve(ROOT, "node_modules", "gacha-calendar-core", "core.mjs");
  if (!existsSync(corePath)) throw new Error("找不到 node_modules/gacha-calendar-core/core.mjs，先 npm ci");
  copyFile(corePath, join(DIST, "vendor", "core.mjs"));
  log(`copy vendor/core.mjs (${(statSync(corePath).size / 1024).toFixed(0)} KB)`);

  // 6) 数据快照
  const dataPath = join(PREVIEW, "data", "latest.json");
  if (existsSync(dataPath)) {
    copyFile(dataPath, join(DIST, "data", "latest.json"));
    log(`copy data/latest.json (${(statSync(dataPath).size / 1024).toFixed(0)} KB)`);
  } else {
    console.warn("  ⚠️ 缺少 data/latest.json，PWA 会没有初始数据。跑 npm run data:refresh");
  }

  // 7) Service Worker（预缓存清单按 dist 实际文件生成，避免手写漏项导致 install 失败）
  const version = makeVersion();
  const files = walk(DIST).filter((file) => file !== "sw.js");
  const precache = ["./", ...files.map((file) => `./${file}`)];
  const template = readFileSync(join(PREVIEW, "sw.template.js"), "utf8");
  const sw = template
    .replace("__VERSION_TOKEN__", version)
    .replace("__PRECACHE_TOKEN__", JSON.stringify(precache, null, 2));
  // 构建期就校验语法：这类错误在浏览器里只表现为"SW 注册失败"，很难排查。
  try {
    new Function(sw);
  } catch (error) {
    throw new Error(`生成的 sw.js 有语法错误：${error instanceof Error ? error.message : String(error)}`);
  }
  if (sw.includes("__PRECACHE_TOKEN__") || sw.includes("__VERSION_TOKEN__")) {
    throw new Error("sw.js 里仍有未替换的占位符");
  }
  writeFileSync(join(DIST, "sw.js"), sw, "utf8");
  log(`生成 sw.js（版本 ${version}，预缓存 ${precache.length} 项，语法校验通过）`);

  // 8) GitHub Pages 用
  writeFileSync(join(DIST, ".nojekyll"), "", "utf8");

  // 9) 汇总
  const total = walk(DIST).reduce((sum, file) => sum + statSync(join(DIST, file)).size, 0);
  console.log("─".repeat(48));
  log(`产物：${walk(DIST).length} 个文件，合计 ${(total / 1024).toFixed(0)} KB`);
  log(`目录：${DIST}`);
}

main();
