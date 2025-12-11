import * as THREE from "three";
import { latLonToVector3 } from "./utils/geo.js";

export function createLaunchMarkers(data, radius = 1.5) {
  const group = new THREE.Group();
  const successColor = new THREE.Color(0x00ff00);
  const failureColor = new THREE.Color(0xff0000);

  const BAR_RADIUS = 0.005;

  data.forEach((d) => {
    let lat = parseFloat(d.Latitude);
    let lon = parseFloat(d.Longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    const jitter = 2;
    lat += (Math.random() - 0.5) * jitter;
    lon += (Math.random() - 0.5) * jitter;

    const basePos = latLonToVector3(lat, lon, radius + 0.01);

    const barLength = d.MissionStatus === "Success" ? 0.2 : 0.1;
    const tipPos = latLonToVector3(lat, lon, radius + 0.01 + barLength);

    const cylGeo = new THREE.CylinderGeometry(
      BAR_RADIUS,
      BAR_RADIUS,
      barLength,
      8
    );

    const color = d.MissionStatus === "Success" ? successColor : failureColor;

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.1,
    });

    const cylinder = new THREE.Mesh(cylGeo, mat);

    const midpoint = new THREE.Vector3()
      .addVectors(basePos, tipPos)
      .multiplyScalar(0.5);

    cylinder.position.copy(midpoint);

    cylinder.lookAt(tipPos);
    cylinder.rotateX(Math.PI / 2);

    cylinder.castShadow = true;
    cylinder.receiveShadow = true;

    cylinder.userData = d;
    group.add(cylinder);
  });

  return group;
}
