explain (analyze,buffers,format json)
select private.admin_has_permission('performance_admin','audit.read',clock_timestamp());

explain (analyze,buffers,format json)
select a.id from public.admin_role_assignments a join public.roles r on r.id=a.role_id
where a.user_id='performance_admin' and r.enabled and a.revoked_at is null
  and a.starts_at<=clock_timestamp() and (a.ends_at is null or a.ends_at>clock_timestamp())
order by a.starts_at desc,a.id limit 100;
