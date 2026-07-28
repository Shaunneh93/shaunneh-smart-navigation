import { NextResponse } from 'next/server';

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

    // Call Google Maps Directions API directly
    const googleMapsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&alternatives=true&key=${apiKey}`;

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
      const durationMin = Math.round(leg.duration.value / 60);
      const distanceKm = (leg.distance.value / 1000).toFixed(1);

      return {
        id: index,
        summary: route.summary || `Via ${leg.steps[0]?.html_instructions?.replace(/<[^>]*>?/gm, '') || 'Main Road'}`,
        durationMin,
        distanceKm,
        erpTotalCost: (Math.random() * 3).toFixed(2), // Replace with your ERP calculation function
        intersectionScore: Math.floor(Math.random() * 10) + 1, // Replace with your traffic light logic
        startAddress: leg.start_address,
        endAddress: leg.end_address,
      };
    });

    return NextResponse.json({
      winner: formattedRoutes[0],
      allRoutes: formattedRoutes,
      routes: formattedRoutes
    });

  } catch (err: any) {
    console.error("❌ Route Handler Error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}