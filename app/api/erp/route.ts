import { NextResponse } from 'next/server';
import erpData from '@/data/erp-rates.json';

// LTA standard vehicle type multipliers
const VEHICLE_MULTIPLIERS: Record<string, number> = {
  'Motorcycles': 0.5,
  'Passenger Cars': 1.0,
  'Heavy Goods Vehicles': 1.5,
  'Very Heavy Goods Vehicles': 2.0,
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const vehicleType = searchParams.get('vehicleType') || 'Passenger Cars';
    const multiplier = VEHICLE_MULTIPLIERS[vehicleType] || 1.0;

    // Map base rates to match expected LTA structure in frontend
    const formattedRates = erpData.map((item) => ({
      ZoneID: item.zoneId,
      GantryIDs: item.gantryIds,
      Location: item.location,
      DayType: item.dayType,
      StartTime: item.startTime,
      EndTime: item.endTime,
      ChargeAmount: item.baseRate * multiplier,
    }));

    return NextResponse.json({ value: formattedRates });
  } catch (error) {
    console.error('Failed to load local ERP rates:', error);
    return NextResponse.json({ value: [] }, { status: 500 });
  }
}