from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import transaction

from app1.models import create_account_related_objects

class Command(BaseCommand):
    help = "Reset and recreate the public demo account"

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        
        username = "demo"
        password = "demo"
        email = "demo@example.com"

        # Delete existing demo user if it exists
        User.objects.filter(username=username).delete()

        # Create new demo user
        user = User.objects.create(
            username=username, 
            email=email,
            is_staff=False,
            is_superuser=False
        )
        user.set_password(password)
        user.save()

        # Create associated profile and settings
        create_account_related_objects(user)
        
        self.stdout.write(self.style.SUCCESS(f"Created demo user '{username}' with password '{password}'"))
        