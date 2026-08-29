import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '20s',
  thresholds: { checks: ['rate==1'], 'http_req_duration{flow:permission}': ['p(95)<25'] },
};
export default function () {
  const response = http.get(`${__ENV.MASARIFI_BASE_URL}/api/v1/admin/access/permissions`, {
    headers: { Authorization: `Bearer ${__ENV.MASARIFI_TEST_JWT}` },
    tags: { flow: 'permission' },
  });
  check(response, {
    'permission request is bounded': (value) => [200, 403, 404].includes(value.status),
  });
}
