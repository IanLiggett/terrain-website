# setting presets

LAYER_PRESETS = {
    "basic": {
        "name": "Basic",
        "frequency": 0.1,
        "amplitude": 1.0,
        "octaves": 1,
        "lacunarity": 2.0,
        "persistence": 0.5,
        "warping": 0,
        "ridge_strength": 0
    },
    "fractal": {
        "name": "Octaves",
        "frequency": 0.1,
        "amplitude": 1.0,
        "octaves": 5,
        "lacunarity": 2.0,
        "persistence": 0.5,
        "warping": 0,
        "ridge_strength": 0
    },
    "warping": {
        "name": "Warping",
        "frequency": 0.1,
        "amplitude": 1.0,
        "octaves": 1,
        "lacunarity": 2.0,
        "persistence": 0.5,
        "warping": 3,
        "ridge_strength": 0
    },
    "ridges": {
        "name": "Ridges",
        "frequency": 0.1,
        "amplitude": 1.0,
        "octaves": 1,
        "lacunarity": 2.0,
        "persistence": 0.5,
        "warping": 0,
        "ridge_strength": 1
    },
    "combined": {
        "name": "Combined Effects",
        "frequency": 0.017,
        "amplitude": 6.0,
        "octaves": 7,
        "lacunarity": 2.0,
        "persistence": 0.45,
        "warping": 2,
        "ridge_strength": 1
    }
}
