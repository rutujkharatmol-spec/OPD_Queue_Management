import { fetchWithOfflineSync } from './offlineSync';

// Use same-origin proxy in dev (see next.config.ts rewrites) to avoid CORS and startup race issues.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : '/api/v1';

export async function generateToken(
  patientId?: string,
  departmentId?: string,
  doctorId?: string,
  priority: string = 'NORMAL',
  patientData?: { firstName?: string; lastName?: string; phone?: string; uhid?: string; }
) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/tokens`, {
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
  if (!response.ok) {
    const text = await response.text();
    console.error(`generateToken failed: ${response.status} ${response.statusText} - ${text}`);
    throw new Error('Failed to generate token');
  }
  return response.json();
}

export async function callNextPatient(departmentId: string, roomNumber: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/next/${departmentId}`, {
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
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/action/${tokenId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!response.ok) throw new Error('Failed to mark token action');
  return response.json();
}

export async function getTokenStatus(tokenNumber: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/tokens/status/${tokenNumber}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to fetch token status');
  return response.json();
}

export async function getDepartments() {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments`);
  if (!response.ok) throw new Error('Failed to fetch departments');
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createDepartment(name: string, code: string, description?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code, description }),
  });
  if (!response.ok) throw new Error('Failed to create department');
  return response.json();
}

export async function updateDepartment(id: string, name: string, code: string, description?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code, description }),
  });
  if (!response.ok) throw new Error('Failed to update department');
  return response.json();
}

export async function deleteDepartment(id: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/departments/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete department');
  return response.json();
}

export async function recallPatient(departmentId: string, roomNumber: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/queue/recall/${departmentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to recall patient');
  }
  return response.json();
}

export async function searchTokens(query: string, departmentId?: string) {
  const params = new URLSearchParams({ q: query });
  if (departmentId) params.append('departmentId', departmentId);
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/tokens/search?${params.toString()}`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function getDepartmentAnalytics(departmentId?: string, date?: string) {
  const url = departmentId
    ? `${API_BASE_URL}/queue/analytics/${departmentId}${date ? `?date=${date}` : ''}`
    : `${API_BASE_URL}/queue/analytics${date ? `?date=${date}` : ''}`;
  const response = await fetchWithOfflineSync(url);
  if (!response.ok) throw new Error('Failed to fetch analytics');
  return response.json();
}

export async function getRooms(departmentId?: string) {
  const url = departmentId ? `${API_BASE_URL}/settings/rooms?departmentId=${departmentId}` : `${API_BASE_URL}/settings/rooms`;
  const response = await fetchWithOfflineSync(url);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function createRoom(roomNumber: string, isActive: boolean = true, departmentId?: string, doctorName?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/settings/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, isActive, departmentId, doctorName }),
  });
  if (!response.ok) throw new Error('Failed to create room');
  return response.json();
}

export async function updateRoom(id: string, roomNumber?: string, isActive?: boolean, doctorName?: string) {
  const response = await fetchWithOfflineSync(`${API_BASE_URL}/settings/rooms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomNumber, isActive, doctorName }),
  });
  if (!response.ok) throw new Error('Failed to update room');
  return response.json();
}
