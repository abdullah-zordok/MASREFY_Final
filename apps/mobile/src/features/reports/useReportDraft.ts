import type {
  ReportScheduleDraft,
  ReportScheduleInput
} from '@/domain/reports';
import { reportsService } from '@/services/reports-service';

export function makeReportScheduleDraft(
  payload: ReportScheduleInput,
  baseVersion: number | null
): ReportScheduleDraft {
  return {
    id: 'report_schedule',
    payload,
    baseVersion,
    status: 'editing',
    updatedAt: Date.now()
  };
}

export const reportDraftStore = {
  save: (draft: ReportScheduleDraft) => reportsService.saveScheduleDraft(draft),
  load: () => reportsService.loadScheduleDraft(),
  discard: () => reportsService.discardScheduleDraft()
};
