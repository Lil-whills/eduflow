from django.db import migrations


def create_initial_roles(apps, schema_editor):
    Role = apps.get_model('tenants', 'Role')
    roles = [
        ('PROPRIETOR', 'School oversight, school-wide monitoring, and subscription/billing responsibilities'),
        ('ADMINISTRATOR', 'Core school administration, staff and academic setup, and authorized operational coordination'),
        ('HEADMASTER', 'School-wide oversight, review of consolidated reports, and operational monitoring'),
        ('ACCOUNTANT', 'School financial configuration, fee and charge management, payments, receipts, balances, arrears, expenses, and finance reporting'),
        ('CLASS_TEACHER', 'Assigned-class responsibilities, completeness checks, and submission of class results according to the academic workflow'),
        ('SUBJECT_TEACHER', 'Assigned-subject teaching and entry/submission of marks for assigned classes and subjects'),
    ]
    for name, desc in roles:
        Role.objects.get_or_create(name=name, defaults={'description': desc})


def reverse_initial_roles(apps, schema_editor):
    Role = apps.get_model('tenants', 'Role')
    Role.objects.filter(name__in=[
        'PROPRIETOR', 'ADMINISTRATOR', 'HEADMASTER', 'ACCOUNTANT', 'CLASS_TEACHER', 'SUBJECT_TEACHER'
    ]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_initial_roles, reverse_initial_roles),
    ]

