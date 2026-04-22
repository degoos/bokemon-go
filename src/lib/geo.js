// Afstand in meters tussen twee GPS-coordinaten (Haversine)
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Check of punt binnen polygoon ligt (ray casting)
export function pointInPolygon(lat, lon, polygonCoords) {
  // polygonCoords: array van [lat, lon]
  let inside = false
  const x = lon, y = lat
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i][1], yi = polygonCoords[i][0]
    const xj = polygonCoords[j][1], yj = polygonCoords[j][0]
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// Genereer random punt binnen polygoon (simpele bounding box methode)
export function randomPointInBounds(bounds) {
  const { minLat, maxLat, minLon, maxLon } = bounds
  return {
    lat: minLat + Math.random() * (maxLat - minLat),
    lon: minLon + Math.random() * (maxLon - minLon),
  }
}

// Bounding box van GeoJSON polygon
export function getBoundsFromGeoJSON(geojson) {
  const coords = geojson.geometry?.coordinates?.[0] || []
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lon, lat] of coords) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return { minLat, maxLat, minLon, maxLon }
}

// GeoJSON coordinates naar Leaflet LatLng array
export function geojsonToLatLngs(geojson) {
  const coords = geojson.geometry?.coordinates?.[0] || geojson.coordinates?.[0] || []
  return coords.map(([lon, lat]) => [lat, lon])
}

// Leaflet LatLng array naar GeoJSON
export function latLngsToGeoJSON(latLngs) {
  const coords = latLngs.map(([lat, lon]) => [lon, lat])
  if (coords.length > 0 && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
    coords.push(coords[0]) // sluit de ring
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] }
  }
}

// Bereken centroid van een GeoJSON polygon
export function getPolygonCenter(geojson) {
  const coords = geojson?.geometry?.coordinates?.[0] || geojson?.coordinates?.[0] || []
  if (coords.length === 0) return null
  const lats = coords.map(([, lat]) => lat)
  const lons = coords.map(([lon]) => lon)
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lons) + Math.max(...lons)) / 2,
  ]
}
