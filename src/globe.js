import * as THREE from "three";

export function buildGlobe() {
    const group = new THREE.Group();
    const textureLoader = new THREE.TextureLoader();

    const earthGeometry = new THREE.SphereGeometry(1.5, 64, 64);

    const earthMaterial = new THREE.MeshPhongMaterial({
        map: textureLoader.load("assets/textures/earth_daymap.jpg"),
        bumpMap: textureLoader.load("assets/textures/earth_normal_map.tif"),
        bumpScale: 0.05,
        specularMap: textureLoader.load("assets/textures/earth_specular_map.tif"),
        specular: new THREE.Color(0x333333),
        shininess: 10,
    });

    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    group.add(earth);

    const starGeo = new THREE.SphereGeometry(10, 64, 64);
    const starMat = new THREE.MeshBasicMaterial({
        map: textureLoader.load("assets/textures/stars_milky_way.jpg"),
        side: THREE.BackSide
    });
    const stars = new THREE.Mesh(starGeo, starMat);
    group.add(stars);

    const atmosphereGeometry = new THREE.SphereGeometry(1.6, 64, 64);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x4dacff,
        transparent: true,
        opacity: 0.1,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    group.add(atmosphere);

    return group;
}
