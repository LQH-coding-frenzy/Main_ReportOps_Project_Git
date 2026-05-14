export const MANUAL_M1_CONTROL_IDS = [
  '1.1.1.9',
  '1.2.1.1',
  '1.2.1.4',
  '1.2.2.1',
] as const;

const MANUAL_M1_CONTROL_ID_SET = new Set<string>(MANUAL_M1_CONTROL_IDS);

export function isManualM1Control(controlId: string): boolean {
  return MANUAL_M1_CONTROL_ID_SET.has(controlId);
}
