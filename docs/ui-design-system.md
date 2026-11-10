# Arknights Tactical Terminal 设计系统规范 (docs/ui-design-system.md)

> **设计概念：** 罗德岛 PRTS 战术作战终端（Tactical Command Terminal）。  
> **设计基调：** 工业科幻、冷静克制、高辨识度战场、严谨的信息层级。

---

## 1. 色彩系统 (Color Tokens)

```css
:root {
  /* 背景层级 */
  --color-bg-base: #171a1d;       /* 终端底色 (深灰黑，非纯黑) */
  --color-bg-sub: #20262b;        /* 二级容器、侧栏、卡组抽屉 */
  --color-bg-panel: #293137;      /* 信息面板、卡牌浮层 */
  --color-bg-raised: #343d43;     /* 高亮弹出层、悬浮选中 */

  /* 文字层级 */
  --color-text-primary: #e8e9e6;   /* 主要高对比文本 (白近微暖) */
  --color-text-secondary: #aab2b5; /* 辅助文字、技能说明、参数 */
  --color-text-muted: #778187;     /* 非重点编号、修饰标注 */

  /* 功能与强调色 */
  --color-accent: #e5a52b;         /* 明日方舟黄 / 部署费用 / 关键操作 */
  --color-ally: #38bdf8;           /* 友方蓝 (Sky Blue / 玩家 A) */
  --color-enemy: #fb7185;          /* 敌方红 (Rose / 玩家 B) */
  --color-success: #34d399;        /* 成功 / 就绪 / 治疗 */
  --color-warning: #fbbf24;        /* 警告 / 费用不足 / 阻挡预警 */
  --color-danger: #f87171;         /* 危险 / 受击 / 阵亡 */

  /* 结构分割与线条 */
  --color-border: #4a555b;         /* 面板线框 */
  --color-border-subtle: #2d353b;  /* 次级细分隔线 */

  /* 稀有度主题色 */
  --rarity-3: #94a3b8;            /* 3星: 灰蓝/标准干员 */
  --rarity-4: #a855f7;            /* 4星: 紫色/精英干员 */
  --rarity-5: #eab308;            /* 5星: 金黄/资深干员 */
  --rarity-6: #f97316;            /* 6星: 橙红/高级资深干员 */
}
```

---

## 2. 字体与排版规范

- **正文字体：** `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`
- **英文与代号：** `'Teko', 'DIN Alternate', 'Bebas Neue', 'Chakra Petch', monospace`
- **数字与费用：** 必须使用等宽数字特性 `font-feature-settings: "tnum" 1;` 避免生命值与费用跳动。
- **排版层级：**
  - Terminal Header: 18px ~ 22px, Bold, 带技术编号
  - Operator Title: 14px ~ 16px, SemiBold
  - Body Text: 12px ~ 13px, Regular, 适度行高
  - Annotation / Stat Label: 10px ~ 11px, Uppercase, Tracking-wide

---

## 3. 切角与工业图形语言

- **非对称切角：** 使用 CSS `clip-path: polygon(...)` 营造终端面板与卡片切角：
  - 8px 切角: `clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));`
- **技术条纹与网格：** 采用微妙的半透明线性重复背景（Scanlines / Grid pattern），透明度控制在 0.03 ~ 0.08，不干扰立绘阅读。
- **状态高亮：** 选中单位添加外发光与脉冲边框，未选中保持克制。

---

## 4. 卡框与立绘分层规范 (CardFrame Spec)

卡框由纯 CSS + SVG 绘制，坚决不依赖外部 PNG 卡框：
1. **背景层 (Background Layer)**：依据干员职业与星级渲染暗灰碳纤维纹理。
2. **立绘层 (Portrait Artwork Layer)**：显示官方原版 WebP 立绘；缺图时触发 Fallback 剪影。
3. **几何框体 (Frame Geometry Layer)**：SVG/CSS 切角边框、星级色带、工业标尺编号。
4. **信息文字层 (Text & Stats Layer)**：动态渲染费用徽章、干员中文名与拼音/代号、攻击/生命/SP 等。
5. **交互覆层 (Interaction Layer)**：悬停呼吸高亮、拖放反馈、选中边框、不可部署暗角。
