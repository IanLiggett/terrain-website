import * as THREE from 'three';
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Sky } from 'three/addons/objects/Sky.js';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import Alea from 'https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm';
import { MinPriorityQueue, MaxPriorityQueue, PriorityQueue } from "https://esm.sh/@datastructures-js/priority-queue@6.3.5";
import Denque from 'https://esm.sh/denque';

const middle_column = document.getElementById("middleColumn");
const render_window_frame = document.getElementById("renderWindowFrame");

function render_window_size() {
    return {"window_width": render_window_frame.clientWidth, "window_height": middle_column.clientHeight / 2};
}
function camera_perspective() {
    const {window_width, window_height} = render_window_size();
    return window_width / window_height;
}

const terrain_width_real = 40;
const terrain_height_real = 40;

const terrain_width = 500;
const terrain_height = 500;

const previewWidth = 100;
const previewHeight = 50;

let active_layers = null;
let active_noise = null;

// create scene and camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, camera_perspective(), 0.1, 1000);
camera.position.y = 0.2;
camera.position.z = -0.35;


// create renderer and add it to the page
const renderer = new THREE.WebGLRenderer();
renderer.outputColorSpace = THREE.SRGBColorSpace;
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
// renderer.toneMappingExposure = 0.6;

const render_window = renderer.domElement;
render_window.id = "render_window";
render_window.setAttribute("tabindex", "0");
render_window_frame.prepend(render_window);


// create skybox so we're totally not in an infinite void
const sky = new Sky();
sky.scale.setScalar(200);
scene.add(sky);

const uniforms = sky.material.uniforms;
const sun = new THREE.Vector3();

// renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;

uniforms.turbidity.value = 3;
uniforms.rayleigh.value = 3;
uniforms.mieCoefficient.value = 0.0005;
uniforms.mieDirectionalG.value = 0.9;

const elevation = 5;
const azimuth = 180;
const distance = 450000;

const phi = THREE.MathUtils.degToRad(90 - elevation);
const theta = THREE.MathUtils.degToRad(azimuth);

sun.setFromSphericalCoords(distance, phi, theta);
uniforms.sunPosition.value.copy(sun);

