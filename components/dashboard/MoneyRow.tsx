import Link from 'next/link';
import { fmtMoney } from '@/lib/invoices';

// Admin/rep only (page.tsx gates who renders this). Numbers arrive precomputed from the
// company_revenue view / cleaner_earnings rows — this component only formats and lays out.
export function MoneyRow({
  month,
  allTimeNet,
}: {
  month: { revenue: number; expenses: number; net: number } | null;
  allTimeNet: number;
}) {
  return (
    <div className="kpis">
      <div className="kpi box">
        <span className="tag">$</span>
        <div className="lbl">Revenue · this month</div>
        <div className="val">{fmtMoney(month?.revenue ?? 0)}</div>
      </div>
      <div className="kpi box">
        <span className="tag">$</span>
        <div className="lbl">Expenses · this month</div>
        <div className="val">{fmtMoney(month?.expenses ?? 0)}</div>
        <div className="sub"><Link href="/expenses">→ Expenses</Link></div>
      </div>
      <div className="kpi box">
        <span className="tag">$</span>
        <div className="lbl">Net · this month</div>
        <div className="val">{fmtMoney(month?.net ?? 0)}</div>
      </div>
      <div className="kpi box">
        <span className="tag">Σ</span>
        <div className="lbl">Net · all-time</div>
        <div className="val">{fmtMoney(allTimeNet)}</div>
      </div>
    </div>
  );
}
