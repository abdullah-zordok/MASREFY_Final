import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: __ENV.MASARIFI_OPERATIONS_STRESS === '1' ? 20 : 5,
  duration: __ENV.MASARIFI_OPERATIONS_STRESS === '1' ? '30s' : '10s',
  thresholds: {
    http_req_duration: ['p(95)<=300', 'p(99)<=750'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const response = http.get(
    `${__ENV.MASARIFI_BASE_URL}/api/v1/admin/system-health/overview?range=24h&platform=all`,
    {
      headers: { authorization: `Bearer ${__ENV.MASARIFI_TEST_JWT}` },
    },
  );
  check(response, { 'operations read succeeds': (value) => value.status === 200 });
}
