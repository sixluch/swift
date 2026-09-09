-- CRM export: one row per lead with engagement context.
--   docker exec swiftbroker-postgres psql -U chatbroker -d chatbroker \
--     -f /dev/stdin < backend/scripts/export-leads.sql > leads.csv
--
-- Coverage comes from the chips (conversations.coverage_type) when the user
-- clicked them, and otherwise from the latest quote request, since coverage
-- stated in conversation only ever reaches quote_requests.
copy (
  select
    l.email,
    l.phone,
    coalesce(l.source, '')                                    as source,
    l.created_at,
    coalesce(
      nullif(array_to_string(c.coverage_type, '|'), ''),
      nullif(array_to_string(q.coverage_type, '|'), ''),
      ''
    )                                                          as coverage,
    coalesce(q.name, '')                                       as applicant_name,
    q.age                                                      as applicant_age,
    (select count(*) from messages m
      where m.conversation_id = c.id and m.role = 'user')      as user_messages,
    (select count(*) from messages m
      where m.conversation_id = c.id and m.input_mode = 'voice') as voice_messages,
    (select count(*) from quote_requests qr
      where qr.conversation_id = c.id)                         as quote_requests
  from leads l
  left join conversations c on c.lead_id = l.id
  left join lateral (
    select qr.name, qr.age, qr.coverage_type
    from quote_requests qr
    where qr.conversation_id = c.id
    order by qr.created_at desc
    limit 1
  ) q on true
  order by l.created_at desc
) to stdout with csv header;
