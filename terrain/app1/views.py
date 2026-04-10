from django.shortcuts import render

# Create your views here.

def renderTest(request):
    return render(request, 'app1/renderTest.html')
