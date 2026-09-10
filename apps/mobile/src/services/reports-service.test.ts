import { createLiveReportsService } from './live/reports-service';
import { selectReportsService } from './reports-service';

it('keeps report fixtures out of production selection', async () => {
  const selected = selectReportsService(
    false,
    createLiveReportsService({ baseUrl: '' })
  );

  expect(selected.metadata).toMatchObject({
    kind: 'live',
    availability: 'unavailable'
  });
  await expect(selected.getSchedule()).rejects.toMatchObject({
    code: 'reports_unavailable'
  });
});
