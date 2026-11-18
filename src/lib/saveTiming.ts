/** Numeric phase measurements only: no entity names, IDs or financial data. */
export function measureSavePhase(name: 'review' | 'prepare' | 'confirmation' | 'reconcile', start: number) {
  const end=performance.now();
  performance.measure(`sandrini.save.${name}`, {start,end});
  return end-start;
}