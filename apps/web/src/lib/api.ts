export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1` : 'http://localhost:4000/api/v1';

export async function generateToken(patientId: string, departmentId: string, doctorId: string, priority: string) {
  const response = await fetch(`${API_BASE_URL}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId, departmentId, doctorId, priority }),
  });
  if (!response.ok) throw new Error('Failed to generate token');
  return response.json();
}

export async function callNextPatient(doctorId: string) {
  const response = await fetch(`${API_BASE_URL}/queue/next/${doctorId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to call next patient');
  // Returns empty if queue is empty, handle carefully
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function markTokenAction(tokenId: string, action: 'SKIP' | 'ABSENT' | 'COMPLETE') {
  const response = await fetch(`${API_BASE_URL}/queue/action/${tokenId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error('Failed to mark token action');
  return response.json();
}

export async function getTokenStatus(tokenNumber: string) {
  const response = await fetch(`${API_BASE_URL}/tokens/status/${tokenNumber}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to fetch token status');
  return response.json();
}
