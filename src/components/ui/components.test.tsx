import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Button, Panel, Badge, HealthBar, ResourceIndicator, TERMINAL_COLORS, RARITY_THEMES } from './index';
import { CardFrame } from '../cards/CardFrame';
import type { CardId } from '../../game/types';

describe('Phase 1: Design Tokens 与基础 UI 终端组件', () => {
  it('Design Tokens: 集中管理终端色系与稀有度色值', () => {
    expect(TERMINAL_COLORS.bgBase).toBe('#171a1d');
    expect(TERMINAL_COLORS.accent).toBe('#e5a52b');
    expect(RARITY_THEMES[6].color).toBe('#f97316');
    expect(RARITY_THEMES[3].color).toBe('#94a3b8');
  });

  it('Badge: 正确渲染稀有度与职业徽章', () => {
    const htmlRarity = renderToString(<Badge variant="rarity" value={6} />);
    expect(htmlRarity).toContain('★★★★★★');

    const htmlClass = renderToString(<Badge variant="class" value="vanguard" />);
    expect(htmlClass).toContain('先锋');
  });

  it('HealthBar: 正确计算生命百分比与护盾显示', () => {
    const html = renderToString(<HealthBar currentHp={15} maxHp={30} shield={5} />).replace(/<!-- -->/g, '');
    expect(html).toContain('15');
    expect(html).toContain('30');
    expect(html).toContain('+5');
  });

  it('ResourceIndicator: 正确渲染 DP 与 SP 数值', () => {
    const htmlDp = renderToString(<ResourceIndicator type="dp" current={8} max={10} />);
    expect(htmlDp).toContain('DP');
    expect(htmlDp).toContain('8');
    expect(htmlDp).toContain('10');

    const htmlSp = renderToString(<ResourceIndicator type="sp" current={4} max={5} />);
    expect(htmlSp).toContain('SP');
    expect(htmlSp).toContain('4');
  });

  it('Button: 正确应用变体与禁用状态属性', () => {
    const html = renderToString(
      <Button variant="primary" disabled>
        确认行动
      </Button>,
    );
    expect(html).toContain('disabled');
    expect(html).toContain('确认行动');
  });

  it('Panel: 正确渲染战术标题与代号', () => {
    const html = renderToString(
      <Panel title="作战参数" codeName="SYS.GRID">
        <div>参数内容</div>
      </Panel>,
    );
    expect(html).toContain('作战参数');
    expect(html).toContain('SYS.GRID');
    expect(html).toContain('参数内容');
  });

  it('CardFrame: 正确渲染卡牌立绘、名称、费用与 SVG 几何框架', () => {
    const html = renderToString(
      <CardFrame
        cardId={'OP-VAN-001' as CardId}
        definition={{
          card_id: 'OP-VAN-001' as CardId,
          card_name_zh: '芬',
          card_type: 'operator',
          cost: 2,
          rarity: 3,
          atk: 3,
          hp: 12,
        }}
        variant="deck"
      />,
    ).replace(/<!-- -->/g, '');
    expect(html).toContain('芬');
    expect(html).toContain('2'); // Cost
    expect(html).toContain('ATK 3');
    expect(html).toContain('<svg');
  });
});
