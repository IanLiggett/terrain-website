import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/+esm';
import Alea from 'https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm';

console.log("Running!!");

function renderTerrain() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const seed = 0;
    const seededPRNG = Alea(seed);
    const noise2d = createNoise2D(seededPRNG);

    const geometry = new THREE.PlaneGeometry(10, 10, 64, 64);
    const position = geometry.getAttribute('position');

    for (let i = 0; i < position.count; i++) {
        let x = position.getX(i);
        let y = position.getY(i);

        let z = noise2d(x, y);

        position.setXYZ(i, x, y, z);
    }
    
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00, 
        wireframe: true
    });

    const heightMap = new THREE.Mesh(geometry, material);

    scene.add(heightMap);

    renderer.render(scene, camera);
}
renderTerrain();
