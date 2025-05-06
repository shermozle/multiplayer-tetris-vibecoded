const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Game state
const games = {}; // Stores active games
const waitingPlayers = []; // Queue of players waiting for a match
const playerSockets = {}; // Map of player IDs to WebSocket connections

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    
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
        playerId = 'player_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        playerSockets[playerId] = ws;
        ws.playerId = playerId; // Store player ID directly on the WebSocket connection
        
        const player = {
            id: playerId,
            name: data.playerName,
            ready: false
        };
        
        // Check if there are players waiting
        if (waitingPlayers.length > 0) {
            // Match with a waiting player
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

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tetris server listening on all interfaces on port ${PORT}`);
    console.log(`Access locally at http://localhost:${PORT}`);
    console.log(`Access from other devices on the same network at http://<your-ip-address>:${PORT}`);
}); 