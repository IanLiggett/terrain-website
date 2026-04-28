from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse, HttpResponse
from django.contrib.auth.decorators import login_required
from django.template.loader import render_to_string
from app1.forms import JoinForm, LoginForm, InputLayerForm, RiverSettingsForm
from app1.models import Profile, InputLayer, RiverSettings

# Create your views here.

@login_required(login_url="/login/")
def activate_layer(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    layer_id = request.POST.get("layer_id")
    layer = get_object_or_404(InputLayer, pk=layer_id, user=request.user)
    if request.user.profile.tracked_layers.filter(pk=layer.pk).exists():
        return JsonResponse({"ok": False, "error": "Layer already active"}, status=400)
    
    request.user.profile.tracked_layers.add(layer)

    layer_card = render_to_string(
        "layercard.html",
        {"layer": layer, "input_layer_form": InputLayerForm(instance=layer, prefix=f"layer-{layer.id}")},
        request=request
    )
    layer_stick = render_to_string(
        "layerstick.html",
        {"layer": layer, "is_active": True},
        request=request
    )

    # modify layer_stick to look different now that it's an active layer

    return JsonResponse({
        "ok": True,
        "layer_id": layer.pk,
        "layer_card": layer_card,
        "layer_stick": layer_stick
    })

@login_required(login_url="/login/")
def deactivate_layer(request):
    if request.method != "POST":
        return HttpResponse(status=405)
    
    layer_id = request.POST.get("layer_id")
    layer = get_object_or_404(InputLayer, pk=layer_id, user=request.user)
    if not request.user.profile.tracked_layers.filter(pk=layer.pk).exists():
        return JsonResponse({"ok": False, "error": "Layer already inactive"}, status=400)
    
    request.user.profile.tracked_layers.remove(layer)

    return render(request, "layerstick.html", {"layer": layer, "is_active": False})

@login_required(login_url="/login/")
def create_input_layer(request):
    if request.method != "POST":
        return HttpResponse(status=405)
    
    layer = InputLayer.objects.create(user=request.user)
    # layers are tracked by default upon creation
    request.user.profile.tracked_layers.add(layer)

    layer_card = render_to_string(
        "layercard.html",
        {"layer": layer, "input_layer_form": InputLayerForm(instance=layer, prefix=f"layer-{layer.id}")},
        request=request
    )
    layer_stick = render_to_string(
        "layerstick.html",
        {"layer": layer, "is_active": True},
        request=request
    )

    return JsonResponse({
        "ok": True,
        "layer_id": layer.pk,
        "layer_card": layer_card,
        "layer_stick": layer_stick
    })

@login_required(login_url="/login/")
def delete_layer(request):
    if request.method != "POST":
        return HttpResponse(status=405)
    
    layer_id = request.POST.get("layer_id")
    layer = get_object_or_404(InputLayer, pk=layer_id, user=request.user)

    layer.delete()

    return HttpResponse(status=204)


@login_required(login_url='/login/')
def home(request):
    tracked_ids = set(request.user.profile.tracked_layers.values_list("pk", flat=True))
    input_layers = request.user.inputlayer_set.all()
    
    layer_forms = []
    for layer in input_layers:
        layer_data = {
            "layer": layer,
            "is_active": False
        }
        if layer.pk in tracked_ids:
            layer_data["input_layer_form"] = InputLayerForm(instance=layer, prefix=f"layer-{layer.id}")
            layer_data["is_active"] = True

        layer_forms.append(layer_data)

    return render(request, "app1/home.html", {"layer_forms": layer_forms, 'river_settings_form': RiverSettingsForm(instance=request.user.profile.riversettings)})

def about(request):
    return render(request, "app1/about.html")

def join(request):
    if (request.method == "POST"):
        join_form = JoinForm(request.POST)
        if (join_form.is_valid()):
            # Save form data to DB
            user = join_form.save()
            # Encrypt the password
            user.set_password(user.password)
            # Save encrypted password to DB
            user.save()

            # Create user profile
            Profile.objects.create(user=user)
            RiverSettings.objects.create(profile=user.profile);

            # Success! Redirect to home page.
            return redirect("/")
        else:
            # Form invalid, print errors to console
            page_data = { "join_form": join_form }
            return render(request, 'app1/join.html', page_data)
    else:
        page_data = { "join_form": JoinForm }
        return render(request, 'app1/join.html', page_data)

def user_login(request):
    if (request.method == 'POST'):
        login_form = LoginForm(request.POST)
        if login_form.is_valid():
            # First get the username and password supplied
            username = login_form.cleaned_data["username"]
            password = login_form.cleaned_data["password"]
            # Django's built-in authentication function:
            user = authenticate(username=username, password=password)
            # If we have a user
            if user:
                #Check it the account is active
                if user.is_active:
                    # Log the user in.
                    login(request,user)
                    # Send the user back to homepage
                    return redirect("/")
                else:
                    # If account is not active:
                    return HttpResponse("Your account is not active.")
            else:
                print("Someone tried to login and failed.")
                print("They used username: {} and password: {}".format(username,password))
                return render(request, 'app1/login.html', {"login_form": LoginForm})
    else:
        #Nothing has been provided for username or password.
        return render(request, 'app1/login.html', {"login_form": LoginForm})

@login_required(login_url='/login/')    
def user_logout(request):
    # Log out the user.
    logout(request)
    # Return to homepage.
    return redirect("/")

@login_required(login_url='/login/')
def save_layer(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    layer_id = request.POST.get("layer_id")
    layer = get_object_or_404(InputLayer, pk=layer_id, user=request.user)
    form = InputLayerForm(request.POST, instance=layer, prefix=f"layer-{layer_id}")
    if form.is_valid():
        form.save()
        return JsonResponse({"ok": True})
    return JsonResponse({"ok": False, "errors": form.errors}, status=400)


@login_required(login_url='/login/')
def save_river_settings(request):
    if request.method != "POST":
        return HttpResponse(status=405)

    river_settings = get_object_or_404(RiverSettings, profile=request.user.profile)
    form = RiverSettingsForm(request.POST, instance=river_settings)
    if form.is_valid():
        form.save()
        return JsonResponse({"ok": True})
    return JsonResponse({"ok": False, "errors": form.errors}, status=400)
