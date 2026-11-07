from django.db import migrations

TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security audit events are strictly append-only. Modification and deletion prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_audit_events ON audit_securityauditevent;
CREATE TRIGGER trg_protect_audit_events
BEFORE UPDATE OR DELETE ON audit_securityauditevent
FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();
"""

REVERSE_SQL = """
DROP TRIGGER IF EXISTS trg_protect_audit_events ON audit_securityauditevent;
DROP FUNCTION IF EXISTS prevent_audit_tampering();
"""


class Migration(migrations.Migration):
    dependencies = [
        ('audit', '0002_initial'),
    ]

    operations = [
        migrations.RunSQL(TRIGGER_SQL, reverse_sql=REVERSE_SQL),
    ]

