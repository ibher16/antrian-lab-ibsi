// =====================
// ADMIN PANEL APP.JS
// =====================

// State
let currentCounter = 1;
let currentCalledTicket = null;
let waitingTickets = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load counter from localStorage
    const savedCounter = localStorage.getItem('adminCounter');
    if (savedCounter) {
        currentCounter = parseInt(savedCounter);
        document.getElementById('counter-select').value = currentCounter;
    }

    // Counter selector change
    document.getElementById('counter-select').addEventListener('change', (e) => {
        currentCounter = parseInt(e.target.value);
        localStorage.setItem('adminCounter', currentCounter);
    });

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            switchSection(section);
        });
    });

    // Initial data load
    loadStats();
    loadWaitingTickets();
    loadVideoSettings();

    // Refresh every 5 seconds
    setInterval(() => {
        loadStats();
        loadWaitingTickets();
    }, 5000);
});

// WebSocket connection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new QueueWebSocket(`${protocol}//${window.location.host}/ws`, (message) => {
    console.log('Admin received:', message);

    if (message.type === 'NEW_TICKET') {
        loadWaitingTickets();
        loadStats();
    } else if (message.type === 'RESET_QUEUE') {
        loadWaitingTickets();
        loadStats();
        currentCalledTicket = null;
        document.getElementById('current-called').textContent = '--';
    }
});

// =====================
// NAVIGATION
// =====================

function switchSection(section) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });

    // Update sections
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(`section-${section}`).classList.add('active');

    // Update title
    const titles = {
        'queue': 'Panggil Antrian',
        'settings': 'Pengaturan Display'
    };
    document.getElementById('page-title').textContent = titles[section] || 'Admin';
}

// =====================
// API CALLS
// =====================

async function loadStats() {
    try {
        const res = await fetch('/api/queue/stats');
        const stats = await res.json();

        document.getElementById('stat-waiting').textContent = stats.waiting || 0;
        document.getElementById('stat-calling').textContent = stats.calling || 0;
        document.getElementById('stat-finished').textContent = stats.finished || 0;
        document.getElementById('stat-total').textContent = stats.total || 0;
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

async function loadWaitingTickets() {
    try {
        const res = await fetch('/api/queue/waiting');
        waitingTickets = await res.json() || [];

        renderQueueLists();
    } catch (err) {
        console.error('Error loading waiting tickets:', err);
    }
}

function renderQueueLists() {
    const categories = {
        1: { prefix: 'A', list: document.getElementById('queue-A'), count: document.getElementById('count-A') },
        2: { prefix: 'B', list: document.getElementById('queue-B'), count: document.getElementById('count-B') },
        3: { prefix: 'C', list: document.getElementById('queue-C'), count: document.getElementById('count-C') }
    };

    // Clear lists
    Object.values(categories).forEach(cat => {
        cat.list.innerHTML = '';
        cat.count.textContent = '0';
    });

    // Group tickets by category
    const grouped = { 1: [], 2: [], 3: [] };
    waitingTickets.forEach(ticket => {
        if (grouped[ticket.category_id]) {
            grouped[ticket.category_id].push(ticket);
        }
    });

    // Render each category
    Object.keys(grouped).forEach(catId => {
        const cat = categories[catId];
        const tickets = grouped[catId];

        cat.count.textContent = tickets.length;

        if (tickets.length === 0) {
            cat.list.innerHTML = '<div class="empty-queue">Tidak ada antrian</div>';
            return;
        }

        tickets.forEach(ticket => {
            const time = new Date(ticket.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const div = document.createElement('div');
            div.className = 'queue-item';
            div.innerHTML = `
                <div>
                    <div class="queue-item-code">${ticket.formatted_code}</div>
                    <div class="queue-item-time">${time}</div>
                </div>
                <div class="queue-item-actions">
                    <button class="btn btn-primary" onclick="callTicket(${ticket.id})">Panggil</button>
                    <button class="btn btn-secondary" onclick="skipTicket(${ticket.id})">Skip</button>
                </div>
            `;
            cat.list.appendChild(div);
        });
    });
}

// =====================
// QUEUE ACTIONS
// =====================

async function callTicket(ticketId) {
    try {
        const res = await fetch('/api/queue/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: ticketId, counter: currentCounter })
        });

        if (!res.ok) throw new Error('Failed to call ticket');

        const ticket = await res.json();
        currentCalledTicket = ticket;
        document.getElementById('current-called').textContent = ticket.formatted_code;

        // Reload lists
        loadWaitingTickets();
        loadStats();
    } catch (err) {
        console.error('Error calling ticket:', err);
        alert('Gagal memanggil antrian');
    }
}

async function recallTicket() {
    try {
        const res = await fetch('/api/queue/recall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ counter: currentCounter })
        });

        if (!res.ok) {
            alert('Tidak ada antrian untuk dipanggil ulang');
            return;
        }

        const ticket = await res.json();
        console.log('Recalled:', ticket.formatted_code);
    } catch (err) {
        console.error('Error recalling ticket:', err);
    }
}

async function skipTicket(ticketId) {
    if (!confirm('Yakin ingin skip antrian ini?')) return;

    try {
        const res = await fetch('/api/queue/skip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: ticketId })
        });

        if (!res.ok) throw new Error('Failed to skip');

        loadWaitingTickets();
        loadStats();
    } catch (err) {
        console.error('Error skipping ticket:', err);
    }
}

