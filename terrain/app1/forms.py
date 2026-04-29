from django import forms
from django.core import validators
from django.contrib.auth.models import User
from .models import InputLayer, RiverSettings

class InputLayerForm(forms.ModelForm):
    class Meta:
        model = InputLayer
        fields = ["name", "frequency", "amplitude", "octaves", "lacunarity", "persistence", "warping", "ridge_strength"]
        widgets = {
            "name": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Enter name here",
                "id": "layerNameInput",
                "help_text": "A descriptor to help you identify this layer later."
            }),
            "frequency": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.001",
                "max": "1",
                "step": "0.001",
                "class": "form-control-range",
                "help_text": "How often the noise pattern repeats across the terrain.<br>Lower values: smoother terrain<br>Higher values: frequent changes in elevation."
            }),
            "amplitude": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "6",
                "step": "0.01",
                "class": "form-control-range",
                "help_text": "The maximum height variation caused by this layer.<br>Lower values: lower rises<br>Higher values: higher rises."
            }),
            "octaves": forms.NumberInput(attrs={
                "type": "range",
                "min": "1",
                "max": "5",
                "step": "1",
                "class": "form-control-range",
                "help_text": "The number of layers of noise to combine.<br>Lower values: simpler terrain<br>Higher values: more complex and detailed terrain."
            }),
            "lacunarity": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "3",
                "step": "0.01",
                "class": "form-control-range",
                "help_text": "The frequency multiplier for each octave.<br>Lower values: more slowly changing terrain<br>Higher values: more rapidly changing terrain."
            }),
            "persistence": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "3",
                "step": "0.01",
                "class": "form-control-range",
                "help_text": "The amplitude multiplier for each octave.<br>Lower values: lower rises in higher octaves<br>Higher values: higher rises in higher octaves."
            }),
            "warping": forms.NumberInput(attrs={
                "type": "range",
                "min": "0",
                "max": "1",
                "step": "0.01",
                "class": "form-control-range",
                "help_text": "The warping multiplier, controls the domain warping of the terrain.<br>Lower values: less warping<br>Higher values: more warping"
            }),
            "ridge_strength": forms.NumberInput(attrs={
                "type": "range",
                "min": "0",
                "max": "1",
                "step": "0.01",
                "class": "form-control-range",
                "help_text": "The ridge strength, controls weight of ridges vs regular terrain.<br>Lower values: less ridges<br>Higher values: more ridges"
            }),
        }

class RiverSettingsForm(forms.ModelForm):
    class Meta:
        model = RiverSettings
        fields = ["max_width", "river_threshold", "river_threshold_end", "width_beta"]
        widgets = {
            "max_width": forms.NumberInput(attrs={
                "type": "range",
                "min": "1",
                "max": "20",
                "step": "1",
                "class": "form-control-range",
                "help_text": "Maximum width of the river"
            }),
            "river_threshold": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.001",
                "max": "0.1",
                "step": "0.001",
                "class": "form-control-range",
                "help_text": "Threshold after which a river will start.<br>Lower values: more rivers<br>Higher values: less rivers"
            }),
            "river_threshold_end": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.1",
                "max": "1",
                "step": "0.01",
                "class": "form-control-range",
                "help_text": "Threshold at which a river will stop widening.<br>Lower values: widen faster<br>Higher values: widen slower"
            }),
            "width_beta": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.1",
                "max": "2",
                "step": "0.1",
                "class": "form-control-range",
                "help_text": "How quickly a river widens, on a quadratic curve.<br>Lower values: widen faster<br>Higher values: widen slower"
            }),
        }

class JoinForm(forms.ModelForm):
    password = forms.CharField(widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}))
    email = forms.CharField(widget=forms.TextInput(attrs={'size': '30'}))
    class Meta():
        model = User
        fields = ('first_name', 'last_name', 'username', 'email', 'password')
        help_texts = {
            'username': None
        }

class LoginForm(forms.Form):
    username = forms.CharField()
    password = forms.CharField(widget=forms.PasswordInput())