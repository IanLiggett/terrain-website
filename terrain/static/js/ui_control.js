import { generate_terrain, render_preview } from "./terrain.js";
import { export_scene_as_glb } from "./scene.js";

const riverSettingsForm = document.getElementById("riverSettingsForm");
const newInputLayerForm = document.getElementById("newInputLayerForm");
const activeLayersList = document.getElementById("activeList");
const allLayersList = document.getElementById("allList");
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

    const response = await fetch("createlayer/", {
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

    activeLayersList.insertAdjacentHTML("afterbegin", data.layer_card);
    allLayersList.insertAdjacentHTML("afterbegin", data.layer_stick);
    initLayerCard(data.layer_id);
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

    const {response, success} = await request_layer_update(layer_id, "activatelayer/");
    if (!success) return;

    const data = await response.json();

    activeLayersList.insertAdjacentHTML("afterbegin", data.layer_card);
    initLayerCard(data.layer_id);
    const layer_stick_element = allLayersList.querySelector("#layer-stick-" + String(layer_id));
    if (layer_stick_element) {
        layer_stick_element.outerHTML = data.layer_stick;
    }

    set_render_button_active();
}

async function set_layer_inactive(button) {
    const layer_id = button.dataset.layerId;

    const {response, success} = await request_layer_update(layer_id, "deactivatelayer/");
    if (!success) return;

    const layer_stick = await response.text();
    activeLayersList.querySelector("#layer-card-" + String(layer_id))?.remove();
    const layer_stick_element = allLayersList.querySelector("#layer-stick-" + String(layer_id));
    if (layer_stick_element) {
        layer_stick_element.outerHTML = layer_stick;
    }

    set_render_button_active();
}

function is_active(button) {
    return button.dataset.active === "1"
}

allLayersList.addEventListener("click", async function(event) {
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

    const {response, success} = await request_layer_update(layer_id, "deletelayer/");
    if (!success) return;

    activeLayersList.querySelector("#layer-card-" + String(layer_id))?.remove();
    allLayersList.querySelector("#layer-stick-" + String(layer_id))?.remove();

    set_render_button_active();
}

activeLayersList.addEventListener("click", async function(event) {
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

function initLayerCard(layerId) {
    const layer_card = document.querySelector(`#layer-card-${layerId}`);
    const form = layer_card.querySelector(`form[data-layer-id="${layerId}"]`);
    const canvas = document.getElementById(`preview-${layerId}`);
    if (!form || !canvas) return;
    render_preview(canvas, getLayerParams(form));

    const layer_stick_element = allLayersList.querySelector("#layer-stick-" + String(layerId));
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

async function saveLayer(form) {
    const layerId = form.dataset.layerId;
    const formData = new FormData(form);
    formData.append("layer_id", layerId);
    const res = await fetch("/savelayer/", {
        method: "POST",
        body: formData,
        headers: { "X-CSRFToken": globcsrfToken },
        credentials: "same-origin",
    });
    if (!res.ok) console.error("Save failed:", res.status);
}

async function saveRiverSettings(form) {
    const formData = new FormData(form);
    const res = await fetch("/saveriversettings/", {
        method: "POST",
        body: formData,
        headers: { "X-CSRFToken": globcsrfToken },
        credentials: "same-origin",
    });
    if (!res.ok) console.error("Save failed:", res.status);
}


// ----- render control logic
const renderButton = document.getElementById("renderButton");
let render_button_active = true;

function getLayerParams(form) {
    const d = new FormData(form);
    const p = `layer-${form.dataset.layerId}`;
    return {
        frequency:      parseFloat(d.get(`${p}-frequency`)),
        amplitude:      parseFloat(d.get(`${p}-amplitude`)),
        octaves:        parseInt(d.get(`${p}-octaves`)),
        lacunarity:     parseFloat(d.get(`${p}-lacunarity`)),
        persistence:    parseFloat(d.get(`${p}-persistence`)),
        warping:        parseFloat(d.get(`${p}-warping`)),
        ridge_strength:  parseFloat(d.get(`${p}-ridge_strength`))
    };
}

function getRiverSettings(form) {
    const d = new FormData(form);
    return {
        max_width:              parseInt(d.get("max_width")),
        river_threshold:        parseFloat(d.get("river_threshold")),
        river_threshold_end:    parseFloat(d.get("river_threshold_end")),
        width_beta:             parseFloat(d.get("width_beta")),
    }
}   

function set_render_button_active() {
    if (render_button_active) return;
    render_button_active = true;

    renderButton.removeAttribute("disabled");
    renderButton.classList.remove("btn-secondary");
    renderButton.classList.add("active");
    renderButton.classList.add("btn-primary");
}

function set_render_button_inactive() {
    if (!render_button_active) return;
    render_button_active = false;

    renderButton.setAttribute("disabled", true);
    renderButton.classList.remove("btn-primary");
    renderButton.classList.remove("active");
    renderButton.classList.add("btn-secondary");
}

renderButton.addEventListener("click", async function(event) {
    set_render_button_inactive();

    const layers = [];
    for (const layer_card of activeLayersList.children) {
        const form = layer_card.querySelector("form[data-layer-id]");
        layers.push(getLayerParams(form));
    }
    
    const river_settings = getRiverSettings(riverSettingsForm);
    
    generate_terrain(layers, undefined, undefined, undefined, undefined, river_settings);
});

document.getElementById("exportButton").addEventListener("click", async function() {
    export_scene_as_glb();
})


// Throttle via rAF — skip frames if one is already queued
let rafPending = false;
function throttledPreview(form, canvas) {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        render_preview(canvas, getLayerParams(form));
        rafPending = false;
    });
}

// Debounce — wait server_save_debounce ms after last change before saving
let saveTimer = null;
function debouncedSave(form, saveFunction) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveFunction(form), server_save_debounce);
}

// Keep preview up to date and saves changes
activeLayersList.addEventListener("input", function(event) {
    const form = event.target.closest("form[data-layer-id]");
    if (!form) return;
    set_render_button_active();
    const canvas = document.getElementById(`preview-${form.dataset.layerId}`);
    if (canvas) throttledPreview(form, canvas);
    debouncedSave(form, saveLayer);
});

document.querySelectorAll("#activeList form[data-layer-id]").forEach(form => {
    initLayerCard(form.dataset.layerId);
});


riverSettingsForm.addEventListener("input", function() {
    set_render_button_active();
    debouncedSave(this, saveRiverSettings);
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
