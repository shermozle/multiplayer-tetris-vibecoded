const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable trust proxy to work behind load balancers/proxies
app.set('trust proxy', 1);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Add server status endpoint
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        games: Object.keys(games).length,
        waitingPlayers: waitingPlayers.length,
        connectedPlayers: Object.keys(playerSockets).length
    });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server with ping enabled
const wss = new WebSocket.Server({ 
    server,
    // Allow server to be fronted by reverse proxies
    clientTracking: true,
    // Increase max payload size for board updates
    maxPayload: 1024 * 1024 // 1MB max payload
});

// Game state
const games = {}; // Stores active games
const waitingPlayers = []; // Queue of players waiting for a match
const playerSockets = {}; // Map of player IDs to WebSocket connections

// Handle WebSocket connections
// Main WebSocket connection handler
wss.on('connection', (ws, req) => {
    // Get client IP for logging and rate limiting
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`New client connected from ${ip}`);
    
    let playerId = null;
    let gameId = null;
    
    // Handle messages from clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data.type);
            
            switch (data.type) {
                case 'JOIN_GAME':
                    handleJoinGame(ws, data);
                    break;
                case 'LEAVE_GAME':
                    handleLeaveGame(ws, data);
                    break;
                case 'READY':
                    handlePlayerReady(ws, data);
                    break;
                case 'NEXT_PIECE':
                    handleNextPiece(ws, data);
                    break;
                case 'ATTACK':
                    handleAttack(ws, data);
                    break;
                case 'BOARD_UPDATE':
                    handleBoardUpdate(ws, data);
                    break;
                case 'GAME_OVER':
                    handleGameOver(ws, data);
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    // Handle disconnections
    ws.on('close', () => {
        console.log('Client disconnected');
        const playerId = ws.playerId;
        const gameId = ws.gameId;
        if (playerId) {
            handlePlayerDisconnect(playerId, gameId);
        }
    });
    
    // Handle player joining a game
    function handleJoinGame(ws, data) {
    // Validate player name
    const playerName = (data.playerName || '').trim().substring(0, 20) || 'Player';
    
    // Generate a unique player ID
    playerId = 'player_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    playerSockets[playerId] = ws;
    ws.playerId = playerId; // Store player ID directly on the WebSocket connection
    
    const player = {
        id: playerId,
        name: playerName,
        ready: false,
    joinTime: Date.now()
    };
    
        // Check if there are players waiting
        if (waitingPlayers.length > 0) {
            // Match with a waiting player (first in queue for fairness)
            const opponent = waitingPlayers.shift();
            gameId = 'game_' + Date.now();
            
            // Create a new game
            games[gameId] = {
                id: gameId,
                players: [opponent, player],
                pieceQueue: [],
                active: false
            };
            
            // Update both players' gameId
            playerSockets[opponent.id].gameId = gameId;
            ws.gameId = gameId; // Store game ID directly on the WebSocket connection
            
            // Notify both players about the match
            sendToPlayer(opponent.id, {
                type: 'GAME_MATCHED',
                gameId: gameId,
                players: [
                    { id: opponent.id, name: opponent.name },
                    { id: player.id, name: player.name }
                ],
                yourId: opponent.id
            });
            
            sendToPlayer(playerId, {
                type: 'GAME_MATCHED',
                gameId: gameId,
                players: [
                    { id: opponent.id, name: opponent.name },
                    { id: player.id, name: player.name }
                ],
                yourId: playerId
            });
            
            console.log(`Matched players: ${opponent.name} and ${player.name} in game ${gameId}`);
        } else {
            // Add to waiting queue
            waitingPlayers.push(player);
            
            // Notify player they're in queue
            sendToPlayer(playerId, {
                type: 'WAITING',
                position: waitingPlayers.length,
                playerId: playerId
            });
            
            console.log(`Player ${player.name} (${playerId}) added to waiting queue`);
        }
    }
    
    // Handle player leaving game/queue
    function handleLeaveGame(ws, data) {
        const playerId = ws.playerId;
        const gameId = ws.gameId;
        
        if (!playerId) return;
        
        // Remove from waiting queue if applicable
        const waitingIndex = waitingPlayers.findIndex(p => p.id === playerId);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
            console.log(`Player ${playerId} removed from waiting queue`);
        }
        
        // Handle leaving active game
        if (gameId && games[gameId]) {
            const game = games[gameId];
            
            // Notify other players
            game.players.forEach(player => {
                if (player.id !== playerId) {
                    sendToPlayer(player.id, {
                        type: 'OPPONENT_LEFT',
                        playerId: playerId
                    });
                }
            });
            
            // Delete game if necessary
            delete games[gameId];
            console.log(`Game ${gameId} ended because player ${playerId} left`);
            
            // Check if we can match the remaining player with someone waiting
            game.players.forEach(player => {
                if (player.id !== playerId && playerSockets[player.id]) {
                    // If there are waiting players, suggest a new match
                    if (waitingPlayers.length > 0) {
                        sendToPlayer(player.id, {
                            type: 'NEW_MATCH_AVAILABLE'
                        });
                    }
                }
            });
        }
        
        // Clean up player data
        delete playerSockets[playerId];
    }
    
    // Handle player ready state
    function handlePlayerReady(ws, data) {
        const playerId = ws.playerId;
        const gameId = ws.gameId;
        
        console.log(`Handling READY message from player ${playerId} for game ${gameId}`);
        
        if (!playerId) {
            console.log('Player ID is missing!');
            return;
        }
        
        if (!gameId) {
            console.log('Game ID is missing!');
            return;
        }
        
        if (!games[gameId]) {
            console.log(`Game ${gameId} not found!`);
            return;
        }
        
        const game = games[gameId];
        console.log(`Game state before ready: ${JSON.stringify(game)}`);
        
        const playerIndex = game.players.findIndex(p => p.id === playerId);
        
        if (playerIndex === -1) {
            console.log(`Player ${playerId} not found in game ${gameId}!`);
            return;
        }
        
        game.players[playerIndex].ready = true;
        console.log(`Player ${game.players[playerIndex].name} is now ready in game ${gameId}`);
        console.log(`Game players after update: ${JSON.stringify(game.players)}`);
        
        // Check if all players are ready
        const allReady = game.players.every(p => p.ready);
        console.log(`All players ready: ${allReady}`);
        
        // Notify all players about ready state
        game.players.forEach(player => {
            sendToPlayer(player.id, {
                type: 'PLAYER_READY',
                playerId: playerId
            });
        });
        
        if (allReady) {
            console.log(`All players are ready in game ${gameId}. Starting game!`);
            
            // Start the game
            game.active = true;
            
            // Generate initial piece queue (7 pieces)
            const initialPieces = generateRandomPieces(7);
            game.pieceQueue = initialPieces;
            console.log(`Generated initial pieces: ${JSON.stringify(initialPieces)}`);
            
            // Notify all players that game is starting
            game.players.forEach(player => {
                console.log(`Sending GAME_START to player ${player.id}`);
                sendToPlayer(player.id, {
                    type: 'GAME_START',
                    pieceQueue: initialPieces
                });
            });
            
            console.log(`Game ${gameId} started with ${game.players.length} players`);
        }
    }
    
    // Handle next piece broadcast
    function handleNextPiece(ws, data) {
        const playerId = ws.playerId;
        const gameId = ws.gameId;
        
        if (!gameId || !games[gameId] || !games[gameId].active) return;
        
        const game = games[gameId];
        
        // Add the new piece to the game's piece queue
        game.pieceQueue.push(data.pieceType);
        
        // Broadcast to all other players in the game
        game.players.forEach(player => {
            if (player.id !== playerId) {
                sendToPlayer(player.id, {
                    type: 'NEXT_PIECE',
                    pieceType: data.pieceType
                });
            }
        });
    }
    
    // Handle player attack
    function handleAttack(ws, data) {
        const playerId = ws.playerId;
        const gameId = ws.gameId;
        
        if (!gameId || !games[gameId] || !games[gameId].active) return;
        
        const game = games[gameId];
        
        // Send attack to all other players
        game.players.forEach(player => {
            if (player.id !== playerId) {
                sendToPlayer(player.id, {
                    type: 'ATTACK',
                    from: data.from,
                    lines: data.lines
                });
            }
        });
    }
    
    // Handle game over
    function handleGameOver(ws, data) {
        const playerId = ws.playerId;
        const gameId = ws.gameId;
        
        if (!gameId || !games[gameId]) return;
        
        const game = games[gameId];
        
        // Notify other players
        game.players.forEach(player => {
            if (player.id !== playerId) {
                sendToPlayer(player.id, {
                    type: 'OPPONENT_GAME_OVER',
                    playerId: playerId
                });
            }
        });
        
        // Check if all players are done
        const remainingPlayers = game.players.filter(p => 
            p.id !== playerId && playerSockets[p.id]
        );
        
        if (remainingPlayers.length <= 1) {
            // Game is over, notify remaining player they won
            if (remainingPlayers.length === 1) {
                sendToPlayer(remainingPlayers[0].id, {
                    type: 'GAME_WON'
                });
            }
            
            // Delete the game
            delete games[gameId];
            console.log(`Game ${gameId} ended`);
        }
    }

    // Handle board updates
    function handleBoardUpdate(ws, data) {
        const playerId = ws.playerId;
        const gameId = ws.gameId;
        
        if (!gameId || !games[gameId] || !games[gameId].active) {
            console.log(`Cannot handle board update: invalid game state for player ${playerId}`);
            return;
        }
        
        const game = games[gameId];
        
        // Send the board update to all other players
        game.players.forEach(player => {
            if (player.id !== playerId) {
                console.log(`Sending board update from ${playerId} to ${player.id}`);
                sendToPlayer(player.id, {
                    type: 'OPPONENT_BOARD_UPDATE',
                    playerId: playerId,
                    board: data.board
                });
            }
        });
    }
});