async function finishTicket() {
    if (!currentCalledTicket) {
        alert('Tidak ada antrian yang sedang dipanggil');
        return;
    }

    try {
        const res = await fetch('/api/queue/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: currentCalledTicket.id })
        });

        if (!res.ok) throw new Error('Failed to finish');

        currentCalledTicket = null;
        document.getElementById('current-called').textContent = '--';

        loadStats();
    } catch (err) {
        console.error('Error finishing ticket:', err);
    }
}

async function resetQueue() {
    if (!confirm('PERINGATAN: Ini akan menghapus SEMUA antrian hari ini. Yakin?')) return;
    if (!confirm('Konfirmasi sekali lagi: Reset semua antrian?')) return;

    try {
        const res = await fetch('/api/queue/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error('Failed to reset');

        currentCalledTicket = null;
        document.getElementById('current-called').textContent = '--';

        loadWaitingTickets();
        loadStats();

        alert('Antrian berhasil direset!');
    } catch (err) {
        console.error('Error resetting queue:', err);
        alert('Gagal mereset antrian');
    }
}

async function finishAndCallNext() {
    // 1. Finish Current if exists
    if (currentCalledTicket) {
        try {
            const res = await fetch('/api/queue/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_id: currentCalledTicket.id })
            });
            if (!res.ok) throw new Error('Failed to finish');

            // UI update (clear current)
            currentCalledTicket = null;
            document.getElementById('current-called').textContent = '--';
        } catch (err) {
            console.error('Error finishing ticket:', err);
            alert('Gagal menyelesaikan antrian saat ini');
            return; // Stop if failed
        }
    }

    // 2. Refresh lists to get latest status
    await loadWaitingTickets();

    // 3. Call Next
    if (waitingTickets.length > 0) {
        await callNextTicket();
    } else {
        alert('Antrian saat ini selesai. Tidak ada antrian berikutnya.');
        loadStats();
    }
}

// =====================
// MANUAL INPUT
// =====================

async function callNextTicket() {
    if (waitingTickets.length === 0) {
        alert('Tidak ada antrian yang menunggu saat ini.');
        return;
    }

    // Sort by ID (just in case) and pick the first one
    const nextTicket = waitingTickets.sort((a, b) => a.id - b.id)[0];

    // Call it
    await callTicket(nextTicket.id);
}

async function callManualTicket() {
    const code = document.getElementById('manual-call-code').value.trim().toUpperCase();
    if (!code) {
        alert('Masukkan nomor antrian, contoh: A-005');
        return;
    }

    try {
        const res = await fetch('/api/queue/call-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                counter: currentCounter
            })
        });

        if (res.status === 404) {
            alert('Nomor antrian tidak ditemukan (Pastikan format benar dan terdaftar hari ini)');
            return;
        }

        if (!res.ok) throw new Error('Failed to call manual');

        const ticket = await res.json();
        currentCalledTicket = ticket;
        document.getElementById('current-called').textContent = ticket.formatted_code;

        // Reset input
        document.getElementById('manual-call-code').value = '';

        loadWaitingTickets();
        loadStats();
    } catch (err) {
        console.error('Error manual call:', err);
        alert('Gagal memanggil antrian manual');
    }
}

async function createManualTicket() {
    const categoryId = parseInt(document.getElementById('manual-category').value);

    try {
        const res = await fetch('/api/queue/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: categoryId })
        });

        if (!res.ok) throw new Error('Failed to create ticket');

        const ticket = await res.json();
        alert(`Antrian ${ticket.formatted_code} berhasil dibuat!`);

        loadWaitingTickets();
        loadStats();
    } catch (err) {
        console.error('Error creating ticket:', err);
        alert('Gagal membuat antrian');
    }
}

// =====================
// VIDEO SETTINGS
// =====================

async function updateVideoSettings() {
    const videoUrl = document.getElementById('video-url').value;
    const title = document.getElementById('video-title').value;
    const subtitle = document.getElementById('video-subtitle').value;

    try {
        const res = await fetch('/api/display/video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_url: videoUrl,
                title: title,
                subtitle: subtitle
            })
        });

        if (!res.ok) throw new Error('Failed to update');

        alert('Pengaturan video berhasil disimpan!');
    } catch (err) {
        console.error('Error updating video settings:', err);
        alert('Gagal menyimpan pengaturan');
    }
}

async function loadVideoSettings() {
    try {
        const res = await fetch('/api/display/video');
        if (res.ok) {
            const data = await res.json();
            document.getElementById('video-url').value = data.video_url || '';
            document.getElementById('video-title').value = data.title || '';
            document.getElementById('video-subtitle').value = data.subtitle || '';
        }
    } catch (err) {
        console.error('Error loading video settings:', err);
    }
}
