import { NextResponse } from 'next/server';

// Helper to map route step instructions / road names to LTA DataMall Zone IDs
function detectLtaZoneIds(route: any): string[] {
  const zones = new Set<string>();
  const fullText = (route.summary || '') + ' ' + 
    route.legs[0]?.steps?.map((s: any) => s.html_instructions || '').join(' ');

  const textUpper = fullText.toUpperCase();

  // CTE (Central Expressway)
  if (textUpper.includes('CTE') || textUpper.includes('CENTRAL EXP')) {
    zones.add('CT1');
    zones.add('CT2');
  }
  // PIE (Pan Island Expressway)
  if (textUpper.includes('PIE') || textUpper.includes('PAN ISLAND')) {
    zones.add('PE1');
    zones.add('PE2');
  }
  // ECP (East Coast Parkway)
  if (textUpper.includes('ECP') || textUpper.includes('EAST COAST')) {
    zones.add('EC1');
  }
  // AYE (Ayer Rajah Expressway)
  if (textUpper.includes('AYE') || textUpper.includes('AYER RAJAH')) {
    zones.add('AY1');
  }
  // KPE (Kallang-Paya Lebar Expressway)
  if (textUpper.includes('KPE') || textUpper.includes('KALLANG')) {
    zones.add('KP1');
  }
  // CBD / Orchard Area Roads
  if (textUpper.includes('ORCHARD') || textUpper.includes('MAXWELL') || textUpper.includes('SHEENTON') || textUpper.includes('BRAS BASAH')) {
    zones.add('CBD');
  }

  return Array.from(zones);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📥 Received API Payload:", body);

    const { origin, destination } = body;

    if (!origin || !destination) {
      return NextResponse.json(
        { error: "Missing origin or destination in request body" },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API Key is missing on the server" },
        { status: 500 }
      );
    }

    // FIX 1: Added departure_time=now & traffic_model=best_guess for REAL TRAFFIC TIMINGS
    const googleMapsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&alternatives=true&departure_time=now&traffic_model=best_guess&key=${apiKey}`;

    const googleRes = await fetch(googleMapsUrl);
    const googleData = await googleRes.json();

    console.log("🗺️ Google Maps API Response Status:", googleData.status);

    if (googleData.status !== 'OK' || !googleData.routes || googleData.routes.length === 0) {
      console.error("Google Directions Error Details:", googleData.error_message || googleData.status);
      return NextResponse.json(
        { 
          error: `Google Maps API returned status: ${googleData.status}`,
          details: googleData.error_message || "No routes found between selected points"
        },
        { status: 400 }
      );
    }

    // Process and format all returned routes
    const formattedRoutes = googleData.routes.map((route: any, index: number) => {
      const leg = route.legs[0];

      // FIX 2: Prefer duration_in_traffic over baseline static duration
      const durationSeconds = leg.duration_in_traffic 
        ? leg.duration_in_traffic.value 
        : leg.duration.value;

      const durationMin = Math.round(durationSeconds / 60);
      const distanceKm = (leg.distance.value / 1000).toFixed(1);

      // Extract LTA Zone IDs from step descriptions
      const zoneIds = detectLtaZoneIds(route);

      // Clean HTML instructions for summary label
      const cleanInstruction = leg.steps[0]?.html_instructions?.replace(/<[^>]*>?/gm, '') || 'Main Road';
      const summaryLabel = route.summary ? `Via ${route.summary}` : `Via ${cleanInstruction}`;

      // FIX 3: Stable unique primitive string IDs to prevent selection reference bugs
      const uniqueId = `route-${index}-${route.summary ? route.summary.replace(/\s+/g, '-').toLowerCase() : 'opt'}`;

      return {
        id: uniqueId,
        summary: summaryLabel,
        via: route.summary || cleanInstruction,
        durationMin,
        distanceKm,
        zoneIds, // Passed to frontend for real LTA DataMall rate lookups
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        waypoints: leg.steps.map((step: any) => ({
          latitude: step.end_location.lat,
          longitude: step.end_location.lng,
        })),
      };
    });

    // Rank winner route by fastest travel time
    const sortedRoutes = [...formattedRoutes].sort((a, b) => a.durationMin - b.durationMin);
    const winnerRoute = sortedRoutes[0];

    return NextResponse.json({
      winner: winnerRoute,
      allRoutes: formattedRoutes,
      routes: formattedRoutes
    });

  } catch (err: any) {
    console.error("❌ Route Handler Error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}