-- Production-like Phase 04 query shapes. The TypeScript runner supplies the
-- transactional 100k-row fixtures and captures JSON plans for these statements.
select id,kind,sort_order
from public.categories
where user_id = 'reference_performance_user' and active
order by sort_order,id
limit 100;

select id,status,sort_order
from public.accounts
where user_id = 'reference_performance_user' and status = 'active'
order by sort_order,id
limit 100;

select btrim(code),name,minor_unit,version
from public.currencies
where enabled
order by code;
