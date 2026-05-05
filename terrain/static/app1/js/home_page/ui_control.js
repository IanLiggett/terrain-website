import { generate_terrain, render_preview } from "./terrain.js";
import { export_scene_as_glb } from "./scene.js";

const save_layer_url = "savelayer/";
const save_river_settings_url = "saveriversettings/";
const save_feature_settings_url = "savefeaturesettings/";
const activate_layer_url = "activatelayer/";
const deactivate_layer_url = "deactivatelayer/";
const delete_layer_url = "deletelayer/";
const create_layer_url = "createlayer/";

const river_settings_form = document.getElementById("riverSettingsForm");
const feature_settings_form = document.getElementById("featureSettingsForm");
const seed_text_box = feature_settings_form.querySelector(".form-control");
const new_input_layer_form = document.getElementById("newInputLayerForm");
const active_layers_list = document.getElementById("activeList");
const all_layers_list = document.getElementById("allList");
const globcsrfToken = document.querySelector("[name=csrfmiddlewaretoken]").value;


const server_save_debounce = 1000;

// magic spell to enable all tooltips
$(function () {
  $('body').tooltip({
    selector: '[data-toggle="tooltip"]'
  })
})


// ----- input layer state handling

newInputLayerForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const csrfToken = newInputLayerForm.querySelector("[name=csrfmiddlewaretoken]").value;

    const response = await fetch(create_layer_url, {
      method: "POST",
      headers: {
        "X-CSRFToken": csrfToken,
      },
      credentials: "same-origin",
    });

    if (!response.ok) {
        console.error("Failed to create new input layer: " + response.status);
        return;
    }

    const data = await response.json();

    active_layers_list.insertAdjacentHTML("afterbegin", data.layer_card);
    all_layers_list.insertAdjacentHTML("afterbegin", data.layer_stick);
    init_layer_card(data.layer_id);
});

// helper function to update the state of a layer
async function request_layer_update(layer_id, url) {
    const formData = new FormData();
    formData.append("layer_id", layer_id);

    const response = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
            "X-CSRFToken": globcsrfToken,
        },
        credentials: "same-origin",
    });

    // const data = await response.json();
    if (!response.ok) {
        console.error("Failed to update layer: " + response.status);
        return {"response": response, "success": false};
    }

    return {"response": response, "success": true};
}

async function set_layer_active(button) {
    const layer_id = button.dataset.layerId;

    const {response, success} = await request_layer_update(layer_id, activate_layer_url);
    if (!success) return;

    const data = await response.json();

    active_layers_list.insertAdjacentHTML("afterbegin", data.layer_card);
    init_layer_card(data.layer_id);
    const layer_stick_element = all_layers_list.querySelector("#layer-stick-" + String(layer_id));
    if (layer_stick_element) {
        layer_stick_element.outerHTML = data.layer_stick;
    }

    set_render_button_active();
}

async function set_layer_inactive(button) {
    const layer_id = button.dataset.layerId;

    const {response, success} = await request_layer_update(layer_id, deactivate_layer_url);
    if (!success) return;

    const layer_stick = await response.text();
    active_layers_list.querySelector("#layer-card-" + String(layer_id))?.remove();
    const layer_stick_element = all_layers_list.querySelector("#layer-stick-" + String(layer_id));
    if (layer_stick_element) {
        layer_stick_element.outerHTML = layer_stick;
    }

    set_render_button_active();
}

function is_active(button) {
    return button.dataset.active === "1"
}

all_layers_list.addEventListener("click", async function(event) {
    const button = event.target.closest(".toggle-layer-btn");
    if (!button) return;

    if (is_active(button)) {
        set_layer_inactive(button);
    } else {
        set_layer_active(button);
    }
});

async function delete_layer(button) {
    const layer_id = button.dataset.layerId;

    const {response, success} = await request_layer_update(layer_id, delete_layer_url);
    if (!success) return;

    active_layers_list.querySelector("#layer-card-" + String(layer_id))?.remove();
    all_layers_list.querySelector("#layer-stick-" + String(layer_id))?.remove();

    set_render_button_active();
}

active_layers_list.addEventListener("click", async function(event) {
    const setInactiveButton = event.target.closest(".move-to-inactive-btn");
    if (setInactiveButton) {
        set_layer_inactive(setInactiveButton);
        return;
    }

    const deleteLayerButton = event.target.closest(".delete-layer-btn");
    if (deleteLayerButton) {
        delete_layer(deleteLayerButton);
        return;
    }
})

function init_layer_card(layerId) {
    const layer_card = document.querySelector(`#layer-card-${layerId}`);
    const form = layer_card.querySelector(`form[data-layer-id="${layerId}"]`);
    const canvas = document.getElementById(`preview-${layerId}`);
    if (!form || !canvas) return;
    render_preview(canvas, get_layer_settings(form));

    const layer_stick_element = all_layers_list.querySelector("#layer-stick-" + String(layerId));
    const name_box = form.querySelector(`input[name="layer-${layerId}-name"]`);
    const card_name_display = layer_card.querySelector(".layer-expand-btn");
    const stick_name_display = layer_stick_element.querySelector(".layer-stick-name");

    // update the layer names on all the cards since otherwise with how its set up, a layer save on the server would have to return fresh cards and that is rather pointless for this
    name_box.addEventListener("change", function(event) {
        card_name_display.textContent = name_box.value;
        stick_name_display.textContent = name_box.value;
    });
    // prevent automatic form submission for layer name change on enter, as it's saved to the server by another listener already, and submit would cause a page reload
    name_box.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            name_box.blur();
        }
    });
}

