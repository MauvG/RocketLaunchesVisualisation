import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildGlobe } from "./globe.js";
import { loadCSV } from "./utils/loadCSV.js";
import { createLaunchMarkers } from "./launchMarkers.js";

let scene, camera, renderer, globe;
let raycaster, mouse;
let launchMarkersGroup;
let launchData = [];
let yearlyData = [];
let chartCtx = null;
let chartWidth = 0;
let chartHeight = 0;

const PICK_PIXEL_RADIUS = 8;

export default async function main() {
  initThree();
  initLights();
  initRaycaster();

  launchData = await loadCSV("/data/space_missions_geocoded.csv");
  yearlyData = aggregateLaunchesByYear(launchData);

  launchMarkersGroup = new THREE.Group();
  scene.add(launchMarkersGroup);

  initChartCanvas();
  drawLaunchChart(yearlyData, 2000, onYearClick);

  const slider = document.getElementById("yearSlider");
  const label = document.getElementById("yearLabel");

  function onYearClick(year) {
    year = Number(year);
    if (Number.isNaN(year)) return;

    if (slider) slider.value = year;
    if (label) label.textContent = `Year: ${year}`;

    updateMarkers(year);
    drawLaunchChart(yearlyData, year, onYearClick);

    const outcomes = aggregateOutcomeByYear(launchData, year);
    drawOutcomeChart(outcomes, year);

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

function aggregateLaunchesByYear(data) {
  const counts = {};

  data.forEach((d) => {
    const year = new Date(d.Date).getFullYear();
    if (!isNaN(year)) {
      counts[year] = (counts[year] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .map(([year, count]) => ({ year: +year, count }))
    .sort((a, b) => a.year - b.year);
}

function setupChartCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext("2d");

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { ctx, cssWidth: rect.width, cssHeight: rect.height };
}

function aggregateOutcomeByYear(data, year) {
  const counts = {
    Success: 0,
    Failure: 0,
    Partial: 0,
    Other: 0,
  };

  data.forEach((d) => {
    const parsed = new Date(d.Date);
    if (Number.isNaN(parsed.getTime())) return;
    if (parsed.getFullYear() !== year) return;

    const status = (d.MissionStatus || "").toLowerCase();

    if (status.includes("success")) counts.Success++;
    else if (status.includes("fail")) counts.Failure++;
    else if (status.includes("partial")) counts.Partial++;
    else counts.Other++;
  });

  return counts;
}

function drawOutcomeChart(outcomes, year) {
  const canvas = document.getElementById("outcomeChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  const total = Object.values(outcomes).reduce((a, b) => a + b, 0);
  if (total === 0) return;

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const innerRadius = radius * 0.6;

  const colors = {
    Success: "#4caf50",
    Failure: "#f44336",
    Partial: "#ff9800",
    Other: "#9e9e9e",
  };

  let startAngle = -Math.PI / 2;

  Object.entries(outcomes).forEach(([key, value]) => {
    if (value === 0) return;

    const sliceAngle = (value / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.arc(
      centerX,
      centerY,
      innerRadius,
      startAngle + sliceAngle,
      startAngle,
      true
    );
    ctx.closePath();

    ctx.fillStyle = colors[key];
    ctx.fill();

    startAngle += sliceAngle;
  });

  ctx.fillStyle = "#ffffff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Outcomes", centerX, centerY - 24);
  ctx.fillText("Launches: " + total, centerX, centerY);
  ctx.fillText("Year: " + year, centerX, centerY + 24);
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
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  if (!data.length) return;

  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const maxValue = Math.max(...data.map((d) => d.count));
  const barWidth = chartWidth / data.length;

  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + chartHeight);
  ctx.lineTo(padding + chartWidth, padding + chartHeight);
  ctx.stroke();

  data.forEach((d, i) => {
    const x = padding + i * barWidth + barWidth * 0.1;
    const barH = (d.count / maxValue) * chartHeight;
    const y = padding + chartHeight - barH;

    ctx.fillStyle = "#4dacff";
    ctx.fillRect(x, y, barWidth * 0.8, barH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.count, x + barWidth * 0.4, y - 6);

    ctx.save();
    ctx.translate(x + barWidth * 0.4, padding + chartHeight + 6);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "right";
    ctx.fillText(d.country, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = "#ffffff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Top launch countries", width / 2, 16);
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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  initChartCanvas();
  const slider = document.getElementById("yearSlider");
  const year = slider ? parseInt(slider.value, 10) : yearlyData[0].year;
  drawLaunchChart(yearlyData, year, onYearClick);
}

main().catch((err) => {
  console.error("Failed to initialize app:", err);
});
