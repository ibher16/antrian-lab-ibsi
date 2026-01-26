class QueueWebSocket {
    constructor(url, onMessage, onOpen) {
        this.url = url;
        this.onMessage = onMessage;
        this.onOpen = onOpen;
        this.reconnectInterval = 3000;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('WebSocket Connected');
            if (this.onOpen) this.onOpen();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onMessage) this.onMessage(data);
            } catch (e) {
                console.error('WebSocket message parsing error:', e);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket Disconnected. Reconnecting...');
            setTimeout(() => this.connect(), this.reconnectInterval);
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket Error:', err);
            this.ws.close();
        };
    }

    send(data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not open. Cannot send data.');
        }
    }
}
