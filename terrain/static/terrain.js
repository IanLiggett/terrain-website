import * as THREE from 'three';
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import Alea from 'https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm';

const width = 500;
const height = 500;

const previewWidth = 400;
const previewHeight = 400;

// create scene and camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = -15;
camera.position.z = 10;

// orient camera towards center
camera.lookAt(new THREE.Vector3(0, -2.2, 0));

// create renderer and add it to the templated page
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
renderer.domElement.id = "renderWindow";
renderer.domElement.classList.add("col-sm-6");
document.getElementById("leftColumn").after(renderer.domElement);

// create light, ambient for global visibility and a point light for shadows
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 10);
scene.add(light);

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

// create the canvas for the input layer preview and cache the imageData
const previewCanvas = document.getElementById("renderPreview");
const ctx = previewCanvas.getContext('2d');
const imageData = ctx.createImageData(previewWidth, previewHeight);
const previewData = imageData.data;

// array for iterating over neighbors cleanly
const neighborOffsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    // [1, 1],
    // [1, -1],
    // [-1, 1],
    // [-1, -1]
]

// weights for when a drop deposits its sediment
// not sure if weighting some more heavily than others is useful at all
const depositOffsets = [
    [0, 0, 0.2],
    [-1, 0, 0.2],
    [1, 0, 0.2],
    [0, -1, 0.2],
    [0, 1, 0.2]
];

// converts (X, Y) to I
function getIFromXY(x, y, planeWidth) {
    return y * planeWidth + x;
}

// converts I to (X, Y)
function getXYFromI(i, planeWidth) {
    return {
        x: i % planeWidth,
        y: Math.floor(i / planeWidth)
    }
}

// gets a random number in range. If min is an integer, it will be too.
function rngInRange(prng, min, max) {
    return Math.floor(prng() * (max - min + 1)) + min;
}

// finds the lowest neighbor and the delta height for a given node
function getLowestNeighbor(x, y, z, position, planeWidth, planeHeight, prng) {
    let lowestNeighbor = null;
    let lowestDeltaHeight = 100000000;

    // iterate over neighbors
    for (const [dx, dy] of neighborOffsets) {
        const nx = x + dx;
        const ny = y + dy;

        // guard against out of bounds
        if (nx < 0 || nx >= planeWidth || ny < 0 || ny >= planeHeight) {
            continue;
        }

        const nI = getIFromXY(nx, ny, planeWidth);
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
function calculateNoise(noise2d, x, y, frequency, amplitude, octaves, lacunarity, persistance) {
    let noise = 0;
    for (let octave = 0; octave < octaves; octave++) {
        const octFrequency = frequency * lacunarity ** octave;
        noise += noise2d(x * octFrequency, y * octFrequency) * (amplitude * persistance ** octave);
    }
    return noise;
}

function calculateExtremeNoise(amplitude, octaves, persistance, extreme) {
    let extremeNoise = 0;
    for (let octave = 0; octave < octaves; octave++) {
        extremeNoise += extreme * (amplitude * persistance ** octave);
    }
    return extremeNoise;
}

// iterates over height map and uses the normals as slope to pick colors per vertex
function calculateTerrainColors(geometry) {
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
function erodeTerrain(geometry, prng) {
    const position = geometry.getAttribute("position");
    const positionsArray = position.array;
    const planeWidth = geometry.parameters.widthSegments + 1;
    const planeHeight = geometry.parameters.heightSegments + 1;

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
        let x = rngInRange(prng, 0, planeWidth - 1);
        let y = rngInRange(prng, 0, planeHeight - 1);
        let i = getIFromXY(x, y, planeWidth);
        let sediment = 0;

        // step the droplet down 30 times, or until it stops "moving"
        for (let time = 0; time < 50; time++) {
            // move to the lowest nearby neighbor
            const z = position.getZ(i);
            const {neighbor, deltaHeight} = getLowestNeighbor(x, y, z, position, planeWidth, planeHeight, prng);

            i = neighbor;
            ({x, y} = getXYFromI(i, planeWidth));

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
                for (const [dx, dy, weight] of depositOffsets) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= planeWidth || ny < 0 || ny >= planeHeight) {
                        continue;
                    }

                    positionsArray[getIFromXY(nx, ny, planeWidth) * 3 + 2] += deposition * weight;
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
                        if (nx < 0 || nx >= planeWidth || ny < 0 || ny >= planeHeight) {
                            continue;
                        }

                        // scale by distance from center of erosion, guarding against 0 case
                        let div = Math.sqrt(Math.abs(dx)^2 + Math.abs(dy)^2) / 1.4;
                        if (div == 0) {
                            div = 1;
                        }
                        // update Z position of the vertex directly
                        positionsArray[getIFromXY(nx, ny, planeWidth) * 3 + 2] -= erosionPerCell / div;
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

// calculate the generic height map based on layers
// currently hardcoded with a couple layer's inputs
function calculateTerrainNoise(geometry, noise2d) {
    const position = geometry.getAttribute("position");

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = calculateNoise(noise2d, x, y, 0.1, 1, 4, 2, 0.5) + calculateNoise(noise2d, x, y, 0.03, 2, 3, 2, 0.5);

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
    const geometry = new THREE.PlaneGeometry(40, 40, width, height);
    calculateTerrainNoise(geometry, noise2d);
    erodeTerrain(geometry, prng);

    // calculate normals and use that to determine color
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ 
        vertexColors: true
    });
    const colors = calculateTerrainColors(geometry);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
async function renderPreview(layerId) {
    let frequency = 0.05;
    let amplitude = 1;
    let octaves = 4;
    let lacunarity = 2;
    let persistance = 0.8;
    const max = calculateExtremeNoise(amplitude, octaves, persistance, 1);
    const min = calculateExtremeNoise(amplitude, octaves, persistance, -1);

    // the outer for loop and sleep are just a lazy stress test of the layer preview
    // its not cheap to update it every frame, but it can do it
    // for (let t = 0; t < 100; t++) {
    const seed = 6;
    const prng = Alea(seed);
    const noise2d = createNoise2D(prng);

    for (let x = 0; x < previewWidth; x++) {
        for (let y = 0; y < previewHeight; y++) {
            const i = getIFromXY(x, y, previewWidth) * 4;
            const z = calculateNoise(noise2d, x, y, frequency, amplitude, octaves, lacunarity, persistance);
            const colorNoise = Math.floor((z - max) / (min - max) * 255);

            previewData[i] = colorNoise;
            previewData[i + 1] = colorNoise;
            previewData[i + 2] = colorNoise;
            previewData[i + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    //     await sleep(16);
    //     frequency -= 0.0004;
    //     amplitude += 0.01;
    //     lacunarity -= 0.01;
    //     persistance -= 0.005;
    // }
}
renderPreview();

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
