import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const middle_column = document.getElementById("middleColumn");
const render_window_frame = document.getElementById("renderWindowFrame");

// create scene and camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, camera_perspective(), 0.1, 1000);

// create renderer and add it to the page
const renderer = new THREE.WebGLRenderer();
renderer.outputColorSpace = THREE.SRGBColorSpace;
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
// renderer.toneMappingExposure = 0.6;

const bound_animation_loop_functions = [];

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


// keep render window and camera scaled properly as screen size changes
function render_window_size() {
    return {"window_width": render_window_frame.clientWidth, "window_height": middle_column.clientHeight / 2};
}
function camera_perspective() {
    const {window_width, window_height} = render_window_size();
    return window_width / window_height;
}

function resize_render_window() {
    const {window_width, window_height} = render_window_size();

    renderer.setSize(window_width, window_height, false);
    camera.aspect = window_width / window_height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
}
resize_render_window();
const observer = new ResizeObserver(resize_render_window);
observer.observe(render_window_frame);

render_window_frame.addEventListener("click", () => {
    render_window.focus();
});

renderer.setAnimationLoop((time) => {
    for (const bound_function of bound_animation_loop_functions) {
        bound_function(time);
    }

    renderer.render(scene, camera);
});

export function set_camera_parent(parent, camera_offset) {
    parent.add(camera);
    camera.position.copy(camera_offset);
    camera.lookAt(0, 0, 0);
}

export function add_object_to_scene(object) {
    scene.add(object);
}

export function bind_event_to_render_window(event_name, func) {
    render_window.addEventListener(event_name, func);
}

export function bind_to_animation_loop(func) {
    bound_animation_loop_functions.push(func);
}
