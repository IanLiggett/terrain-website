from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class InputLayer(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=50, default="DEFAULT")
    frequency = models.FloatField(default=0.1)
    amplitude = models.FloatField(default=1.0)
    octaves = models.IntegerField(default=3)
    lacunarity = models.FloatField(default=2.0)
    persistence = models.FloatField(default=0.5)

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    tracked_layers = models.ManyToManyField(InputLayer, blank=True)
