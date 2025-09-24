// map.js - initialize map and export utility functions
var map = L.map('map').setView([31.2304, 121.4737], 12);
L.tileLayer('http://localhost:3000/tiles/{z}/{x}/{y}.png', {
  maxZoom: 16,
  attribution: '© 高德地图（本地离线）'
}).addTo(map);

var polyline = null;
var previewLine = null;
var markerFrom = null;
var markerTo = null;

function setPolyline(coords) {
  if (polyline) { map.removeLayer(polyline); }
  polyline = L.polyline(coords, {color: 'red', weight: 5}).addTo(map);
  try { map.fitBounds(polyline.getBounds()); } catch(e){}
}

function setPreviewLine(fromLatLng, toLatLng) {
  if (previewLine) map.removeLayer(previewLine);
  previewLine = L.polyline([fromLatLng, toLatLng], {color: 'orange', dashArray: '10,10'}).addTo(map);
}

function setMarkerFrom(lat, lon) {
  if (markerFrom) map.removeLayer(markerFrom);
  const iconFrom = L.divIcon({ className: '', html: '<div class="label-icon label-s">S</div>', iconSize: [22,22], iconAnchor: [11,11] });
  markerFrom = L.marker([lat, lon], { icon: iconFrom, interactive: false }).addTo(map);
}
function setMarkerTo(lat, lon) {
  if (markerTo) map.removeLayer(markerTo);
  const iconTo = L.divIcon({ className: '', html: '<div class="label-icon label-t">T</div>', iconSize: [22,22], iconAnchor: [11,11] });
  markerTo = L.marker([lat, lon], { icon: iconTo, interactive: false }).addTo(map);
}

// expose to global for backward compatibility
window.map = map;
window.setPolyline = setPolyline;
window.setPreviewLine = setPreviewLine;
window.setMarkerFrom = setMarkerFrom;
window.setMarkerTo = setMarkerTo;
