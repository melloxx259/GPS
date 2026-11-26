import {
  nearestNodeWorld,
  type CityGraph,
  type GeoBounds,
} from './graph';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface GeoProjection {
  centerLat: number;
  centerLng: number;
  cosLat: number;
  bounds: GeoBounds;
}

/**
 * Expands a city's base geographic bounds so any user-dropped origin/destination pin
 * keeps the map camera framing both the road network and user pins cleanly.
 */
export function expandGeoBounds(
  base: GeoBounds,
  points: LatLngPoint[],
): GeoBounds {
  let {north, south, east, west} = base;
  const latPad = Math.max(0.01, (north - south) * 0.08);
  const lngPad = Math.max(0.01, (east - west) * 0.08);

  for (const p of points) {
    if (p.lat > north - latPad * 0.35) north = Math.max(north, p.lat + latPad);
    if (p.lat < south + latPad * 0.35) south = Math.min(south, p.lat - latPad);
    if (p.lng > east - lngPad * 0.35) east = Math.max(east, p.lng + lngPad);
    if (p.lng < west + lngPad * 0.35) west = Math.min(west, p.lng - lngPad);
  }

  return {north, south, east, west};
}

/**
 * Builds an exact tangent-plane geographic projection tied to the real OSM road graph's
 * center lat/lng, ensuring road lines never warp off Google Maps streets even when panning or zooming.
 */
export function buildGeoBoundsProjection(
  graph: CityGraph,
  bounds: GeoBounds,
): GeoProjection {
  const centerLat = graph.cfg.geo.center.lat;
  const centerLng = graph.cfg.geo.center.lng;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  return {
    centerLat,
    centerLng,
    cosLat,
    bounds,
  };
}

export function worldToLatLng(
  proj: GeoProjection,
  wx: number,
  wy: number,
): LatLngPoint {
  return {
    lat: proj.centerLat - wy / 111.32,
    lng: proj.centerLng + wx / (111.32 * proj.cosLat),
  };
}

export function latLngToWorld(
  proj: GeoProjection,
  lat: number,
  lng: number,
): {wx: number; wy: number} {
  return {
    wx: (lng - proj.centerLng) * 111.32 * proj.cosLat,
    wy: (proj.centerLat - lat) * 111.32,
  };
}

export function nearestNodeToLatLng(
  graph: CityGraph,
  proj: GeoProjection,
  lat: number,
  lng: number,
): number {
  const {wx, wy} = latLngToWorld(proj, lat, lng);
  return nearestNodeWorld(graph, wx, wy);
}
