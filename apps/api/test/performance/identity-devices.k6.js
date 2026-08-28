import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.MASARIFI_BASE_URL || 'http://127.0.0.1:3000';
const token = __ENV.MASARIFI_TEST_JWT;

export const options = {
  scenarios: {
    devices: { executor: 'constant-vus', vus: 10, duration: '30s' },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_duration: ['p(95)<250', 'p(99)<500'],
  },
};

export default function () {
  if (!token) throw new Error('MASARIFI_TEST_JWT_REQUIRED');
  const response = http.get(`${baseUrl}/api/v1/me/devices?limit=50`, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' },
    tags: { endpoint: 'identity_devices' },
  });
  check(response, {
    'device list succeeds': (result) => result.status === 200,
    'device payload is bounded': (result) => result.body.length < 50 * 1024,
    'device payload hides private evidence': (result) =>
      !/fingerprint|sessionId|pushToken|tokenHash|ciphertext/i.test(result.body),
  });
  sleep(0.1);
}