const sunLight = new THREE.DirectionalLight(0xffc07d, 1.5);
sunLight.position.copy(sun).multiplyScalar(100);
scene.add(sunLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

scene.fog = new THREE.Fog(0xcccccc, 30, 100);

// create users cube that the camera locks to
const cube_geometry = new THREE.BoxGeometry(0.02, 0.02, 0.02);
const cube_material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const camera_cube = new THREE.Mesh(cube_geometry, cube_material);
camera_cube.visible = false;
camera.lookAt(camera_cube.position);
camera_cube.add(camera);
scene.add(camera_cube);

let terrain_mesh = null;
const terrain_material = new THREE.MeshStandardMaterial({ vertexColors: true });

// keybinds for movement controls
const move_directions = {
    d: [-1, 0],
    a: [1, 0],
    w: [0, 1],
    s: [0, -1],
};

const rotate_directions = {
    ArrowRight: -1,
    ArrowLeft: 1,
    "2": 1,
    "3": -1,
}

const elevation_directions = {
    e: 1,
    q: -1,
}

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// optional with three-mesh-bvh:
const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const origin = new THREE.Vector3();
const hits = [];

raycaster.firstHitOnly = true;
raycaster.layers.set(1);
raycaster.near = 0;
raycaster.far = 200;

function snap_cube_to_floor(camera_cube, height) {
  camera_cube.getWorldPosition(origin);
  origin.y += 100;

  raycaster.set(origin, down);

  hits.length = 0;
  raycaster.intersectObject(terrain_mesh, false, hits);

  if (hits.length > 0) {
    height = Math.max(hits[0].point.y + 0.1, height)
    camera_cube.position.y = height;
  }

  return height;
}

// user controls to allow user to traverse scene
window.load_user_controls = function load_user_controls() {
    render_window_frame.addEventListener("click", () => {
        render_window.focus();
    });

    const max_dt = 1/30;

    const max_speed = 5;
    const acceleration = 20;
    const slowdown = 12;

    const rotate_speed = 0.01;

    const min_height = 0.1;
    let height = min_height;

    let x_momentum = 0;
    let y_momentum = 0;
    let z_momentum = 0;
    let x_velocity = 0;
    let y_velocity = 0;
    let z_velocity = 0;

    let rotate_momentum = 0;
    let rotate_velocity = 0;

    let last_time = 0;

    function update_momentums(event, direction) {
        if (event.repeat || terrain_mesh === null) return;
        
        const move_direction = move_directions[event.key];
        if (move_direction) {
            x_momentum += move_direction[0] * direction;
            y_momentum += move_direction[1] * direction;
        };

        const rotate_direction = rotate_directions[event.key];
        if (rotate_direction) {
            rotate_momentum += rotate_direction * direction;
        }

        const elevation_direction = elevation_directions[event.key]
        if (elevation_direction) {
            z_momentum += elevation_direction * direction;
        }
    }

    render_window.addEventListener("keydown", (event) => {
        update_momentums(event, 1);
    });

    render_window.addEventListener("keyup", (event) => {
        update_momentums(event, -1);
    });

    renderer.setAnimationLoop((time) => {
        if (terrain_mesh === null) return;

        const dt = Math.min(last_time ? (time - last_time) / 1000 : 0, max_dt);
        last_time = time;

        if (x_momentum !== 0) {
            x_velocity += x_momentum * acceleration * dt;
        } else {
            x_velocity -= x_velocity * slowdown * dt;
        }

        if (y_momentum !== 0) {
            y_velocity += y_momentum * acceleration * dt;
        } else {
            y_velocity -= y_velocity * slowdown * dt;
        }

        if (z_momentum !== 0) {
            z_velocity += z_momentum * acceleration * dt;
        } else {
            z_velocity -= z_velocity * slowdown * dt;
        }

        if (rotate_momentum != 0) {
            rotate_velocity += rotate_momentum * acceleration * dt;
        } else {
            rotate_velocity -= rotate_velocity * slowdown * dt
        }

        x_velocity = Math.max(-max_speed, Math.min(max_speed, x_velocity));
        y_velocity = Math.max(-max_speed, Math.min(max_speed, y_velocity));
        z_velocity = Math.max(-max_speed, Math.min(max_speed, z_velocity));
        rotate_velocity = Math.max(-max_speed, Math.min(max_speed, rotate_velocity));

        camera_cube.translateX(x_velocity * dt);
        camera_cube.translateZ(y_velocity * dt);
        camera_cube.rotation.y += rotate_velocity * rotate_speed;

        height = height + z_velocity * dt;

        if (active_layers) {
            height = snap_cube_to_floor(camera_cube, height);

            // const terrain_cube_coords = new THREE.Vector3();
            // camera_cube.getWorldPosition(terrain_cube_coords);
            // terrain_mesh.worldToLocal(terrain_cube_coords);

            // const x = terrain_cube_coords.x;
            // const z = terrain_cube_coords.z;

            // const terrain_segments_x = terrain_mesh.geometry.parameters.widthSegments;
            // const terrain_segments_y = terrain_mesh.geometry.parameters.heightSegments;

            // const grid_x = ((x + terrain_width_real / 2) / terrain_width_real) * terrain_segments_x;
            // const grid_z = ((z + terrain_height_real / 2) / terrain_height_real) * terrain_segments_y;

            // const terrain_z = height_at_coords(grid_x, grid_z, terrain_mesh.geometry);
            // camera_cube.position.y = terrain_z + height;
        }

        renderer.render(scene, camera);
    });
};

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
observer.observe(render_window_frame);

// array for iterating over neighbors cleanly
const neighbor_offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
]

const water_neighbor_offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
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

// finds lowest neighbor, selects randomly for similar heights to avoid forming ridges on plains
function get_lowest_neighbor_epsilon(x, y, z, position, plane_width, plane_height, prng) {
    const neighbors = [];
    let min_height = Infinity;

    for (const [dx, dy] of neighbor_offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= plane_width || ny < 0 || ny >= plane_height) continue;

        const i = get_i_from_xy(nx, ny, plane_width);
        const h = position.getZ(i);

        neighbors.push({ i, h });
        if (h < min_height) min_height = h;
    }

    const epsilon = 1e-2;
    const candidates = neighbors.filter(n => n.h <= min_height + epsilon);

    const chosen = candidates[Math.floor(rng_in_range(prng, 0, candidates.length - 1))];
    return {
        neighbor: chosen.i,
        delta_height: chosen.h - z
    };
}

