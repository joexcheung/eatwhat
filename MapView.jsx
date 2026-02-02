import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Center Hong Kong
const HK_CENTER = [22.3193, 114.1694];

function Recenter({ coords }) {
  const map = useMap();
  useEffect(()=> {
    if (coords) map.setView(coords, 14);
  }, [coords]);
  return null;
}

export default function MapView({ places = [], onSelect }) {
  // default marker icon fix for Leaflet in many bundlers
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:
      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
  });

  const firstCoords = places.length ? [places[0].location.lat, places[0].location.lng] : HK_CENTER;

  return (
    <MapContainer center={firstCoords} zoom={13} style={{height:'100%', width:'100%'}}>
      <Recenter coords={firstCoords} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {places.map(p => (
        p.location && (
          <Marker key={p.place_id} position={[p.location.lat, p.location.lng]}>
            <Popup>
              <div style={{width:200}}>
                <div style={{fontWeight:700}}>{p.name}</div>
                <div style={{fontSize:12}}>{p.address}</div>
                <div style={{marginTop:8}}>
                  <button style={{padding:6}} onClick={()=> onSelect(p)}>Open</button>
                </div>
              </div>
            </Popup>
          </Marker>
        )
      ))}
    </MapContainer>
  );
}