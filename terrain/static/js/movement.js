import * as THREE from 'three';
import { get_height_at_xz, is_terrain_loaded } from "./terrain.js";
import { set_camera_parent, bind_to_animation_loop, bind_event_to_render_window, add_object_to_scene, blur_render_window } from "./scene.js";

const camera_offset = new THREE.Vector3(0, 0.2, -0.35);

const cube_start = new THREE.Vector3(0, 8, -15);
const cube_position = new THREE.Vector3();
const height_offset = 0.1;

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

function snap_cube_to_floor(camera_cube, height) {
    camera_cube.getWorldPosition(cube_position);

    const min_height = get_height_at_xz(cube_position.x, cube_position.z) + height_offset;

    height = Math.max(min_height, height);
    camera_cube.position.y = height;

    return height;
}

function new_camera_cube() {
    const cube_geometry = new THREE.BoxGeometry(0.00, 0.00, 0.00);
    const cube_material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const camera_cube = new THREE.Mesh(cube_geometry, cube_material);
    camera_cube.position.copy(cube_start);
    camera_cube.visible = true;
    set_camera_parent(camera_cube, camera_offset);
    add_object_to_scene(camera_cube);

    return camera_cube;
}

// user controls to allow user to traverse scene
window.load_user_controls = function load_user_controls() {
    const camera_cube = new_camera_cube();

    const max_dt = 1/30;

    const max_speed = 5;
    const acceleration = 20;
    const slowdown = 12;

    const rotate_speed = 0.01;

    let keys = {};

    let height = cube_start.y;

    let x_momentum = 0;
    let y_momentum = 0;
    let z_momentum = 0;
    let x_velocity = 0;
    let y_velocity = 0;
    let z_velocity = 0;

    let rotate_momentum = 0;
    let rotate_velocity = 0;

    let last_time = 0;

    function reset_momentums() {
        x_momentum = 0;
        y_momentum = 0;
        z_momentum = 0;
        rotate_momentum = 0;
    }
    function reset_input_state() {
        keys = {};
        reset_momentums();
        blur_render_window();
    }

    function update_momentums(event, direction) {        
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

    bind_event_to_render_window("keydown", (event) => {
        if (event.repeat || !is_terrain_loaded || keys[event.key]) return;
        keys[event.key] = true;
        
        update_momentums(event, 1);
    })
    bind_event_to_render_window("keyup", (event) => {
        if (!keys[event.key]) return;
        keys[event.key] = false;
        
        update_momentums(event, -1);
    });

    bind_event_to_render_window("focus", reset_momentums);
    bind_event_to_render_window("focusout", reset_input_state);
    bind_event_to_render_window("contextmenu", reset_input_state);
    bind_event_to_render_window("pointercancel", reset_input_state);
    window.addEventListener("blur", reset_input_state);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) reset_input_state();
    });

    bind_to_animation_loop((time) => {
        if (!is_terrain_loaded()) return;

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

        // if (x_velocity !== 0 || z_velocity !== 0) {
        height = snap_cube_to_floor(camera_cube, height + z_velocity * dt);
        // }
    })
};
