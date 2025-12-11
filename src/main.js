import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildGlobe } from "./globe.js";
import { loadCSV } from "./utils/loadCSV.js";
import { createLaunchMarkers } from "./launchMarkers.js";

let scene, camera, renderer, globe;
let raycaster, mouse;
let launchMarkersGroup;
let launchData = [];
let isPlaying = false;
let playInterval = null;

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
  window.yearSlider = slider;

  const label = document.getElementById("yearLabel");

  const playButton = document.getElementById("playButton");
  window.playButton = playButton;

  function onYearClick(year) {
    year = Number(year);
    if (Number.isNaN(year)) return;

    if (slider) slider.value = year;
    if (label) label.textContent = `Year: ${year}`;

    updateMarkers(year);

    const byCountry = aggregateLaunchesByCountry(launchData, year);
    drawCountryChart(byCountry);

    const byCompany = aggregateLaunchesByCompany(launchData, year);
    drawCompanyChart(byCompany);

    drawMonthlyChart(year);
  }

  window.onYearClick = onYearClick;

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

  const { byCountry, byCompany } = aggregateAllTimeStats(launchData);

  const c = getTopMetrics(byCountry);
  const o = getTopMetrics(byCompany);

  document.getElementById(
    "topCountry"
  ).textContent = `${c.mostLaunches[0]} (${c.mostLaunches[1].total})`;

  document.getElementById(
    "topCompany"
  ).textContent = `${o.mostLaunches[0]} (${o.mostLaunches[1].total})`;

  document.getElementById(
    "topFailureCountry"
  ).textContent = `${c.mostFailures[0]} (${c.mostFailures[1].failure})`;

  document.getElementById(
    "topFailureCompany"
  ).textContent = `${o.mostFailures[0]} (${o.mostFailures[1].failure})`;

  document.getElementById("bestCountry").textContent = `${
    c.bestSuccessRate.name
  } (${(c.bestSuccessRate.rate * 100).toFixed(1)}%)`;

  document.getElementById("bestCompany").textContent = `${
    o.bestSuccessRate.name
  } (${(o.bestSuccessRate.rate * 100).toFixed(1)}%)`;

  playButton.addEventListener("click", () => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  });

  yearSlider.addEventListener("input", () => {
    if (isPlaying) stopPlayback();
  });
}

function initThree() {
  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const container = document.getElementById("scene-container");

  container.appendChild(renderer.domElement);
  renderer.setSize(container.clientWidth, container.clientHeight);

  const w = container.clientWidth;
  const h = container.clientHeight;

  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 0, 5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = true;

  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = 1.2;

  globe = buildGlobe();
  scene.add(globe);
}

