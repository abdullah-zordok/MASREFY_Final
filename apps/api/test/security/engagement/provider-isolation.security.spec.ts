import {
  FcmPushProvider,
  type HttpTransport,
} from '../../../src/engagement/notification.providers';

test('provider payload contains only the selected token and safe route data', async () => {
  let captured: Parameters<HttpTransport>[0] | undefined;
  const transport: HttpTransport = (request) => {
    captured = request;
    return Promise.resolve({ status: 200, json: { name: 'providers/message-1' } });
  };
  const provider = new FcmPushProvider(transport, 'project', 'credential');
  await provider.send({
    token: 'device-token',
    eventId: '10000000-0000-4000-8000-000000000001',
    title: 'Update',
    body: 'Open Masarifi for details',
    route: 'notifications',
  });
  expect(captured?.body).toEqual({
    message: {
      token: 'device-token',
      notification: { title: 'Update', body: 'Open Masarifi for details' },
      data: { eventId: '10000000-0000-4000-8000-000000000001', route: 'notifications' },
    },
  });
  expect(JSON.stringify(captured?.body)).not.toMatch(/credential|account|amount|email/i);
});
