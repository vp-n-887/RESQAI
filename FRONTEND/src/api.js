const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Cannot reach the RESQAI backend. Check that the backend is running.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error || payload?.details || "The request could not be completed."
    );
  }
  return payload;
}

export const api = {
  getDashboard: () => request("/dashboard/stats"),
  createEmergency: (emergency) =>
    request("/emergencies", {
      method: "POST",
      body: JSON.stringify(emergency),
    }),
  getEmergencies: ({ search = "", status = "", history = false } = {}) => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if (history) query.set("history", "true");
    const suffix = query.size ? `?${query.toString()}` : "";
    return request(`/emergencies${suffix}`);
  },
  getAmbulances: () => request("/ambulances"),
  updateAmbulance: (id, values) =>
    request(`/ambulances/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    }),
  getHospitals: () => request("/hospitals"),
  updateHospital: (id, values) =>
    request(`/hospitals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    }),
};
