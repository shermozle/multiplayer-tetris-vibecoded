# blocq Multiplayer Agent Guidelines

## Build & Run Commands
- Start server: `npm start`
- Development with auto-restart: `npm run dev`
- Run app locally: Open `index.html` or visit http://localhost:3000 (with server running)
- No test framework identified
- Docker build: `docker build -t tetris-multiplayer .`
- Docker run: `docker run -p 3000:3000 tetris-multiplayer`

## Code Style Guidelines
- **Formatting**: Use 4-space indentation and consistent line breaks
- **Naming**: camelCase for variables/functions, descriptive names (e.g., `handlePlayerReady`)
- **Error Handling**: Use try/catch blocks for handling WebSocket messages and sound playback
- **Commenting**: Use clear comments for functions, code sections, and complex logic
- **Types**: No explicit types (vanilla JavaScript)
- **Variables**: Define at the top of scope, group related variables
- **WebSocket Messages**: Follow type-based message structure with clear type identifiers
- **DOM Manipulation**: Query selectors for elements, create event listeners on DOMContentLoaded
- **Event Handling**: Use dedicated handler functions for different message types

## Architecture
- Server-side: Node.js with Express and WebSockets
- Client-side: Vanilla JavaScript, HTML5 Canvas
- WebSocket-based real-time communication for multiplayer
- Matchmaking system for pairing players into 2-player games
- Support for multiple concurrent games with automatic cleanup
- Heartbeat mechanism for keeping WebSocket connections alive