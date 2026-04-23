import * as THREE from 'three';
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import Alea from 'https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm';
import { MinPriorityQueue, MaxPriorityQueue, PriorityQueue } from "https://esm.sh/@datastructures-js/priority-queue@6.3.5";

const middle_column = document.getElementById("middleColumn");

function render_window_size() {
    return {"window_width": middle_column.clientWidth, "window_height": middle_column.clientHeight / 2};
}
function camera_perspective() {
    const {window_width, window_height} = render_window_size();
    return window_width / window_height;
}

const terrain_width_real = 40;
const terrain_height_real = 40;

const terrain_width = 750;
const terrain_height = 750;

const previewWidth = 100;
const previewHeight = 50;

// create scene and camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, camera_perspective(), 0.1, 1000);
camera.position.y = -15;
camera.position.z = 10;

// orient camera towards center
camera.lookAt(new THREE.Vector3(0, -2.2, 0));

// create renderer and add it to the templated page
const renderer = new THREE.WebGLRenderer();
renderer.domElement.id = "renderWindow";
middle_column.prepend(renderer.domElement);

function resize_render_window() {
    const {window_width, window_height} = render_window_size();

    renderer.setSize(window_width, window_height, false);
    camera.aspect = window_width / window_height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
}

// size renderer to current frame and listen for changes
resize_render_window();
const observer = new ResizeObserver(resize_render_window);
observer.observe(middle_column);

// create light, ambient for global visibility and a point light for shadows
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 10);
scene.add(light);

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const activeLayers = {};

// array for iterating over neighbors cleanly
const neighbor_offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
]

// weights for when a drop deposits its sediment
// not sure if weighting some more heavily than others is useful at all
const deposit_offsets = [
    [0, 0, 0.2],
    [-1, 0, 0.2],
    [1, 0, 0.2],
    [0, -1, 0.2],
    [0, 1, 0.2]
];

// converts (X, Y) to I
function get_i_from_xy(x, y, plane_width) {
    return y * plane_width + x;
}

// converts I to (X, Y)
function get_xy_from_i(i, plane_width) {
    return {
        x: i % plane_width,
        y: Math.floor(i / plane_width)
    }
}

// gets a random number in range. If min is an integer, it will be too.
function rng_in_range(prng, min, max) {
    return Math.floor(prng() * (max - min + 1)) + min;
}

// finds the lowest neighbor and the delta height for a given node
function get_lowest_neighbor(x, y, z, position, plane_width, plane_height, prng) {
    let lowestNeighbor = null;
    let lowestDeltaHeight = 100000000;

    // iterate over neighbors
    for (const [dx, dy] of neighbor_offsets) {
        const nx = x + dx;
        const ny = y + dy;

        // guard against out of bounds
        if (nx < 0 || nx >= plane_width || ny < 0 || ny >= plane_height) {
            continue;
        }

        const nI = get_i_from_xy(nx, ny, plane_width);
        const deltaHeight = position.getZ(nI) - z;
        // checks if neighbor is the lowest
        if (deltaHeight < lowestDeltaHeight) {
            lowestNeighbor = nI;
            lowestDeltaHeight = deltaHeight
        }
    }

    return {
        neighbor: lowestNeighbor,
        deltaHeight: lowestDeltaHeight
    };
}

// calculates noise given layer parameters and a seeded noise generator
function calculate_noise(noise2d, x, y, frequency, amplitude, octaves, lacunarity, persistance) {
    let noise = 0;
    for (let octave = 0; octave < octaves; octave++) {
        const octFrequency = frequency * lacunarity ** octave;
        noise += noise2d(x * octFrequency, y * octFrequency) * (amplitude * persistance ** octave);
    }
    return noise;
}

function calculate_extreme_noise(amplitude, octaves, persistance, extreme) {
    let extremeNoise = 0;
    for (let octave = 0; octave < octaves; octave++) {
        extremeNoise += extreme * (amplitude * persistance ** octave);
    }
    return extremeNoise;
}

