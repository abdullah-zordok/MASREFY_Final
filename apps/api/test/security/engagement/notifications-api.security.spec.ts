import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';

test('notification actions allow only owned identifier, version, and registered action key fields', () => {
  const command = {
    operation: 'actOnNotification',
    params: { notificationId: '10000000-0000-4000-8000-000000000001' },
    body: { actionKey: 'view', expectedVersion: 1 },
    requestId: 'request-1',
    idempotencyKey: 'notification-action-1',
  };
  expect(() => validateEngagementCommand(command)).not.toThrow();
  expect(() =>
    validateEngagementCommand({ ...command, body: { ...command.body, userId: 'another-owner' } }),
  ).toThrow();
  expect(() =>
    validateEngagementCommand({
      ...command,
      body: { ...command.body, actionKey: 'https://attacker.test' },
    }),
  ).toThrow();
});
