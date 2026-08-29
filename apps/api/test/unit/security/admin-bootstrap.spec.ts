import { parseBootstrapArgs } from '../../../src/security/admin-bootstrap';

describe('Admin bootstrap arguments', () => {
  it('requires separate subject and approver plus a bounded reason', () => {
    expect(
      parseBootstrapArgs([
        '--user-id',
        'user_1',
        '--approved-by',
        'reviewer_2',
        '--reason',
        'Approved deployment bootstrap',
      ]),
    ).toEqual({
      userId: 'user_1',
      approvedBy: 'reviewer_2',
      reason: 'Approved deployment bootstrap',
    });
  });

  it.each([
    ['--user-id', 'same', '--approved-by', 'same', '--reason', 'Approved bootstrap'],
    ['--user-id', 'user_1', '--approved-by', 'reviewer_2', '--reason', 'short'],
    ['--user-id', 'user_1', '--reason', 'Approved bootstrap'],
  ])('rejects incomplete or one-person input', (...argv) => {
    expect(() => parseBootstrapArgs(argv)).toThrow('ADMIN_BOOTSTRAP_ARGUMENT_INVALID');
  });
});