// iterates over height map and uses the normals as slope to pick colors per vertex
function calculate_terrain_colors(geometry) {
    const position = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");

    // colors array to store the data for the height map
    const colors = new Float32Array(position.count * 3);

    // iterate over each vertice
    const slopeThreshold = 0.3
    for (let i = 0; i < position.count; i++) {
        const slope = 1 - normals.getZ(i);

        // brown
        if (slope > slopeThreshold) {
            colors[i * 3] = 85 / 255;
            colors[i * 3 + 1] = 53 / 255;
            colors[i * 3 + 2] = 30 / 255;
        // green
        } else {
            colors[i * 3] = 89 / 255;
            colors[i * 3 + 1] = 100 / 255;
            colors[i * 3 + 2] = 41 / 255;
        }
    }

    return colors;
}

// uses a simple implementation of hydraulic erosion to make the terrain look fancy
function erode_terrain(geometry, prng) {
    const position = geometry.getAttribute("position");
    const positions_array = position.array;
    const plane_width = geometry.parameters.widthSegments + 1;
    const plane_height = geometry.parameters.heightSegments + 1;

    // placeholder inputs, maybe allow user to input these via a form?
    // only issue with that is they're very sensitive, so easy to mess up the terrain on accident by changing these
    const sizeRetention = 0.8;
    const speedRetention = 0.9;
    const depositSpeed = 0.05;
    const erodeSpeed = 0.08;
    const erosionRadius = 3;
    const minCapacity = 0.1;
    const baseCapacity = 2;
    const droplets = 100000;
    // simulate some number of droplets
    for (let droplet = 0; droplet < droplets; droplet++) {
        // initialize starting values for droplet
        let size = 5;
        let speed = 100;
        let x = rng_in_range(prng, 0, plane_width - 1);
        let y = rng_in_range(prng, 0, plane_height - 1);
        let i = get_i_from_xy(x, y, plane_width);
        let sediment = 0;

        // step the droplet down 30 times, or until it stops "moving"
        for (let time = 0; time < 50; time++) {
            // move to the lowest nearby neighbor
            const z = position.getZ(i);
            const {neighbor, deltaHeight} = get_lowest_neighbor(x, y, z, position, plane_width, plane_height, prng);

            i = neighbor;
            ({x, y} = get_xy_from_i(i, plane_width));

            // calculate the current capacity for the droplet (how much sediment it can hold)
            const capacity = Math.max(-deltaHeight * size * speed * baseCapacity, minCapacity);
            // if sediment is greater than capacity or its moving up instead of down, deposit excess sediment nearby right away
            if (sediment > capacity || deltaHeight > 0) {
                let deposition;
                if (deltaHeight > 0) {
                    deposition = Math.min(deltaHeight, sediment);
                } else {
                    deposition = (sediment - capacity) * depositSpeed;
                }
                sediment -= deposition;

                // iterate over neighbors and use hardcoded weights for each
                for (const [dx, dy, weight] of deposit_offsets) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= plane_width || ny < 0 || ny >= plane_height) {
                        continue;
                    }

                    positions_array[get_i_from_xy(nx, ny, plane_width) * 3 + 2] += deposition * weight;
                }
            // otherwise, erode by taking sediment from its surroundings and carrying it with it
            } else {
                const erosion = Math.min((capacity - sediment) * erodeSpeed, -deltaHeight);
                const erosionPerCell = erosion / (erosionRadius * 2 + 1) ** 2;
                sediment += erosion;
                
                // iterate over nearby nodes based on a radius to erode from them
                for (let dx = -erosionRadius; dx < erosionRadius + 1; dx++) {
                    for (let dy = -erosionRadius; dy < erosionRadius + 1; dy++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        // guard against out of bounds
                        if (nx < 0 || nx >= plane_width || ny < 0 || ny >= plane_height) {
                            continue;
                        }

                        // scale by distance from center of erosion, guarding against 0 case
                        let div = Math.sqrt(Math.abs(dx)^2 + Math.abs(dy)^2) / 1.4;
                        if (div == 0) {
                            div = 1;
                        }
                        // update Z position of the vertex directly
                        positions_array[get_i_from_xy(nx, ny, plane_width) * 3 + 2] -= erosionPerCell / div;
                    }
                }
            }

            // update speed based on delta height
            speed = Math.max(speed + (-deltaHeight), 0.1) * speedRetention;
            // decrease size of the droplet
            size *= sizeRetention;

            if (speed < 0.01) {
                break;
            }
        }
    }

    position.needsUpdate = true;
}

