"use client";

import { useState, useEffect, FormEvent } from "react";

interface City {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

interface WeatherData {
  temperature: number;
  weathercode: number;
  windspeed: number;
}

function getWeatherLabel(code: number): string {
  if (code === 0) return "Clear sky ☀️";
  if (code >= 1 && code <= 3) return "Partly cloudy ⛅";
  if (code >= 45 && code <= 48) return "Fog 🌫️";
  if (code >= 51 && code <= 67) return "Rain 🌧️";
  if (code >= 71 && code <= 77) return "Snow ❄️";
  if (code >= 80 && code <= 82) return "Showers 🌦️";
  if (code >= 95 && code <= 99) return "Thunderstorm ⛈️";
  return `Unknown (${code})`;
}

export default function Home() {
  const [cities, setCities] = useState<City[]>([]);
  const [newCityName, setNewCityName] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [weather, setWeather] = useState<Record<string, WeatherData>>({});
  const [weatherLoading, setWeatherLoading] = useState<Record<string, boolean>>(
    {},
  );

  async function fetchCities() {
    try {
      const res = await fetch("/api/cities");
      const data = await res.json();
      setCities(data);
    } catch (err) {
      console.error("Failed to fetch cities:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCities();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = newCityName.trim();
    if (!trimmed) return;

    await fetch("/api/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setNewCityName("");
    fetchCities();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/cities/${id}`, { method: "DELETE" });
    setWeather((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    fetchCities();
  }

  function startEdit(city: City) {
    setEditingId(city.id);
    setEditName(city.name);
  }

  async function handleSaveEdit(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;

    await fetch(`/api/cities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setEditingId(null);
    setEditName("");
    fetchCities();
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function fetchWeather(id: string) {
    setWeatherLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/weather/${id}`);
      const data = await res.json();
      if (data.current_weather) {
        setWeather((prev) => ({ ...prev, [id]: data.current_weather }));
      }
    } catch (err) {
      console.error("Failed to fetch weather:", err);
    } finally {
      setWeatherLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Weather Bookmarks
        </h1>

        <form onSubmit={handleAdd} className="flex gap-2 mb-8">
          <input
            type="text"
            value={newCityName}
            onChange={(e) => setNewCityName(e.target.value)}
            placeholder="Add a city..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Add
          </button>
        </form>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading cities...</p>
        ) : cities.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No bookmarked cities yet. Add one above.
          </p>
        ) : (
          <ul className="space-y-3">
            {cities.map((city) => (
              <li
                key={city.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  {editingId === city.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(city.id);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(city.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">
                          {city.name}
                        </p>
                        {city.latitude != null && city.longitude != null && (
                          <p className="text-xs text-gray-400">
                            {city.latitude.toFixed(2)},{" "}
                            {city.longitude.toFixed(2)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => fetchWeather(city.id)}
                          disabled={weatherLoading[city.id]}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {weatherLoading[city.id] ? "..." : "Weather"}
                        </button>
                        <button
                          onClick={() => startEdit(city)}
                          className="rounded px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(city.id)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {weather[city.id] && (
                  <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    <span className="font-medium">
                      {weather[city.id].temperature}°C
                    </span>{" "}
                    &middot; {getWeatherLabel(weather[city.id].weathercode)}{" "}
                    &middot; Wind: {weather[city.id].windspeed} km/h
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
