// examples/ws.ts
import { $, $body, createEventsProxy, EventsProxy } from "../src";

/**
 * Example WebSocket wrapper using Jel's event system.
 * 
 * Shows how to create reactive event sources for non-DOM objects.
 * 
 * Usage:
 * ```ts
 * const ws = new MyWebSocket("wss://echo.websocket.org");
 * const messages = ws.events.message
 *   .map(m => JSON.parse(m.data))
 *   .filter(msg => msg.type === "chat");
 * ```
 */
class MyWebSocket {
    readonly websocket: WebSocket;
    
    // Reuse the same proxy logic that DomEntity.events uses
    readonly events: EventsProxy<WebSocketEventMap>;

    constructor(url: string, protocols?: string | string[])
    constructor(socket: WebSocket)
    constructor(urlOrSocket: string | WebSocket, protocols?: string | string[]) {
        this.websocket = typeof urlOrSocket === "string" 
            ? new WebSocket(urlOrSocket, protocols) 
            : urlOrSocket;
        
        // createEventsProxy automatically creates EventEmitter on property read
        this.events = createEventsProxy(this.websocket);
    }

    // Proxy methods to the underlying WebSocket
    send(data: any) { this.websocket.send(data); }
    close(code?: number, reason?: string) { this.websocket.close(code, reason); }
    
    get readyState() { return this.websocket.readyState; }

}

// Example usage
function demo() {
    const ws = new MyWebSocket("wss://echo.websocket.org");
    
    // Reactive message stream
    const messages$ = ws.events.message
        .map(m => JSON.parse(m.data));
    
    // Display messages in the DOM
    $body.append($.h1({
        content: messages$
            .filter(msg => msg.type === "title")
            .map(msg => msg.data)
    }));
    
    // Show connection status
    $body.append($.div({
        content: ws.events.open
            .map(() => "Connected!")
            .or(ws.events.close.map(() => "Disconnected"))
            .immediate("Connecting...")
    }));
    
    // Auto-send on connection
    ws.events.open.apply(() => {
        ws.send(JSON.stringify({ type: "hello", data: "world" }));
    });
}