function add_edge(i, edges, visited) {
    if (visited[i]) return;
    visited[i] = true;
    edges.push(i);
}

function fill_depressions_with_water(geometry, colors) {
    const position = geometry.getAttribute("position");
    const positions_array = position.array;
    const plane_width = geometry.parameters.widthSegments + 1;
    const plane_height = geometry.parameters.heightSegments + 1;

    const visited = Array(plane_width * plane_height).fill(false);

    const edges = [];
    for (let x = 0; x < plane_width; x++) {
        const i1 = x;
        const i2 = x + plane_width * (plane_height - 1);
        add_edge(i1, edges, visited);
        add_edge(i2, edges, visited);
    }

    for (let y = 1; y < plane_height - 1; y++) {
        const i1 = y * plane_width;
        const i2 = y * plane_width + plane_width - 1;
        add_edge(i1, edges, visited);
        add_edge(i2, edges, visited);
    }

    const p_queue = PriorityQueue.fromArray(edges, (i1, i2) => {
        return positions_array[i1 * 3 + 2] - positions_array[i2 * 3 + 2];
    });

    while (true) {
        const ci = p_queue.dequeue();
        if (ci == null) break;

        const ciz = ci * 3 + 2;
        const {x, y} = get_xy_from_i(ci, plane_width);
        const z = positions_array[ci * 3 + 2];

        // colors[ciz - 2] = 255
        // colors[ciz - 1] = 255
        // colors[ciz] = 255
        
        for (const [dx, dy] of neighbor_offsets) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= plane_width || ny < 0 || ny >= plane_height) {
                continue;
            }

            const ni = get_i_from_xy(nx, ny, plane_width);
            const niz = ni * 3 + 2;
            if (visited[ni]) {
                continue;
            }

            const nz = positions_array[niz];
            if (nz < z) {
                positions_array[niz] = z;
                colors[niz - 2] = 0;
                colors[niz - 1] = 38 / 255;
                colors[niz] = 91 / 255;
            }

            p_queue.enqueue(ni);
            visited[ni] = true;
        }
    }
}

// calculate the generic height map based on layers
// currently hardcoded with a couple layer's inputs
function calculateTerrainNoise(geometry, noise2d) {
    const position = geometry.getAttribute("position");

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = calculate_noise(noise2d, x, y, 0.1, 1, 3, 2, 0.5) + calculate_noise(noise2d, x, y, 0.03, 2, 3, 2, 0.5);

        position.setXYZ(i, x, y, z);
    }

    position.needsUpdate = true;
}

