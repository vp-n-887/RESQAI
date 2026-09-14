import { useEffect, useState } from "react";
import locations from "./locations";
import {
  Ambulance,
  Hospital,
  AlertTriangle,
  LayoutDashboard,
  ClipboardList,
  Activity,
  MapPin,
  Clock,
  Users,
  CheckCircle2,
  Menu,
  X,
} from "lucide-react";

function App() {
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
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
  ambulances: {
    total: 0,
    available: 0,
    busy: 0,
  },
  hospitals: {
    total: 0,
    available: 0,
    full: 0,
  },
  emergencies: {
    total: 0,
    active: 0,
  },
});

useEffect(() => {
  const fetchStats = async () => {
    try {
      const response = await fetch(
        "http://localhost:5000/api/dashboard/stats"
      );

      const data = await response.json();

      setStats({
        ambulances: {
          total: Number(data.ambulances.total),
          available: Number(data.ambulances.available),
          busy: Number(data.ambulances.busy),
        },
        hospitals: {
          total: Number(data.hospitals.total),
          available: Number(data.hospitals.available),
          full: Number(data.hospitals.full),
        },
        emergencies: {
          total: Number(data.emergencies.total),
          active: Number(data.emergencies.active),
        },
      });
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    }
  };

  fetchStats();
}, []);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        "http://localhost:5000/api/emergencies",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            latitude: Number(form.latitude),
            longitude: Number(form.longitude),
            patient_count: Number(form.patient_count),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || "Emergency request failed");
      }

      setResult(data.data);
      const statsResponse = await fetch(
  "http://localhost:5000/api/dashboard/stats"
);

const statsData = await statsResponse.json();

