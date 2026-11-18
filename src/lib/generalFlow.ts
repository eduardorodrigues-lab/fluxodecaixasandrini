import { computeFlow } from './engine/engine';
import type { ScenarioData } from './engine/types';

/** This page never consumes legacy supplier/group preferences or URL recuts. */
export function generalFlow(data: ScenarioData, period: { start: string; end: string }) {
  return computeFlow(data, { start: period.start, end: period.end });
}