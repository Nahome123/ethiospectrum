-- New launch prices: Consultation $49.99 and IEP Language Assistance $29.99
-- per request. Administrators can still change them in Admin -> Services;
-- requests already awaiting payment are charged the price current at checkout.

update public.services
set price_cents = 4999, version = version + 1, updated_at = now()
where service_type = 'consultation';

update public.services
set price_cents = 2999, version = version + 1, updated_at = now()
where service_type = 'iep_language_assistance';
