import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.LTA_DATAMALL_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'LTA_DATAMALL_KEY environment variable is not set.' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch('https://api.datamall.lta.gov.sg/ltaodataservice/ERPRates', {
      headers: {
        AccountKey: apiKey,
        accept: 'application/json',
      },
      // Cache the response on the server for 1 hour to prevent spamming LTA
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `LTA API responded with status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching ERP rates from LTA:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ERP data from LTA DataMall' },
      { status: 500 }
    );
  }
}