// calculates noise given layer parameters and a seeded noise generator
function calculate_noise(noise2d, x, y, frequency, amplitude, octaves, lacunarity, persistence) {
    let noise = 0;
    for (let octave = 0; octave < octaves; octave++) {
        const octFrequency = frequency * lacunarity ** octave;
        noise += noise2d(x * octFrequency, y * octFrequency) * (amplitude * persistence ** octave);
    }
    return noise;
}

function calculate_extreme_noise(amplitude, octaves, persistence, extreme) {
    let extremeNoise = 0;
    for (let octave = 0; octave < octaves; octave++) {
        extremeNoise += extreme * (amplitude * persistence ** octave);
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

    // placeholder inputs, probably don't allow user to input these
    // only issue with that is they're very sensitive, so easy to mess up the terrain on accident by changing these
    const sizeRetention = 0.9;
    const speedRetention = 0.9;
    const depositSpeed = 0.1;
    const erodeSpeed = 0.1;
    // const erosionRadius = 3;
    const minCapacity = 0.1;
    const baseCapacity = 5;
    const droplets = 100000;
    // simulate some number of droplets
    for (let droplet = 0; droplet < droplets; droplet++) {
        // initialize starting values for droplet
        let erosionRadius = rng_in_range(prng, 2, 4);
        let size = 5;
        let speed = 5;
        let x = rng_in_range(prng, 0, plane_width - 1);
        let y = rng_in_range(prng, 0, plane_height - 1);
        let i = get_i_from_xy(x, y, plane_width);
        let sediment = 0;

        // step the droplet down 30 times, or until it stops "moving"
        for (let time = 0; time < 50; time++) {
            // move to the lowest nearby neighbor
            const z = position.getZ(i);
            const {neighbor, delta_height} = get_lowest_neighbor_epsilon(x, y, z, position, plane_width, plane_height, prng);

            if (Math.abs(delta_height) < 0.01) {
                break;
            }

            i = neighbor;
            ({x, y} = get_xy_from_i(i, plane_width));

            // calculate the current capacity for the droplet (how much sediment it can hold)
            const capacity = Math.max(-delta_height * size * speed * baseCapacity, minCapacity);
            // if sediment is greater than capacity or its moving up instead of down, deposit excess sediment nearby right away
            if (sediment > capacity || delta_height > 0) {
                let deposition;
                if (delta_height > 0) {
                    deposition = Math.min(delta_height, sediment);
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
                const erosion = Math.min((capacity - sediment) * erodeSpeed, -delta_height);
                const erosionPerCell = erosion / (erosionRadius * 2 + 1) ** 2;
                
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
                        let div = Math.hypot(dx, dy) / 1.4;
                        if (div === 0) div = 1;
                        // update Z position of the vertex directly
                        positions_array[get_i_from_xy(nx, ny, plane_width) * 3 + 2] -= erosionPerCell / div;
                        sediment += erosionPerCell / div;
                    }
                }
            }

            // update speed based on delta height
            speed = Math.max(speed + (-delta_height), 0.1) * speedRetention;
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

const lerp = (start, end, t) => start + t * (end - start);

function linear_falloff(distance, max_distance) {
  // Returns 1 at distance 0, and 0 at maxDistance
  return Math.max(0, 1 - (distance / max_distance));
}

function fill_depressions_with_water(geometry, colors) {
    const position = geometry.getAttribute("position");
    const positions_array = position.array;
    const plane_width = geometry.parameters.widthSegments + 1;
    const plane_height = geometry.parameters.heightSegments + 1;

    const visited = new Array(plane_width * plane_height).fill(false);

    const indegree = new Uint8Array(plane_width * plane_height).fill(0);
    const receivers = new Uint32Array(plane_width * plane_height).fill(null);
    const water = new Array(plane_width * plane_height).fill(false);
    // let "rain" decide starting value
    const accumulation = new Uint32Array(plane_width * plane_height).fill(3);
    const water_mask = new Float32Array(plane_width * plane_height);

    // How much the water rises per iteration during priority flood filling
    const dz = 0.002;

    // how high of a bank a river can overcome
    const bank_tolerance = 0.05;

    // min and max blue coloring for the water
    const min_alpha = 0.5;
    const max_alpha = 0.7;
    
    // definition of a river based on water accumulation
    const min_river = 1000;
    const max_river = 100000;
    const river_range = max_river - min_river;

    // power to scale width of rivers non linearly
    const width_beta = 0.5;

    const queue = new Denque();

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

    // use non priority queue for flat sections (water) - optimization | only if water doesn't rise in a lake anywhere

    while (true) {
        const ci = p_queue.dequeue();
        if (ci == null) break;

        const {x, y} = get_xy_from_i(ci, plane_width);
        const z = positions_array[ci * 3 + 2];

        for (const [dx, dy] of water_neighbor_offsets) {
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
                // simply heuristic for determing how filled basins contribute to water accumulation
                accumulation[ni] += 4;
                water[ni] = true;

                positions_array[niz] = z + dz;

                water_mask[ni] = lerp(min_alpha, max_alpha, Math.max((z - nz) / 2, 0));
            }

            p_queue.enqueue(ni);
            visited[ni] = true;

            indegree[ci] += 1;
            receivers[ni] = ci;
        }
        
        // add leaf nodes to the queue for river calculations
        if (indegree[ci] == 0) queue.push(ci);
    }

    while (true) {
        const ci = queue.shift();
        if (ci == null) break;

        const acc = accumulation[ci];
        if (acc >= min_river && !water[ci]) {
            const river_strength = Math.max(Math.min((acc - min_river) / river_range, 1), 0);
            // const width = Math.max(1, Math.round(lerp(1, 10, Math.pow(river_strength, width_beta))));
            const width = Math.floor(lerp(0, 10, Math.pow(river_strength, width_beta)));

            const center_alpha = lerp(min_alpha, max_alpha, river_strength);
            if (center_alpha > water_mask[ci]) {
                water_mask[ci] = center_alpha;
            }

            const {x, y} = get_xy_from_i(ci, plane_width);
            const cz = positions_array[ci * 3 + 2];
            for (let dx = -width; dx <= width; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= plane_width) continue;

                for (let dy = -width; dy <= width; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= plane_height) continue;

                    const ni = get_i_from_xy(nx, ny, plane_width);
                    if (water[ni]) continue;
                    
                    const distance = Math.hypot(dx, dy);
                    if (distance > width) continue;

                    const nz = positions_array[ni * 3 + 2];

                    const dh = nz - cz;
                    // if (dh > bank_tolerance/2) {
                    //     positions_array[ni * 3 + 2] -= dh/2;
                    // };
                    if (dh > bank_tolerance) continue;

                    const distance_factor = 1 - distance / width;
                    const height_factor = 1 - Math.max(0, dh) / bank_tolerance;
                    const alpha = lerp(min_alpha, max_alpha, river_strength * distance_factor * height_factor);
                    if (alpha > water_mask[ni]) {
                        water_mask[ni] = alpha;
                    }
                }
            }
        }

        const receiver = receivers[ci];
        if (receiver == null) continue;

        accumulation[receiver] += acc;

        indegree[receiver] -= 1;
        if (indegree[receiver] != 0) continue; 

        queue.push(receiver);
    }

    for (let i = 0; i < water_mask.length; i++) {
        const alpha = water_mask[i];
        if (alpha <= 0) continue;

        colors[i * 3] = 0;
        colors[i * 3 + 1] = (38 / 255) * alpha;
        colors[i * 3 + 2] = Math.max(colors[i * 3 + 2], alpha);
    }
}

