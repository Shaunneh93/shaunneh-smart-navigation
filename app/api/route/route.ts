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
  // MCE (Marina Coastal Expressway)
  if (textUpper.includes('MCE') || textUpper.includes('MARINA COASTAL')) {
    zones.add('MC1');
    zones.add('MC2');
  }
  // BKE (Bukit Timah Expressway)
  if (textUpper.includes('BKE') || textUpper.includes('BUKIT TIMAH EXP')) {
    zones.add('BK1');
  }
  // SLE (Seletar Expressway)
  if (textUpper.includes('SLE') || textUpper.includes('SELETAR EXP')) {
    zones.add('SL1');
  }
  // TPE (Tampines Expressway)
  if (textUpper.includes('TPE') || textUpper.includes('TAMPINES EXP')) {
    zones.add('TP1');
  }
  // KJE (Kranji Expressway)
  if (textUpper.includes('KJE') || textUpper.includes('KRANJI EXP')) {
    zones.add('KJ1');
  }
  // Dunearn Road / Bukit Timah Arterials
  if (textUpper.includes('DUNEARN') || textUpper.includes('BUKIT TIMAH RD')) {
    zones.add('DR');
  }
  // CBD / Orchard Area Roads
  if (
    textUpper.includes('ORCHARD') || 
    textUpper.includes('MAXWELL') || 
    textUpper.includes('SHENTON') || 
    textUpper.includes('BRAS BASAH') ||
    textUpper.includes('SOMERSET')
  ) {
    zones.add('CBD');
    zones.add('OC'); // Orchard Cordon
  }

  return Array.from(zones);
}

// Calculates estimated traffic light / intersection encounters
function calculateIntersectionScore(leg: any): number {
  if (!leg?.steps || !Array.isArray(leg.steps)) return 0;

  let score = 0;

  leg.steps.forEach((step: any) => {
    const maneuver = step.maneuver || '';
    const text = (step.html_instructions || '').toLowerCase();

    // 1. Maneuvers that almost always involve a traffic light / intersection
    if (
      maneuver.includes('turn') || 
      maneuver.includes('u-turn') || 
      text.includes('turn left') || 
      text.includes('turn right') ||
      text.includes('u-turn') ||
      text.includes('at the traffic light') ||
      text.includes('junction')
    ) {
      score += 1;
    } 
    // 2. Long straight segments on non-expressways often cross signalized junctions
    else if (!maneuver && step.distance?.value > 400 && !text.includes('expressway') && !text.includes('e/way')) {
      // Add ~1 light for every 500m on major non-expressway arterial roads
      score += Math.floor(step.distance.value / 500);
    }
  });

  // Ensure minimum score of 1 if steps exist
  return Math.max(1, score);
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

    // Departure_time=now & traffic_model=best_guess for real traffic timings
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

      // Prefer duration_in_traffic over baseline static duration
      const durationSeconds = leg.duration_in_traffic 
        ? leg.duration_in_traffic.value 
        : leg.duration.value;

      const durationMin = Math.round(durationSeconds / 60);
      const distanceNum = parseFloat((leg.distance.value / 1000).toFixed(1));
      const distanceKm = distanceNum.toFixed(1);

      // Extract LTA Zone IDs from step descriptions
      const zoneIds = detectLtaZoneIds(route);

      // Calculate the Intersection / Traffic Light Score
      const intersectionScore = calculateIntersectionScore(leg);

      // 🟢 Option 2 ERP Avoidance Penalty:
      // If the route passes through any ERP zone (zoneIds detected), apply a +15.0 penalty point score
      const erpPenalty = zoneIds.length > 0 ? 15.0 : 0.0;

      // 🟢 Strategy A Composite Score Formula:
      // - 1.0 pt per minute of travel time
      // - 0.5 pts per traffic light / junction encounter
      // - 0.2 pts per kilometer of distance
      // - +15.0 pts PENALTY if the route passes through an ERP zone
      const compositeScore = Number(
        (
          durationMin * 1.0 +
          intersectionScore * 0.5 +
          distanceNum * 0.2 +
          erpPenalty
        ).toFixed(1)
      );

      // Clean HTML instructions for summary label
      const cleanInstruction = leg.steps[0]?.html_instructions?.replace(/<[^>]*>?/gm, '') || 'Main Road';
      const summaryLabel = route.summary ? `Via ${route.summary}` : `Via ${cleanInstruction}`;

      const uniqueId = `route-${index}-${route.summary ? route.summary.replace(/\s+/g, '-').toLowerCase() : 'opt'}`;

      return {
        id: uniqueId,
        summary: summaryLabel,
        via: route.summary || cleanInstruction,
        durationMin,
        distanceKm,
        zoneIds, // Passed to frontend for real LTA DataMall rate lookups
        intersectionScore,
        erpPenalty, // 🟢 Included in response for transparency
        compositeScore, // 🟢 Strategy A + ERP Penalty score
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        waypoints: leg.steps.map((step: any) => ({
          latitude: step.end_location.lat,
          longitude: step.end_location.lng,
        })),
      };
    });

    // 🟢 Rank winner route by LOWEST composite score (Strategy A + Option 2)
    const sortedRoutes = [...formattedRoutes].sort((a, b) => a.compositeScore - b.compositeScore);
    const winnerRoute = sortedRoutes[0];

    return NextResponse.json({
      winner: winnerRoute,
      allRoutes: sortedRoutes,
      routes: sortedRoutes
    });

  } catch (err: any) {
    console.error("❌ Route Handler Error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}