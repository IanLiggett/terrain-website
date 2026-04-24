from django import forms
from django.core import validators
from django.contrib.auth.models import User
from .models import InputLayer

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
                "class": "form-range",
            }),
            "amplitude": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "6",
                "step": "0.01",
                "class": "form-range",
            }),
            "octaves": forms.NumberInput(attrs={
                "type": "range",
                "min": "1",
                "max": "5",
                "step": "1",
                "class": "form-range",
            }),
            "lacunarity": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "3",
                "step": "0.01",
                "class": "form-range",
            }),
            "persistence": forms.NumberInput(attrs={
                "type": "range",
                "min": "0.01",
                "max": "3",
                "step": "0.01",
                "class": "form-range",
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