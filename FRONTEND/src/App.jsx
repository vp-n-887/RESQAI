import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ambulance,
  BedDouble,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Hospital,
  LayoutDashboard,
  MapPin,
  Menu,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import locations from "./locations";
import "./App.css";

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "emergencies", label: "Emergencies", icon: AlertTriangle },
  { id: "ambulances", label: "Ambulances", icon: Ambulance },
  { id: "hospitals", label: "Hospitals", icon: Hospital },
  { id: "history", label: "History", icon: ClipboardList },
];

const pageTitles = {
  dashboard: ["Emergency response dashboard", "Monitor active incidents and coordinate a response."],
  emergencies: ["Active emergencies", "Review incident details and current resource assignments."],
  ambulances: ["Ambulance fleet", "Review availability and maintain fleet details."],
  hospitals: ["Hospital network", "Review facilities, capacity, and destination details."],
  history: ["Emergency history", "Review completed and resolved incidents."],
};

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function StatusBadge({ children, tone }) {
  const label = children || "Unknown";
  const normalized = tone || String(label).toLowerCase().replaceAll(" ", "-");
  return <span className={`badge badge-${normalized}`}>{label}</span>;
}

function ErrorNotice({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="notice notice-error" role="alert">
      <div>
        <strong>Something went wrong</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="button button-secondary button-small" type="button" onClick={onRetry}>
          <RefreshCw size={15} /> Retry
        </button>
      )}
    </div>
  );
}

