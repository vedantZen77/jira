import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import api from '../utils/api';
import { Bar, Doughnut } from 'react-chartjs-2';
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
  const [summary, setSummary] = useState({ total: 0, open: 0, done: 0, overdue: 0 });
  const [tasksPerDay, setTasksPerDay] = useState([]);
  const [status, setStatus] = useState([]);
  const [avg, setAvg] = useState({ avgHours: 0 });
  const [workload, setWorkload] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, a, b, c, d] = await Promise.all([
          api.get('/analytics/summary'),
          api.get('/analytics/tasks-per-day'),
          api.get('/analytics/status'),
          api.get('/analytics/avg-completion-time'),
          api.get('/analytics/workload-per-user'),
        ]);
        setSummary(s.data || { total: 0, open: 0, done: 0, overdue: 0 });
        setTasksPerDay(a.data || []);
        setStatus(b.data || []);
        setAvg(c.data || { avgHours: 0 });
        setWorkload(d.data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
    return {
      labels,
      datasets: [
        {
          label: 'Issues',
          data: values,
          backgroundColor: [
            'rgba(37, 99, 235, 0.6)',
            'rgba(234, 179, 8, 0.6)',
            'rgba(168, 85, 247, 0.6)',
            'rgba(249, 115, 22, 0.6)',
            'rgba(34, 197, 94, 0.6)',
            'rgba(107, 114, 128, 0.6)',
          ],
        },
      ],
    };
  }, [status]);

  return (
    <Layout title="Analytics">
      <div className="max-w-6xl">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Analytics</h2>
        <p className="text-sm text-gray-500 mb-8">High-level project activity and workload metrics.</p>

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
                    <div className="text-sm text-gray-500">No open issues.</div>
                  ) : (
                    workload.slice(0, 12).map((w) => (
                      <div key={String(w.userId)} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 font-medium truncate pr-3">{w.name || 'Unassigned'}</span>
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-bold text-xs">{w.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Analytics;