// Handle player disconnect
function handlePlayerDisconnect(playerId, gameId) {
    // Remove from waiting queue
    const waitingIndex = waitingPlayers.findIndex(p => p.id === playerId);
    if (waitingIndex !== -1) {
        waitingPlayers.splice(waitingIndex, 1);
    }
    
    // Handle active game
    if (gameId && games[gameId]) {
        const game = games[gameId];
        
        // Notify other players
        game.players.forEach(player => {
            if (player.id !== playerId && playerSockets[player.id]) {
                sendToPlayer(player.id, {
                    type: 'OPPONENT_DISCONNECTED',
                    playerId: playerId
                });
            }
        });
        
        // Check if game should end
        const remainingPlayers = game.players.filter(p => 
            p.id !== playerId && playerSockets[p.id]
        );
        
        if (remainingPlayers.length <= 1) {
            // Game is over, notify remaining player they won
            if (remainingPlayers.length === 1) {
            sendToPlayer(remainingPlayers[0].id, {
            type: 'GAME_WON'
            });
                
                // Match this player with someone waiting if possible
                if (waitingPlayers.length > 0) {
                    const winningPlayer = remainingPlayers[0];
                    const winningSocket = playerSockets[winningPlayer.id];
                        
                        if (winningSocket) {
                            // Send notification that a new match is available
                            sendToPlayer(winningPlayer.id, {
                                type: 'NEW_MATCH_AVAILABLE'
                            });
                        }
                    }
                }
                
                // Delete the game
                delete games[gameId];
                console.log(`Game ${gameId} ended due to disconnections`);
        }
    }
    
    // Clean up player data
    delete playerSockets[playerId];
}

