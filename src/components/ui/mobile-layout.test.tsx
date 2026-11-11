import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BottomSheet } from './BottomSheet';

describe('Phase 3: 移动端独立布局与抽屉组件测试', () => {
  it('BottomSheet: 当 isOpen 为 false 时不渲染任何 DOM 内容', () => {
    const html = renderToString(
      <BottomSheet isOpen={false} onClose={() => {}} title="战斗日志">
        <div>日志内容</div>
      </BottomSheet>,
    );
    expect(html).toBe('');
  });

  it('BottomSheet: 当 isOpen 为 true 时渲染抽屉标题、代号与内容', () => {
    const html = renderToString(
      <BottomSheet isOpen={true} onClose={() => {}} title="干员战术档案" codeName="OP-VAN-001">
        <div data-testid="drawer-body">干员属性与技能详情</div>
      </BottomSheet>,
    );
    expect(html).toContain('干员战术档案');
    expect(html).toContain('OP-VAN-001');
    expect(html).toContain('干员属性与技能详情');
  });

  it('BottomSheet: 具有用于拖动/关闭的把手与关闭按钮', () => {
    const html = renderToString(
      <BottomSheet isOpen={true} onClose={() => {}} title="战术指令">
        <button type="button">撤离干员</button>
      </BottomSheet>,
    );
    expect(html).toContain('cursor-grab');
    expect(html).toContain('✕');
    expect(html).toContain('撤离干员');
  });
});
