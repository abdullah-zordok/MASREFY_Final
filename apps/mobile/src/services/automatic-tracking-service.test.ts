import { automaticTrackingService as fixtureAutomaticTrackingService } from './mocks/automatic-tracking-service';
import {
  automaticTrackingService,
  selectAutomaticTrackingService
} from './automatic-tracking-service';

describe('automatic tracking provider selection', () => {
  it('selects fixtures only for explicit fixture mode', () => {
    const live = { metadata: { kind: 'live' } } as never;

    expect(selectAutomaticTrackingService(true, live)).toBe(
      fixtureAutomaticTrackingService
    );
    expect(selectAutomaticTrackingService(false, live)).toBe(live);
  });

  it('uses fixtures in the test client', () => {
    expect(automaticTrackingService).toBe(fixtureAutomaticTrackingService);
  });
});