async function save_layer(form, url) {
    const layer_id = form.dataset.layerId;
    const form_data = new FormData(form);
    form_data.append("layer_id", layer_id);
    const res = await fetch(url, {
        method: "POST",
        body: form_data,
        headers: { "X-CSRFToken": globcsrfToken },
        credentials: "same-origin",
    });
    if (!res.ok) console.error("Save failed:", res.status);
}

async function save_standard_form(form, url) {
    const form_data = new FormData(form);
    const res = await fetch(url, {
        method: "POST",
        body: form_data,
        headers: { "X-CSRFToken": globcsrfToken },
        credentials: "same-origin",
    });
    if (!res.ok) console.error("Save failed:", res.status);
}


// ----- render control logic
const render_button = document.getElementById("renderButton");
let render_button_active = true;

function get_layer_settings(form) {
    const d = new FormData(form);
    const p = `layer-${form.dataset.layerId}`;
    return {
        frequency:          parseFloat(d.get(`${p}-frequency`)),
        amplitude:          parseFloat(d.get(`${p}-amplitude`)),
        octaves:            parseInt(d.get(`${p}-octaves`)),
        lacunarity:         parseFloat(d.get(`${p}-lacunarity`)),
        persistence:        parseFloat(d.get(`${p}-persistence`)),
        warping:            parseFloat(d.get(`${p}-warping`)),
        ridge_strength:     parseFloat(d.get(`${p}-ridge_strength`)),
    };
}

function get_river_settings(form) {
    const d = new FormData(form);
    return {
        max_width:              parseInt(d.get("max_width")),
        river_threshold:        parseFloat(d.get("river_threshold")),
        river_threshold_end:    parseFloat(d.get("river_threshold_end")),
        width_beta:             parseFloat(d.get("width_beta")),
    }
}

function get_seed_from_raw_seed(raw_seed) {
    let seed = 0;
    for (let i = 0; i < raw_seed.length; i++) {
        seed += raw_seed.charCodeAt(i) * (i + 1);
    }
    return seed;
}

function get_feature_settings(form) {
    const d = new FormData(form);
    return {
        seed:           get_seed_from_raw_seed(d.get("seed")),
        has_erosion:    d.get("has_erosion") === "on",
        has_water:      d.get("has_water") === "on",
        has_rivers:     d.get("has_rivers") === "on",
    };
}

function set_render_button_active() {
    if (render_button_active) return;
    render_button_active = true;

    render_button.removeAttribute("disabled");
    render_button.classList.remove("btn-secondary");
    render_button.classList.add("active");
    render_button.classList.add("btn-primary");
}

function set_render_button_inactive() {
    if (!render_button_active) return;
    render_button_active = false;

    render_button.setAttribute("disabled", true);
    render_button.classList.remove("btn-primary");
    render_button.classList.remove("active");
    render_button.classList.add("btn-secondary");
}

render_button.addEventListener("click", async function(event) {
    set_render_button_inactive();

    const layers = [];
    for (const layer_card of active_layers_list.children) {
        const form = layer_card.querySelector("form[data-layer-id]");
        layers.push(get_layer_settings(form));
    }

    const river_settings = get_river_settings(river_settings_form);
    const feature_settings = get_feature_settings(feature_settings_form);

    generate_terrain(layers, feature_settings, river_settings);
});

document.getElementById("exportButton").addEventListener("click", async function() {
    export_scene_as_glb();
})


// Throttle via rAF — skip frames if one is already queued
let raf_pending = false;
function throttled_preview(form, canvas) {
    if (raf_pending) return;
    raf_pending = true;
    requestAnimationFrame(() => {
        render_preview(canvas, get_layer_settings(form));
        raf_pending = false;
    });
}

// Debounce — wait server_save_debounce ms after last change before saving
let save_timer = null;
function debounced_save(form, saveFunction, url) {
    clearTimeout(save_timer);
    save_timer = setTimeout(() => saveFunction(form, url), server_save_debounce);
}

// Keep preview up to date and saves changes
active_layers_list.addEventListener("input", function(event) {
    const form = event.target.closest("form[data-layer-id]");
    if (!form) return;
    set_render_button_active();
    const canvas = document.getElementById(`preview-${form.dataset.layerId}`);
    if (canvas) throttled_preview(form, canvas);
    debounced_save(form, save_layer, "savelayer/");
});

document.querySelectorAll("#activeList form[data-layer-id]").forEach(form => {
    init_layer_card(form.dataset.layerId);
});


river_settings_form.addEventListener("input", function() {
    set_render_button_active();
    debounced_save(this, save_standard_form, save_river_settings_url);
});


feature_settings_form.addEventListener("input", function() {
    set_render_button_active();
    debounced_save(this, save_standard_form, save_feature_settings_url);
})

// prevent the enter key from causing a page reload for the seed input
feature_settings_form.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        seed_text_box.blur();
    }
});
// detect blur upstream and update server with new seed
feature_settings_form.addEventListener("blur", function(event) {
    debounced_save(this, save_standard_form, save_feature_settings_url);
});


// Keep slider values up to date
document.addEventListener("input", function(event) {
    if (!event.target.matches('input[type="range"]')) return;

    const wrapper = event.target.closest(".form-group");
    const value_el = wrapper?.querySelector(".slider-value");
    if (value_el) {
        value_el.textContent = event.target.value;
    }
});
