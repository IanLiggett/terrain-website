from django import forms
from django.core import validators
from django.contrib.auth.models import User
from .models import InputLayer, RiverSettings

class InputLayerForm(forms.ModelForm):
    class Meta:
        model = InputLayer
        fields = ["name", "frequency", "amplitude", "octaves", "lacunarity", "persistence"]
        widgets = {
            "name": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Enter name here",
                "id": "layerNameInput"
            }),
            "frequency": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.001",
                "max": "1",
                "step": "0.001",
                "class": "form-control-range",
            }),
            "amplitude": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "6",
                "step": "0.01",
                "class": "form-control-range",
            }),
            "octaves": forms.NumberInput(attrs={
                "type": "range",
                "min": "1",
                "max": "5",
                "step": "1",
                "class": "form-control-range",
            }),
            "lacunarity": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "3",
                "step": "0.01",
                "class": "form-control-range",
            }),
            "persistence": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "3",
                "step": "0.01",
                "class": "form-control-range",
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
            }),
            "river_threshold": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.001",
                "max": "0.1",
                "step": "0.001",
                "class": "form-control-range",
            }),
            "river_threshold_end": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.1",
                "max": "1",
                "step": "0.01",
                "class": "form-control-range",
            }),
            "width_beta": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.1",
                "max": "2",
                "step": "0.1",
                "class": "form-control-range",
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