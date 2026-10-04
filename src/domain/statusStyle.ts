import type { RouteStatus } from './course';

export interface StatusStyle {
  weight: number;
  dashed: boolean;
}

/** Line style per status; colour alone must not tell them apart (colour-blind users). */
export const STATUS_STYLE: Record<RouteStatus, StatusStyle> = {
  NotPlanned: { weight: 3, dashed: false },
  NotCompleted: { weight: 5, dashed: true },
  Completed: { weight: 5, dashed: false },
};
