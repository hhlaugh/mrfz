# 阶段 6 收尾报告（Phase 6 Report）v0.1

> 日期：2026-11-03
> 范围：React 本地对战 UI（不联网、无机器人）。依据 `CODEX_RUNBOOK_v0.1.md` 阶段 6 与 `DEMO_SCOPE_v0.2.md`。
> 引擎边界：**`src/game/` 既有引擎文件零改动**；UI 全部状态来自规则引擎，UI 层不计算任何费用/伤害/SP/退款/CD。

---

## 1. 结论

**阶段 6 完成。** 固定牌组可从标题页 → 选牌组 → 双方起手换牌 → 完整对战（部署/战术/技能/撤离交互 + 自动战斗）进行到胜负结算；typecheck、60 项测试、生产构建、浏览器实机冒烟全部通过。

## 2. 改动文件清单

**新增（18 个）**

| 文件 | 作用 |
|---|---|
| `index.html` | Vite 应用入口 |
| `src/main.tsx` | React 挂载入口 |
| `src/game/legal-actions.ts` | **引擎层合法动作枚举**（阶段 5 报告预告的接口）：返回当前决策点全部引擎认可的动作，UI 高亮/按钮可用性唯一来源 |
| `src/game/legal-actions.test.ts` | 4 项测试：mulligan 阶段无动作、动作全部可过引擎验证、0 费用时隐藏不可负担动作、部署位规则（front_only/浮空后位） |
| `src/client/localGameController.ts` | 本地 GameController：包装引擎 `createInitialGameState / mulligan / reduceGameAction / advancePhase`；自动推进无人决策阶段（行动→战斗→回合结束→下家回合开始，遇回合开始支援选择即停）；跨战斗阶段累积展示用日志；失败分发零状态变更 |
| `src/client/localGameController.test.ts` | 4 项测试：**随机合法动作经 dispatch 完整整局至胜负**、日志严格单调、end_action_phase 后自动推进到下个决策点、越权/非法分发原子拒绝 |
| `src/client/demoData.ts` | 卡池/牌组加载（复用引擎校验），UI 卡片扩展字段 |
| `src/client/App.tsx` | 屏幕路由（标题/选牌组/游戏） |
| `src/client/ui.css` | 全部样式（暗色主题，桌面优先 + ≤900px 适配） |
| `src/views/StartView.tsx` `DeckSelectView.tsx` `MulliganView.tsx` `BattleView.tsx` `SettlementView.tsx` | 五个页面 |
| `src/components/CardView.tsx` `UnitView.tsx` `PlayerBar.tsx` `LogView.tsx` | 手牌卡 / 场上单位 / 玩家信息条 / 战斗日志 |

**修改（2 个）**

- `vite.config.ts`：按模式切换构建——默认为 UI 应用构建；原引擎库构建保留为 `npm run build:lib`（产出 `dist/game-data.js`，行为与阶段 1–5 一致）。
- `package.json`：新增 `build:lib`、`preview` 两个脚本。

## 3. 实际执行的验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 退出码 0 |
| `npm run test` | ✅ **8 个测试文件 / 60 个测试全部通过**（阶段 5 的 52 项 + 新增 8 项，200 局模拟回归不变） |
| `npm run build` | ✅ 应用构建：`dist/index.html` + assets（307.88 kB JS / 8.72 kB CSS） |
| 浏览器实机冒烟（`npm run dev` @ http://localhost:5173，440×621 视口即手机宽度） | ✅ 全流程走通，见 §5 |

## 4. 阶段 6 要求逐项对照