function LoadingState({ label = "Loading records…" }) {
  return (
    <div className="state-panel" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="state-panel state-empty">
      <CheckCircle2 size={25} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function Field({ label, id, children, hint }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [form, setForm] = useState({
    emergency_type: "Road Accident",
    location: "Tambaram",
    latitude: locations.Tambaram.latitude,
    longitude: locations.Tambaram.longitude,
    patient_count: "1",
    description: "",
    priority: "High",
  });
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");
    try {
      setStats(await api.getDashboard());
    } catch (error) {
      setStatsError(error.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(refreshStats, 0);
    return () => clearTimeout(timer);
  }, [refreshStats]);

  const setField = (event) => {
    const { name, value } = event.target;
    if (name === "location") {
      const coordinate = locations[value];
      setForm((current) => ({
        ...current,
        location: value,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      }));
      return;
    }
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitEmergency = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setResult(null);
    try {
      const response = await api.createEmergency({
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        patient_count: Number(form.patient_count),
      });
      setResult(response.data);
      await refreshStats();
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="stat-grid" aria-label="Current resource overview">
        <StatCard icon={AlertTriangle} label="Active emergencies" value={stats?.emergencies?.active} loading={statsLoading} tone="red" />
        <StatCard icon={Ambulance} label="Available ambulances" value={stats?.ambulances?.available} loading={statsLoading} tone="blue" />
        <StatCard icon={Hospital} label="Available hospitals" value={stats?.hospitals?.available} loading={statsLoading} tone="green" />
        <StatCard icon={Activity} label="Fleet size" value={stats?.ambulances?.total} loading={statsLoading} tone="slate" />
      </section>
      <ErrorNotice message={statsError} onRetry={refreshStats} />

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div className="heading-icon heading-red"><Siren size={19} /></div>
            <div>
              <h2>Report an emergency</h2>
              <p>Submit an incident for coordinated response.</p>
            </div>
          </div>

          <form className="form-grid" onSubmit={submitEmergency}>
            <Field id="emergency_type" label="Emergency type">
              <select id="emergency_type" name="emergency_type" value={form.emergency_type} onChange={setField} required>
                <option>Road Accident</option>
                <option>Medical Emergency</option>
                <option>Cardiac Emergency</option>
                <option>Fire Emergency</option>
              </select>
            </Field>
            <Field id="priority" label="Priority">
              <select id="priority" name="priority" value={form.priority} onChange={setField} required>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </Field>
            <Field id="emergency_location" label="Incident location">
              <select id="emergency_location" name="location" value={form.location} onChange={setField} required>
                {Object.keys(locations).map((location) => <option key={location}>{location}</option>)}
              </select>
            </Field>
            <Field id="patient_count" label="Number of patients">
              <input id="patient_count" name="patient_count" type="number" min="1" step="1" value={form.patient_count} onChange={setField} required />
            </Field>
            <Field id="description" label="Incident details">
              <textarea id="description" name="description" rows="3" value={form.description} onChange={setField} placeholder="Describe the emergency…" required />
            </Field>
            <button className="button button-danger form-submit" type="submit" disabled={submitting}>
              <Siren size={17} /> {submitting ? "Coordinating response…" : "Request emergency response"}
            </button>
          </form>
          <ErrorNotice message={submitError} />

          {result && (
            <div className="response-result" role="status">
              <div className="result-title"><CheckCircle2 size={19} /> Emergency coordinated</div>
              <p>Incident #{result.emergency.id} · Assignment #{result.assignment.id}</p>
              <div className="result-resources">
                <span><Ambulance size={15} /> {result.ambulance.vehicle_number} · {result.ambulance.eta} min</span>
                <span><Hospital size={15} /> {result.hospital.name} · {result.hospital.eta} min</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel response-overview">
          <div className="panel-heading">
            <div className="heading-icon heading-blue"><Activity size={19} /></div>
            <div>
              <h2>Response overview</h2>
              <p>Current system totals from the backend.</p>
            </div>
            <button className="icon-button" type="button" onClick={refreshStats} aria-label="Refresh dashboard statistics">
              <RefreshCw size={17} />
            </button>
          </div>
          {statsLoading ? <LoadingState label="Loading dashboard…" /> : (
            <div className="overview-list">
              <OverviewRow label="Emergencies recorded" value={stats?.emergencies?.total} />
              <OverviewRow label="Ambulances on duty" value={stats?.ambulances?.busy} />
              <OverviewRow label="Hospitals at capacity" value={stats?.hospitals?.full} />
            </div>
          )}
          <div className="info-callout">
            <ShieldAlert size={18} />
            <span>Demo mode: this prototype has no sign-in or role-based access. Do not use it for production operations.</span>
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, loading, tone }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-${tone}`}><Icon size={19} /></div>
      <div>
        <span>{label}</span>
        <strong>{loading ? "…" : (value ?? "—")}</strong>
      </div>
    </article>
  );
}

function OverviewRow({ label, value }) {
  return <div className="overview-row"><span>{label}</span><strong>{value ?? "—"}</strong></div>;
}

function EmergencyListPage({ history = false }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await api.getEmergencies({ search, status, history });
        if (current) setRecords(response.data);
      } catch (requestError) {
        if (current) setError(requestError.message);
      } finally {
        if (current) setLoading(false);
      }
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [history, refreshKey, search, status]);

  return (
    <section className="panel">
      <div className="list-toolbar">
        <div className="search-control">
          <Search size={17} aria-hidden="true" />
          <input aria-label="Search emergencies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search type, location, description…" />
        </div>
        <label className="filter-control">
          <span>Status</span>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {history ? (
              <>
                <option value="Resolved">Resolved</option>
                <option value="Completed">Completed</option>
              </>
            ) : (
              <>
                <option value="Active">Active</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
              </>
            )}
          </select>
        </label>
        <button className="button button-secondary" type="button" onClick={() => setRefreshKey((key) => key + 1)}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <ErrorNotice message={error} onRetry={() => setRefreshKey((key) => key + 1)} />
      {loading ? <LoadingState label="Loading emergencies…" /> : records.length === 0 ? (
        <EmptyState title={history ? "No completed emergencies" : "No active emergencies"} description="There are no records matching these filters." />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Incident</th>
                <th>Priority</th>
                <th>Patients</th>
                <th>Ambulance</th>
                <th>Destination hospital</th>
                <th>Status</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {records.map((emergency) => (
                <tr key={emergency.id}>
                  <td>
                    <strong>#{emergency.id} · {emergency.emergency_type}</strong>
                    <span className="table-subtext"><MapPin size={13} /> {emergency.location}</span>
                    {emergency.description && <span className="table-subtext">{emergency.description}</span>}
                  </td>
                  <td><StatusBadge>{emergency.priority}</StatusBadge></td>
                  <td>{emergency.patient_count ?? "—"}</td>
                  <td>{emergency.ambulance?.vehicle_number || "Not assigned"}</td>
                  <td>{emergency.hospital?.name || "Not assigned"}</td>
                  <td>
                    <div className="status-stack">
                      <StatusBadge>{emergency.status || "Unknown"}</StatusBadge>
                      {emergency.assignment && <StatusBadge>{emergency.assignment.status || "Assigned"}</StatusBadge>}
                    </div>
                  </td>
                  <td>{formatDate(emergency.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="result-count">{records.length} {records.length === 1 ? "incident" : "incidents"}</p>
    </section>
  );
}

function AmbulancesPage() {
  const [records, setRecords] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.getAmbulances();
      setRecords(response.data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh, refreshKey]);

  const save = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      vehicle_number: data.get("vehicle_number"),
      location: data.get("location"),
      latitude: data.get("latitude"),
      longitude: data.get("longitude"),
      ambulance_type: data.get("ambulance_type"),
      equipment: data.get("equipment"),
    };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.updateAmbulance(editing.id, body);
      setRecords((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      setEditing(null);
      setNotice(`Ambulance ${response.data.vehicle_number} updated.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DemoNotice />
      <ManagementNotice message={notice} />
      <section className="panel">
        <ListHeader count={records.length} label="vehicles" onRefresh={() => setRefreshKey((key) => key + 1)} />
        <ErrorNotice message={error} onRetry={refresh} />
        {loading ? <LoadingState label="Loading ambulance fleet…" /> : records.length === 0 ? (
          <EmptyState title="No ambulances found" description="Fleet records will appear here when available." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Vehicle</th><th>Status</th><th>Unit type</th><th>Location</th><th>Coordinates</th><th>Equipment</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {records.map((ambulance) => (
                  <tr key={ambulance.id}>
                    <td><strong>{ambulance.vehicle_number}</strong><span className="table-subtext">ID #{ambulance.id}</span></td>
                    <td><StatusBadge>{ambulance.status}</StatusBadge></td>
                    <td>{ambulance.ambulance_type || "—"}</td>
                    <td>{ambulance.location || "—"}</td>
                    <td>{formatCoordinate(ambulance.latitude)}, {formatCoordinate(ambulance.longitude)}</td>
                    <td>{ambulance.equipment || "—"}</td>
                    <td><button className="button button-secondary button-small" type="button" onClick={() => setEditing(ambulance)}><Pencil size={14} /> Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && (
        <EditDialog title={`Edit ${editing.vehicle_number}`} onClose={() => setEditing(null)} onSubmit={save} saving={saving} error={error}>
          <div className="form-grid">
            <Field id="vehicle_number" label="Registration">
              <input id="vehicle_number" name="vehicle_number" defaultValue={editing.vehicle_number} required />
            </Field>
            <Field id="ambulance_type" label="Unit type">
              <select id="ambulance_type" name="ambulance_type" defaultValue={editing.ambulance_type} required><option>Basic</option><option>Advanced</option></select>
            </Field>
            <Field id="ambulance_location" label="Location">
              <input id="ambulance_location" name="location" defaultValue={editing.location} required />
            </Field>
            <Field id="ambulance_status" label="Operational status">
              <input id="ambulance_status" value={editing.status || "Unknown"} readOnly aria-readonly="true" />
            </Field>
            <Field id="ambulance_latitude" label="Latitude">
              <input id="ambulance_latitude" name="latitude" type="number" min="-90" max="90" step="any" defaultValue={editing.latitude ?? ""} required />
            </Field>
            <Field id="ambulance_longitude" label="Longitude">
              <input id="ambulance_longitude" name="longitude" type="number" min="-180" max="180" step="any" defaultValue={editing.longitude ?? ""} required />
            </Field>
            <Field id="ambulance_equipment" label="Equipment">
              <textarea id="ambulance_equipment" name="equipment" rows="2" defaultValue={editing.equipment || ""} />
            </Field>
          </div>
        </EditDialog>
      )}
    </>
  );
}

function HospitalsPage() {
  const [records, setRecords] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.getHospitals();
      setRecords(response.data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh, refreshKey]);

  const save = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parseOptionalCount = (value) => value.trim() === "" ? undefined : Number(value);
    const totalRooms = Number(data.get("total_rooms"));
    const availableRooms = Number(data.get("available_rooms"));
    if (!Number.isInteger(totalRooms) || totalRooms < 0 ||
        !Number.isInteger(availableRooms) || availableRooms < 0 ||
        availableRooms > totalRooms) {
      setError("Enter non-negative whole room counts; available rooms cannot exceed total rooms.");
      return;
    }
    const body = {
      name: data.get("name"),
      location: data.get("location"),
      latitude: data.get("latitude"),
      longitude: data.get("longitude"),
      status: data.get("status"),
      trauma_care: data.get("trauma_care"),
      icu_available: data.get("icu_available"),
      specialties: data.get("specialties"),
      total_rooms: totalRooms,
      available_rooms: availableRooms,
    };
    const beds = parseOptionalCount(data.get("available_beds"));
    if (beds !== undefined) body.available_beds = beds;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.updateHospital(editing.id, body);
      setRecords((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      setEditing(null);
      setNotice(`${response.data.name} updated.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DemoNotice />
      <ManagementNotice message={notice} />
      <section className="panel">
        <ListHeader count={records.length} label="hospitals" onRefresh={() => setRefreshKey((key) => key + 1)} />
        <ErrorNotice message={error} onRetry={refresh} />
        {loading ? <LoadingState label="Loading hospitals…" /> : records.length === 0 ? (
          <EmptyState title="No hospitals found" description="Hospital records will appear here when available." />
        ) : (
          <div className="hospital-grid">
            {records.map((hospital) => (
              <article className="hospital-card" key={hospital.id}>
                <div className="hospital-card-top">
                  <div className="heading-icon heading-green"><Hospital size={19} /></div>
                  <StatusBadge>{hospital.status}</StatusBadge>
                </div>
                <p className="table-subtext">Facility ID #{hospital.id}</p>
                <h3>{hospital.name}</h3>
                <p className="hospital-location"><MapPin size={14} /> {hospital.location}</p>
                <div className="hospital-facts">
                  <span><BedDouble size={15} /> {hospital.available_beds ?? "—"} beds</span>
                  <span><Users size={15} /> {hospital.available_rooms ?? "—"} / {hospital.total_rooms ?? "—"} rooms</span>
                </div>
                <p className="hospital-specialties">{hospital.specialties || "No facility details listed"}</p>
                <button className="button button-secondary button-small" type="button" onClick={() => setEditing(hospital)}><Pencil size={14} /> Edit details</button>
              </article>
            ))}
          </div>
        )}
      </section>
      {editing && (
        <EditDialog title={`Edit ${editing.name}`} onClose={() => setEditing(null)} onSubmit={save} saving={saving} error={error}>
          <div className="form-grid">
            <Field id="hospital_name" label="Hospital name"><input id="hospital_name" name="name" defaultValue={editing.name} required /></Field>
            <Field id="hospital_location" label="Address / location"><input id="hospital_location" name="location" defaultValue={editing.location} required /></Field>
            <Field id="hospital_latitude" label="Latitude"><input id="hospital_latitude" name="latitude" type="number" min="-90" max="90" step="any" defaultValue={editing.latitude ?? ""} required /></Field>
            <Field id="hospital_longitude" label="Longitude"><input id="hospital_longitude" name="longitude" type="number" min="-180" max="180" step="any" defaultValue={editing.longitude ?? ""} required /></Field>
            <Field id="hospital_status" label="Operational status"><select id="hospital_status" name="status" defaultValue={editing.status || "Available"}><option>Available</option><option>Full</option></select></Field>
            <Field id="hospital_trauma" label="Trauma care"><select id="hospital_trauma" name="trauma_care" defaultValue={editing.trauma_care || "No"}><option>Yes</option><option>No</option></select></Field>
            <Field id="hospital_icu" label="ICU available"><select id="hospital_icu" name="icu_available" defaultValue={editing.icu_available || "No"}><option>Yes</option><option>No</option></select></Field>
            <Field id="available_beds" label="Available beds"><input id="available_beds" name="available_beds" type="number" min="0" step="1" defaultValue={editing.available_beds ?? ""} /></Field>
            <Field id="total_rooms" label="Total rooms"><input id="total_rooms" name="total_rooms" type="number" min="0" step="1" defaultValue={editing.total_rooms ?? ""} required /></Field>
            <Field id="available_rooms" label="Available rooms"><input id="available_rooms" name="available_rooms" type="number" min="0" step="1" defaultValue={editing.available_rooms ?? ""} required /></Field>
            <Field id="hospital_specialties" label="Facilities / services"><textarea id="hospital_specialties" name="specialties" rows="3" defaultValue={editing.specialties || ""} /></Field>
          </div>
        </EditDialog>
      )}
    </>
  );
}

function DemoNotice() {
  return (
    <div className="notice notice-warning">
      <ShieldAlert size={18} />
      <p><strong>Development demo mode.</strong> Authentication and staff authorization are not configured; management edits are not production-secure.</p>
    </div>
  );
}

function ManagementNotice({ message }) {
  return message ? <div className="notice notice-success" role="status"><CheckCircle2 size={17} /> {message}</div> : null;
}

function ListHeader({ count, label, onRefresh }) {
  return (
    <div className="list-header">
      <div><h2>Database records</h2><p>{count} {label}</p></div>
      <button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
    </div>
  );
}

function EditDialog({ title, onClose, onSubmit, saving, error, children }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading">
          <div><h2 id="dialog-title">{title}</h2><p>Changes are saved to the backend database.</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close editor"><X size={19} /></button>
        </div>
        <form onSubmit={onSubmit}>
          {children}
          <ErrorNotice message={error} />
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function formatCoordinate(value) {
  return value == null ? "—" : Number(value).toFixed(4);
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  let content;
  if (page === "dashboard") {
    content = <DashboardPage />;
  } else if (page === "emergencies") {
    content = <EmergencyListPage />;
  } else if (page === "history") {
    content = <EmergencyListPage history />;
  } else if (page === "ambulances") {
    content = <AmbulancesPage />;
  } else {
    content = <HospitalsPage />;
  }

  const [title, description] = pageTitles[page];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Ambulance size={23} /></div>
          <div><strong>RESQAI</strong><span>Emergency network</span></div>
          <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${page === id ? "nav-active" : ""}`} type="button" aria-current={page === id ? "page" : undefined} onClick={() => { setPage(id); setSidebarOpen(false); }}>
              <Icon size={18} /><span>{label}</span>
              {id === "emergencies" && <span className="nav-dot" aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-indicator"><span /> API workspace</div>
          <p>RESQAI · Response coordination</p>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button menu-toggle" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumb">RESQAI <span>/</span> {navigation.find((item) => item.id === page)?.label}</div>
          <div className="topbar-right"><span className="live-label"><span /> Prototype</span><time>{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div><p className="eyebrow">OPERATIONS</p><h1>{title}</h1><p>{description}</p></div>
            {page === "dashboard" && <div className="date-label"><Clock3 size={15} /> {clock.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</div>}
          </div>
          {content}
        </div>
      </main>
    </div>
  );
}

export default App;
