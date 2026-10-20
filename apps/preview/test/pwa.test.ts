/**
 * PWA 静态产物的规范检查。
 *
 * 这些错误在浏览器里只表现为"装不上 / 白屏 / 离线打不开"，排查成本很高，
 * 所以在构建前用测试挡住：
 *  · manifest 字段缺失 → 不可安装
 *  · 图标路径写错 → 安装后图标空白
 *  · index.html 用了绝对路径 → 部署到 `/gacha-calendar-app/` 这种子路径就全 404
 *  · SW 占位符没替换 / 重复出现 → 脚本语法错误（曾经真的踩过）
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const PREVIEW = fileURLToPath(new URL("..", import.meta.url));
const read = (name: string): string => readFileSync(`${PREVIEW}/${name}`, "utf8");

interface Manifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  background_color?: string;
  theme_color?: string;
  icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
}

const manifest = JSON.parse(read("manifest.webmanifest")) as Manifest;
const html = read("index.html");
const swTemplate = read("sw.template.js");

describe("manifest", () => {
  it("必填字段齐全（缺一个 Chrome 就不给安装）", () => {
    assert.ok(manifest.name, "name");
    assert.ok(manifest.short_name, "short_name");
    assert.equal(manifest.start_url, "./", "start_url 必须相对，才能部署到子路径");
    assert.equal(manifest.scope, "./");
    assert.equal(manifest.display, "standalone");
    assert.match(manifest.theme_color ?? "", /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color ?? "", /^#[0-9a-f]{6}$/i);
  });

  it("同时提供 192 与 512，且有一个 maskable（安卓自适应图标）", () => {
    const icons = manifest.icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    assert.ok(sizes.includes("192x192"), "缺 192x192");
    assert.ok(sizes.includes("512x512"), "缺 512x512");
    assert.ok(
      icons.some((i) => (i.purpose ?? "").includes("maskable")),
      "缺 maskable 图标，安卓上会被裁成方块"
    );
  });

  it("每个图标文件都真实存在", () => {
    for (const icon of manifest.icons ?? []) {
      assert.ok(icon.src, "icon 缺 src");
      const path = `${PREVIEW}/${icon.src!.replace(/^\.\//, "")}`;
      assert.ok(existsSync(path), `图标不存在：${icon.src}`);
    }
  });

  it("shortcuts 指向的 URL 都不带绝对路径", () => {
    const raw = read("manifest.webmanifest");
    assert.equal(/"url"\s*:\s*"\//.test(raw), false, "shortcuts 用了绝对路径");
  });
});

describe("index.html", () => {
  it("声明了 manifest、主题色、apple-touch-icon", () => {
    assert.match(html, /rel="manifest"/);
    assert.match(html, /name="theme-color"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, /name="apple-mobile-web-app-capable"/);
  });

  it("本地资源一律用相对路径（否则部署到子路径全 404）", () => {
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]!);
    const local = refs.filter((r) => !/^https?:|^data:/.test(r));
    for (const ref of local) {
      assert.ok(ref.startsWith("./"), `资源用了非相对路径：${ref}`);
    }
  });

  it("import map 把 core 指向相对路径", () => {
    assert.match(html, /"gacha-calendar-core"\s*:\s*"\.\/vendor\/core\.mjs"/);
  });

  it("viewport 带 viewport-fit=cover（刘海屏安全区）", () => {
    assert.match(html, /viewport-fit=cover/);
  });
});

describe("Service Worker 模板", () => {
  it("两个占位符各出现一次（重复出现曾导致注释被替换、脚本语法错误）", () => {
    const count = (needle: string): number => swTemplate.split(needle).length - 1;
    assert.equal(count("__VERSION_TOKEN__"), 1, "__VERSION_TOKEN__ 出现次数不对");
    assert.equal(count("__PRECACHE_TOKEN__"), 1, "__PRECACHE_TOKEN__ 出现次数不对");
  });

  it("没有残留的旧占位符名", () => {
    assert.equal(swTemplate.includes("__PRECACHE__"), false);
    assert.equal(swTemplate.includes("__VERSION__"), false);
  });

  it("三个生命周期钩子都在", () => {
    assert.match(swTemplate, /addEventListener\("install"/);
    assert.match(swTemplate, /addEventListener\("activate"/);
    assert.match(swTemplate, /addEventListener\("fetch"/);
  });

  it("不拦截跨域请求（SW 插手只会让 CORS 错误更难查）", () => {
    assert.match(swTemplate, /url\.origin !== self\.location\.origin/);
  });
});