setStats({
  ambulances: {
    total: Number(statsData.ambulances.total),
    available: Number(statsData.ambulances.available),
    busy: Number(statsData.ambulances.busy),
  },
  hospitals: {
    total: Number(statsData.hospitals.total),
    available: Number(statsData.hospitals.available),
    full: Number(statsData.hospitals.full),
  },
  emergencies: {
    total: Number(statsData.emergencies.total),
    active: Number(statsData.emergencies.active),
  },
});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f14] text-white">

      {/* MOBILE HEADER */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-red-500">
            RESQAI
          </h1>
          <p className="text-xs text-slate-500">
            Emergency Command
          </p>
        </div>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 bg-slate-800 rounded-lg"
        >
          {sidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      <div className="flex">

        {/* SIDEBAR */}
        <aside
          className={`
            fixed lg:static z-50
            top-0 left-0
            h-screen
            w-64
            bg-[#10151c]
            border-r border-slate-800
            p-5
            transition-transform
            duration-300
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >

          {/* LOGO */}
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="bg-red-600 p-2 rounded-xl">
                <Ambulance size={25} />
              </div>

              <div>
                <h1 className="text-xl font-bold">
                  RESQAI
                </h1>

                <p className="text-xs text-slate-500">
                  Emergency Command
                </p>
              </div>
            </div>
          </div>

          {/* NAVIGATION */}
          <nav className="space-y-2">

            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-600 text-white">
              <LayoutDashboard size={19} />
              Dashboard
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white">
              <AlertTriangle size={19} />
              Emergencies
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white">
              <Ambulance size={19} />
              Ambulances
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white">
              <Hospital size={19} />
              Hospitals
            </button>

            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white">
              <ClipboardList size={19} />
              History
            </button>

          </nav>

          {/* SYSTEM STATUS */}
          <div className="absolute bottom-6 left-5 right-5 bg-slate-900 rounded-xl p-4 border border-slate-800">

            <div className="flex items-center gap-2 text-green-400 text-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              System Operational
            </div>

            <p className="text-xs text-slate-500 mt-2">
              Backend connected
            </p>

          </div>

        </aside>

        {/* MAIN */}
        <main className="flex-1 min-w-0">

          {/* HEADER */}
          <header className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-slate-800">

            <div>
              <h2 className="text-2xl font-semibold">
                Emergency Response Dashboard
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                Monitor and coordinate emergency response
              </p>
            </div>

            <div className="flex items-center gap-3">

              <div className="flex items-center gap-2 bg-green-950 border border-green-900 px-4 py-2 rounded-full text-green-400 text-sm">
                <Activity size={16} />
                All Systems Operational
              </div>

            </div>

          </header>

          <div className="p-5 lg:p-8 max-w-[1500px] mx-auto">

            {/* STAT CARDS */}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-7">

              <div className="bg-[#10151c] border border-slate-800 rounded-2xl p-5">
                <div className="flex justify-between">
                  <div className="bg-red-950 p-3 rounded-xl text-red-500">
                    <AlertTriangle size={22} />
                  </div>

                  <span className="text-xs text-slate-500">
                    Current
                  </span>
                </div>

                <p className="text-3xl font-bold mt-5">
  {stats.emergencies.active}
</p>

                <p className="text-sm text-slate-500">
                  Active Emergencies
                </p>
              </div>

              <div className="bg-[#10151c] border border-slate-800 rounded-2xl p-5">

                <div className="bg-blue-950 p-3 rounded-xl text-blue-400 w-fit">
                  <Ambulance size={22} />
                </div>

                <p className="text-3xl font-bold mt-5">
  {stats.ambulances.available}
</p>

<p className="text-sm text-slate-500">
  Available Ambulances
</p>

                <p className="text-sm text-slate-500">
                  Ambulance Status
                </p>

              </div>

              <div className="bg-[#10151c] border border-slate-800 rounded-2xl p-5">

                <div className="bg-purple-950 p-3 rounded-xl text-purple-400 w-fit">
                  <Hospital size={22} />
                </div>

              <p className="text-3xl font-bold mt-5">
  {stats.hospitals.available}
</p>

<p className="text-sm text-slate-500">
  Available Hospitals
</p> 

              </div>

              <div className="bg-[#10151c] border border-slate-800 rounded-2xl p-5">

                <div className="bg-green-950 p-3 rounded-xl text-green-400 w-fit">
                  <CheckCircle2 size={22} />
                </div>

                <p className="text-3xl font-bold mt-5">
                  Online
                </p>

                <p className="text-sm text-slate-500">
                  RESQAI System
                </p>

              </div>

            </div>

            {/* MAIN GRID */}

            <div className="grid xl:grid-cols-5 gap-6">

              {/* EMERGENCY FORM */}

              <div className="xl:col-span-2 bg-[#10151c] border border-slate-800 rounded-2xl p-6">

                <div className="flex items-center gap-3 mb-6">

                  <div className="bg-red-950 p-3 rounded-xl text-red-500">
                    <AlertTriangle size={22} />
                  </div>

                  <div>
                    <h2 className="text-xl font-semibold">
                      Report Emergency
                    </h2>

                    <p className="text-xs text-slate-500">
                      Create a new emergency request
                    </p>
                  </div>

                </div>

                <form onSubmit={handleSubmit} className="space-y-5">

                  {/* TYPE */}

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Emergency Type
                    </label>

                    <select
                      name="emergency_type"
                      value={form.emergency_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          emergency_type: e.target.value,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 outline-none focus:border-red-500"
                    >
                      <option>Road Accident</option>
                      <option>Medical Emergency</option>
                      <option>Cardiac Emergency</option>
                      <option>Fire Emergency</option>
                    </select>
                  </div>

                  {/* LOCATION */}

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Emergency Location
                    </label>

                    <div className="relative">

                      <MapPin
                        size={18}
                        className="absolute left-3 top-4 text-slate-500"
                      />

                      <select
                        name="location"
                        value={form.location}
                        onChange={(e) => {
                          const selectedLocation = e.target.value;
                          const coordinates =
                            locations[selectedLocation];

                          setForm({
                            ...form,
                            location: selectedLocation,
                            latitude: coordinates.latitude,
                            longitude: coordinates.longitude,
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 pl-10 outline-none focus:border-red-500"
                      >
                        {Object.keys(locations).map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>

                    </div>
                  </div>

                  {/* PATIENTS */}

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Number of Patients
                    </label>

                    <div className="relative">

                      <Users
                        size={18}
                        className="absolute left-3 top-4 text-slate-500"
                      />

                      <input
                        type="number"
                        min="1"
                        name="patient_count"
                        value={form.patient_count}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            patient_count: e.target.value,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 pl-10 outline-none focus:border-red-500"
                      />

                    </div>
                  </div>

                  {/* DESCRIPTION */}

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Description
                    </label>

                    <textarea
                      name="description"
                      value={form.description}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          description: e.target.value,
                        })
                      }
                      rows="3"
                      placeholder="Describe the emergency..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 outline-none focus:border-red-500 resize-none"
                    />
                  </div>

                  {/* PRIORITY */}

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Priority
                    </label>

                    <select
                      name="priority"
                      value={form.priority}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          priority: e.target.value,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 outline-none focus:border-red-500"
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-700 py-3.5 rounded-xl font-semibold transition"
                  >
                    {loading
                      ? "🚑 Coordinating Response..."
                      : "🚨 Request Emergency Response"}
                  </button>

                </form>

                {error && (
                  <div className="mt-5 bg-red-950 border border-red-800 text-red-300 p-4 rounded-xl">
                    ❌ {error}
                  </div>
                )}

              </div>

              {/* RESPONSE PANEL */}

              <div className="xl:col-span-3 bg-[#10151c] border border-slate-800 rounded-2xl p-6">

                <div className="flex items-center gap-3 mb-6">

                  <div className="bg-blue-950 p-3 rounded-xl text-blue-400">
                    <Activity size={22} />
                  </div>

                  <div>
                    <h2 className="text-xl font-semibold">
                      Response Center
                    </h2>

                    <p className="text-xs text-slate-500">
                      Real-time emergency coordination
                    </p>
                  </div>

                </div>

                {!result && !loading && (
                  <div className="flex flex-col items-center justify-center h-[500px] text-center">

                    <div className="bg-slate-900 p-6 rounded-full mb-5">
                      <Ambulance
                        size={45}
                        className="text-slate-600"
                      />
                    </div>

                    <h3 className="text-lg font-semibold text-slate-400">
                      No Active Emergency
                    </h3>

                    <p className="text-sm text-slate-600 mt-2 max-w-sm">
                      Submit an emergency request to begin
                      ambulance and hospital coordination.
                    </p>

                  </div>
                )}

                {loading && (
                  <div className="flex flex-col items-center justify-center h-[500px]">

                    <div className="text-red-500 mb-5 animate-pulse">
                      <Ambulance size={55} />
                    </div>

                    <h3 className="text-lg font-semibold">
                      Coordinating Emergency
                    </h3>

                    <p className="text-sm text-slate-500 mt-2">
                      Finding the best ambulance and hospital...
                    </p>

                  </div>
                )}

                {result && (
                  <div className="space-y-5">

                    {/* EMERGENCY SUMMARY */}

                    <div className="bg-red-950/40 border border-red-900 rounded-xl p-5">

                      <div className="flex items-center justify-between">

                        <div>
                          <p className="text-xs text-red-400 uppercase tracking-wider">
                            Active Emergency
                          </p>

                          <h3 className="text-xl font-semibold mt-1">
                            {result.emergency.emergency_type}
                          </h3>
                        </div>

                        <span className="px-3 py-1 rounded-full bg-red-600 text-sm font-semibold">
                          {result.emergency.priority}
                        </span>

                      </div>

                      <div className="flex flex-wrap gap-5 mt-4 text-sm text-slate-400">

                        <span className="flex items-center gap-2">
                          <MapPin size={15} />
                          {result.emergency.location}
                        </span>

                        <span className="flex items-center gap-2">
                          <Users size={15} />
                          {result.emergency.patient_count} Patient(s)
                        </span>

                      </div>

                    </div>

                    {/* RESPONSE CARDS */}

                    <div className="grid md:grid-cols-2 gap-5">

                      {/* AMBULANCE */}

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">

                        <div className="flex justify-between items-start">

                          <div className="bg-blue-950 p-3 rounded-xl text-blue-400">
                            <Ambulance size={22} />
                          </div>

                          <span className="text-xs bg-green-950 text-green-400 px-3 py-1 rounded-full">
                            Assigned
                          </span>

                        </div>

                        <p className="text-xs text-slate-500 mt-5">
                          AMBULANCE
                        </p>

                        <h3 className="text-xl font-bold mt-1">
                          {result.ambulance.vehicle_number}
                        </h3>

                        <p className="text-sm text-slate-500 mt-1">
                          {result.ambulance.ambulance_type} Unit
                        </p>

                        <div className="border-t border-slate-800 mt-5 pt-4 space-y-2">

                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">
                              Distance
                            </span>

                            <span>
                              {result.ambulance.distance} km
                            </span>
                          </div>

                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500 flex items-center gap-1">
                              <Clock size={14} />
                              ETA
                            </span>

                            <span className="text-red-400 font-semibold">
                              {result.ambulance.eta} min
                            </span>
                          </div>

                        </div>

                      </div>

                      {/* HOSPITAL */}

                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">

                        <div className="flex justify-between items-start">

                          <div className="bg-purple-950 p-3 rounded-xl text-purple-400">
                            <Hospital size={22} />
                          </div>

                          <span className="text-xs bg-green-950 text-green-400 px-3 py-1 rounded-full">
                            Selected
                          </span>

                        </div>

                        <p className="text-xs text-slate-500 mt-5">
                          DESTINATION HOSPITAL
                        </p>

                        <h3 className="text-xl font-bold mt-1">
                          {result.hospital.name}
                        </h3>

                        <p className="text-sm text-slate-500 mt-1">
                          {result.hospital.location}
                        </p>

                        <div className="border-t border-slate-800 mt-5 pt-4 space-y-2">

                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">
                              Available Beds
                            </span>

                            <span>
                              {result.hospital.available_beds}
                            </span>
                          </div>

                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500 flex items-center gap-1">
                              <Clock size={14} />
                              ETA
                            </span>

                            <span className="text-purple-400 font-semibold">
                              {result.hospital.eta} min
                            </span>
                          </div>

                        </div>

                      </div>

                    </div>

                    {/* ASSIGNMENT */}

                    <div className="bg-green-950/30 border border-green-900 rounded-xl p-5">

                      <div className="flex items-center gap-3">

                        <CheckCircle2
                          size={22}
                          className="text-green-400"
                        />

                        <div>
                          <h3 className="font-semibold text-green-400">
                            Emergency Successfully Coordinated
                          </h3>

                          <p className="text-xs text-slate-500 mt-1">
                            Assignment ID:{" "}
                            {result.assignment.id}
                          </p>
                        </div>

                      </div>

                    </div>

                  </div>
                )}

              </div>

            </div>

          </div>

        </main>

      </div>
    </div>
  );
}

export default App;