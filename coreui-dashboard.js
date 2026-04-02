// CoreUI Dashboard - Real-time WFMS Performance Charts
// Rewritten to avoid appending data repeatedly and to keep a fixed chart size.

document.addEventListener('DOMContentLoaded', () => {
	const MAX_BARS = 20; // fixed maximum number of bars to display
	const POLL_MS = 10000; // polling interval

	const canvas = document.getElementById('performanceChart');
	if (!canvas) return console.warn('performanceChart canvas not found');

	// enforce a fixed height so the chart doesn't elongate vertically
	canvas.style.width = '100%';
	canvas.style.maxWidth = '1200px';
	canvas.style.height = '420px';

	const ctx = canvas.getContext('2d');

	const chart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: [],
			datasets: [
				{
					label: 'Completion Rate (%)',
					data: [],
					backgroundColor: 'rgba(16,185,129,0.85)',
					borderColor: '#10b981',
					borderWidth: 1,
					yAxisID: 'y'
				},
				{
					label: 'Tasks Completed',
					data: [],
					backgroundColor: 'rgba(59,130,246,0.8)',
					borderColor: '#3b82f6',
					borderWidth: 1,
					yAxisID: 'y1'
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			animation: { duration: 400 },
			plugins: {
				legend: { position: 'top' }
			},
			scales: {
				y: {
					type: 'linear',
					position: 'left',
					min: 0,
					max: 100,
					ticks: { callback: (v) => v + '%' }
				},
				y1: {
					type: 'linear',
					position: 'right',
					grid: { drawOnChartArea: false }
				},
				x: {
					ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }
				}
			}
		}
	});

	// replace chart data (do NOT push/concat) and limit to MAX_BARS
	function setChartData(perfArray) {
		if (!Array.isArray(perfArray)) return;

		const sorted = perfArray.slice().sort((a, b) => (b.completion_rate || 0) - (a.completion_rate || 0));
		const trimmed = sorted.slice(0, MAX_BARS);

		const labels = trimmed.map(p => p.name || p.user || p._id || 'Unknown');
		const completion = trimmed.map(p => Number(p.completion_rate || 0));
		const tasksCompleted = trimmed.map(p => Number(p.tasks_completed || p.tasks || 0));

		// Replace arrays (avoid push)
		chart.data.labels = labels;
		chart.data.datasets[0].data = completion;
		chart.data.datasets[1].data = tasksCompleted;
		chart.update();

		const el = document.getElementById('last-updated');
		if (el) el.textContent = new Date().toLocaleTimeString();
	}

	async function loadPerformance() {
		try {
			const res = await fetch('/api/admin/performance-metrics');
			if (!res.ok) return console.warn('Failed to fetch performance metrics', res.status);
			const body = await res.json();
			const perf = Array.isArray(body) ? body : (body.performance || body.data || body.metrics || body.records || []);
			setChartData(perf);
		} catch (err) {
			console.error('Error loading performance metrics', err);
		}
	}

	// initial load and polling
	loadPerformance();
	const intervalId = setInterval(loadPerformance, POLL_MS);

	// try to connect socket.io for real-time updates; if not available, polling will suffice
	try {
		const socket = io();
		socket.on('connect', () => console.log('CoreUI dashboard socket connected', socket.id));
		socket.on('performance_update', (payload) => {
			const perf = Array.isArray(payload) ? payload : (payload.performance || payload.data || payload.metrics || payload.records || []);
			setChartData(perf);
		});
	} catch (e) {
		console.warn('socket.io not available; using polling only');
	}

	// cleanup in case the page is unloaded
	window.addEventListener('beforeunload', () => clearInterval(intervalId));
});

