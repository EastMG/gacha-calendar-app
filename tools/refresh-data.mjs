#!/usr/bin/env node
/**
 * 抓一轮数据，写成 **PWA 的静态数据文件** `apps/preview/data/latest.json`。
 *
 * ## 为什么 PWA 需要这个
 *
 * 浏览器永远受 CORS 约束：28 个源站里只有少数回了 `access-control-allow-origin`，
 * 所以**静态托管的网页不可能实时抓取**。而 Node 没有 CORS。
 * 于是把"抓取"搬到构建/CI 侧：
 *
 *   GitHub Actions（每 6 小时）→ 本脚本抓一轮 → 重新部署 Pages
 *
 * 结果是一个**零服务端**、却能近实时更新的 PWA。
 *
 * ## 顺带证明了一件事
 *
 * 本脚本直接使用 `packages/core-bridge`（而不是另写一套抓取），
 * 等于验证了「同一个适配层能在非浏览器运行时跑」—— 这正是未来三端壳要依赖的能力。
 *
 * 用法：node tools/refresh-data.mjs [--out <path>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppEngine, createFetchHttpClient, createMemoryStorage } from "../packages/core-bridge/src/index.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_OUT = resolve(ROOT, "apps/preview/data/latest.json");

/** 抓取成功的最低款数 —— 低于它认为"这轮是全局故障"，不覆盖已有数据 */
const MIN_OK = 20;

function outPathFromArgv() {
  const index = process.argv.indexOf("--out");
  if (index !== -1 && process.argv[index + 1]) return resolve(process.argv[index + 1]);
  return DEFAULT_OUT;
}

async function main() {
  const out = outPathFromArgv();
  console.log("二游日历 · 数据快照");
  console.log("─".repeat(48));

  const { engine } = createAppEngine({
    http: createFetchHttpClient(),
    storage: createMemoryStorage(),
    now: () => Date.now()
  });

  const startedAt = Date.now();
  const result = await engine.refresh();
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  const records = Object.entries(result.games ?? {});
  const okCount = records.filter(([, rec]) => rec && (rec.banner || rec.event)).length;
  const failCount = records.filter(([, rec]) => rec && (rec.gachaFail || rec.eventFail)).length;

  console.log(`  游戏 ${records.length} 款 · 有数据 ${okCount} 款 · 有失败 ${failCount} 款 · 耗时 ${seconds}s`);

  if (okCount < MIN_OK) {
    console.warn(
      `\n  ⚠️ 只有 ${okCount} 款抓到数据（低于阈值 ${MIN_OK}），判断为网络/上游整体故障。\n` +
        `     不覆盖已有快照，退出码 0（避免 CI 因上游抖动而失败）。`
    );
    return;
  }

  const payload = {
    ...result,
    meta: {
      generatedAt: new Date().toISOString(),
      okCount,
      failCount,
      total: records.length,
      generator: "tools/refresh-data.mjs"
    }
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(payload), "utf8");
  console.log(`\n  ✓ 已写入 ${out.replace(ROOT + "\\", "").replace(ROOT + "/", "")}`);
  console.log(`    refreshedAt = ${new Date(result.refreshedAt).toISOString()}`);
}

await main();
