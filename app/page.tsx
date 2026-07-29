'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';

const LIBRARIES: ("places")[] = ["places"];

export interface LtaErpRateItem {
  VehicleType: string;
  DayType: string;
  StartTime: string;
  EndTime: string;
  ZoneID: string;
  ChargeAmount: number;
}

export default function Home() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  });

// ✅ AFTER (GPS by default for start, blank for destination)
const [originText, setOriginText] = useState('📍 Fetching Location...');
const [originCoords, setOriginCoords] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

const [destText, setDestText] = useState('');
const [destCoords, setDestCoords] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
const destAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

// Automatically trigger GPS on page mount
useEffect(() => {
  useCurrentLocation();
}, []);

  // Route State
  const [routes, setRoutes] = useState<any[]>([]);
  const [winnerRouteId, setWinnerRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Live LTA ERP State
  const [erpRates, setErpRates] = useState<LtaErpRateItem[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Fetch live ERP rate database from /api/erp once on mount
  useEffect(() => {
    async function fetchLtaRates() {
      try {
        const res = await fetch('/api/erp');
        if (res.ok) {
          const data = await res.json();
          setErpRates(data.value || data.ERP || []);
        }
      } catch (err) {
        console.error('Failed to load live LTA rates:', err);
      }
    }
    fetchLtaRates();
  }, []);

  // Sync Singapore Time for live ERP window checks
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Singapore',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Compute live ERP fees per route based on current SG time & route ZoneIDs
  const liveErpMap = useMemo(() => {
    if (!currentTime || erpRates.length === 0 || routes.length === 0) return {};

    const resultMap: Record<string, number> = {};

    routes.forEach((route, idx) => {
      const routeKey = route.id || `route-${idx}`;
      const zoneIds: string[] = route.zoneIds || route.erpZones || [];

      let totalFee = 0;
      zoneIds.forEach((zoneId) => {
        const activeRate = erpRates.find((rate) => {
          if (rate.ZoneID !== zoneId) return false;
          const start = rate.StartTime.substring(0, 5);
          const end = rate.EndTime.substring(0, 5);
          return currentTime >= start && currentTime < end;
        });

        if (activeRate) {
          totalFee += Number(activeRate.ChargeAmount) || 0;
        }
      });

      resultMap[routeKey] = totalFee;
    });

    return resultMap;
  }, [currentTime, erpRates, routes]);

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

      // Assign primitive IDs to routes if missing
      allRoutes = allRoutes.map((r, i) => ({
        ...r,
        id: r.id || `route-${i}`,
      }));

      if (topWinner && !topWinner.id) {
        topWinner.id = 'route-winner-0';
      }

      const winnerId = topWinner?.id || allRoutes[0]?.id || null;

      setRoutes(allRoutes);
      setWinnerRouteId(winnerId);
      setSelectedRouteId(winnerId);
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

    // 1. If route has intermediate waypoints, pick 1-2 points along the path
    if (route?.waypoints && Array.isArray(route.waypoints) && route.waypoints.length > 0) {
      const total = route.waypoints.length;
      
      // Sample a middle point to force Google Maps along this specific route choice
      const midPoint = route.waypoints[Math.floor(total / 2)];
      
      if (midPoint?.latitude && midPoint?.longitude) {
        // Pass plain lat,lng (DO NOT prepend 'via:' here)
        const waypointsString = `${midPoint.latitude},${midPoint.longitude}`;
        mapsUrl += `&waypoints=${encodeURIComponent(waypointsString)}`;
      }
    } 
    // 2. Fallback if route provides a summary string (e.g. 'PIE' or 'CTE')
    else if (route?.via && typeof route.via === 'string') {
      mapsUrl += `&via=${encodeURIComponent(route.via)}`;
    }

    window.open(mapsUrl, '_blank');
  };

  if (loadError) return <div style={{ color: 'red', padding: '20px' }}>Error loading Google Maps API.</div>;
  if (!isLoaded) return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>Loading Google Maps...</div>;

  return (
    <main style={{ padding: '30px 20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto', color: '#ffffff' }}>
      <h1 style={{ textAlign: 'center', fontSize: '24px', marginBottom: '20px' }}>NEHvigation</h1>

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
  disabled={loading || !destCoords.lat || !originCoords.lat}
  style={{
    padding: '14px 20px',
    fontSize: '16px',
    cursor: (loading || !destCoords.lat || !originCoords.lat) ? 'not-allowed' : 'pointer',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: loading ? '#475569' : '#0070f3',
    color: '#ffffff',
    fontWeight: 'bold',
    width: '100%',
    boxShadow: '0 4px 12px rgba(0, 112, 243, 0.3)',
    opacity: (!destCoords.lat || !originCoords.lat) ? 0.6 : 1
  }}
>
  {loading ? 'Evaluating All Routes...' : 'Calculate Routes'}
</button>
      {/* ROUTE RESULTS LIST */}
      {routes.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '18px', margin: 0, color: '#e0e0e0' }}>
              Considered Routes ({routes.length})
            </h2>
            {currentTime && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                SG Time: {currentTime}
              </span>
            )}
          </div>
          
          {routes.map((route, idx) => {
            const routeKey = route.id || `route-${idx}`;
            const isWinner = winnerRouteId ? routeKey === winnerRouteId : idx === 0;
            const isSelected = selectedRouteId === routeKey;

            // Live ERP figure (or fallback to backend calculation)
            const liveErpCost = liveErpMap[routeKey];
            const displayErp = liveErpCost !== undefined 
              ? liveErpCost 
              : route.erpTotalCost ?? route.erpFee ?? 0;

            return (
              <div 
                key={routeKey}
                onClick={() => setSelectedRouteId(routeKey)}
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
                  position: 'relative',
                  transition: 'border 0.15s ease-in-out'
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
                  
                  {/* LIVE LTA ERP DISPLAY */}
                  <div>
                    💰 <strong>ERP Fee:</strong>{' '}
                    <span style={{ color: displayErp > 0 ? '#fbbf24' : '#34d399', fontWeight: 'bold' }}>
                      ${Number(displayErp).toFixed(2)}
                    </span>
                  </div>

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
                    setSelectedRouteId(routeKey);
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