// Clock
setInterval(() => {
    const now = new Date();
    document.getElementById('clock-time').textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('clock-date').textContent = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}, 1000);

// State and History
const state = {
    current: null,
    history: []
};

// Global AudioContext
let audioCtx = null;
let audioUnlocked = false;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function unlockAudio() {
    if (audioUnlocked) return;

    initAudioContext();

    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            console.log('AudioContext unlocked');
            audioUnlocked = true;
        });
    } else {
        audioUnlocked = true;
    }

    // Warm up speech synthesis
    if ('speechSynthesis' in window) {
        const warmup = new SpeechSynthesisUtterance('');
        warmup.volume = 0;
        window.speechSynthesis.speak(warmup);
    }
}

// Initial Fetch
fetch('/api/queue/recent')
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            data.reverse().forEach(t => addToHistory(t));
        }
    })
    .catch(console.error);

// Initial Video Settings
fetch('/api/display/video')
    .then(res => res.json())
    .then(data => {
        updateVideoDisplay(data);
    })
    .catch(console.error);

// WebSocket
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new QueueWebSocket(`${protocol}//${window.location.host}/ws`, (message) => {
    console.log('Received:', message);

    if (message.type === 'NEW_TICKET') {
        const ticket = message.data;
        addToHistory(ticket);
    } else if (message.type === 'CALL_TICKET') {
        handleCall(message.data);
    } else if (message.type === 'RESET_QUEUE') {
        document.getElementById('current-number').textContent = '--';
        document.getElementById('current-counter').textContent = 'LOKET --';
        document.getElementById('history-list').innerHTML = '';
    } else if (message.type === 'UPDATE_VIDEO') {
        updateVideoDisplay(message.data);
    }
});

function updateVideoDisplay(data) {
    const overlay = document.querySelector('.media-overlay');
    const content = document.querySelector('.media-content');

    // Update Text
    if (overlay && data) {
        const titleEl = overlay.querySelector('h3');
        const subtitleEl = overlay.querySelector('p');
        if (titleEl && data.title) titleEl.textContent = data.title;
        if (subtitleEl && data.subtitle) subtitleEl.textContent = data.subtitle;
    }

    // Update Video
    if (content && data.video_url) {
        // Simple check for YouTube
        const isYouTube = data.video_url.includes('youtube.com') || data.video_url.includes('youtu.be');

        // Remove placeholder background
        content.style.backgroundImage = 'none';

        if (isYouTube) {
            let videoId = '';
            // Extract Video ID
            if (data.video_url.includes('watch?v=')) {
                videoId = data.video_url.split('v=')[1].split('&')[0];
            } else if (data.video_url.includes('youtu.be/')) {
                videoId = data.video_url.split('youtu.be/')[1].split('?')[0];
            }

            if (videoId) {
                // Autoplay=1, Mute=1 (required for autoplay), Loop=1, Playlist=videoId, Controls=1
                const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&rel=0&showinfo=0`;
                content.innerHTML = `<iframe width="100%" height="100%" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
            }
        } else {
            // Direct video file (muted required for autoplay)
            content.innerHTML = `<video width="100%" height="100%" src="${data.video_url}" autoplay loop muted controls playsinline style="object-fit: cover;"></video>`;
        }
    }
}

function handleCall(ticket) {
    if (state.current) {
        addToHistory(state.current);
    }
    state.current = ticket;
    updateMainDisplay(ticket);
    announce(ticket);
}

function updateMainDisplay(ticket) {
    const numberEl = document.getElementById('current-number');
    const counterEl = document.getElementById('current-counter');
    numberEl.style.opacity = '0';
    setTimeout(() => {
        numberEl.textContent = ticket.formatted_code;
        counterEl.textContent = `LOKET ${ticket.counter || 1}`;
        numberEl.style.opacity = '1';
    }, 200);
}

function addToHistory(ticket) {
    const list = document.getElementById('history-list');
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
        <div class="history-col">
            <span class="label-sm">Nomor</span>
            <span class="val-xl">${ticket.formatted_code}</span>
        </div>
        <div class="divider-v"></div>
        <div class="history-col" style="align-items: flex-end;">
            <span class="label-sm">Loket</span>
            <span class="val-xl" style="color: var(--primary);">${ticket.counter || 1}</span>
        </div>
    `;
    list.prepend(div);
    if (list.children.length > 4) list.lastElementChild.remove();
}

// ==========================================
// SIMPLE VOICE ANNOUNCEMENT (Local/Native)
// ==========================================

const digitToWord = {
    '0': 'nol', '1': 'satu', '2': 'dua', '3': 'tiga', '4': 'empat',
    '5': 'lima', '6': 'enam', '7': 'tujuh', '8': 'delapan', '9': 'sembilan'
};

const letterToWord = {
    'A': 'A', 'B': 'Be', 'C': 'Ce', 'D': 'De', 'E': 'E', 'F': 'Ef',
    'G': 'Ge', 'H': 'Ha', 'I': 'I', 'J': 'Je', 'K': 'Ka', 'L': 'El',
    'M': 'Em', 'N': 'En', 'O': 'O', 'P': 'Pe', 'Q': 'Qiu', 'R': 'Er',
    'S': 'Es', 'T': 'Te', 'U': 'U', 'V': 'Ve', 'W': 'We', 'X': 'Eks',
    'Y': 'Ye', 'Z': 'Zet'
};

function numberToWords(numStr) {
    // Join with spaces for natural reading
    return numStr.split('').map(d => digitToWord[d] || d).join(' ');
}

function counterToWords(num) {
    const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh',
        'delapan', 'sembilan', 'sepuluh', 'sebelas', 'dua belas', 'tiga belas',
        'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas',
        'sembilan belas', 'dua puluh'];
    if (num <= 20) return words[num];
    return numberToWords(num.toString());
}

function ticketToSpeech(formattedCode) {
    const parts = formattedCode.split('-');
    const prefix = parts[0];
    const number = parts[1];
    const letterWord = letterToWord[prefix] || prefix;
    const numberWords = numberToWords(number);
    return `${letterWord} ${numberWords}`;
}

function announce(ticket) {
    const ticketSpeech = ticketToSpeech(ticket.formatted_code);
    const counterNum = ticket.counter || 1;
    const counterSpeech = counterToWords(counterNum);

    // Text to speak: "Nomor Antrian, A Satu Dua Tiga, Menuju Loket, Satu"
    const text = `Nomor Antrian ${ticketSpeech}, Menuju Loket ${counterSpeech}`;

    console.log('Announcing:', text);

    // Play bell first
    playChime().then(() => {
        speakLocal(text);
    });
}

function speakLocal(text) {
    if ('speechSynthesis' in window) {
        // Native browser TTS logic
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
}

function playChime() {
    return new Promise((resolve) => {
        try {
            const ctx = initAudioContext();

            // Try to resume if suspended
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => { });
            }

            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.frequency.value = 830;
            osc1.type = 'sine';
            gain1.gain.setValueAtTime(0.4, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.4);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.frequency.value = 622;
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.2);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
            osc2.start(ctx.currentTime + 0.2);
            osc2.stop(ctx.currentTime + 0.7);

            setTimeout(resolve, 800);
        } catch (e) {
            console.error('Chime error:', e);
            resolve();
        }
    });
}

// Initialize voices (Chrome requires this even just for default)
if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
}

// Auto-unlock audio on any user interaction
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// Try to unlock immediately on page load (works in some browsers)
setTimeout(() => {
    unlockAudio();
}, 100);
