import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import Alea from 'https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm';

const neighborOffsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
]

const depositOffsets = [
    [0, 0, 0.2],
    [-1, 0, 0.2],
    [1, 0, 0.2],
    [0, -1, 0.2],
    [0, 1, 0.2]
];

function getIFromXY(x, y, planeWidth) {
    return y * (planeWidth) + x;
}

function getXYFromI(i, planeWidth) {
    return {
        x: i % planeWidth,
        y: Math.floor(i / planeWidth)
    }
}

function rngInRange(prng, min, max) {
    return Math.floor(prng() * (max - min + 1)) + min;
}

function getLowestNeighbor(x, y, z, position, planeWidth, planeHeight, prng) {
    let lowestNeighbor;
    let lowestDHeight = 100000000;

    for (const [dx, dy] of neighborOffsets) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || nx >= planeWidth || ny < 0 || ny >= planeHeight) {
            continue;
        }

        const nI = getIFromXY(nx, ny, planeWidth)
        
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

function calculateNoise(noise2d, x, y, frequency, amplitude, octaves, lacunarity, persistance) {
    let noise = 0;
    for (let octave = 0; octave < octaves; octave++) {
        const octFrequency = frequency * lacunarity ** octave;
        noise += noise2d(x * octFrequency, y * octFrequency) * (amplitude * persistance ** octave);
    }
    return noise;
}

function calculateTerrainColors(geometry) {
    const position = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");

    const colors = new Float32Array(position.count * 3);

    const slopeThreshold = 0.3
    for (let i = 0; i < position.count; i++) {
        const slope = 1 - normals.getZ(i);

        if (slope > slopeThreshold) {
            colors[i * 3] = 85 / 255;
            colors[i * 3 + 1] = 53 / 255;
            colors[i * 3 + 2] = 30 / 255;
        } else {
            colors[i * 3] = 20 / 255;
            colors[i * 3 + 1] = 172 / 255;
            colors[i * 3 + 2] = 42 / 255;
        }
    }

    return colors;
}

function erodeTerrain(geometry, prng) {
    const position = geometry.getAttribute("position");
    const positionsArray = position.array;
    const planeWidth = geometry.parameters.widthSegments + 1;
    const planeHeight = geometry.parameters.heightSegments + 1;

    const sizeRetention = 0.95;
    const depositSpeed = 0.05;
    const erodeSpeed = 0.08;
    const erosionRadius = 3;
    const minCapacity = 0.1;
    const baseCapacity = 2;
    const droplets = 60000;
    for (let droplet = 0; droplet < droplets; droplet++) {
        let size = 5;
        let speed = 5;
        let x = rngInRange(prng, 0, planeWidth);
        let y = rngInRange(prng, 0, planeHeight);
        let i = getIFromXY(x, y, planeWidth);
        let sediment = 0;

        // console.log({ x, y, i, isIntegerX: Number.isInteger(x), isIntegerY: Number.isInteger(y), isIntegerI: Number.isInteger(i) });

        for (let time = 0; time < 30; time++) {
            const z = position.getZ(i);
            const {neighbor, deltaHeight} = getLowestNeighbor(x, y, z, position, planeWidth, planeHeight, prng);

            i = neighbor;
            if (!Number.isInteger(i)) {
                console.log("Bad currentIndex:", i);
                break;
            }
            ({x, y} = getXYFromI(i, planeWidth));

            const capacity = Math.max(-deltaHeight * size * speed * baseCapacity, minCapacity);
            if (sediment > capacity || deltaHeight > 0) {
                let deposition;
                if (deltaHeight > 0) {
                    deposition = Math.min(deltaHeight, sediment);
                } else {
                    deposition = (sediment - capacity) * depositSpeed;
                }
                sediment -= deposition;

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
            } else {
                const erosion = Math.min((capacity - sediment) * erodeSpeed, -deltaHeight);
                const erosionPerCell = erosion / (erosionRadius * 2 + 1) ** 2;
                sediment += erosion;
                
                for (let dx = -erosionRadius; dx < erosionRadius + 1; dx++) {
                    for (let dy = -erosionRadius; dy < erosionRadius + 1; dy++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || nx >= planeWidth || ny < 0 || ny >= planeHeight) {
                            continue;
                        }

                        if (!Number.isInteger(getIFromXY(nx, ny, planeWidth))) {
                            console.log("Bad currentIndex:", i);
                            break;
                        }

                        let div = Math.sqrt(Math.abs(dx)^2 + Math.abs(dy)^2) / 1.4;
                        if (div == 0) {
                            div = 1;
                        }
                        positionsArray[getIFromXY(nx, ny, planeWidth) * 3 + 2] -= erosionPerCell / div;
                    }
                }
            }

            speed = speed = Math.max(speed + (-deltaHeight), 0);
            size *= sizeRetention;

            if (speed < 0.01) {
                break;
            }
        }
    }

    position.needsUpdate = true;
}

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

function renderTerrain() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = -5;
    camera.position.z = 3;

    camera.lookAt(new THREE.Vector3(0, -2, 0));

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
    document.body.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(5, 10, 10);
    scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const seed = 0;
    const prng = Alea(seed);
    const noise2d = createNoise2D(prng);

    const geometry = new THREE.PlaneGeometry(10, 10, 200, 200);
    calculateTerrainNoise(geometry, noise2d);
    erodeTerrain(geometry, prng);

    geometry.computeVertexNormals();
    
    // const material = new THREE.MeshStandardMaterial({ 
    //     color: 0x00ff00,
    // });

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
