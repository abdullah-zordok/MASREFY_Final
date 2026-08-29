import http from 'k6/http';
import { check } from 'k6';

export const options={vus:10,duration:'20s',thresholds:{checks:['rate==1'],'http_req_duration{flow:owner-events}':['p(95)<300','p(99)<600']}};
export default function(){const response=http.get(`${__ENV.MASARIFI_BASE_URL}/api/v1/me/security/events?limit=100`,{headers:{Authorization:`Bearer ${__ENV.MASARIFI_TEST_JWT}`},tags:{flow:'owner-events'}});check(response,{'owner event payload is bounded':(value)=>value.status===200&&value.body.length<=204800});}
