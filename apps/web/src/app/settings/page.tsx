"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, Settings as SettingsIcon, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { API_BASE_URL } from '../../lib/api';

interface Room {
  id: string;
  roomNumber: string;
  isActive: boolean;
}

export default function SettingsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/settings/rooms`);
      if (res.ok) {
        setRooms(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNumber.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/settings/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomNumber: newRoomNumber.trim() })
      });
      if (res.ok) {
        setNewRoomNumber('');
        fetchRooms();
      }
    } catch (err) {
      console.error('Failed to add room', err);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/settings/rooms/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchRooms();
      }
    } catch (err) {
      console.error('Failed to delete room', err);
    }
  };

  const startEditing = (room: Room) => {
    setEditingRoomId(room.id);
    setEditRoomNumber(room.roomNumber);
  };

  const saveEdit = async (id: string) => {
    if (!editRoomNumber.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/settings/rooms/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomNumber: editRoomNumber.trim() })
      });
      if (res.ok) {
        setEditingRoomId(null);
        fetchRooms();
      }
    } catch (err) {
      console.error('Failed to update room', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 lg:p-10">
      <header className="flex justify-between items-center mb-10 max-w-5xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">System Settings</h1>
            <p className="text-slate-500 font-medium text-sm">Configure OPD parameters</p>
          </div>
        </div>
        <Link href="/" className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center gap-2">
          <Home size={18} /> Back to Home
        </Link>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">

        {/* Rooms Configuration */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xl font-bold text-slate-800">Consultation Rooms</h2>
            <p className="text-slate-500 text-sm mt-1">Manage the rooms available for doctors to assign patients.</p>
          </div>

          <div className="p-6 lg:p-8">
            <form onSubmit={handleAddRoom} className="flex gap-4 mb-8">
              <input
                type="text"
                value={newRoomNumber}
                onChange={(e) => setNewRoomNumber(e.target.value)}
                placeholder="Enter new room number (e.g. 101)"
                className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <button
                type="submit"
                disabled={!newRoomNumber.trim()}
                className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus size={20} /> Add Room
              </button>
            </form>

            {loading ? (
              <div className="text-center py-10 text-slate-400 font-medium animate-pulse">Loading rooms...</div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-10 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No rooms configured yet. Add one above.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map(room => (
                  <div key={room.id} className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow group">

                    {editingRoomId === room.id ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={editRoomNumber}
                          onChange={(e) => setEditRoomNumber(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                          autoFocus
                        />
                        <button onClick={() => saveEdit(room.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                          <Check size={18} />
                        </button>
                        <button onClick={() => setEditingRoomId(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-black">
                            R
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-lg">{room.roomNumber}</p>
                            <p className="text-xs text-slate-400 font-medium">{room.isActive ? 'Active' : 'Inactive'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEditing(room)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDeleteRoom(room.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
