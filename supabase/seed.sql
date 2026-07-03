-- ===== login users (local dev). Password for all three: password123 =====
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','authenticated','authenticated','admin@clearview.dev',crypt('password123',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','authenticated','authenticated','rep@clearview.dev',crypt('password123',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
 ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333','authenticated','authenticated','cleaner@clearview.dev',crypt('password123',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}','{}');

-- GoTrue scans these token columns as non-null strings; NULL breaks login. Must be ''.
update auth.users set
  confirmation_token='', recovery_token='', email_change='', email_change_token_current='',
  email_change_token_new='', phone_change='', phone_change_token='', reauthentication_token=''
where email in ('admin@clearview.dev','rep@clearview.dev','cleaner@clearview.dev');

insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
values
 (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111',jsonb_build_object('sub','11111111-1111-1111-1111-111111111111','email','admin@clearview.dev'),'email',now(),now(),now()),
 (gen_random_uuid(),'22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222',jsonb_build_object('sub','22222222-2222-2222-2222-222222222222','email','rep@clearview.dev'),'email',now(),now(),now()),
 (gen_random_uuid(),'33333333-3333-3333-3333-333333333333','33333333-3333-3333-3333-333333333333',jsonb_build_object('sub','33333333-3333-3333-3333-333333333333','email','cleaner@clearview.dev'),'email',now(),now(),now());

insert into profiles(id,full_name,role) values
 ('11111111-1111-1111-1111-111111111111','Marcus Reed','admin'),
 ('22222222-2222-2222-2222-222222222222','Jess Lane','rep'),
 ('33333333-3333-3333-3333-333333333333','Dylan Cruz','cleaner');

-- ===== customers =====
insert into customers (id,name,phone,email,address,type,lat,lng,notes) overriding system value values
 (1,'Sarah Kim','555-0142','sarah.kim@mail.com','142 Maple Ave','residential',42.3310,-83.0450,'Repeat, every 8 wks. Gate 4417.'),
 (2,'Dan Ortiz','555-0077','dortiz@mail.com','7 Birch Court','residential',42.3365,-83.0398,'Bungalow, dog in yard.'),
 (3,'Priya Nair','555-0090','priya.n@mail.com','90 Cedar Lane','residential',42.3342,-83.0521,'Hard water on south windows.'),
 (4,'Greg Lowe','555-0033','glowe@mail.com','33 Elm Street','residential',42.3288,-83.0477,'Price sensitive.'),
 (5,'Wu Residence','555-0210','wu.family@mail.com','210 Oak Drive','residential',42.3401,-83.0333,'Big house, sunny side streaks.'),
 (6,'Marta Ruiz','555-0005','marta.r@mail.com','5 Pine Way','residential',42.3255,-83.0555,'Weekends only.'),
 (7,'Alex Park','555-0088','apark@mail.com','88 Willow Rd','residential',42.3377,-83.0444,'Inbound web lead.'),
 (8,'Ramirez Family','555-0012','ramirez@mail.com','12 Spruce Ct','residential',42.3299,-83.0511,'Screens add-on.'),
 (9,'Alicia Cole','555-0401','acole@mail.com','401 Rowan Ave','residential',42.3410,-83.0480,'Referral from Sarah Kim.'),
 (10,'Alan Webb — Webb Storefronts','555-0900','alan@webbstore.com','900 Market St','commercial',42.3350,-83.0300,'Storefront, monthly contract.');

-- ===== leads =====
insert into leads (id,customer_id,status,service,stories,panes,quote_value,note) overriding system value values
 (1,1,'won','In + out',2,18,180,'Booked.'),
 (2,2,'won','Outside only',1,11,95,'Booked.'),
 (3,3,'follow','Screens + hard water',3,24,260,'Quoted, call Fri.'),
 (4,4,'lost','In + out',2,16,0,'Chose cheaper.'),
 (5,5,'won','In + out + screens',2,22,210,'Booked.'),
 (6,6,'follow','Outside only',1,9,120,'Wants weekend.'),
 (7,7,'new','TBD',2,14,150,'Un-contacted.'),
 (8,8,'won','In + out',2,20,140,'Booked.'),
 (9,9,'new','TBD',2,12,130,'Referral.'),
 (10,10,'follow','Storefront monthly',1,30,400,'Contract pending.');

-- ===== jobs =====
-- Won leads (1,2,5,8) auto-create an 'unclaimed' job via the leads_won_creates_job
-- trigger (0006), already carrying service = lead.service. Re-derive the original
-- seed job states by UPDATE (match on lead_id — the trigger's job ids are sequence-
-- assigned, so never reference them by literal id).
update jobs set status='claimed',     claimed_by='33333333-3333-3333-3333-333333333333', price=180, scheduled_date='2026-07-03' where lead_id=1;
update jobs set                                                                          price=95,  scheduled_date='2026-07-03' where lead_id=2;
update jobs set status='in_progress', claimed_by='33333333-3333-3333-3333-333333333333', price=210, scheduled_date='2026-07-02' where lead_id=5;
update jobs set                                                                          price=140, scheduled_date='2026-07-04' where lead_id=8;

-- ===== invoices + items =====
insert into invoices (id,customer_id,job_id,number,issue_date,status) overriding system value values
 (1,1,(select id from jobs where lead_id=1),'INV-1001','2026-06-20','paid'),
 (2,5,(select id from jobs where lead_id=5),'INV-1002','2026-06-25','sent'),
 (3,8,(select id from jobs where lead_id=8),'INV-1003','2026-05-28','sent');

insert into invoice_items (id,invoice_id,description,qty,unit_price) overriding system value values
 (1,1,'Window cleaning — in + out (18 panes)',1,180),
 (2,2,'Window cleaning + screens (22 panes)',1,210),
 (3,3,'Window cleaning — in + out (20 panes)',1,140),
 (4,3,'Screen cleaning add-on',1,25);

-- ===== advance identity sequences past the manually-inserted ids =====
select setval(pg_get_serial_sequence('customers','id'), (select max(id) from customers));
select setval(pg_get_serial_sequence('leads','id'), (select max(id) from leads));
select setval(pg_get_serial_sequence('jobs','id'), (select max(id) from jobs));
select setval(pg_get_serial_sequence('invoices','id'), (select max(id) from invoices));
select setval(pg_get_serial_sequence('invoice_items','id'), (select max(id) from invoice_items));
