export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1` : 'http://localhost:4000/api/v1';

export async function generateToken(
  patientId: string, 
  departmentId: string, 
  doctorId: string, 
  priority: string,
  patientData?: { firstName: string; lastName: string; phone: string; uhid: string; }
) {
  const response = await fetch(`${API_BASE_URL}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      patientId, 
      departmentId, 
      doctorId, 
      priority,
      ...(patientData || {})
    }),
  });
  if (!response.ok) throw new Error('Failed to generate token');
  return response.json();
}

export async function callNextPatient(departmentId: string, roomNumber: string) {
  const response = await fetch(`${API_BASE_URL}/queue/next/${departmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber }),
  });
  if (!response.ok) throw new Error('Failed to call next patient');
  // Returns empty if queue is empty, handle carefully
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function markTokenAction(tokenId: string, action: 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE') {
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

export async function getDepartments() {
  const response = await fetch(`${API_BASE_URL}/departments`);
  if (!response.ok) throw new Error('Failed to fetch departments');
  return response.json();
}

export async function createDepartment(name: string, code: string, description?: string) {
  const response = await fetch(`${API_BASE_URL}/departments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code, description }),
  });
  if (!response.ok) throw new Error('Failed to create department');
  return response.json();
}

export async function getRooms(departmentId?: string) {
  const url = departmentId ? `${API_BASE_URL}/settings/rooms?departmentId=${departmentId}` : `${API_BASE_URL}/settings/rooms`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch rooms');
  return response.json();
}

export async function createRoom(roomNumber: string, isActive: boolean = true, departmentId?: string) {
  const response = await fetch(`${API_BASE_URL}/settings/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, isActive, departmentId }),
  });
  if (!response.ok) throw new Error('Failed to create room');
  return response.json();
}
