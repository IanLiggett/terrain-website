import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import Alea from 'https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm';

// array for iterating over neighbors cleanly
const neighborOffsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
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
    return y * (planeWidth) + x;
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
    let lowestNeighbor;
    let lowestDHeight = 100000000;

    // iterate over neighbors
    for (const [dx, dy] of neighborOffsets) {
        const nx = x + dx;
        const ny = y + dy;

        // guard against out of bounds
        if (nx < 0 || nx >= planeWidth || ny < 0 || ny >= planeHeight) {
            continue;
        }

        const nI = getIFromXY(nx, ny, planeWidth)
        
        // checks if neighbor is the lowest
        const deltaHeight = position.getZ(nI) - z; //+ (prng() - 0.5) / 5;
        if (deltaHeight < lowestDHeight) {
            lowestNeighbor = nI;
            lowestDHeight = deltaHeight
        }
    }

    return {
        neighbor: lowestNeighbor,
        deltaHeight: lowestDHeight
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
            colors[i * 3] = 20 / 255;
            colors[i * 3 + 1] = 172 / 255;
            colors[i * 3 + 2] = 42 / 255;
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
    const sizeRetention = 0.95;
    const depositSpeed = 0.05;
    const erodeSpeed = 0.08;
    const erosionRadius = 3;
    const minCapacity = 0.1;
    const baseCapacity = 2;
    const droplets = 200000;
    // simulate some number of droplets
    for (let droplet = 0; droplet < droplets; droplet++) {
        // initialize starting values for droplet
        let size = 5;
        let speed = 5;
        let x = rngInRange(prng, 0, planeWidth);
        let y = rngInRange(prng, 0, planeHeight);
        let i = getIFromXY(x, y, planeWidth);
        let sediment = 0;

        // console.log({ x, y, i, isIntegerX: Number.isInteger(x), isIntegerY: Number.isInteger(y), isIntegerI: Number.isInteger(i) });

        // step the droplet down 30 times, or until it stops "moving"
        for (let time = 0; time < 30; time++) {
            // move to the lowest nearby neighbor
            const z = position.getZ(i);
            const {neighbor, deltaHeight} = getLowestNeighbor(x, y, z, position, planeWidth, planeHeight, prng);

            i = neighbor;
            // only known remaining bug, i isn't an integer very occasionally for some reason
            if (!Number.isInteger(i)) {
                console.log("Bad currentIndex:", i);
                break;
            }
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

                    if (!Number.isInteger(getIFromXY(nx, ny, planeWidth))) {
                        console.log("Bad currentIndex:", i);
                        break;
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
            speed = speed = Math.max(speed + (-deltaHeight), 0);
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
// currently hardcoded with a single layer's inputs
function calculateTerrainNoise(geometry, noise2d) {
    const position = geometry.getAttribute("position");

    for (let i = 0; i < position.count; i++) {
        let x = position.getX(i);
        let y = position.getY(i);
        let z = calculateNoise(noise2d, x, y, 0.1, 1, 4, 2, 0.5);

        position.setXYZ(i, x, y, z);
    }

    position.needsUpdate = true;
}

// main function which creates the scene and renders terrain it requests
// maybe not the place to create the scene object?
function renderTerrain() {
    // create scene and camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = -5;
    camera.position.z = 3;

    // orient camera towards center
    camera.lookAt(new THREE.Vector3(0, -2, 0));

    // create renderer and add it to the templated page
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
    document.body.appendChild(renderer.domElement);

    // create light, ambient for global visibility and a point light for shadows
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(5, 10, 10);
    scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    // hardcoded seed
    const seed = 6;
    // initialize seeded random number generator and noise function
    const prng = Alea(seed);
    const noise2d = createNoise2D(prng);

    // create geometry and populate it with height map
    const geometry = new THREE.PlaneGeometry(10, 10, 500, 500);
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
}
renderTerrain();