// this dang thing didn't work properly, resorted to raycasts instead
// function height_at_coords(x, y, geometry) {
//     const position = geometry.getAttribute("position");
//     const positions_array = position.array;
//     const plane_segments_x = geometry.parameters.widthSegments;
//     const plane_segments_y = geometry.parameters.heightSegments;

//     const x0 = Math.floor(x);
//     const y0 = Math.floor(y);
//     const x1 = x0 + 1;
//     const y1 = y0 + 1;

//     const cx0 = Math.max(0, Math.min(x0, plane_segments_x));
//     const cx1 = Math.max(0, Math.min(x1, plane_segments_x));
//     const cy0 = Math.max(0, Math.min(y0, plane_segments_y));
//     const cy1 = Math.max(0, Math.min(y1, plane_segments_y));

//     const z00 = positions_array[get_i_from_xy(cx0, cy0, plane_segments_x + 1) * 3 + 2];
//     const z10 = positions_array[get_i_from_xy(cx1, cy0, plane_segments_x + 1) * 3 + 2];
//     const z01 = positions_array[get_i_from_xy(cx0, cy1, plane_segments_x + 1) * 3 + 2];
//     const z11 = positions_array[get_i_from_xy(cx1, cy1, plane_segments_x + 1) * 3 + 2];

