-- Lost submissions remain historical; they are not actionable quotation-review work.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.role_dashboard(text,integer)'::regprocedure);
 definition:=replace(definition,'and v.state=''Submitted for Review''','and p.commercial_status<>''Lost'' and v.state=''Submitted for Review''');
 execute definition;
end $$;
