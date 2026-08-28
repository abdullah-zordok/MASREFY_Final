import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.MASARIFI_BASE_URL || 'http://127.0.0.1:3000';
const token = __ENV.MASARIFI_TEST_JWT;

export const options = {
  scenarios: {
    profile_reads: { executor: 'constant-vus', vus: 10, duration: '30s' },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_duration: ['p(95)<250', 'p(99)<500'],
  },
};

export default function () {
  if (!token) throw new Error('MASARIFI_TEST_JWT_REQUIRED');
  const headers = { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' };
  for (const path of ['/api/v1/me', '/api/v1/me/preferences']) {
    const response = http.get(`${baseUrl}${path}`, {
      headers,
      tags: { endpoint: 'identity_profile' },
    });
    check(response, {
      'identity read succeeds': (result) => result.status === 200,
      'identity payload is bounded': (result) => result.body.length < 50 * 1024,
      'identity payload hides raw contact data': (result) =>
        !/"(?:primaryEmail|phoneE164|sessionId|token)"\s*:/i.test(result.body),
    });
  }
  sleep(0.1);
}
