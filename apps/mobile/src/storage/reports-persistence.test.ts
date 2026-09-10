import { buildSchedule, type ReportScheduleDraft } from '@/domain/reports';
import { ReportsRepository } from './reports-repository';

const mockRunAsync = jest.fn(async (..._arguments: unknown[]) => ({}));
const mockGetAllAsync = jest.fn(async (sql: string) => {
  if (sql.includes('report_schedules'))
    return [{ payload: JSON.stringify(schedule) }];
  if (sql.includes('planning_drafts'))
    return [{ payload: JSON.stringify(draft) }];
  return [];
});
let mockDatabase = { getAllAsync: mockGetAllAsync, runAsync: mockRunAsync };

jest.mock('./database', () => ({
  openDatabase: jest.fn(async () => mockDatabase),
  runExclusiveDatabaseTransaction: jest.fn(async (_database, task) =>
    task(mockDatabase)
  )
}));

const schedule = buildSchedule(
  {
    recipientEmail: 'reports@example.com',
    frequency: 'monthly',
    language: 'en',
    currencyCode: 'SAR',
    deliveryDay: 1,
    timeZone: 'Asia/Riyadh',
    includeAssistantSummary: false,
    detailLevel: 'summary'
  },
  null,
  1
);
const draft: ReportScheduleDraft = {
  id: 'report_schedule',
  payload: {
    recipientEmail: 'draft@example.com',
    frequency: 'annual',
    language: 'en',
    currencyCode: 'SAR',
    deliveryDay: 2,
    timeZone: 'Asia/Riyadh',
    includeAssistantSummary: false,
    detailLevel: 'summary'
  },
  baseVersion: null,
  status: 'editing',
  updatedAt: 2
};

test('persistent reports repository restores and writes schedule state and draft', async () => {
  const repository = new ReportsRepository(true);

  expect(await repository.getSchedule()).toEqual(schedule);
  expect(await repository.loadDraft()).toEqual(draft);
  await repository.setScheduleStatus('paused', schedule.version, 3);
  await repository.saveDraft({ ...draft, updatedAt: 4 });
  await repository.discardDraft();

  expect(
    mockRunAsync.mock.calls.some(([sql]) =>
      String(sql).includes('report_schedules')
    )
  ).toBe(true);
  expect(
    mockRunAsync.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO planning_drafts')
    )
  ).toBe(true);
  expect(
    mockRunAsync.mock.calls.some(([sql]) =>
      String(sql).includes('DELETE FROM planning_drafts')
    )
  ).toBe(true);
});

test('persistent reports repository drops cached owner data when the database changes', async () => {
  const repository = new ReportsRepository(true);
  expect(await repository.getSchedule()).toEqual(schedule);

  const otherSchedule = { ...schedule, id: 'other-owner-schedule' };
  mockDatabase = {
    getAllAsync: jest.fn(async (sql: string) =>
      sql.includes('report_schedules')
        ? [{ payload: JSON.stringify(otherSchedule) }]
        : []
    ),
    runAsync: mockRunAsync
  };

  expect(await repository.getSchedule()).toEqual(otherSchedule);
  expect(await repository.loadDraft()).toBeNull();
});
