import React, { useEffect, useMemo, useState, useContext } from 'react';
import Layout from '../components/Layout';
import api from '../utils/api';
import { Bar, Doughnut } from 'react-chartjs-2';
import { AuthContext } from '../context/AuthContext';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const Analytics = () => {
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState({ total: 0, open: 0, done: 0, overdue: 0 });
  const [tasksPerDay, setTasksPerDay] = useState([]);
  const [status, setStatus] = useState([]);
  const [avg, setAvg] = useState({ avgHours: 0 });
  const [workload, setWorkload] = useState([]);
  const [devPerformance, setDevPerformance] = useState({ developers: [], selected: null });
  const [movingTickets, setMovingTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('all'); // all | projectId
  const [stateFilter, setStateFilter] = useState('all'); // all | open | closed
  const [workloadSort, setWorkloadSort] = useState('total'); // total | open | done
  const [selectedDevId, setSelectedDevId] = useState('all');
  const [showDetailedView, setShowDetailedView] = useState(false);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const { data } = await api.get('/projects');
        setProjects(Array.isArray(data) ? data : []);
      } catch (e) {
        setProjects([]);
      }
    };

    if (user) loadProjects();
  }, [user]);

  useEffect(() => {
    const load = async () => {
      try {
        const params = {};
        if (selectedProjectId !== 'all') params.projectId = selectedProjectId;
        if (stateFilter !== 'all') params.state = stateFilter;
        const paramsWithDev = { ...params };
        if (selectedDevId !== 'all') paramsWithDev.userId = selectedDevId;
        const [s, a, b, c, d, devRes, movingRes] = await Promise.all([
          api.get('/analytics/summary', { params }),
          api.get('/analytics/tasks-per-day', { params }),
          api.get('/analytics/status', { params }),
          api.get('/analytics/avg-completion-time', { params }),
          api.get('/analytics/workload-per-user', { params }),
          api.get('/analytics/dev-performance', { params: paramsWithDev }),
          api.get('/analytics/moving-tickets', { params }),
        ]);
        setSummary(s.data || { total: 0, open: 0, done: 0, overdue: 0 });
        setTasksPerDay(a.data || []);
        setStatus(b.data || []);
        setAvg(c.data || { avgHours: 0 });
        setWorkload(d.data || []);
        setDevPerformance(devRes.data || { developers: [], selected: null });
        setMovingTickets(Array.isArray(movingRes.data) ? movingRes.data : []);
      } finally {
        setLoading(false);
      }
    };
    if (user) load();
  }, [user, selectedProjectId, stateFilter, selectedDevId]);

  const tasksPerDayChart = useMemo(() => {
    const labels = tasksPerDay.map((x) => new Date(x.date).toLocaleDateString());
    const values = tasksPerDay.map((x) => x.count);
    return {
      labels,
      datasets: [
        {
          label: 'Completed issues',
          data: values,
          backgroundColor: 'rgba(37, 99, 235, 0.6)',
        },
      ],
    };
  }, [tasksPerDay]);

  const statusChart = useMemo(() => {
    const labels = status.map((x) => x.status);
    const values = status.map((x) => x.count);
    const colorForStatus = {
      'Backlog': 'rgba(156, 163, 175, 0.7)',
      'Todo': 'rgba(37, 99, 235, 0.6)',
      'In Progress': 'rgba(234, 179, 8, 0.6)',
      'In Review': 'rgba(168, 85, 247, 0.6)',
      'Testing': 'rgba(249, 115, 22, 0.6)',
      'Done': 'rgba(34, 197, 94, 0.6)',
    };
    return {
      labels,
      datasets: [
        {
          label: 'Issues',
          data: values,
          backgroundColor: labels.map((s) => colorForStatus[s] || 'rgba(107, 114, 128, 0.6)'),
        },
      ],
    };
  }, [status]);

  const sortedWorkload = useMemo(() => {
    const metricKey = workloadSort === 'open' ? 'openCount' : workloadSort === 'done' ? 'doneCount' : 'totalCount';
    return [...workload].sort((a, b) => (b[metricKey] || 0) - (a[metricKey] || 0));
  }, [workload, workloadSort]);

  const selectedDeveloperStats = useMemo(() => {
    if (selectedDevId === 'all') return null;
    return (devPerformance.developers || []).find((d) => String(d.userId) === String(selectedDevId)) || null;
  }, [devPerformance, selectedDevId]);

  return (
    <Layout title="Analytics">
      <div className="max-w-6xl">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Analytics</h2>
        <p className="text-sm text-gray-500 mb-8">High-level project activity and workload metrics.</p>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 md:items-end md:justify-between">
            <div className="flex flex-col md:flex-row gap-3 flex-1">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Project</label>
                <select
                  className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  <option value="all">All projects</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.key} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Issue state</label>
                <select
                  className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="open">Open only</option>
                  <option value="closed">Closed (Done)</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Developer</label>
                <select
                  className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  value={selectedDevId}
                  onChange={(e) => setSelectedDevId(e.target.value)}
                >
                  <option value="all">All developers</option>
                  {(devPerformance.developers || []).map((d) => (
                    <option key={String(d.userId)} value={String(d.userId)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col w-full md:w-56">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Sort workload</label>
              <select
                className="px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                value={workloadSort}
                onChange={(e) => setWorkloadSort(e.target.value)}
              >
                <option value="total">Total tickets</option>
                <option value="open">Open tickets</option>
                <option value="done">Done tickets</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-blue-600 font-semibold">Loading...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total issues</div>
                <div className="mt-2 text-3xl font-black text-gray-900">{summary.total}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Open</div>
                <div className="mt-2 text-3xl font-black text-gray-900">{summary.open}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Done</div>
                <div className="mt-2 text-3xl font-black text-gray-900">{summary.done}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Overdue</div>
                <div className="mt-2 text-3xl font-black text-gray-900">{summary.overdue}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Avg completion</div>
                <div className="mt-2 text-3xl font-black text-gray-900">
                  {Number(avg?.avgHours || 0).toFixed(1)}h
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800">Detailed analytics</div>
                <div className="text-xs text-gray-500 mt-0.5">Developer trends, movement charts, and deep insights.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailedView((v) => !v)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
              >
                {showDetailedView ? 'Hide Details' : 'Show Details'}
              </button>
            </div>

            {showDetailedView && (
              <>
                {selectedDeveloperStats ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Selected dev</div>
                      <div className="mt-2 text-lg font-bold text-gray-900">{selectedDeveloperStats.name}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dev done</div>
                      <div className="mt-2 text-3xl font-black text-green-700">{selectedDeveloperStats.done || 0}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dev open</div>
                      <div className="mt-2 text-3xl font-black text-blue-700">{selectedDeveloperStats.open || 0}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Status moves</div>
                      <div className="mt-2 text-3xl font-black text-purple-700">{selectedDeveloperStats.statusMoves || 0}</div>
                    </div>
                  </div>
                ) : null}

                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Completed per day</div>
                  <Bar data={tasksPerDayChart} options={{ responsive: true, plugins: { legend: { display: false } } }} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Status distribution</div>
                    <Doughnut data={statusChart} options={{ responsive: true }} />
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Workload per user (open)</div>
                    <div className="space-y-2">
                      {workload.length === 0 ? (
                        <div className="text-sm text-gray-500">No tickets found for this filter.</div>
                      ) : (
                        sortedWorkload.slice(0, 12).map((w) => (
                          <div key={String(w.userId)} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-700 font-medium truncate pr-3">
                              {w.name || 'Unassigned'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-100">
                                Open {w.openCount || 0}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 font-bold text-[11px] border border-green-100">
                                Done {w.doneCount || 0}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Developer throughput</div>
                    <div className="space-y-2">
                      {(devPerformance.developers || []).length === 0 ? (
                        <div className="text-sm text-gray-500">No developer data found.</div>
                      ) : (
                        devPerformance.developers.slice(0, 12).map((d) => (
                          <div key={String(d.userId)} className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-700 truncate pr-2">{d.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 font-bold text-[11px] border border-green-100">
                                Done {d.done || 0}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold text-[11px] border border-purple-100">
                                Moves {d.statusMoves || 0}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Most moving tickets</div>
                    <div className="space-y-2">
                      {movingTickets.length === 0 ? (
                        <div className="text-sm text-gray-500">No movement data found.</div>
                      ) : (
                        movingTickets.slice(0, 12).map((t) => (
                          <div key={t.issueId} className="flex items-start justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800 truncate">{t.title}</div>
                              <div className="text-[11px] text-gray-500">
                                {t.projectKey ? `${t.projectKey} • ` : ''}{t.status}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-bold text-[11px] border border-orange-100">
                              {t.moves} moves
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default Analytics;

