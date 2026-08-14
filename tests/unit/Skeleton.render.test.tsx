// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  SkeletonScreen, SkeletonBar, SkeletonHead, SkeletonTable,
  SkeletonKpis, SkeletonBoard, SkeletonPanel, SkeletonFill,
} from '@/components/skeleton/Skeleton';

describe('Skeleton primitives', () => {
  it('announces the screen as busy, with a label naming what is loading', () => {
    render(<SkeletonScreen label="jobs"><SkeletonBar /></SkeletonScreen>);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.getAttribute('aria-label')).toBe('Loading jobs');
    expect(region.classList.contains('screen')).toBe(true);
  });

  it('hides decorative bars from assistive tech', () => {
    const { container } = render(<SkeletonBar w="40%" h={20} />);
    const bar = container.querySelector('.sk') as HTMLElement;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.style.width).toBe('40%');
    expect(bar.style.height).toBe('20px');
  });

  it('renders a table skeleton with the real table chrome and requested shape', () => {
    const { container } = render(<SkeletonTable cols={5} rows={3} />);
    expect(container.querySelector('.panel.box')).toBeTruthy();
    expect(container.querySelector('.tblwrap')).toBeTruthy();
    expect(container.querySelectorAll('table.tbl thead th')).toHaveLength(5);
    expect(container.querySelectorAll('table.tbl tbody tr')).toHaveLength(3);
    expect(container.querySelectorAll('table.tbl tbody td')).toHaveLength(15);
  });

  it('defaults the table to six rows', () => {
    const { container } = render(<SkeletonTable cols={2} />);
    expect(container.querySelectorAll('table.tbl tbody tr')).toHaveLength(6);
  });

  it('renders the head row with a title bar plus the requested action buttons', () => {
    const { container } = render(<SkeletonHead actions={3} />);
    expect(container.querySelector('.scrhead')).toBeTruthy();
    expect(container.querySelectorAll('.scrhead .sk')).toHaveLength(4);
  });

  it('renders KPI, board, panel and fill shapes with the real class names', () => {
    const kpis = render(<SkeletonKpis count={3} />).container;
    expect(kpis.querySelectorAll('.kpis .kpi.box')).toHaveLength(3);

    const board = render(<SkeletonBoard cols={2} cards={4} />).container;
    expect(board.querySelectorAll('.kanban .col.box')).toHaveLength(2);
    expect(board.querySelectorAll('.kanban .col.box .sk')).toHaveLength(10);

    const panel = render(<SkeletonPanel lines={2} />).container;
    expect(panel.querySelectorAll('.panel.box .sk')).toHaveLength(2);

    const fill = render(<SkeletonFill />).container;
    expect(fill.querySelector('.box.sk-fill')).toBeTruthy();
  });
});
