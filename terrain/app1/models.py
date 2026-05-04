from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class InputLayer(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField("Name:", max_length=50, default="DEFAULT")
    frequency = models.FloatField("Frequency:", default=0.1)
    amplitude = models.FloatField("Amplitude:", default=1.0)
    octaves = models.IntegerField("Octaves:", default=3)
    lacunarity = models.FloatField("Lacunarity:", default=2.0)
    persistence = models.FloatField("Persistence:", default=0.5)
    warping = models.FloatField("Warping:", default=0.1)
    ridge_strength = models.FloatField("Ridge Strength:", default=0.3)

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    tracked_layers = models.ManyToManyField(InputLayer, blank=True)

class RiverSettings(models.Model):
    profile = models.OneToOneField(Profile, on_delete=models.CASCADE)
    max_width = models.IntegerField("Max Width:", default=10)
    river_threshold = models.FloatField("River Threshold:", default=0.02)
    river_threshold_end = models.FloatField("River Threshold End:", default=0.6)
    width_beta = models.FloatField("Width Beta:", default=0.5)
    has_erosion = models.BooleanField("Erosion:", default=True)
    has_water = models.BooleanField("Water:", default=True)
    has_rivers = models.BooleanField("Rivers:", default=True)
