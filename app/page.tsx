'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';

const LIBRARIES: ("places")[] = ["places"];

export default function Home() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  });

  const [originText, setOriginText] = useState('268 Toa Payoh E, Singapore');
  const [originCoords, setOriginCoords] = useState<{ lat: string; lng: string }>({ lat: '1.3343', lng: '103.8568' });
  const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [destText, setDestText] = useState('45 Maxwell Rd, Singapore');
  const [destCoords, setDestCoords] = useState<{ lat: string; lng: string }>({ lat: '1.2797', lng: '103.8458' });
  const destAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [routes, setRoutes] = useState<any[]>([]);
  const [winnerRoute, setWinnerRoute] = useState<any>(null);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const onOriginPlaceChanged = () => {
    if (originAutocompleteRef.current) {
      const place = originAutocompleteRef.current.getPlace();
      if (place && place.geometry && place.geometry.location) {
        setOriginCoords({
          lat: place.geometry.location.lat().toString(),
          lng: place.geometry.location.lng().toString()
        });
        setOriginText(place.formatted_address || place.name || '');
      }
    }
  };

  const onDestPlaceChanged = () => {
    if (destAutocompleteRef.current) {
      const place = destAutocompleteRef.current.getPlace();
      if (place && place.geometry && place.geometry.location) {
        setDestCoords({
          lat: place.geometry.location.lat().toString(),
          lng: place.geometry.location.lng().toString()
        });
        setDestText(place.formatted_address || place.name || '');
      }
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOriginCoords({
          lat: position.coords.latitude.toString(),
          lng: position.coords.longitude.toString()
        });
        setOriginText('📍 My Current Location');
      },
      (error) => console.error("GPS Error:", error),
      { enableHighAccuracy: true }
    );
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      // Pass real-time timestamp for current ERP rate period
      const departureTime = new Date().toISOString();

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: parseFloat(originCoords.lat), longitude: parseFloat(originCoords.lng) },
          destination: { latitude: parseFloat(destCoords.lat), longitude: parseFloat(destCoords.lng) },
          departureTime
        })
      });

      const data = await res.json();
      console.log('API Full Response:', data);

      let allRoutes: any[] = [];
      let topWinner: any = null;

      if (data.allRoutes && Array.isArray(data.allRoutes)) {
        allRoutes = data.allRoutes;
      } else if (data.routes && Array.isArray(data.routes)) {
        allRoutes = data.routes;
      } else if (Array.isArray(data)) {
        allRoutes = data;
      } else if (data.result && Array.isArray(data.result)) {
        allRoutes = data.result;
      }

      topWinner = data.winner || data.optimal || allRoutes[0] || null;

      if (topWinner && !allRoutes.includes(topWinner)) {
        allRoutes = [topWinner, ...allRoutes];
      }

      setRoutes(allRoutes);
      setWinnerRoute(topWinner);
      setSelectedRoute(topWinner || allRoutes[0] || null);
    } catch (err) {
      console.error('Fetch error:', err);
      alert('Failed to calculate routes.');
    } finally {
      setLoading(false);
    }
  };

  const launchGoogleMaps = (route: any) => {
    const dest = route?.destinationCoords || { latitude: destCoords.lat, longitude: destCoords.lng };
    const orig = route?.originCoords || { latitude: originCoords.lat, longitude: originCoords.lng };

    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${orig.latitude},${orig.longitude}&destination=${dest.latitude},${dest.longitude}&travelmode=driving`;

    // Ensure selected route path is strictly enforced using waypoints or path coordinates if present
    if (route?.waypoints && Array.isArray(route.waypoints) && route.waypoints.length > 0) {
      const waypointsString = route.waypoints
        .map((wp: { latitude: number; longitude: number }) => `${wp.latitude},${wp.longitude}`)
        .join('|');
      mapsUrl += `&waypoints=${encodeURIComponent(waypointsString)}`;
    } else if (route?.via) {
      mapsUrl += `&via=${encodeURIComponent(route.via)}`;
    }

    window.open(mapsUrl, '_blank');
  };

  if (loadError) return <div style={{ color: 'red', padding: '20px' }}>Error loading Google Maps API.</div>;
  if (!isLoaded) return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>Loading Google Maps...</div>;

  return (
    <main style={{ padding: '30px 20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto', color: '#ffffff' }}>
      <h1 style={{ textAlign: 'center', fontSize: '24px', marginBottom: '20px' }}>Shaunneh's Smart Navigation</h1>

      {/* START LOCATION SEARCH */}
      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>🟢 Start Location</label>
          <button 
            onClick={useCurrentLocation}
            style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            🎯 Use GPS
          </button>
        </div>

        <Autocomplete
          onLoad={(autocomplete) => (originAutocompleteRef.current = autocomplete)}
          onPlaceChanged={onOriginPlaceChanged}
          options={{ componentRestrictions: { country: 'sg' } }}
        >
          <input 
            type="text" 
            placeholder="Search Google Maps address..." 
            value={originText} 
            onChange={(e) => setOriginText(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', boxSizing: 'border-box' }}
          />
        </Autocomplete>
      </div>

      {/* DESTINATION SEARCH */}
      <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #334155' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>🔴 Destination</label>

        <Autocomplete
          onLoad={(autocomplete) => (destAutocompleteRef.current = autocomplete)}
          onPlaceChanged={onDestPlaceChanged}
          options={{ componentRestrictions: { country: 'sg' } }}
        >
          <input 
            type="text" 
            placeholder="Search Google Maps address..." 
            value={destText} 
            onChange={(e) => setDestText(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#fff', boxSizing: 'border-box' }}
          />
        </Autocomplete>
      </div>

      {/* CALCULATE BUTTON */}
      <button 
        onClick={handleSearch}
        disabled={loading}
        style={{
          padding: '14px 20px',
          fontSize: '16px',
          cursor: loading ? 'not-allowed' : 'pointer',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: loading ? '#475569' : '#0070f3',
          color: '#ffffff',
          fontWeight: 'bold',
          width: '100%',
          boxShadow: '0 4px 12px rgba(0, 112, 243, 0.3)'
        }}
      >
        {loading ? 'Evaluating All Routes...' : 'Calculate Routes'}
      </button>

      {/* ROUTE RESULTS LIST */}
      {routes.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '12px', color: '#e0e0e0' }}>
            Considered Routes ({routes.length})
          </h2>
          
          {routes.map((route, idx) => {
            const isWinner = (winnerRoute && (route.id ? route.id === winnerRoute.id : route === winnerRoute)) || (idx === 0 && winnerRoute === null);
            const isSelected = selectedRoute && (route.id ? route.id === selectedRoute.id : route === selectedRoute);

            return (
              <div 
                key={route.id || idx}
                onClick={() => setSelectedRoute(route)}
                style={{
                  padding: '16px',
                  marginBottom: '16px',
                  borderRadius: '12px',
                  backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                  border: isWinner 
                    ? '2px solid #22c55e' 
                    : isSelected 
                      ? '2px solid #38bdf8' 
                      : '1px solid #334155',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '16px', color: isWinner ? '#4ade80' : '#38bdf8' }}>
                    {route.summary || route.via || route.label || `Route Option ${idx + 1}`}
                  </span>
                  
                  {isWinner ? (
                    <span style={{ backgroundColor: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px' }}>
                      ⭐ Optimal Route
                    </span>
                  ) : (
                    <span style={{ backgroundColor: '#334155', color: '#94a3b8', fontSize: '11px', padding: '3px 8px', borderRadius: '12px' }}>
                      Alternative
                    </span>
                  )}
                </div>

                <div style={{ color: '#f1f5f9', fontSize: '14px', lineHeight: '1.8' }}>
                  <div>⏱️ <strong>Time:</strong> {route.durationMin !== undefined ? Number(route.durationMin).toFixed(0) : route.duration || 'N/A'} mins</div>
                  <div>🛣️ <strong>Distance:</strong> {route.distanceKm !== undefined ? Number(route.distanceKm).toFixed(1) : route.distance || 'N/A'} km</div>
                  <div>💰 <strong>ERP Fee:</strong> ${route.erpTotalCost !== undefined ? Number(route.erpTotalCost).toFixed(2) : route.erpFee || '0.00'}</div>
                  {route.intersectionScore !== undefined && (
                    <div>🚦 <strong>Traffic Light Score:</strong> {route.intersectionScore}</div>
                  )}
                  {route.score !== undefined && (
                    <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '4px' }}>📊 <strong>Total Weighted Score:</strong> {Number(route.score).toFixed(1)}</div>
                  )}
                </div>

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRoute(route);
                    launchGoogleMaps(route);
                  }}
                  style={{
                    marginTop: '14px',
                    padding: '10px 16px',
                    backgroundColor: isWinner ? '#16a34a' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    width: '100%',
                    fontSize: '14px'
                  }}
                >
                  Navigate This Route
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}