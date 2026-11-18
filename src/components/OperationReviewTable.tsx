import type { OperationReviewRow } from '@/lib/operationReview';
export function OperationReviewTable({ rows }: { rows: OperationReviewRow[] }) {
  return <table className="tbl"><thead><tr><th>Registro</th><th>Ação</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.record}</td><td>{r.action}</td><td>{r.field}</td><td>{r.before}</td><td>{r.after}</td></tr>)}</tbody></table>;
}