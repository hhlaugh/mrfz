# 修订报告（Amendment Report）v0.1 · 2026-11-03

> 背景：阶段 8 完成后，按用户决定落实两条修改建议。修改遵循"规则文档先行"：先修订 `GAME_RULES_v0.7.md`，再同步卡牌数据与引擎默认值，最后 UI 与测试对齐。

---

## 修订 1：等待再部署的手牌变灰

**行为**：撤离后进入再部署冷却（`redeploy_cd_remaining > 0`）的干员手牌以半透明灰显呈现，并保留"再部署 CD：n"数字徽章；点击时弹出原因提示，不进入选择状态。

**改动**：
- `src/components/CardView.tsx`：CD > 0 时追加 `card-dimmed` 类。
- `src/views/BattleView.tsx`：点击 CD 手牌时提示"再部署冷却中：还需跳过 n 个己方行动阶段才能重新部署。"（选择状态不改变）。
- `src/client/ui.css`：`.card-dimmed { opacity: 0.45; filter: grayscale(0.65); }`，交互光标改为 not-allowed。

**浏览器实测**：部署泡泡 → 普通撤离 → 手牌出现灰显卡（含"再部署 CD：1"徽章），点击弹出冷却提示 ✅。

## 修订 2：远程干员默认不可部署前排（特种/特殊技能干员例外）

**规则**（原规则：远程可依 `deploy_rule` 部署前位或后位）：**远程干员默认只能部署后位**；特种干员或具有特殊部署技能的干员通过卡牌 `deploy_rule=front_or_back` 显式声明后排部署资格，引擎按卡面数据执行，不在引擎中硬编码职业特例。

**改动**：
| 文件 | 内容 |
|---|---|
| `DEMO_PACKAGE_v0.2_FRIEND_MATCH/GAME_RULES_v0.7.md` | §部署位置条目修订（带 2026-11-03 修订标记）：近战默认前位；**远程默认后位**；`deploy_rule=front_or_back` 保留为特种/特殊技能干员的前排例外通道 |
| `DEMO_PACKAGE_v0.2_FRIEND_MATCH/CARD_FIELDS_v0.7.csv` | `deploy_rule` 字段说明同步新默认值语义 |
| `src/data/demo-card-pool.json` | 克洛丝（sniper）、史都华德（caster）：`deploy_rule` front_or_back → **back_only**（安赛尔、浮空侦察机本就是 back_only；Demo 卡池无特种干员，无需例外卡） |
| `DEMO_PACKAGE_v0.2_FRIEND_MATCH/DEMO_CARD_POOL_v0.3.csv` | 同步上述两张卡的数据 |
| `src/game/engine.ts` | `deploymentPositionAllowed` 兜底默认：无显式 `deploy_rule` 时远程按 back_only（与修订一致），并留注释 |
| `src/game/lifecycle.test.ts` | 部署测试**新增断言：远程干员部署前位被拒绝**（配合既有"后位合法"断言） |

**验证**：
- 全量回归 **82/82 通过**（含 200 局规则回归、120 局 bot 模拟——bot 的高亮/枚举自动适应新规则）、typecheck 0、构建通过。
- 浏览器实测：选中克洛丝仅高亮 **3 个后位格**（修订前为 6 格，含 3 前位），`allBack=true`，后位部署成功 ✅。

## 附带发现并修复的回归（浏览器冒烟发现）

**热座模式在玩家 B 换牌时卡死**：阶段 7 重写 App 时，"机器人正在选择起手牌…"等待页只判断了座位（`nextPlayer === botSeat`），未判断当前模式是否真的有机器人，导致热座模式下 A 确认换牌后 B 的换牌页被顶掉。已修复为 `bot && nextPlayer === botSeat`（单人模式行为不变），并重新走通热座全流程（A/B 换牌 → 对战 → 部署/撤离）。此回归说明每阶段冒烟需覆盖两种模式，已记入后续检查习惯。

## 当前状态

- 测试：11 个文件 / **82 项全部通过**；typecheck、生产构建通过。
- 阶段 0–8 全部完成；下一阶段 9（Node.js + Socket.IO 中继服务）待开始。
