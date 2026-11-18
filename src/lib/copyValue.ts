import { current, isDraft } from 'immer';
/** Clone only the affected history/condition value, including values inside an isolated Immer draft. */
export function copyValue<T>(value: T): T {
  return structuredClone(isDraft(value) ? current(value as object) : value) as T;
}