function initLights() {
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 3, 5);
  scene.add(dirLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 50;

  dirLight.castShadow = true;
  scene.add(dirLight);
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

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(
    launchMarkersGroup.children,
    true
  );
  if (!intersects.length) return;

  const hit = intersects[0];
  const launch = hit.object.userData;

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

function aggregateLaunchesByCountry(data, year, limit = 6) {
  const counts = {};

  data.forEach((d) => {
    const parsed = new Date(d.Date);
    if (Number.isNaN(parsed.getTime())) return;
    if (parsed.getFullYear() !== year) return;

    const location = d.Location || "";
    const parts = location.split(",");
    const country = parts[parts.length - 1]?.trim() || "Unknown";

    if (!counts[country]) {
      counts[country] = { country, success: 0, failure: 0 };
    }

    const status = (d.MissionStatus || "").toLowerCase();
    if (status.includes("success")) {
      counts[country].success += 1;
    } else {
      counts[country].failure += 1;
    }
  });

  return Object.values(counts)
    .map((d) => ({
      ...d,
      total: d.success + d.failure,
    }))
    .sort((a, b) => b.total - a.total)
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

  const maxValue = Math.max(...data.map((d) => d.total));
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

  ctx.font = "16px sans-serif";
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

  data.forEach((d, i) => {
    const x = xScale(i) - barWidth / 2;

    const ySuccess = yScale(d.success);
    const hSuccess = padding.top + chartH - ySuccess;

    ctx.fillStyle = "#4caf50";
    ctx.fillRect(x, ySuccess, barWidth, hSuccess);

    const yFailure = yScale(d.success + d.failure);
    const hFailure = ySuccess - yFailure;

    ctx.fillStyle = "#f44336";
    ctx.fillRect(x + 1, yFailure, barWidth - 2, hFailure);
  });

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  data.forEach((d, i) => {
    ctx.fillText(d.country, xScale(i), padding.top + chartH + 6);
  });

  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Countries with most launches", width / 2, 10);

  ctx.textAlign = "left";
  ctx.font = "16px sans-serif";

  ctx.fillStyle = "#4caf50";
  ctx.fillRect(width - 120, 16, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Success", width - 104, 16);

  ctx.fillStyle = "#f44336";
  ctx.fillRect(width - 120, 32, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Failure", width - 104, 32);
}

function aggregateLaunchesByCompany(data, year, limit = 6) {
  const counts = {};

  data.forEach((d) => {
    const parsed = new Date(d.Date);
    if (isNaN(parsed.getTime())) return;
    if (parsed.getFullYear() !== year) return;

    const company = d.Company?.trim() || "Unknown";
    const status = (d.MissionStatus || "").toLowerCase();

    if (!counts[company]) {
      counts[company] = { company, success: 0, failure: 0 };
    }

    if (status.includes("success")) {
      counts[company].success += 1;
    } else {
      counts[company].failure += 1;
    }
  });

  return Object.values(counts)
    .map((d) => ({
      ...d,
      total: d.success + d.failure,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function drawCompanyChart(data) {
  const canvas = document.getElementById("companyChart");
  if (!canvas || !data.length) return;

  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  const padding = { top: 30, right: 20, bottom: 50, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => d.total));
  const groupW = chartW / data.length;
  const barW = groupW * 0.6;

  const xCenter = (i) => padding.left + i * groupW + groupW / 2;

  const yScale = (v) => padding.top + chartH - (v / maxValue) * chartH;

  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(padding.left + chartW, padding.top + chartH);
  ctx.stroke();

  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i++) {
    const v = Math.round((maxValue / 4) * i);
    const y = yScale(v);

    ctx.fillText(v, padding.left - 6, y);

    ctx.strokeStyle = "#222";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();
  }

  data.forEach((d, i) => {
    const x = xCenter(i) - barW / 2;

    const ySuccess = yScale(d.success);
    const yTotal = yScale(d.total);

    const hSuccess = padding.top + chartH - ySuccess;
    const hFailure = ySuccess - yTotal;

    ctx.fillStyle = "#4caf50";
    ctx.fillRect(x, ySuccess, barW, hSuccess);

    ctx.fillStyle = "#f44336";
    ctx.fillRect(x + 1, yTotal, barW - 2, hFailure);
  });

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  data.forEach((d, i) => {
    ctx.fillText(d.company, xCenter(i), padding.top + chartH + 6);
  });

  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Comapnies with most launches", width / 2, 10);

  ctx.textAlign = "left";
  ctx.font = "16px sans-serif";

  ctx.fillStyle = "#4caf50";
  ctx.fillRect(width - 120, 16, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Success", width - 104, 16);

  ctx.fillStyle = "#f44336";
  ctx.fillRect(width - 120, 32, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Failure", width - 104, 32);
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

  ctx.font = "16px sans-serif";
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

  ctx.font = "16px sans-serif";
  ctx.fillText("Total launches for all years", width / 2, 0);

  ctx.textAlign = "left";

  ctx.strokeStyle = "#4dacff";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(width - 80, 5);
  ctx.lineTo(width - 70, 5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Total", width - 60, 0);

  ctx.fillStyle = "#4caf50";
  ctx.fillRect(width - 80, 20, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Success", width - 60, 20);

  ctx.fillStyle = "#f44336";
  ctx.fillRect(width - 80, 40, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Failure", width - 60, 40);
}

function aggregateAllTimeStats(data) {
  const byCountry = {};
  const byCompany = {};

  data.forEach((d) => {
    const country = d.Location?.split(",").pop()?.trim() || "Unknown";
    const company = d.Company || "Unknown";
    const success = (d.MissionStatus || "").toLowerCase().includes("success");

    for (const key of [
      [byCountry, country],
      [byCompany, company],
    ]) {
      const map = key[0];
      const name = key[1];

      if (!map[name]) {
        map[name] = { success: 0, failure: 0, total: 0 };
      }

      success ? map[name].success++ : map[name].failure++;
      map[name].total++;
    }
  });

  return { byCountry, byCompany };
}

function getTopMetrics(map, minLaunches = 30) {
  const entries = Object.entries(map);

  return {
    mostLaunches: entries.reduce((a, b) => (b[1].total > a[1].total ? b : a)),
    mostFailures: entries.reduce((a, b) =>
      b[1].failure > a[1].failure ? b : a
    ),
    bestSuccessRate: entries
      .filter(([, v]) => v.total >= minLaunches)
      .map(([k, v]) => ({
        name: k,
        rate: v.success / v.total,
        total: v.total,
      }))
      .sort((a, b) => b.rate - a.rate)[0],
  };
}

function getMonthlyStatsForYear(year) {
  const months = Array(12)
    .fill(0)
    .map(() => ({
      launches: 0,
      success: 0,
      failure: 0,
    }));

  launchData.forEach((l) => {
    const y = new Date(l.Date).getFullYear();
    if (y !== year) return;

    const m = new Date(l.Date).getMonth();
    months[m].launches++;

    if (l.MissionStatus === "Success") months[m].success++;
    else months[m].failure++;
  });

  return months;
}

function drawMonthlyChart(year) {
  const canvas = document.getElementById("monthlyChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  const padding = 40;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const stats = getMonthlyStatsForYear(year);

  const labels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const launches = stats.map((s) => s.launches);
  const success = stats.map((s) => s.success);
  const failure = stats.map((s) => s.failure);
  const maxValue = Math.max(...launches, ...success, ...failure, 1);

  const xScale = (i) => padding + (i / 11) * chartW;
  const yScale = (v) => padding + chartH - (v / maxValue) * chartH;

  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + chartH);
  ctx.lineTo(padding + chartW, padding + chartH);
  ctx.stroke();

  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxValue / 4) * i);
    const y = yScale(val);

    ctx.fillText(val, padding - 6, y);

    ctx.strokeStyle = "#222";
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + chartW, y);
    ctx.stroke();
  }

  function drawLine(values, color, width = 2, dashed = false) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;

    if (dashed) ctx.setLineDash([4, 4]);
    else ctx.setLineDash([]);

    ctx.beginPath();
    values.forEach((v, i) => {
      const x = xScale(i);
      const y = yScale(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawLine(success, "#4caf50", 2);
  drawLine(failure, "#f44336", 2);
  drawLine(launches, "#4dacff", 2, true);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  labels.forEach((label, i) => {
    ctx.fillText(label, xScale(i), padding + chartH + 6);
  });

  ctx.font = "16px sans-serif";
  ctx.fillText(`Launches per month for ${year}`, width / 2, 10);

  ctx.textAlign = "left";
  ctx.font = "16px sans-serif";

  ctx.strokeStyle = "#4dacff";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(width - 80, 12);
  ctx.lineTo(width - 70, 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Total", width - 60, 7);

  ctx.fillStyle = "#4caf50";
  ctx.fillRect(width - 80, 30, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Success", width - 60, 28);

  ctx.fillStyle = "#f44336";
  ctx.fillRect(width - 80, 50, 10, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Failure", width - 60, 48);
}

function startPlayback() {
  if (isPlaying) return;

  isPlaying = true;
  playButton.textContent = "Stop";

  playInterval = setInterval(() => {
    let year = parseInt(yearSlider.value);
    const maxYear = parseInt(yearSlider.max);

    if (year >= maxYear) {
      stopPlayback();
      return;
    }

    yearSlider.value = year + 1;
    onYearClick(year + 1);
  }, 300);
}

function stopPlayback() {
  isPlaying = false;
  playButton.textContent = "Play";

  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
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
