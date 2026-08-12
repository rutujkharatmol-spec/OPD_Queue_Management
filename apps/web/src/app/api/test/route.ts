import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('http://localhost:4000/api/v1/tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patientId: '11111111-1111-1111-1111-111111111111',
        departmentId: '11111111-1111-1111-1111-111111111111',
        doctorId: '22222222-2222-2222-2222-222222222222',
        priority: 'NORMAL'
      }),
    });
    
    const text = await response.text();
    return NextResponse.json({
      status: response.status,
      body: text
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
