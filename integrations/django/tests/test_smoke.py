"""Smoke tests proving the Django lane runs independently of the JS toolchain."""

import django
from django.conf import settings


def _configure_django() -> None:
    if not settings.configured:
        settings.configure(
            DEBUG=True,
            DATABASES={},
            INSTALLED_APPS=["django.contrib.contenttypes", "django.contrib.auth"],
            TEMPLATES=[{"BACKEND": "django.template.backends.django.DjangoTemplates"}],
            USE_TZ=True,
        )
        django.setup()


def test_django_template_render_smoke() -> None:
    _configure_django()
    from django.template import Context, Template

    rendered = Template("Hello {{ name }}!").render(Context({"name": "taipa"}))
    assert rendered == "Hello taipa!"


def test_taipa_django_importable() -> None:
    import taipa_django

    assert taipa_django.__version__ == "0.0.0"
