#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
from pathlib import Path


def main():
    """Run administrative tasks."""
    base_dir = Path(__file__).resolve().parent
    venv_python = base_dir / 'env' / 'Scripts' / 'python.exe'

    # Auto-switch to project virtual environment if executed with global Python
    if venv_python.exists() and sys.executable.lower() != str(venv_python).lower():
        if sys.prefix == sys.base_prefix or 'pythoncore' in sys.executable.lower():
            import subprocess
            sys.exit(subprocess.call([str(venv_python)] + sys.argv))

    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'eduflowbackend.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
