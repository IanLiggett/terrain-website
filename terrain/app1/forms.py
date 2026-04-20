from django import forms
from django.core import validators
from django.contrib.auth.models import User

class InputLayerForm(forms.Form):
    frequency = forms.FloatField(
        min_value=0.001,
        max_value=1,
        initial=0.1,
        widget=forms.NumberInput(attrs={
            "type":"range",
            "min":"0.001",
            "max":"1",
            "step":"0.001",
            "class":"form-range"
        })
    )
    amplitude = forms.FloatField(
        min_value=0.01,
        max_value=10,
        initial=1,
        widget=forms.NumberInput(attrs={
            "type":"range",
            "min":"0.01",
            "max":"10",
            "step":"0.01",
            "class":"form-range"
        })
    )
    octaves = forms.IntegerField(
        min_value=1,
        max_value=5,
        initial=3,
        widget=forms.NumberInput(attrs={
            "type":"range",
            "min":"1",
            "max":"5",
            "step":"1",
            "class":"form-range"
        })
    )
    lacunarity = forms.FloatField(
        min_value=0.01,
        max_value=3,
        initial=2,
        widget=forms.NumberInput(attrs={
            "type":"range",
            "min":"0.01",
            "max":"3",
            "step":"0.01",
            "class":"form-range"
        })
    )
    persistance = forms.FloatField(
        min_value=0.01,
        max_value=3,
        initial=0.5,
        widget=forms.NumberInput(attrs={
            "type":"range",
            "min":"0.01",
            "max":"3",
            "step":"0.01",
            "class":"form-range"
        })
    )


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