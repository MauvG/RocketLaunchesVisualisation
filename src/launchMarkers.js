import * as THREE from "three";
import { latLonToVector3 } from "./utils/geo.js";

export function createLaunchMarkers(data, radius = 1.49) {
  const positions = [];
  const colors = [];

  const successColor = new THREE.Color(0x00ff00);
  const failureColor = new THREE.Color(0xff0000);

  data.forEach((d) => {
    let lat = parseFloat(d.Latitude);
    let lon = parseFloat(d.Longitude);

    if (isNaN(lat) || isNaN(lon)) return;

    const jitter = 1;
    lat += (Math.random() - 0.5) * jitter;
    lon += (Math.random() - 0.5) * jitter;

    const pos = latLonToVector3(lat, lon, radius + 0.01);

    positions.push(pos.x, pos.y, pos.z);

    const color = d.MissionStatus === "Success" ? successColor : failureColor;

    colors.push(color.r, color.g, color.b);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.01,
    map: new THREE.TextureLoader().load("/textures/circle.png"),
    transparent: true,
    alphaTest: 0.5,
    vertexColors: true,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}
