import { NextResponse } from 'next/server';

// Zone and Gantry mapping table tailored to match erp-rates.json keys
const ZONE_KEYWORD_MAP: Array<{
  keywords: string[];
  zoneId: string;
  gantryIds: number[];
}> = [
  {
    keywords: ['cte', 'central exp', 'central expressway', 'braddell'],
    zoneId: 'CTE_SOUTHBOUND_BRADDELL',
    gantryIds: [31, 33, 34],
  },
  {
    keywords: ['cte northbound', 'after pie'],
    zoneId: 'CTE_NORTHBOUND_PIE',
    gantryIds: [35],
  },
  {
    keywords: ['aye', 'ayer rajah', 'ayer rajah expressway', 'jurong town hall'],
    zoneId: 'AYE_JURONG_TOWN_HALL',
    gantryIds: [36],
  },
  {
    keywords: ['kpe', 'kallang-paya lebar', 'kallang-paya lebar expressway', 'defu'],
    zoneId: 'KPE_SOUTHBOUND_DEFU',
    gantryIds: [71],
  },
  {
    keywords: ['pie eastbound', 'bendemeer', 'kallang bahru'],
    zoneId: 'PIE_EASTBOUND_KALLANG',
    gantryIds: [90, 91],
  },
  {
    keywords: ['pie westbound', 'eunos'],
    zoneId: 'PIE_WESTBOUND_EUNOS',
    gantryIds: [45],
  },
  {
    keywords: ['bugis', 'marina centre', 'rochor', 'nicoll highway'],
    zoneId: 'BUGIS_MARINA_CENTRE',
    gantryIds: [1, 2, 9, 10, 11, 16, 17, 18, 23],
  },
  {
    keywords: ['shenton', 'chinatown', 'cantonment', 'keppel', 'maxwell'],
    zoneId: 'SHENTON_WAY_CHINATOWN',
    gantryIds: [3, 5, 6, 7, 19, 20, 24, 25, 28, 29, 72],
  },
  {
    keywords: ['orchard', 'somerset', 'scotts rd'],
    zoneId: 'ORCHARD_CORDON',
    gantryIds: [4, 12, 13, 14, 15, 21, 22, 26, 27],
  },
  {
    keywords: ['fort canning', 'ymca', 'clemenceau', 'bras basah'],
    zoneId: 'YMCA_FORT_CANNING',
    gantryIds: [47, 49],
  },
  {
    keywords: ['handy rd', 'handy road'],
    zoneId: 'HANDY_ROAD',
    gantryIds: [48],
  },
  {
    keywords: ['new bridge rd', 'south bridge rd', 'fullerton', 'bayfront'],
    zoneId: 'NEW_BRIDGE_SOUTH_BRIDGE_FULLERTON_BAYFRONT',
    gantryIds: [60, 61, 62, 63, 64, 66, 69],
  },
];

// Upgraded zone and gantry detection function matching erp-rates.json
function detectLtaZoneIds(route: any): { zoneIds: string[]; gantryIds: number[] } {
  const zoneSet = new Set<string>();
  const gantrySet = new Set<number>();

  const fullText = (
    (route.summary || '') +
    ' ' +
    route.legs[0]?.steps?.map((s: any) => s.html_instructions || '').join(' ')
  ).toLowerCase();

  ZONE_KEYWORD_MAP.forEach((mapping) => {
    const isMatch = mapping.keywords.some((keyword) => fullText.includes(keyword));

    if (isMatch) {
      zoneSet.add(mapping.zoneId);
      mapping.gantryIds.forEach((id) => gantrySet.add(id));
    }
  });

  return {
    zoneIds: Array.from(zoneSet),
    gantryIds: Array.from(gantrySet),
  };
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
      score += Math.floor(step.distance.value / 500);
    }
  });

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

    // Request directions with alternatives and real traffic timings
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

      // Extract ERP Zone IDs & Gantry IDs matching erp-rates.json
      const { zoneIds, gantryIds } = detectLtaZoneIds(route);

      // Calculate the Intersection / Traffic Light Score
      const intersectionScore = calculateIntersectionScore(leg);

      // Apply +15.0 penalty points if the route passes through any detected ERP zone
      const erpPenalty = zoneIds.length > 0 ? 15.0 : 0.0;

      // Composite Score: 1.0/min + 0.5/light + 0.2/km + ERP penalty
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
        zoneIds, // Used by app/page.tsx to match erp-rates.json
        gantryIds,
        intersectionScore,
        erpPenalty,
        compositeScore,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        overviewPolyline: route.overview_polyline?.points,
        waypoints: leg.steps.map((step: any) => ({
          latitude: step.end_location.lat,
          longitude: step.end_location.lng,
        })),
      };
    });

    // Rank routes by lowest composite score
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