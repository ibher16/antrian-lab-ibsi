// Update clock
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    document.getElementById('current-time').textContent = timeString;
    document.getElementById('current-date').textContent = dateString;
}
setInterval(updateTime, 1000);
updateTime();

// Category Mapping
const categories = {
    1: { name: 'Check-up Lab', prefix: 'A' },
    2: { name: 'PCR / Swab Test', prefix: 'B' },
    3: { name: 'Result Collection', prefix: 'C' }
};

// Select Service
async function selectService(categoryId) {
    const btn = document.activeElement;
    if (btn) btn.blur(); // Remove focus

    try {
        // Send request to backend
        const response = await fetch('/api/queue/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category_id: categoryId })
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const ticket = await response.json();
        showTicketModal(ticket);

    } catch (error) {
        console.error('Error creating ticket:', error);
        alert('System Offline. Please contact staff.');
    }
}

// Update Print Area with ticket data
function updatePrintArea(ticket) {
    const pNumber = document.getElementById('p-number');
    const pCategory = document.getElementById('p-category');
    const pTime = document.getElementById('p-time');

    // Format date/time for print
    const now = new Date();
    const dateTimeStr = now.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) + ', ' + now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Update print area elements
    pNumber.textContent = ticket.formatted_code;
    pCategory.textContent = categories[ticket.category_id].name.toUpperCase();
    pTime.textContent = dateTimeStr;
}

// Show Modal
function showTicketModal(ticket) {
    const modal = document.getElementById('ticket-modal');
    const modalContent = document.getElementById('modal-content');
    const ticketNum = document.getElementById('ticket-number');
    const serviceName = document.getElementById('service-name');

    // Update modal content
    ticketNum.textContent = ticket.formatted_code;
    serviceName.textContent = categories[ticket.category_id].name;

    // Update print area for thermal printer
    updatePrintArea(ticket);

    // Show modal with animation
    modal.classList.add('open');

    // Trigger Browser Print Dialog
    setTimeout(() => {
        window.print();
    }, 1000);

    // Auto close after 4 seconds
    setTimeout(() => {
        closeModal();
    }, 4000);
}

function closeModal() {
    const modal = document.getElementById('ticket-modal');
    modal.classList.remove('open');
}
