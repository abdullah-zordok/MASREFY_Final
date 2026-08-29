grant masarifi_migration to current_user with set true, inherit false;
set local role masarifi_migration;

insert into public.currencies(code,name,minor_unit) values
 ('EGP','Egyptian Pound',2),('USD','US Dollar',2),('EUR','Euro',2),('GBP','British Pound',2),
 ('AED','UAE Dirham',2),('SAR','Saudi Riyal',2),('OMR','Omani Rial',3),('KWD','Kuwaiti Dinar',3),
 ('QAR','Qatari Riyal',2),('BHD','Bahraini Dinar',3),('JOD','Jordanian Dinar',3),('JPY','Japanese Yen',0)
on conflict(code) do nothing;

insert into public.supported_countries(code,name,default_currency) values
 ('EG','Egypt','EGP'),('US','United States','USD'),('GB','United Kingdom','GBP'),
 ('AE','United Arab Emirates','AED'),('SA','Saudi Arabia','SAR'),('OM','Oman','OMR'),
 ('KW','Kuwait','KWD'),('QA','Qatar','QAR'),('BH','Bahrain','BHD'),('JO','Jordan','JOD'),('JP','Japan','JPY')
on conflict(code) do nothing;

insert into public.categories(id,user_id,kind,label_ar,label_en,icon,color,system_key,sort_order) values
 ('04000000-0000-4000-8000-000000000001',null,'expense','السكن','Housing','housing','category-0','housing',0),
 ('04000000-0000-4000-8000-000000000002',null,'expense','الطعام','Food','food','category-1','food',1),
 ('04000000-0000-4000-8000-000000000003',null,'expense','المطاعم','Restaurants','restaurants','category-2','restaurants',2),
 ('04000000-0000-4000-8000-000000000004',null,'expense','المواصلات','Transportation','transportation','category-3','transportation',3),
 ('04000000-0000-4000-8000-000000000005',null,'expense','الوقود','Fuel','fuel','category-4','fuel',4),
 ('04000000-0000-4000-8000-000000000006',null,'expense','التسوق','Shopping','shopping','category-5','shopping',5),
 ('04000000-0000-4000-8000-000000000007',null,'expense','الصحة','Health','health','category-6','health',6),
 ('04000000-0000-4000-8000-000000000008',null,'expense','التعليم','Education','education','category-7','education',7),
 ('04000000-0000-4000-8000-000000000009',null,'expense','الترفيه','Entertainment','entertainment','category-0','entertainment',8),
 ('04000000-0000-4000-8000-000000000010',null,'expense','الاشتراكات الرقمية','Digital subscriptions','subscriptions','category-1','subscriptions',9),
 ('04000000-0000-4000-8000-000000000011',null,'expense','الخدمات','Utilities','utilities','category-2','utilities',10),
 ('04000000-0000-4000-8000-000000000012',null,'expense','الاتصالات والإنترنت','Communication and internet','communication','category-3','communication',11),
 ('04000000-0000-4000-8000-000000000013',null,'expense','السفر','Travel','travel','category-4','travel',12),
 ('04000000-0000-4000-8000-000000000014',null,'expense','الصدقة','Charity','charity','category-5','charity',13),
 ('04000000-0000-4000-8000-000000000015',null,'expense','الرسوم','Fees','fees','category-6','fees',14),
 ('04000000-0000-4000-8000-000000000016',null,'income','الراتب','Salary','salary','category-7','salary',15),
 ('04000000-0000-4000-8000-000000000017',null,'income','دخل آخر','Other income','other-income','category-0','other-income',16),
 ('04000000-0000-4000-8000-000000000018',null,'transfer','التحويلات','Transfers','transfers','category-1','transfers',17),
 ('04000000-0000-4000-8000-000000000019',null,'expense','الالتزامات','Obligations','obligations','category-2','obligations',18)
on conflict(id) do nothing;

insert into public.permissions(key,resource,action) values
 ('reference.read','reference','read'),('reference.write','reference','write')
on conflict(key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from public.roles role cross join public.permissions permission
where role.key='super-admin' and permission.key in ('reference.read','reference.write')
   or role.key='security-administrator' and permission.key='reference.read'
on conflict do nothing;

reset role;
revoke masarifi_migration from current_user granted by current_user;
