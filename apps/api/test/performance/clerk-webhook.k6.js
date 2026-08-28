import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const baseUrl = __ENV.MASARIFI_BASE_URL || 'http://127.0.0.1:3000';
const body = __ENV.MASARIFI_SIGNED_WEBHOOK_BODY;
const id = __ENV.MASARIFI_SIGNED_WEBHOOK_ID;
const timestamp = __ENV.MASARIFI_SIGNED_WEBHOOK_TIMESTAMP;
const signature = __ENV.MASARIFI_SIGNED_WEBHOOK_SIGNATURE;
const accepted = new Counter('clerk_webhook_accepted');
const unexpected = new Counter('clerk_webhook_unexpected');

export const options = {
  scenarios: {
    webhook_burst: { executor: 'constant-arrival-rate', rate: 20, timeUnit: '1s', duration: '30s', preAllocatedVUs: 20, maxVUs: 50 },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_duration: ['p(95)<250', 'p(99)<500'],
    clerk_webhook_accepted: ['count>0'],
    clerk_webhook_unexpected: ['count==0'],
  },
};

export default function () {
  if (!body || !id || !timestamp || !signature) throw new Error('SIGNED_WEBHOOK_FIXTURE_REQUIRED');
  const response = http.post(`${baseUrl}/webhooks/clerk`, body, {
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    },
    tags: { endpoint: 'clerk_webhook' },
  });
  if (response.status === 202) accepted.add(1);
  if (response.status !== 202 && response.status !== 429) unexpected.add(1);
  else unexpected.add(0);
  check(response, {
    'durable duplicate accepted or safely throttled': (result) =>
      result.status === 202 || result.status === 429,
  });
  sleep(0.05);
}