//     const tx = x - x0;
//     const ty = y - y0;

//     const top = lerp(z00, z10, tx);
//     const bottom = lerp(z01, z11, tx);

//     return lerp(top, bottom, ty);
// }


function calculate_noise_at_coords(layers, x, y, noise2d) {
    let z = 0;
    for (const layer of layers) {
        z += calculate_noise(noise2d, x, y, layer.frequency, layer.amplitude, layer.octaves, layer.lacunarity, layer.persistence);
    }
    return z;
}

// calculate the generic height map based on layers
// currently hardcoded with a couple layer's inputs
function calculate_terrain_noise(layers, geometry, noise2d) {
    const position = geometry.getAttribute("position");

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        // const z = calculate_noise(noise2d, x, y, 0.1, 1, 3, 2, 0.5) + calculate_noise(noise2d, x, y, 0.03, 2, 3, 2, 0.5);
        const z = calculate_noise_at_coords(layers, x, y, noise2d);

        position.setXYZ(i, x, y, z);
    }

    position.needsUpdate = true;
}

// main function which uses the scene to render the terrain
function render_terrain(layers, seed=13, erosion=true, water=true) {
    set_render_button_inactive();

    // initialize seeded random number generator and noise function
    const prng = Alea(seed);
    const noise2d = createNoise2D(prng);

    active_layers = layers;
    active_noise = noise2d;

    // create geometry and populate it with height map
    const geometry = new THREE.PlaneGeometry(terrain_width_real, terrain_height_real, terrain_width, terrain_height);
    calculate_terrain_noise(layers, geometry, noise2d);

    // erosion!
    if (erosion) erode_terrain(geometry, prng);

    // calculate normals and use that to determine color
    geometry.computeVertexNormals();
    const colors = calculate_terrain_colors(geometry);

    // water!
    if (water) {
        fill_depressions_with_water(geometry, colors);
        // recalculate normals to fix water surface
        geometry.computeVertexNormals();
    }

    // apply color
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    geometry.computeBoundsTree();

    // create height map from calculated data and add it to scene
    if (!terrain_mesh) {
        terrain_mesh = new THREE.Mesh(geometry, terrain_material);
        terrain_mesh.layers.enable(1);
        terrain_mesh.rotation.x = -Math.PI / 2;
        scene.add(terrain_mesh);
        renderer.render(scene, camera);
        // optimization that might be pointless
        terrain_mesh.matrixAutoUpdate = false;
    } else {
        terrain_mesh.geometry.dispose();
        terrain_mesh.geometry = geometry;

        renderer.render(scene, camera);
    }
}
// render_terrain();

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

const renderButton = document.getElementById("renderButton");
let button_active = true;

function set_render_button_active() {
    if (button_active) return;
    button_active = true;

    renderButton.removeAttribute("disabled");
    renderButton.classList.remove("btn-secondary");
    renderButton.classList.add("active");
    renderButton.classList.add("btn-primary");
}

function set_render_button_inactive() {
    if (!button_active) return;
    button_active = false;

    renderButton.setAttribute("disabled", true);
    renderButton.classList.remove("btn-primary");
    renderButton.classList.remove("active");
    renderButton.classList.add("btn-secondary");
}

renderButton.addEventListener("click", async function(event) {
    const layers = [];
    for (const layer_card of activeLayersList.children) {
        const form = layer_card.querySelector("form[data-layer-id]");
        layers.push(getLayerParams(form));
    }

    render_terrain(layers);
});

exportButton.addEventListener("click", async function() {
    exportSceneAsGLB(scene);
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

// Debounce — wait 500ms after last change before saving
let saveTimer = null;
function debouncedSave(form) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLayer(form), 500);
}

activeLayersList.addEventListener("input", function(event) {
    const form = event.target.closest("form[data-layer-id]");
    if (!form) return;
    set_render_button_active();
    const canvas = document.getElementById(`preview-${form.dataset.layerId}`);
    if (canvas) throttledPreview(form, canvas);
    debouncedSave(form);
});

document.querySelectorAll("#activeList form[data-layer-id]").forEach(form => {
    initLayerCard(form.dataset.layerId);
});
