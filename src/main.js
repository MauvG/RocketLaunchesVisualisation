import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildGlobe } from "./globe.js";
import { loadCSV } from "./utils/loadCSV.js";
import { createLaunchMarkers } from "./launchMarkers.js";

let scene, camera, renderer, globe;

async function init() {
  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  globe = buildGlobe();
  scene.add(globe);

  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 3, 5);
  scene.add(dirLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  let launchData = [];
  let launchMarkersGroup;

  launchData = await loadCSV("/data/space_missions_geocoded.csv");

  launchMarkersGroup = new THREE.Group();
  scene.add(launchMarkersGroup);

  function updateMarkers(year) {
    launchMarkersGroup.clear();

    const filtered = launchData.filter((d) => {
      const launchYear = new Date(d.Date).getFullYear();
      return launchYear === year;
    });

    const markers = createLaunchMarkers(filtered);
    launchMarkersGroup.add(markers);
  }

  updateMarkers(1957);

  const slider = document.getElementById("yearSlider");
  const label = document.getElementById("yearLabel");

  slider.addEventListener("input", (e) => {
    const year = parseInt(e.target.value);
    label.textContent = `Year: ${year}`;
    updateMarkers(year);
  });

  animate();
}

function animate() {
  globe.children.forEach((obj) => {
    if (obj.material && obj.material.uniforms?.viewVector) {
      obj.material.uniforms.viewVector.value = camera.position
        .clone()
        .sub(obj.getWorldPosition(new THREE.Vector3()));
    }
  });

  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

init();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});
