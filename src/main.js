import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildGlobe } from "./globe.js";
import { loadCSV } from "./utils/loadCSV.js";
import { createLaunchMarkers } from "./launchMarkers.js";

let scene, camera, renderer, globe;
let raycaster, mouse;
let launchMarkersGroup;

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

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  const PICK_PIXEL_RADIUS = 8;

  function pixelRadiusToWorldDistance(
    px,
    worldPoint = new THREE.Vector3(0, 0, 0)
  ) {
    const proj = worldPoint.clone().project(camera);

    const ndcDx = (px / renderer.domElement.clientWidth) * 2;
    const ndcDy = (px / renderer.domElement.clientHeight) * 2;

    const p1 = new THREE.Vector3(proj.x, proj.y, proj.z);
    const p2 = new THREE.Vector3(proj.x + ndcDx, proj.y, proj.z);

    p1.unproject(camera);
    p2.unproject(camera);

    return p1.distanceTo(p2);
  }

  raycaster.params.Points.threshold = pixelRadiusToWorldDistance(
    PICK_PIXEL_RADIUS,
    new THREE.Vector3(0, 0, 0)
  );

  let launchData = [];

  launchData = await loadCSV("/data/space_missions_geocoded.csv");

  launchMarkersGroup = new THREE.Group();
  scene.add(launchMarkersGroup);

  renderer.domElement.addEventListener("click", onClick);

  function onClick(event) {
    if (!launchMarkersGroup.children.length) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    camera.updateMatrixWorld();
    const points = launchMarkersGroup.children[0];
    if (!points) return;
    points.updateMatrixWorld();

    raycaster.params.Points.threshold = pixelRadiusToWorldDistance(
      PICK_PIXEL_RADIUS,
      new THREE.Vector3(0, 0, 0)
    );

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(points);

    if (intersects.length === 0) {
      return;
    }

    const index = intersects[0].index;
    const launch = points.userData.launches[index];
    showLaunchInfo(launch);
  }

  function showLaunchInfo(launch) {
    const panel = document.getElementById("infoPanel");

    panel.innerHTML = `
    <h3>${launch.Mission}</h3>
    <p><b>Company:</b> ${launch.Company}</p>
    <p><b>Rocket:</b> ${launch.Rocket}</p>
    <p><b>Date:</b> ${launch.Date} ${launch.Time || ""}</p>
    <p><b>Location:</b> ${launch.Location}</p>
    <p><b>Status:</b> ${launch.MissionStatus}</p>
  `;

    panel.style.display = "block";
  }

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