| 要求 | 状态 | 实现方式 |
|---|---|---|
| 开始页 / 牌组选择 / 起手换牌 / 对战页 / 结算页 | ✅ | 五个视图；牌组可选 A/B（允许同套），seed 可填可随机 |
| 双方基本分、cost、牌库/弃牌堆数量 | ✅ | PlayerBar（含疲劳计数、设施芯片+触发次数） |
| 左中右三路、双方前后位 | ✅ | 3×2×2 棋盘格；当前行动方半区高亮 |
| 手牌 | ✅ | 双方手牌区（热座模式明示展示双方，见 §7-1） |
| 干员 HP/ATK/SP/状态、支援区 | ✅ | 单位卡显示 HP、当前 ATK（展示汇总，结算仍在引擎）、SP、护盾、状态芯片（含剩余回合）、装备芯片；浮空标记 |
| 阶段提示、战斗日志 | ✅ | 回合数+阶段徽章+seed；日志跨战斗累积、按事件类型着色、超过 200 条折叠 |
| 选卡后高亮合法部署位/目标 | ✅ | 高亮集合完全来自 `enumerateLegalActions`（引擎验证过滤），如近战仅前排 3 格、远程 6 格、战术/装备仅合法目标发光 |
| 普通撤离只对合法目标可用 | ✅ | 按钮可用性由引擎枚举决定（冻结/对方半区等自动禁用） |
| 快速撤离按战术卡使用 | ✅ | 即 `play_card` 目标流程（手牌带 CD 徽章；引擎行为由既有 17 项撤离测试覆盖） |
| 技能显示 SP 成本 | ✅ | 按钮文案「主动技能（SP n）」，数据来自卡牌定义 |
| 非法操作展示原因 | ✅ | dispatch 失败弹出引擎返回的 reason（实测：越权点对方手牌 →「当前不能操作这张手牌。」） |
| UI 只发 GameAction 给 GameController | ✅ | UI 仅调用 `submitMulligan` / `dispatch` / 只读快照；不引入任何游戏数值计算 |
| 占位图标、无立绘无复杂动画 | ✅ | 名称首字图标 + 纯 CSS 高亮 |
| 桌面优先、手机宽度基本可操作 | ✅ | 全部冒烟在 440px 宽视口完成 |
| **验收：固定牌组从换牌完整玩到胜负** | ✅ | 控制器自动化整局测试（随机合法动作经 dispatch 打到 finished）+ 浏览器人工走至战斗结算、击杀、状态施加 |

## 5. 浏览器实机冒烟记录（发现并修复 2 个 UI bug）

走通路径：标题 → 选牌组（A vs B，随机 seed）→ A 换 2 张 / B 保留 → 对战页（回合 1 · 行动阶段 · 玩家 A，费用 3/10、抽 1 后牌库 14）→ 选「史都华德」高亮 6 个合法位 → 部署成功（费用 3→1）→ 选中单位操作条（普通撤离可用、主动技能 SP 3）→ 结束行动阶段 → **本回合部署的单位按规则不攻击**（无日志，符合 v0.7）→ B 回合：越权点 A 手牌被拒（toast）→ B 部署「克洛丝」→ A 回合结束自动战斗：史都华德自然回复 SP → 普通攻击(3) → 同路选择克洛丝 → 3 点伤害击杀 → 击杀 SP → 克洛丝入弃牌堆 → B 用「战场冻结」冻结史都华德（HP 不变、状态芯片「冻结 1」、卡牌消耗）。

冒烟中发现并修复的 bug（均为 UI 层，引擎零改动）：

1. **App 路由兜底条件错误**：`title || !controller` 把"选牌组"页拦回标题页 → 拆分分支，仅在进入对局时要求 controller 存在。
2. **MulliganView 跨玩家复用残留状态**：从玩家 A 换牌切到玩家 B 时未重挂载，残留 A 的选择导致引擎正确拒绝（「换牌只能选择自己的起手手牌」）→ `key={nextPlayer}` 强制重挂载。此 bug 同时验证了"非法操作展示原因"链路真实生效。

## 6. 已知事项

1. **热座显示双方手牌**：本地同屏双人无隐藏信息需求；隐藏信息边界（PlayerView）属阶段 8。
2. 快速撤离的浏览器实测未单独执行（本局手牌未出现合适目标），其 UI 流程与已实测的战术卡目标流程完全相同（同一 `play_card` 通路），引擎行为由既有测试覆盖。
3. `dist/` 现在是 UI 应用构建；需要引擎 ES 库时使用 `npm run build:lib`。
4. dev server 仍在后台运行（http://localhost:5173）；重启用 `npm run dev`。
5. 单位卡 ATK 为「基础+修正」的展示汇总，仅用于显示，一切结算在引擎内。

## 7. 阶段 7（机器人 AI）前置条件确认

| 前置条件 | 状态 |
|---|---|
| 引擎 + 60 项回归全绿 | ✅ |
| 合法动作枚举已引擎化（机器人可直接复用 `enumerateLegalActions`） | ✅ |
| 控制器决策点清晰（action / 回合开始选择 / finished），AI 可作为普通动作提供方接入 `dispatch` | ✅ |
| UI 与机器人解耦（阶段 7 只需在"非当前玩家决策点"接 AI provider，不动规则引擎） | ✅ |
