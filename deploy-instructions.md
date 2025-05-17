# blocq Multiplayer Deployment Guide

## Mobile Support

blocq includes mobile-friendly controls and responsive design:

- **Touch Controls**: Virtual buttons for movement and actions
- **Press and Hold**: Hold left/right buttons to move pieces horizontally
- **Single Tap**: Tap the rotate button to rotate the piece
- **Double Tap**: Double-tap the drop button for hard drop, single tap for soft drop
- **Fullscreen Mode**: Tap the fullscreen button to maximize gameplay area

## Local Deployment

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

3. Access the game at http://localhost:3000

## Cloud Deployment

### Option 1: Docker Deployment

1. Build the Docker image:
   ```
   docker build -t tetris-multiplayer .
   ```

2. Run the container:
   ```
   docker run -p 3000:3000 tetris-multiplayer
   ```

### Option 2: Platform as a Service (PaaS)

#### Heroku Deployment

1. Create a new Heroku app:
   ```
   heroku create your-app-name
   ```

2. Enable WebSockets support (this is on by default but good to confirm):
   ```
   heroku features:enable http-session-affinity
   ```

3. Push your code to Heroku:
   ```
   git push heroku main
   ```

4. Scale to at least one web dyno:
   ```
   heroku ps:scale web=1
   ```

5. Monitor logs for any WebSocket issues:
   ```
   heroku logs --tail
   ```

#### Other PaaS Options

You can also deploy to Railway.app, Render.com, or similar platforms that support Node.js applications with WebSockets.

### Option 3: Virtual Private Server (VPS)

1. SSH into your server
2. Clone the repository
3. Install Node.js if not already installed
4. Install dependencies with `npm install`
5. Use PM2 to run the server in production:
   ```
   npm install -g pm2
   pm2 start server.js
   ```
6. Set up Nginx as a reverse proxy (sample config):
   ```
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Important Deployment Considerations

1. **WebSocket Support**: Ensure your hosting environment supports WebSockets.
2. **Scaling**: For higher loads, consider:
   - Using a load balancer with sticky sessions
   - Implementing a shared state (Redis) for multiplayer coordination
   - Distributing game instances across multiple servers
3. **Security**: Add rate limiting and input validation if exposing to public internet.
4. **SSL**: Always use HTTPS in production for secure WebSocket connections (WSS).