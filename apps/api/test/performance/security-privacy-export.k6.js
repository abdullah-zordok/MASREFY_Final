import http from 'k6/http';
import { check } from 'k6';

export const options={vus:5,iterations:25,thresholds:{checks:['rate==1'],'http_req_duration{flow:privacy-export}':['p(95)<300','p(99)<600']}};
export default function(){const response=http.post(`${__ENV.MASARIFI_BASE_URL}/api/v1/me/privacy/exports`,'{}',{headers:{Authorization:`Bearer ${__ENV.MASARIFI_TEST_JWT}`,'Content-Type':'application/json','Idempotency-Key':`perf-${__VU}-${__ITER}`},tags:{flow:'privacy-export'}});check(response,{'export acceptance is bounded':(value)=>value.status===202&&value.body.length<=51200});}
