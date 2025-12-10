import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildGlobe } from "./globe.js";
import { loadCSV } from "./utils/loadCSV.js";
import { createLaunchMarkers } from "./launchMarkers.js";

let scene, camera, renderer, globe;
let raycaster, mouse;
let launchMarkersGroup;
let launchData = [];

const PICK_PIXEL_RADIUS = 8;

export default async function main() {
  initThree();
  initLights();
  initRaycaster();

  launchData = await loadCSV("/data/space_missions_geocoded.csv");

  const outcomeTrends = aggregateOutcomeTrends(launchData);
  drawSuccessFailureChart(outcomeTrends);

  launchMarkersGroup = new THREE.Group();
  scene.add(launchMarkersGroup);

  const slider = document.getElementById("yearSlider");
  const label = document.getElementById("yearLabel");

  function onYearClick(year) {
    year = Number(year);
    if (Number.isNaN(year)) return;

    if (slider) slider.value = year;
    if (label) label.textContent = `Year: ${year}`;

    updateMarkers(year);

    const byCountry = aggregateLaunchesByCountry(launchData, year);
    drawCountryChart(byCountry);
  }

  const initialYear = (slider && parseInt(slider.value, 10)) || 2000;

  if (slider) {
    slider.addEventListener("input", (e) => {
      const y = parseInt(e.target.value, 10);
      onYearClick(y);
    });
  }

  onYearClick(initialYear);

  renderer.domElement.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);

  animate();
}

function initThree() {
  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer({ antialias: true });

  const container = document.getElementById("scene-container");
  container.appendChild(renderer.domElement);
  renderer.setSize(container.clientWidth, container.clientHeight);

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
}

function initLights() {
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 3, 5);
  scene.add(dirLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);
}

function initRaycaster() {
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  raycaster.params.Points.threshold = pixelRadiusToWorldDistance(
    PICK_PIXEL_RADIUS,
    new THREE.Vector3(0, 0, 0)
  );
}

function pixelRadiusToWorldDistance(
  px,
  worldPoint = new THREE.Vector3(0, 0, 0)
) {
  const proj = worldPoint.clone().project(camera);

  const ndcDx = (px / Math.max(1, renderer.domElement.clientWidth)) * 2;

  const p1 = new THREE.Vector3(proj.x, proj.y, proj.z);
  const p2 = new THREE.Vector3(proj.x + ndcDx, proj.y, proj.z);

  p1.unproject(camera);
  p2.unproject(camera);

  return p1.distanceTo(p2);
}

function updateMarkers(year) {
  if (!launchMarkersGroup) return;

  launchMarkersGroup.clear();

  const filtered = launchData.filter((d) => {
    const parsed = new Date(d.Date);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getFullYear() === year;
  });

  const points = createLaunchMarkers(filtered);
  launchMarkersGroup.add(points);
}

function onClick(event) {
  if (!launchMarkersGroup || !launchMarkersGroup.children.length) return;

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

  if (intersects.length === 0) return;

  const index = intersects[0].index;
  const launch = points.userData?.launches?.[index];
  if (launch) showLaunchInfo(launch);
}

function showLaunchInfo(launch) {
  const panel = document.getElementById("infoPanel");
  if (!panel) return;

  const mission = launch.Mission ?? "Unknown";
  const company = launch.Company ?? "—";
  const rocket = launch.Rocket ?? "—";
  const date = launch.Date ?? "—";
  const time = launch.Time ?? "";
  const location = launch.Location ?? "—";
  const status = launch.MissionStatus ?? "—";

  panel.innerHTML = `
    <h3 style="margin:0 0 6px 0;">${mission}</h3>
    <div><strong>Company:</strong> ${company}</div>
    <div><strong>Rocket:</strong> ${rocket}</div>
    <div><strong>Date / Time:</strong> ${date} ${time}</div>
    <div><strong>Location:</strong> ${location}</div>
    <div><strong>Mission status:</strong> ${status}</div>
  `;

  panel.style.display = "block";
}