// main function which uses the scene to render the terrain
function renderTerrain() {
    // hardcoded seed
    const seed = 6;
    // initialize seeded random number generator and noise function
    const prng = Alea(seed);
    const noise2d = createNoise2D(prng);

    // create geometry and populate it with height map
    const geometry = new THREE.PlaneGeometry(terrain_width_real, terrain_height_real, terrain_width, terrain_height);
    calculateTerrainNoise(geometry, noise2d);
    erode_terrain(geometry, prng);

    // calculate normals and use that to determine color
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ 
        vertexColors: true
    });
    const colors = calculate_terrain_colors(geometry);
    fill_depressions_with_water(geometry, colors);

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const heightMap = new THREE.Mesh(geometry, material);
    scene.add(heightMap);

    renderer.render(scene, camera);

    // export scene in a file format commonly used that contains all the information about the scene
    // exportSceneAsGLB(scene);
}
renderTerrain();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// layerId is a placeholder to grab the correct layer based on the layer form that's being edited
// the hardcoded layer inputs are also a placeholder
function renderPreview(canvas, params) {
    const { frequency, amplitude, octaves, lacunarity, persistence } = params;
    const max = calculate_extreme_noise(amplitude, octaves, persistence, 1);
    const min = calculate_extreme_noise(amplitude, octaves, persistence, -1);

    const prng = Alea(6);
    const noise2d = createNoise2D(prng);
    const imageData = canvas.getContext('2d').createImageData(previewWidth, previewHeight);
    const data = imageData.data;

    for (let x = 0; x < previewWidth; x++) {
        for (let y = 0; y < previewHeight; y++) {
            const i = get_i_from_xy(x, y, previewWidth) * 4;
            const z = calculate_noise(noise2d, x, y, frequency, amplitude, octaves, lacunarity, persistence);
            const v = Math.floor((z - max) / (min - max) * 255);
            data[i] = data[i+1] = data[i+2] = v;
            data[i+3] = 255;
        }
    }
    canvas.getContext('2d').putImageData(imageData, 0, 0);
}

function saveGLBData(data) {
    const blob = new Blob([data], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "test.glb";
    link.click();
}

function exportSceneAsGLB(scene) {
    const options = { binary: true };
    const exporter = new GLTFExporter();
    exporter.parse(scene, saveGLBData, null, options);
}



const newInputLayerForm = document.getElementById("newInputLayerForm");
const activeLayersList = document.getElementById("activeList");
const allLayersList = document.getElementById("allList");
const globcsrfToken = document.querySelector("[name=csrfmiddlewaretoken]").value;

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
        console.error("Failed to create new input layer: " + response.status)
        return;
    }

    const data = await response.json();

    activeLayersList.insertAdjacentHTML("afterbegin", data.layer_card);
    allLayersList.insertAdjacentHTML("afterbegin", data.layer_stick);
    initLayerCard(data.layer_id);
});

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

function is_active(button) {
    return button.dataset.active === "1"
}

function start_tracking_layer() {
    
}

function stop_tracking_layer(layer_id) {
    delete activeLayers[layer_id]
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

function getLayerParams(form) {
    const d = new FormData(form);
    const p = `layer-${form.dataset.layerId}`;
    return {
        frequency:   parseFloat(d.get(`${p}-frequency`)),
        amplitude:   parseFloat(d.get(`${p}-amplitude`)),
        octaves:     parseInt(d.get(`${p}-octaves`)),
        lacunarity:  parseFloat(d.get(`${p}-lacunarity`)),
        persistence: parseFloat(d.get(`${p}-persistence`)),
    };
}

function initLayerCard(layerId) {
    const form = document.querySelector(`#layer-card-${layerId} form[data-layer-id]`);
    const canvas = document.getElementById(`preview-${layerId}`);
    if (!form || !canvas) return;
    renderPreview(canvas, getLayerParams(form));
}


// Throttle via rAF — skip frames if one is already queued
let rafPending = false;
function throttledPreview(form, canvas) {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        renderPreview(canvas, getLayerParams(form));
        rafPending = false;
    });
}


activeLayersList.addEventListener("input", function(event) {
    const form = event.target.closest("form[data-layer-id]");
    if (!form) return;
    const canvas = document.getElementById(`preview-${form.dataset.layerId}`);
    if (canvas) throttledPreview(form, canvas);
});

document.querySelectorAll("#activeList form[data-layer-id]").forEach(form => {
    initLayerCard(form.dataset.layerId);
});
