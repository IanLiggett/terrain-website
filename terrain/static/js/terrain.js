import * as THREE from 'three';
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import Alea from 'https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm';
import { MinPriorityQueue, MaxPriorityQueue, PriorityQueue } from "https://esm.sh/@datastructures-js/priority-queue@6.3.5";
import Denque from 'https://esm.sh/denque';

import { add_object_to_scene } from './scene.js';

// magic settings that make raycasting cheap
THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;


// raycaster used to find the terrain height
const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const hits = [];

raycaster.firstHitOnly = true;
raycaster.layers.set(1);
raycaster.near = 0;
raycaster.far = 200;


// terrain state and settings
let terrain_mesh = null;
const terrain_material = new THREE.MeshStandardMaterial({ vertexColors: true });

const terrain_width_real = 40;
const terrain_height_real = 40;

const terrain_width = 500;
const terrain_height = 500;

const previewWidth = 100;
const previewHeight = 50;

// arrays for iterating over neighbors cleanly
// terrain got 8 grid priviledges revoked for not playing nicely with erosion algorithm
const neighbor_offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
]

// water gets to be an 8 grid so it can flow diagonally, it looks better
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

function add_water_to_terrain(geometry, colors, has_rivers) {
    const position = geometry.getAttribute("position");
    const positions_array = position.array;
    const plane_width = geometry.parameters.widthSegments + 1;
    const plane_height = geometry.parameters.heightSegments + 1;

    const visited = new Array(plane_width * plane_height).fill(false);

    // default water accumulation, hardcoded right now.
    const rain_level = 3;

    // river data
    const indegree = (has_rivers)? new Uint8Array(plane_width * plane_height) : null;
    const receivers = (has_rivers)? new Uint32Array(plane_width * plane_height).fill(null) : null;
    const water = (has_rivers)? new Array(plane_width * plane_height).fill(false) : null;
    const accumulation = (has_rivers)? new Uint32Array(plane_width * plane_height).fill(rain_level) : null;

    // water coloring data
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

    // iterate over entire graph, starting at the edge nodes
    // this forms a tree of water flow for each outlet off the edge of the map
    while (true) {
        const ci = p_queue.dequeue();
        if (ci == null) break;

        // get current height and coords
        const {x, y} = get_xy_from_i(ci, plane_width);
        const z = positions_array[ci * 3 + 2];

        // iterate over neighbors using an 8 grid
        for (const [dx, dy] of water_neighbor_offsets) {
            // make sure neighbor is in bounds
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= plane_width || ny < 0 || ny >= plane_height) {
                continue;
            }

            // get neighbors height
            const ni = get_i_from_xy(nx, ny, plane_width);
            const niz = ni * 3 + 2;
            if (visited[ni]) {
                continue;
            }

            // if neighbor is lower than current node, raise neighbor to be the same height + a small modifier to very slowly raise water level further from the outlet, and apply water color
            const nz = positions_array[niz];
            if (nz < z) {
                // simple heuristic for determing how filled basins contribute to water accumulation
                if (has_rivers) {
                    accumulation[ni] += 4;
                    water[ni] = true;
                }

                positions_array[niz] = z + dz;

                water_mask[ni] = lerp(min_alpha, max_alpha, Math.max((z - nz) / 2, 0));
            }

            // queue neighbor
            p_queue.enqueue(ni);
            visited[ni] = true;

            // track the additional neighbor current node has and form connection between the two
            if (has_rivers) {
                indegree[ci] += 1;
                receivers[ni] = ci;
            }
        }
        
        // add leaf nodes to the queue for river calculations
        if (has_rivers && indegree[ci] == 0) queue.push(ci);
    }

    // river logic
    if (has_rivers) {
        // iterate over all the trees produced by the priority flood, starting at the leaf nodes
        while (true) {
            const ci = queue.shift();
            if (ci == null) break;

            // each node popped off the queue has a finalized accumulation, so check if its built up enough to form a visible river
            const acc = accumulation[ci];
            if (acc >= min_river && !water[ci]) {
                // calculate river strength and width using ranges and non linear scaling to restrain width for large rivers
                const river_strength = Math.max(Math.min((acc - min_river) / river_range, 1), 0);
                // const width = Math.max(1, Math.round(lerp(1, 10, Math.pow(river_strength, width_beta))));
                const width = Math.floor(lerp(0, 10, Math.pow(river_strength, width_beta)));

                // calculate the water brightness at the center of the river
                const center_alpha = lerp(min_alpha, max_alpha, river_strength);
                if (center_alpha > water_mask[ci]) {
                    water_mask[ci] = center_alpha;
                }

                // paint the surrounding nodes water_mask values based on the current nodes river strength and width
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

            // check if node has a parent
            const receiver = receivers[ci];
            if (receiver == null) continue;

            // add its accumulation to its parent
            accumulation[receiver] += acc;

            // push the parent to the queue if it has no more unprocessed children
            indegree[receiver] -= 1;
            if (indegree[receiver] != 0) continue; 

            queue.push(receiver);
        }
    }

    // apply the water_mask to the colors array
    for (let i = 0; i < water_mask.length; i++) {
        const alpha = water_mask[i];
        if (alpha <= 0) continue;

        colors[i * 3] = 0;
        colors[i * 3 + 1] = (38 / 255) * alpha;
        colors[i * 3 + 2] = Math.max(colors[i * 3 + 2], alpha);
    }
}

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
export function generate_terrain(layers, seed=13, has_erosion=true, has_water=true, has_rivers=true) {
    // initialize seeded random number generator and noise function
    const prng = Alea(seed);
    const noise2d = createNoise2D(prng);

    // create geometry and populate it with height map
    const geometry = new THREE.PlaneGeometry(terrain_width_real, terrain_height_real, terrain_width, terrain_height);
    calculate_terrain_noise(layers, geometry, noise2d);

    // erosion!
    if (has_erosion) erode_terrain(geometry, prng);

    // calculate normals and use that to determine color
    geometry.computeVertexNormals();
    const colors = calculate_terrain_colors(geometry);

    // water!
    if (has_water) {
        add_water_to_terrain(geometry, colors, has_rivers);
        // recalculate normals to fix water surface
        geometry.computeVertexNormals();
    }

    // apply color
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // supposedly makes raycasting faster
    geometry.computeBoundsTree();

    // create height map from calculated data and add it to scene
    if (!terrain_mesh) {
        terrain_mesh = new THREE.Mesh(geometry, terrain_material);
        terrain_mesh.layers.enable(1);
        terrain_mesh.rotation.x = -Math.PI / 2;
        terrain_mesh.updateMatrix();
        terrain_mesh.matrixAutoUpdate = false;
        add_object_to_scene(terrain_mesh);
    } else {
        terrain_mesh.geometry.dispose();
        terrain_mesh.geometry = geometry;
    }
}

export function render_preview(canvas, params) {
    const { frequency, amplitude, octaves, lacunarity, persistence } = params;
    const max = calculate_extreme_noise(amplitude, octaves, persistence, 1);
    const min = calculate_extreme_noise(amplitude, octaves, persistence, -1);

    // seed is hardcoded here, if we wanted to be extremely precise we could track active seed and use that here,
    // but preview has other imprecisions that would make this pointless at the moment
    const prng = Alea(0);
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

export function get_height_at_xz(x, z) {
    const origin = new THREE.Vector3(x, 100, z);

    raycaster.set(origin, down);
    hits.length = 0;
    raycaster.intersectObject(terrain_mesh, false, hits);

    return (hits.length > 0)? hits[0].point.y : 0;
}

export function is_terrain_loaded() {
    return terrain_mesh != null;
}

function save_GLB_data(data) {
    const blob = new Blob([data], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "test.glb";
    link.click();
}

export function export_scene_as_glb(scene) {
    const options = { binary: true };
    const exporter = new GLTFExporter();
    exporter.parse(scene, save_GLB_data, null, options);
}
