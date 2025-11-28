// MapLayers helpers: functions to add/update map layers. These are skeletons
// We'll progressively move layer creation logic from the big file into functions here.
import mapboxgl from 'mapbox-gl';

export const ensureSource = (map: mapboxgl.Map, id: string, data: GeoJSON.FeatureCollection) => {
  if (!map) return;
  if (map.getSource(id)) {
    (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
  } else {
    map.addSource(id, { type: 'geojson', data });
  }
};

export const removeIfExists = (map: mapboxgl.Map, id: string) => {
  if (!map) return;
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
};

export default {
  ensureSource,
  removeIfExists
};
