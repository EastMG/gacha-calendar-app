# AGENTS.md — 开发流程铁律

本文件的约定沿用同系列两个仓库（[`dsh-gacha-calendar`](https://github.com/EastMG/dsh-gacha-calendar)、
[`gacha-calendar-extension`](https://github.com/EastMG/gacha-calendar-extension)）的既有规矩，
针对本仓库的形态做了调整。**未获新的明确指令前一直有效。**

## 自动做（无需询问）

- 改代码、加测试、改文档
- 跑门禁直到全绿：`npm run check`（= 类型检查 + 编译 + `node --test`）
- `git add` + `git commit`
- `git push origin HEAD:main`

## 必须先拿到用户明确指令（默认一律不做）

- **升级版本号**
- **打 tag**（`git tag`）
- **GitHub Release**
- **任何发布**（npm / 应用商店 / 分发包）

「明确指令」= 用户在当轮消息里**点名要求**发布 / 升级 / 打 tag。
「改完了」「继续」「可以」这类不算。只报告"已通过门禁"**不等于**授权发布。

## 门禁

```
npm run check
```

包含三步，缺一不可：

1. `npm run typecheck` —— `tsc --noEmit`，零错误
2. `npm run build` —— 编译到 `build/`（预览依赖它）
3. `npm test` —— `node --test --test-isolation=none`，当前 **62 通过 / 0 失败**

> `--test-isolation=none` 不是随意加的：默认隔离模式会为每个测试文件起子进程，
> 在受限环境（如沙箱）里会 `spawn EPERM`。进程内跑既快又不依赖子进程权限。

## 本仓库特有的硬约束

1. **`packages/*` 里不许出现任何 UI 框架或平台 API。**
   它们是三端壳共用的长期资产。平台相关的东西放 `apps/` 或将来的壳工程里。

2. **不许改 `gacha-calendar-core` 的行为。**
   它是上游 npm 包（精确钉版本，不用 `^`）。要改抓取逻辑请去
   [`dsh-gacha-calendar`](https://github.com/EastMG/dsh-gacha-calendar)（core 的真源）。

3. **`packages/schedule` 不许依赖 `Intl` / `ICU`。**
   原因见 `packages/schedule/src/timezone.ts` 顶部：移动端 JS 引擎 ICU 缺失会**静默**偏 8–9 小时。
   换算一律用固定偏移整数运算。

4. **不许编造时间精度。**
   源站只给日期的事件必须标 `precision: "day"`，界面不得显示到分钟，也不得为它排提醒。

5. **`GAME_TZ` 表必须与上游同步。**
   `packages/schedule/test/roundtrip.test.ts` 会断言快照里出现的每款游戏都有显式时区；
   上游新增游戏时若漏配，门禁会挂。

6. **`fixtures/sample-result.json` 是真实快照，不要手改。**
   它是测试基线，换了就等于换了验收标准。需要更新时用 `npm run dev` 刷新后另行导出，
   并在 PR/commit message 里说明抓取时间。

## 提交信息

中文，一句话说清"改了什么 + 为什么"。涉及取舍的，把理由写进 body。