function aggregateLaunchesByCountry(data, year, limit = 10) {
  const counts = {};

  data.forEach((d) => {
    const parsed = new Date(d.Date);
    if (Number.isNaN(parsed.getTime())) return;
    if (parsed.getFullYear() !== year) return;

    const location = d.Location || "";
    const parts = location.split(",");
    const country = parts[parts.length - 1]?.trim() || "Unknown";

    counts[country] = (counts[country] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function drawCountryChart(data) {
  const canvas = document.getElementById("countryChart");
  if (!canvas || !data.length) return;

  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  const padding = { top: 30, right: 20, bottom: 50, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => d.count));
  const barGroupWidth = chartW / data.length;
  const barWidth = barGroupWidth * 0.6;

  const xScale = (i) => padding.left + i * barGroupWidth + barGroupWidth / 2;

  const yScale = (v) => padding.top + chartH - (v / maxValue) * chartH;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(padding.left + chartW, padding.top + chartH);
  ctx.stroke();

  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const value = Math.round((maxValue / ticks) * i);
    const y = yScale(value);

    ctx.fillText(value, padding.left - 6, y);

    ctx.strokeStyle = "#222";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#4dacff";
  data.forEach((d, i) => {
    const x = xScale(i) - barWidth / 2;
    const y = yScale(d.count);
    const barH = padding.top + chartH - y;

    ctx.fillRect(x, y, barWidth, barH);
  });

  ctx.fillStyle = "#ffffff";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  data.forEach((d, i) => {
    ctx.fillText(d.country, xScale(i), padding.top + chartH + 6);
  });

  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Top launch countries", width / 2, 6);
}

function initChartCanvas() {
  const canvas = document.getElementById("launchChart");
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  chartCtx = canvas.getContext("2d");
  chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  chartWidth = rect.width;
  chartHeight = rect.height;
}

function drawLaunchChart(data, selectedYear, onYearClick) {
  if (!Array.isArray(data) || data.length === 0) return;

  const YEAR_MIN = yearlyData[0].year;
  const YEAR_MAX = yearlyData[yearlyData.length - 1].year;
  const MAX_COUNT = Math.max(...yearlyData.map((d) => d.count));

  const canvas = document.getElementById("launchChart");
  if (!canvas) return;

  const ctx = chartCtx;
  const cssWidth = chartWidth;
  const cssHeight = chartHeight;

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = 40;
  const width = cssWidth - padding * 2;
  const height = cssHeight - padding * 2;

  const maxCount = MAX_COUNT || 1;

  const xScale = (year) =>
    padding + ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * width;

  const yScale = (count) => padding + height - (count / maxCount) * height;

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = "#ffffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + height);
  ctx.lineTo(padding + width, padding + height);
  ctx.stroke();

  ctx.fillStyle = "#ffffffff";
  ctx.font = "12px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const value = Math.round((maxCount / yTicks) * i);
    const y = yScale(value);

    ctx.fillText(value, padding - 8, y);

    ctx.strokeStyle = "#222";
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#4dacff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xScale(d.year);
    const y = yScale(d.count);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  data.forEach((d) => {
    const x = xScale(d.year);
    const y = yScale(d.count);

    ctx.fillStyle = d.year === selectedYear ? "#ff9800" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  data.forEach((d) => {
    if (d.year % 10 === 0) {
      const x = xScale(d.year);
      ctx.fillStyle = "#ffffffff";
      ctx.fillText(d.year, x, padding + height + 6);
    }
  });

  ctx.save();
  ctx.translate(12, padding + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffffff";
  ctx.fillText("Launches per year", 0, -15);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillText("Year", padding + width / 2, cssHeight - 15);

  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    let closestYear = data[0].year;
    let minDist = Infinity;

    data.forEach((d) => {
      const dist = Math.abs(xScale(d.year) - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closestYear = d.year;
      }
    });

    onYearClick(closestYear);
  };
}

function aggregateOutcomeTrends(data) {
  const byYear = {};

  data.forEach((d) => {
    const year = new Date(d.Date).getFullYear();
    if (isNaN(year)) return;

    if (!byYear[year]) {
      byYear[year] = { year, success: 0, failure: 0, total: 0 };
    }

    const status = (d.MissionStatus || "").toLowerCase();

    if (status.includes("success")) {
      byYear[year].success += 1;
    } else {
      byYear[year].failure += 1;
    }

    byYear[year].total += 1;
  });

  return Object.values(byYear).sort((a, b) => a.year - b.year);
}

function drawSuccessFailureChart(data) {
  const canvas = document.getElementById("successFailureChart");
  if (!canvas || !data.length) return;

  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  const padding = 40;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const years = data.map((d) => d.year);
  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.success, d.failure, d.total))
  );

  const xScale = (year) =>
    padding +
    ((year - years[0]) / (years[years.length - 1] - years[0])) * chartW;

  const yScale = (val) => padding + chartH - (val / maxValue) * chartH;

  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + chartH);
  ctx.lineTo(padding + chartW, padding + chartH);
  ctx.stroke();

  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i++) {
    const v = Math.round((maxValue / 4) * i);
    const y = yScale(v);
    ctx.fillText(v, padding - 6, y);

    ctx.strokeStyle = "#222";
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + chartW, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#4caf50";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xScale(d.year);
    const y = yScale(d.success);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = "#f44336";
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xScale(d.year);
    const y = yScale(d.failure);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  years.forEach((y) => {
    if (y % 10 === 0) {
      ctx.fillText(y, xScale(y), padding + chartH + 6);
    }
  });

  ctx.strokeStyle = "#4dacff";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xScale(d.year);
    const y = yScale(d.total);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "12px sans-serif";
  ctx.fillText("Total launches for all years", width / 2, 0);

  ctx.textAlign = "left";

  ctx.fillStyle = "#4caf50";
  ctx.fillRect(width - 100, 0, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Success", width - 80, 0);

  ctx.fillStyle = "#f44336";
  ctx.fillRect(width - 100, 20, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Failure", width - 80, 20);

  ctx.strokeStyle = "#4dacff";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(width - 100, 45);
  ctx.lineTo(width - 90, 45);

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Total launches", width - 80, 40);
}

function animate() {
  globe?.children.forEach((obj) => {
    if (obj.material && obj.material.uniforms?.viewVector) {
      obj.material.uniforms.viewVector.value = camera.position
        .clone()
        .sub(obj.getWorldPosition(new THREE.Vector3()));
    }
  });

  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function onResize() {
  const container = document.getElementById("scene-container");
  if (!container) return;

  const w = container.clientWidth;
  const h = container.clientHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

main().catch((err) => {
  console.error("Failed to initialize app:", err);
});
