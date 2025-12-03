import * as THREE from "three";

export function buildGlobe() {
  const group = new THREE.Group();
  const textureLoader = new THREE.TextureLoader();

  const earthGeometry = new THREE.SphereGeometry(1.5, 64, 64);

  const earthMaterial = new THREE.MeshPhongMaterial({
    map: textureLoader.load("assets/textures/earth_daymap.png"),
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
    map: textureLoader.load("assets/textures/stars.png"),
    side: THREE.BackSide,
  });
  const stars = new THREE.Mesh(starGeo, starMat);
  group.add(stars);

  const atmosphereGlowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x85c6ff) },
      viewVector: { value: new THREE.Vector3(0, 0, 5) },
    },
    vertexShader: `
    uniform vec3 viewVector;
    varying float intensity;

    void main() {
        // Calculate intensity based on angle between normal and camera
        vec3 vNormal = normalize(normalMatrix * normal);
        vec3 vView = normalize(normalMatrix * viewVector);

        intensity = pow(0.6 - dot(vNormal, vView), 2.0);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform vec3 glowColor;
    varying float intensity;

    void main() {
        gl_FragColor = vec4(glowColor, 1.0) * intensity;
    }
  `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });

  const atmosphereGlow = new THREE.Mesh(
    new THREE.SphereGeometry(1.75, 64, 64),
    atmosphereGlowMaterial
  );
  group.add(atmosphereGlow);

  return group;
}
