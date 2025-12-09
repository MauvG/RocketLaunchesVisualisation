import * as d3 from "d3";

export async function loadCSV(path) {
  return await d3.csv(path, (d) => ({
    ...d,
    Latitude: +d.Latitude,
    Longitude: +d.Longitude,
  }));
}
