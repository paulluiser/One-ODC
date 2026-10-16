-- User-approved commercial vocabulary; existing history retains its enum identity.
alter type public.commercial_status rename value 'Negotiation' to 'Under Negotiation';
alter type public.commercial_status add value 'Lost';
