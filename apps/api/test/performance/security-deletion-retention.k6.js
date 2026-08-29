import http from 'k6/http';
import { check } from 'k6';

export const options={vus:5,iterations:25,thresholds:{checks:['rate==1'],'http_req_duration{flow:deletion}':['p(95)<300','p(99)<600']}};
export default function(){const response=http.post(`${__ENV.MASARIFI_BASE_URL}/api/v1/me/deletion-requests`,JSON.stringify({confirmation:'DELETE_MY_ACCOUNT'}),{headers:{Authorization:`Bearer ${__ENV.MASARIFI_TEST_JWT}`,'Content-Type':'application/json','Idempotency-Key':`delete-${__VU}-${__ITER}`},tags:{flow:'deletion'}});check(response,{'deletion acceptance is bounded':(value)=>value.status===202&&value.body.length<=51200});}