// Helper function to send message to a specific player
function sendToPlayer(playerId, data) {
    const ws = playerSockets[playerId];
    if (ws) {
        ws.send(JSON.stringify(data));
    }
}

// Helper function to generate random piece sequence
function generateRandomPieces(count) {
    const pieces = [];
    for (let i = 0; i < count; i++) {
        pieces.push(Math.floor(Math.random() * 7) + 1);
    }
    return pieces;
}

// Setup WebSocket heartbeat for keeping connections alive behind proxies
function heartbeat() {
    this.isAlive = true;
}

wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('pong', heartbeat);
});

// Ping all clients every 30 seconds to keep connections alive
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
            // Client hasn't responded to ping, terminate connection
            const playerId = ws.playerId;
            const gameId = ws.gameId;
            if (playerId) {
                handlePlayerDisconnect(playerId, gameId);
            }
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000); // 30 second ping

// Clean up interval on server shutdown
process.on('SIGINT', function() {
    clearInterval(interval);
    process.exit(0);
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`blocq server listening on all interfaces on port ${PORT}`);
    console.log(`Access locally at http://localhost:${PORT}`);
    console.log(`Access from other devices via public URL`);
    console.log(`Active games: 0 | Waiting players: 0`);
    
    // Log server statistics every minute
    setInterval(() => {
        console.log(`---SERVER STATS---`);
        console.log(`Active games: ${Object.keys(games).length} | Waiting players: ${waitingPlayers.length}`);
        console.log(`Connected players: ${Object.keys(playerSockets).length}`);
    }, 60000); // Log stats every minute
}); 