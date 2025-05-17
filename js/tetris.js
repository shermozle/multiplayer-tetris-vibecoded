document.addEventListener('DOMContentLoaded', () => {
    // WebSocket connection
    let socket;
    let isConnected = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    // Initialize WebSocket connection
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        
        // Construct WebSocket URL
        let wsUrl;
        if (window.location.hostname === 'localhost') {
            // For local development, use port 3000
            wsUrl = `${protocol}//${host}:3000`;
        } else {
            // For production, use the same port as the HTTP server
            wsUrl = `${protocol}//${host}`;
        }
        
        console.log(`Attempting to connect to WebSocket at ${wsUrl}`);
        
        try {
            socket = new WebSocket(wsUrl);
            
            socket.onopen = function() {
                console.log('WebSocket connection established');
                isConnected = true;
                reconnectAttempts = 0;
                
                // If player was in a game and reconnected, attempt to rejoin
                if (isMultiplayer && playerName && gameId) {
                    sendMessage({
                        type: 'REJOIN_GAME',
                        gameId: gameId,
                        playerId: playerId,
                        playerName: playerName
                    });
                }
            };
            
            socket.onclose = function(event) {
                console.log('WebSocket connection closed', event);
                isConnected = false;
                
                // Attempt to reconnect if not intentionally closed
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                    setTimeout(connectWebSocket, 2000);
                } else {
                    console.log('Max reconnect attempts reached');
                    showConnectionError();
                }
            };
            
            socket.onerror = function(error) {
                console.error('WebSocket error:', error);
                // Show error to user
                showConnectionError();
            };
            
            socket.onmessage = function(event) {
                handleServerMessage(event.data);
            };
        } catch (error) {
            console.error('Error creating WebSocket connection:', error);
            showConnectionError();
        }
    }
    
    // Send message to the server
    function sendMessage(data) {
        if (isConnected && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        } else {
            console.error('Cannot send message, WebSocket is not connected');
        }
    }
    
    // Handle messages from the server
    function handleServerMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('Received message from server:', message);
            
            switch (message.type) {
                case 'WAITING':
                    handleWaitingMessage(message);
                    break;
                case 'GAME_MATCHED':
                    handleGameMatchedMessage(message);
                    break;
                case 'PLAYER_READY':
                    handlePlayerReadyMessage(message);
                    break;
                case 'GAME_START':
                    handleGameStartMessage(message);
                    break;
                case 'NEXT_PIECE':
                    handleNextPieceMessage(message);
                    break;
                case 'ATTACK':
                    handleAttackMessage(message);
                    break;
                case 'OPPONENT_BOARD_UPDATE':
                    handleOpponentBoardUpdateMessage(message);
                    break;
                case 'OPPONENT_GAME_OVER':
                    handleOpponentGameOverMessage(message);
                    break;
                case 'OPPONENT_LEFT':
                case 'OPPONENT_DISCONNECTED':
                    handleOpponentLeftMessage(message);
                    break;
                case 'GAME_WON':
                    handleGameWonMessage(message);
                    break;
                case 'NEW_MATCH_AVAILABLE':
                    handleNewMatchAvailable(message);
                    break;
                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing server message:', error);
        }
    }
    
    // Show connection error message
    function showConnectionError() {
        alert('Unable to connect to the game server. Please try again later.');
    }
    
    // Handle WAITING message
    function handleWaitingMessage(message) {
        playerId = message.playerId;
        playerCount.textContent = message.position;
        
        // Update UI to show waiting status
        showWaitingRoom();
    }
    
    // Handle PLAYER_READY message
    function handlePlayerReadyMessage(message) {
        const readyPlayerId = message.playerId;
        console.log(`Player ${readyPlayerId} is ready`);
        
        // Update opponent ready status if applicable
        if (opponents[readyPlayerId]) {
            opponents[readyPlayerId].ready = true;
            
            // Update UI to show opponent is ready
            console.log(`Player ${opponents[readyPlayerId].name} is ready`);
            
            // Add visual indication that opponent is ready
            const opponentElement = document.getElementById(`opponent-${readyPlayerId}`);
            if (opponentElement) {
                const readyIndicator = document.createElement('div');
                readyIndicator.className = 'ready-indicator';
                readyIndicator.textContent = 'READY';
                opponentElement.appendChild(readyIndicator);
            }
        }

        // Check if all players are ready
        const allPlayersReady = Object.values(opponents).every(opponent => opponent.ready);
        console.log('All players ready:', allPlayersReady);

        // If all players are ready, update UI but don't send another READY message
        if (allPlayersReady) {
            console.log('All players are ready, waiting for server to start game...');
            startBtn.disabled = true;
            startBtn.textContent = 'Starting...';
        }
    }
    
    // Handle GAME_MATCHED message
    function handleGameMatchedMessage(message) {
        console.log('Game matched:', message);
        gameId = message.gameId;
        playerId = message.yourId;
        
        // Clear previous opponents
        opponents = {};
        opponentBoards.innerHTML = '';
        
        // Set up opponent data
        message.players.forEach(player => {
            if (player.id !== playerId) {
                opponents[player.id] = {
                    id: player.id,
                    name: player.name,
                    board: createBoard(BOARD_WIDTH, BOARD_HEIGHT),
                    ready: false
                };
                
                // Create opponent UI
                createOpponentBoard(opponents[player.id]);
                
                // Log opponent setup
                console.log(`Opponent board created for ${player.name} (${player.id})`);
            }
        });
        
        // Show game container with opponent boards
        showGameContainer();

        // Enable start button for the current player
        startBtn.disabled = false;
        startBtn.textContent = 'Ready';
    }
    
    // Handle GAME_START message
    function handleGameStartMessage(message) {
        console.log('Game starting with pieces:', message.pieceQueue);
        
        // Initialize piece queue from server
        pieceQueue = message.pieceQueue || [];
        
        // Reset game state
        board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
        resetScore();
        gameOver = false;
        isPaused = false;
        
        // Create initial piece
        createNewPiece();
        drawBoard();
        drawNextPiece();
        
        // Enable start button and update text
        startBtn.disabled = false;
        startBtn.textContent = 'Restart';
        
        // Start the game immediately
        console.log('Starting game now...');
        cancelAnimationFrame(animationId);
        lastTime = 0;
        draw();
        
        // Play background music if enabled
        if (musicEnabled) {
            bgMusic.play().catch(e => console.log("Couldn't play background music:", e));
        }

        // Show mobile controls overlay and enter fullscreen on mobile devices
        if (isMobileDevice()) {
            console.log('Mobile device detected, showing controls overlay');
            // Small delay to ensure game container is ready
            setTimeout(() => {
                showMobileControlsOverlay();
            }, 100);
            
            try {
                enterFullscreen();
            } catch (error) {
                console.error('Failed to enter fullscreen:', error);
                tryFallbackFullscreen();
            }
        }
    }
    
    // Handle NEXT_PIECE message
    function handleNextPieceMessage(message) {
        // Add new piece to the queue
        pieceQueue.push(message.pieceType);
    }
    
    // Handle ATTACK message
    function handleAttackMessage(message) {
        console.log(`Received attack from ${message.from}: ${message.lines} lines`);
        
        // Add attack to queue to be processed
        attackQueue.push({
            from: message.from,
            lines: message.lines
        });
        
        // Play attack sound immediately to give feedback
        attackSound.currentTime = 0;
        attackSound.play().catch(e => console.log("Couldn't play attack sound:", e));
    }
    
    // Handle opponent board update
    function handleOpponentBoardUpdateMessage(message) {
        const opponentId = message.playerId;
        
        if (opponents[opponentId]) {
            console.log(`Updating board for opponent ${opponentId}`);
            // Update opponent's board with the new state
            opponents[opponentId].board = message.board;
            
            // Redraw the opponent's board
            if (opponents[opponentId].canvas) {
                drawOpponentBoard(opponents[opponentId].canvas, opponents[opponentId].board);
            }
        }
    }
    
    // Handle OPPONENT_GAME_OVER message
    function handleOpponentGameOverMessage(message) {
        const defeatedId = message.playerId;
        
        if (opponents[defeatedId]) {
            // Mark opponent as defeated
            console.log(`Opponent ${opponents[defeatedId].name} lost`);
            
            // You could update UI to show opponent is defeated
            const opponentElement = document.getElementById(`opponent-${defeatedId}`);
            if (opponentElement) {
                opponentElement.classList.add('defeated');
                
                const defeatOverlay = document.createElement('div');
                defeatOverlay.className = 'defeat-overlay';
                defeatOverlay.textContent = 'DEFEATED';
                opponentElement.appendChild(defeatOverlay);
            }
        }
    }
    
    // Handle OPPONENT_LEFT or OPPONENT_DISCONNECTED message
    function handleOpponentLeftMessage(message) {
        const leftId = message.playerId;
        
        if (opponents[leftId]) {
            // Show message that opponent left
            console.log(`Opponent ${opponents[leftId].name} left the game`);
            
            // You could update UI to show opponent left
            const opponentElement = document.getElementById(`opponent-${leftId}`);
            if (opponentElement) {
                opponentElement.classList.add('left');
                
                const leftOverlay = document.createElement('div');
                leftOverlay.className = 'left-overlay';
                leftOverlay.textContent = 'LEFT GAME';
                opponentElement.appendChild(leftOverlay);
            }
        }
    }
    
    // Handle GAME_WON message
    function handleGameWonMessage(message) {
        // Player won the game
        console.log('You won the game!');
        
        // Show victory message
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = 'gold';
        ctx.textAlign = 'center';
        ctx.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2 - 40);
        
        ctx.font = '24px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2);
        ctx.fillText('You defeated all opponents!', canvas.width / 2, canvas.height / 2 + 40);
        
        // Stop the game
        gameOver = true;
        cancelAnimationFrame(animationId);
    }
    
    // DOM elements - UI components
    const gameModes = document.getElementById('game-modes');
    const singlePlayerBtn = document.getElementById('single-player-btn');
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    const playerSetup = document.getElementById('player-setup');
    const playerNameInput = document.getElementById('player-name');
    const startMultiplayerBtn = document.getElementById('start-multiplayer-btn');
    const backBtn = document.getElementById('back-btn');
    const waitingRoom = document.getElementById('waiting-room');
    const playerCount = document.getElementById('player-count');
    const cancelWaitBtn = document.getElementById('cancel-wait-btn');
    const gameContainer = document.getElementById('game-container');
    const opponentBoards = document.getElementById('opponent-boards');
    const playerBoardName = document.getElementById('player-board-name');
    const musicToggleBtn = document.getElementById('music-toggle-btn');

    // Game elements
    const canvas = document.getElementById('game');
    const nextPieceCanvas = document.getElementById('next-piece');
    const ctx = canvas.getContext('2d');
    const nextPieceCtx = nextPieceCanvas.getContext('2d');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const linesElement = document.getElementById('lines');

    // Audio elements
    const bgMusic = new Audio('assets/sounds/background-music.mp3'); // Using puzzle game music
    bgMusic.loop = true;
    bgMusic.volume = 0.5;
    
    // Sound effects
    const tapSound = new Audio();
    tapSound.src = 'assets/sounds/tap.mp3';
    tapSound.volume = 0.3;
    
    const clearSound = new Audio();
    clearSound.src = 'assets/sounds/clear.mp3';
    clearSound.volume = 0.4;
    
    const attackSound = new Audio();
    attackSound.src = 'assets/sounds/attack.mp3';
    attackSound.volume = 0.4;
    
    const speedUpSound = new Audio();
    speedUpSound.src = 'assets/sounds/speedup.mp3';
    speedUpSound.volume = 0.4;

    // Game constants
    const GRID_SIZE = 30;
    const BOARD_WIDTH = 10;
    const BOARD_HEIGHT = 20;
    const SMALL_GRID_SIZE = 15; // For opponent boards
    const COLORS = [
        null,
        '#FF0D72', // I
        '#0DC2FF', // J
        '#0DFF72', // L
        '#F538FF', // O
        '#FF8E0D', // S
        '#FFE138', // T
        '#3877FF'  // Z
    ];

    // Tetromino shapes
    const SHAPES = [
        null,
        // I
        [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ],
        // J
        [
            [2, 0, 0],
            [2, 2, 2],
            [0, 0, 0]
        ],
        // L
        [
            [0, 0, 3],
            [3, 3, 3],
            [0, 0, 0]
        ],
        // O
        [
            [4, 4],
            [4, 4]
        ],
        // S
        [
            [0, 5, 5],
            [5, 5, 0],
            [0, 0, 0]
        ],
        // T
        [
            [0, 6, 0],
            [6, 6, 6],
            [0, 0, 0]
        ],
        // Z
        [
            [7, 7, 0],
            [0, 7, 7],
            [0, 0, 0]
        ]
    ];

    // Multiplayer game state
    let isMultiplayer = false;
    let playerName = '';
    let gameId = null;
    let playerId = null;
    let opponents = {};
    let pieceQueue = [];
    let attackQueue = [];
    let intervalId = null;

    // Game state
    let board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
    let piece = null;
    let nextPiece = null;
    let score = 0;
    let level = 1;
    let lines = 0;
    let gameOver = false;
    let isPaused = false;
    let dropCounter = 0;
    let dropInterval = 1000; // Initial drop speed - 1 second
    let lastTime = 0;
    let animationId;
    let gameStartTime = 0; // Track when the game started

    // Multiplayer simulation - For demo purposes only
    // In a real implementation, this would be replaced with actual server communication
    const simulatedPlayers = [];
    const MAX_SIMULATED_PLAYERS = 3;

    // Music settings
    let musicEnabled = localStorage.getItem('tetrisMusicEnabled') !== 'false'; // Default to true

    // Update music toggle button state
    function updateMusicToggleButton() {
        musicToggleBtn.textContent = musicEnabled ? 'Music: On' : 'Music: Off';
        musicToggleBtn.classList.toggle('off', !musicEnabled);
        
        if (musicEnabled) {
            if (!isPaused && !gameOver) {
                bgMusic.play().catch(e => console.log("Couldn't play background music:", e));
            }
        } else {
            bgMusic.pause();
        }
    }

    // Initialize the game
    function init() {
        board = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
        resetScore();
        gameOver = false;
        createNewPiece();
        drawBoard();
        drawNextPiece();
        
        // Set game start time
        gameStartTime = Date.now();
        
        // Clear any previous speed notifications
        clearSpeedNotification();
        
        // Play background music when game starts (if enabled)
        if (musicEnabled && !isPaused) {
            bgMusic.play().catch(e => {
                console.log("Audio couldn't autoplay:", e);
            });
        }
        
        // Track game start event with Amplitude
        if (window.trackEvent) {
            trackEvent('Game Started', {
                game_mode: isMultiplayer ? 'Multiplayer' : 'Single Player',
                initial_level: level
            });
        }
    }

    // Create a new board
    function createBoard(width, height) {
        return Array(height).fill().map(() => Array(width).fill(0));
    }

    // Reset score metrics
    function resetScore() {
        score = 0;
        level = 1;
        lines = 0;
        dropInterval = 1000;
        updateScore();
    }

    // Show a temporary speed up notification
    function showSpeedNotification(level) {
        // Check if notification already exists
        let notification = document.getElementById('speed-notification');
        
        if (!notification) {
            // Create notification element
            notification = document.createElement('div');
            notification.id = 'speed-notification';
            notification.className = 'speed-notification';
            document.querySelector('.game-area').appendChild(notification);
        }
        
        // Update notification content
        notification.textContent = `Speed Up! Level ${level}`;
        notification.classList.add('show');
        
        // Remove notification after delay
        setTimeout(() => {
            if (notification) {
                notification.classList.remove('show');
            }
        }, 2000);
    }

    // Clear any speed notifications
    function clearSpeedNotification() {
        const notification = document.getElementById('speed-notification');
        if (notification) {
            notification.remove();
        }
    }

    // Update score
    function updateScore() {
        scoreElement.textContent = score;
        levelElement.textContent = level;
        linesElement.textContent = lines;
        
        // Check if score threshold for speed increase has been reached
        const speedIncreaseThreshold = 3000;
        const previousSpeedLevel = Math.floor((score - 1) / speedIncreaseThreshold);
        const currentSpeedLevel = Math.floor(score / speedIncreaseThreshold);
        
        // If we've crossed a 3000 point threshold, increase speed
        if (currentSpeedLevel > previousSpeedLevel) {
            // Calculate new drop interval - minimum 100ms
            dropInterval = Math.max(100, 1000 - (level - 1) * 100 - currentSpeedLevel * 50);
            console.log(`Speed increased at ${score} points! New drop interval: ${dropInterval}ms`);
            
            // Only play speed up sound if we're not at the start of the game (score > 0)
            if (score > 0) {
                speedUpSound.currentTime = 0;
                speedUpSound.play().catch(e => console.log("Couldn't play speed up sound:", e));
            }
            
            // Visual feedback for speed increase
            const flashEffect = () => {
                canvas.style.boxShadow = '0 0 20px rgba(255, 255, 0, 0.7)';
                setTimeout(() => {
                    canvas.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.3)';
                }, 300);
            };
            flashEffect();
            
            // Show notification
            showSpeedNotification(currentSpeedLevel + 1);
        }
    }

    // Create a new random piece
    function createPiece(type) {
        return {
            pos: {x: BOARD_WIDTH / 2 - 1, y: 0},
            shape: SHAPES[type],
            type: type
        };
    }

    // Choose random tetrominoes
    function randomPiece() {
        // In multiplayer mode, use the shared piece queue
        if (isMultiplayer && pieceQueue.length > 0) {
            return pieceQueue.shift();
        }
        // Otherwise, generate a random piece
        const randomType = Math.floor(Math.random() * 7) + 1;
        
        // In multiplayer mode, add the piece to the queue for other players
        if (isMultiplayer) {
            broadcastNextPiece(randomType);
        }
        
        return randomType;
    }

    // Create a new piece and set up next piece
    function createNewPiece() {
        if (!nextPiece) {
            nextPiece = randomPiece();
        }
        piece = createPiece(nextPiece);
        nextPiece = randomPiece();
        drawNextPiece();

        // Check if game is over (can't place new piece)
        if (checkCollision()) {
            gameOver = true;
            cancelAnimationFrame(animationId);
            drawGameOver();
            
            // If multiplayer, notify of game over
            if (isMultiplayer) {
                broadcastGameOver();
            }
        }
    }

    // Draw the next piece preview
    function drawNextPiece() {
        nextPieceCtx.clearRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);
        
        if (!nextPiece) return;
        
        const shape = SHAPES[nextPiece];
        const blockSize = 20;
        const offsetX = (nextPieceCanvas.width - shape[0].length * blockSize) / 2;
        const offsetY = (nextPieceCanvas.height - shape.length * blockSize) / 2;
        
        shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    nextPieceCtx.fillStyle = COLORS[nextPiece];
                    nextPieceCtx.fillRect(offsetX + x * blockSize, offsetY + y * blockSize, blockSize, blockSize);
                    nextPieceCtx.strokeStyle = '#000';
                    nextPieceCtx.strokeRect(offsetX + x * blockSize, offsetY + y * blockSize, blockSize, blockSize);
                }
            });
        });
    }

    // Draw the current game state
    function draw(time = 0) {
        if (gameOver || isPaused) return;

        const deltaTime = time - lastTime;
        lastTime = time;

        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            dropPiece();
        }

        drawBoard();
        
        // Update opponent boards in multiplayer mode
        if (isMultiplayer) {
            for (const opponentId in opponents) {
                const opponent = opponents[opponentId];
                if (opponent.canvas) {
                    drawOpponentBoard(opponent.canvas, opponent.board);
                }
            }
            
            // Process any pending attacks
            if (attackQueue.length > 0 && !checkCollision()) {
                processAttack();
            }
        }
        
        animationId = requestAnimationFrame(draw);
    }

    // Draw the game board
    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw board (placed pieces)
        board.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    ctx.fillStyle = COLORS[value];
                    ctx.fillRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                    ctx.strokeStyle = '#000';
                    ctx.strokeRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                }
            });
        });
        
        // Draw current piece
        if (piece) {
            piece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        ctx.fillStyle = COLORS[piece.type];
                        ctx.fillRect((piece.pos.x + x) * GRID_SIZE, (piece.pos.y + y) * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                        ctx.strokeStyle = '#000';
                        ctx.strokeRect((piece.pos.x + x) * GRID_SIZE, (piece.pos.y + y) * GRID_SIZE, GRID_SIZE, GRID_SIZE);
                    }
                });
            });
        }
    }

    // Draw opponent's board
    function drawOpponentBoard(opponentCanvas, opponentBoard) {
        const opponentCtx = opponentCanvas.getContext('2d');
        const smallGridSize = SMALL_GRID_SIZE;
        
        opponentCtx.clearRect(0, 0, opponentCanvas.width, opponentCanvas.height);
        
        // Draw opponent's board
        opponentBoard.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    opponentCtx.fillStyle = COLORS[value];
                    opponentCtx.fillRect(x * smallGridSize, y * smallGridSize, smallGridSize, smallGridSize);
                    opponentCtx.strokeStyle = '#000';
                    opponentCtx.strokeRect(x * smallGridSize, y * smallGridSize, smallGridSize, smallGridSize);
                }
            });
        });
    }

    // Draw game over text
    function drawGameOver() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);
        
        ctx.font = '24px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2);
        ctx.fillText('Press Start to play again', canvas.width / 2, canvas.height / 2 + 40);
        
        // Track game over event with Amplitude
        if (window.trackEvent) {
            trackEvent('Game Over', {
                final_score: score,
                final_level: level,
                lines_cleared: lines,
                game_mode: isMultiplayer ? 'Multiplayer' : 'Single Player',
                game_duration_ms: Date.now() - gameStartTime
            });
        }
    }
    
    // Handle new match available notification
    function handleNewMatchAvailable(message) {
        // Show dialog to ask user if they want to join a new match
        if (confirm('Another player is waiting for a match. Join new game?')) {
            // Reset game state
            resetGameState();
            
            // Join a new game with the same player name
            sendMessage({
                type: 'JOIN_GAME',
                playerName: playerName
            });
        }
    }
    
    // Reset game state for a new match
    function resetGameState() {
        // Clear game boards and reset variables
        gameId = null;
        opponents = {};
        opponentBoards.innerHTML = '';
        pieceQueue = [];
        attackQueue = [];
        gameOver = true;
        cancelAnimationFrame(animationId);
    }

    // Check for collision
    function checkCollision() {
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x] !== 0) {
                    const boardX = piece.pos.x + x;
                    const boardY = piece.pos.y + y;
                    
                    // Check if outside board boundaries or colliding with placed pieces
                    if (
                        boardX < 0 || 
                        boardX >= BOARD_WIDTH || 
                        boardY >= BOARD_HEIGHT ||
                        (boardY >= 0 && board[boardY][boardX] !== 0)
                    ) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Merge the current piece with the board
    function mergePiece() {
        piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    board[piece.pos.y + y][piece.pos.x + x] = piece.type;
                }
            });
        });
        
        // If in multiplayer mode, broadcast board update after placing piece
        if (isMultiplayer) {
            broadcastBoardUpdate();
        }
    }

    // Drop the current piece
    function dropPiece() {
        piece.pos.y++;
        if (checkCollision()) {
            piece.pos.y--;
            mergePiece();
            
            // Play tap sound when piece is placed
            tapSound.currentTime = 0;
            tapSound.play().catch(e => console.log("Couldn't play tap sound:", e));
            
            clearLines();
            createNewPiece();
        }
        dropCounter = 0;
    }

    // Check and clear completed lines
    function clearLines() {
        let linesCleared = 0;
        
        outer: for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (board[y][x] === 0) continue outer;
            }
            
            // Line is complete, remove it and add a new empty line at the top
            const row = board.splice(y, 1)[0].fill(0);
            board.unshift(row);
            y++; // Check the same position again (now with the new line)
            
            linesCleared++;
        }
        
        if (linesCleared > 0) {
            // Play clear sound when lines are cleared
            clearSound.currentTime = 0;
            clearSound.play().catch(e => console.log("Couldn't play clear sound:", e));
            
            // Update score
            const lineScores = [40, 100, 300, 1200]; // Single, double, triple, tetris
            const pointsEarned = lineScores[linesCleared - 1] * level;
            score += pointsEarned;
            lines += linesCleared;
            
            // Level up every 10 lines
            const newLevel = Math.floor(lines / 10) + 1;
            if (newLevel > level) {
                level = newLevel;
                // Increase speed with each level
                dropInterval = Math.max(100, 1000 - (level - 1) * 100);
                
                // Track level up event with Amplitude
                if (window.trackEvent) {
                    trackEvent('Level Up', {
                        new_level: level,
                        lines_cleared: lines,
                        current_score: score
                    });
                }
            }
            
            updateScore();
            
            // In multiplayer mode, send an attack if more than 1 line was cleared
            if (isMultiplayer && linesCleared > 1) {
                sendAttack(linesCleared - 1);
            }
            
            // Broadcast updated board after clearing lines
            if (isMultiplayer) {
                broadcastBoardUpdate();
            }
        }
    }

    // Move the piece horizontally
    function movePiece(dir) {
        piece.pos.x += dir;
        if (checkCollision()) {
            piece.pos.x -= dir;
        }
    }

    // Rotate the piece clockwise
    function rotatePiece() {
        const originalShape = piece.shape;
        
        // Create rotated shape
        const rows = piece.shape.length;
        const cols = piece.shape[0].length;
        
        // Transpose and reverse to rotate 90 degrees clockwise
        piece.shape = piece.shape[0].map((_, colIndex) => 
            piece.shape.map(row => row[colIndex]).reverse()
        );
        
        // If collision occurs, revert back
        if (checkCollision()) {
            piece.shape = originalShape;
        }
    }

    // Rotate the piece counter-clockwise
    function rotatePieceCounterClockwise() {
        const originalShape = piece.shape;
        
        // Create rotated shape
        const rows = piece.shape.length;
        const cols = piece.shape[0].length;
        
        // Transpose and reverse to rotate 90 degrees counter-clockwise
        piece.shape = piece.shape[0].map((_, colIndex) => 
            piece.shape.map(row => row[piece.shape.length - 1 - colIndex])
        );
        
        // If collision occurs, revert back
        if (checkCollision()) {
            piece.shape = originalShape;
        }
    }

    // Hard drop - instantly drop the piece to the bottom
    function hardDrop() {
        console.log("Hard drop triggered");
        if (!piece || gameOver || isPaused) {
            console.log("Cannot hard drop: piece exists:", !!piece, "gameOver:", gameOver, "isPaused:", isPaused);
            return;
        }
        
        let dropDistance = 0;
        
        // Move down until collision
        while (true) {
            piece.pos.y++;
            if (checkCollision()) {
                piece.pos.y--;
                break;
            }
            dropDistance++;
        }
        
        console.log("Drop distance:", dropDistance);
        
        // Add points for hard drop - 2 points per cell dropped
        if (dropDistance > 0) {
            score += dropDistance * 2;
            updateScore();
            mergePiece();
            
            // Play tap sound when piece is placed
            tapSound.currentTime = 0;
            tapSound.play().catch(e => console.log("Couldn't play tap sound:", e));
            
            clearLines();
            createNewPiece();
            dropCounter = 0;
            
            // Broadcast board update after hard drop
            if (isMultiplayer) {
                broadcastBoardUpdate();
            }
        }
    }

    // Process an attack from opponent
    function processAttack() {
        if (attackQueue.length === 0) return;
        
        const attack = attackQueue.shift();
        console.log(`Processing attack of ${attack.lines} lines from ${attack.from}`);
        
        // Play attack sound
        attackSound.currentTime = 0;
        attackSound.play().catch(e => console.log("Couldn't play attack sound:", e));
        
        // Move existing rows up
        for (let i = 0; i < attack.lines; i++) {
            board.shift(); // Remove top row
            
            // Create a new "garbage" row with one random empty cell
            const garbageRow = Array(BOARD_WIDTH).fill(1); // Use type 1 (I-piece color) for garbage
            const emptyCell = Math.floor(Math.random() * BOARD_WIDTH);
            garbageRow[emptyCell] = 0; // Leave one random cell empty
            
            board.push(garbageRow); // Add at bottom
        }
    }

    // Send attack to other players
    function sendAttack(lineCount) {
        if (isConnected && isMultiplayer) {
            console.log(`Sending attack of ${lineCount} lines to opponents`);
            sendMessage({
                type: 'ATTACK',
                from: playerId,
                lines: lineCount
            });
        }
    }

    // Broadcast the next piece to all players
    function broadcastNextPiece(pieceType) {
        if (isConnected && isMultiplayer) {
            sendMessage({
                type: 'NEXT_PIECE',
                pieceType: pieceType
            });
        }
    }

    // Broadcast game over status
    function broadcastGameOver() {
        if (isConnected && isMultiplayer) {
            sendMessage({
                type: 'GAME_OVER'
            });
        }
    }

    // Send board update to all players
    function broadcastBoardUpdate() {
        if (isConnected && isMultiplayer) {
            sendMessage({
                type: 'BOARD_UPDATE',
                board: board
            });
        }
    }

    // Create the opponent board UI elements
    function createOpponentBoard(opponent) {
        const opponentBoardDiv = document.createElement('div');
        opponentBoardDiv.className = 'opponent-board';
        opponentBoardDiv.id = `opponent-${opponent.id}`;
        
        const opponentNameElement = document.createElement('div');
        opponentNameElement.className = 'opponent-name';
        opponentNameElement.textContent = opponent.name;
        
        const opponentCanvas = document.createElement('canvas');
        opponentCanvas.width = 150;
        opponentCanvas.height = 300;
        opponentCanvas.id = `canvas-${opponent.id}`;
        
        opponentBoardDiv.appendChild(opponentNameElement);
        opponentBoardDiv.appendChild(opponentCanvas);
        
        opponentBoards.appendChild(opponentBoardDiv);
        
        // Save canvas reference to opponent object
        opponent.canvas = opponentCanvas;
        
        // Initialize opponent's board display
        drawOpponentBoard(opponentCanvas, opponent.board);
        
        console.log(`Created opponent board for ${opponent.name}`);
        
        return opponentCanvas;
    }

    // Set up multiplayer game with WebSockets
    function setupMultiplayerGame() {
        console.log("Setting up multiplayer game for player:", playerName);
        
        // Connect to WebSocket if not already connected
        if (!isConnected) {
            connectWebSocket();
        }
        
        // Send join game message to server
        sendMessage({
            type: 'JOIN_GAME',
            playerName: playerName
        });
        
        // Show waiting room until server responds
        showWaitingRoom();
    }

    // Event listeners for game controls
    document.addEventListener('keydown', (e) => {
        if (gameOver || isPaused) return;
        
        switch (e.code) {
            case 'ArrowLeft':
                movePiece(-1);
                break;
            case 'ArrowRight':
                movePiece(1);
                break;
            case 'ArrowDown':
                dropPiece();
                break;
            case 'ArrowUp':
                rotatePiece();
                break;
            case 'Space':
                e.preventDefault(); // Prevent scrolling with space bar
                hardDrop();
                break;
        }
    });

    // Add mobile controls overlay
    function showMobileControlsOverlay() {
        console.log('Attempting to show mobile controls overlay');
        
        // Remove any existing overlay first
        const existingOverlay = document.getElementById('mobile-controls-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // Create new overlay
        const overlay = document.createElement('div');
        overlay.id = 'mobile-controls-overlay';
        overlay.innerHTML = `
            <div class="mobile-controls-content">
                <h3>Mobile Controls</h3>
                <p>Hold to move left/right</p>
                <p>Up/down to rotate</p>
                <p>Double tap to hard drop</p>
            </div>
        `;
        
        // Add to game container
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            gameContainer.appendChild(overlay);
            console.log('Added overlay to game container');
            
            // Force a reflow
            overlay.offsetHeight;
            
            // Show the overlay
            requestAnimationFrame(() => {
                overlay.classList.add('show');
                console.log('Added show class to overlay');
            });
            
            // Hide after 2 seconds
            setTimeout(() => {
                overlay.classList.remove('show');
                console.log('Removed show class from overlay');
                // Remove from DOM after transition
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }, 2000);
        } else {
            console.error('Game container not found');
        }
    }

    // Modify the start button click handler for multiplayer
    startBtn.addEventListener('click', async () => {
        if (isMultiplayer) {
            console.log('Player clicked ready button');
            // In multiplayer, Start button signals player is ready
            sendMessage({
                type: 'READY'
            });
            startBtn.disabled = true;
            startBtn.textContent = 'Waiting...';
            
            // Track player ready event
            if (window.trackEvent) {
                trackEvent('Player Ready', {
                    player_name: playerName || 'Unknown'
                });
            }
        } else {
            console.log('Starting single player game');
            // In single player, Start button starts the game directly
            cancelAnimationFrame(animationId);
            init();
            isPaused = false;
            startBtn.textContent = 'Restart';
            draw();
            
            // Show mobile controls overlay and enter fullscreen on mobile devices
            if (isMobileDevice()) {
                console.log('Mobile device detected, showing controls overlay');
                // Small delay to ensure game container is ready
                setTimeout(() => {
                    showMobileControlsOverlay();
                }, 100);
                
                try {
                    await enterFullscreen();
                } catch (error) {
                    console.error('Failed to enter fullscreen:', error);
                    tryFallbackFullscreen();
                }
            }
            
            // Track button click
            if (window.trackEvent) {
                trackEvent('Button Clicked', {
                    button_name: 'Start/Restart',
                    game_mode: 'Single Player'
                });
            }
            
            // Ensure music is playing when game starts (if enabled)
            if (musicEnabled) {
                bgMusic.play().catch(e => console.log("Couldn't play background music:", e));
            }
        }
    });

    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
        
        // Track pause/resume action
        if (window.trackEvent) {
            trackEvent('Game ' + (isPaused ? 'Paused' : 'Resumed'), {
                current_score: score,
                current_level: level,
                lines_cleared: lines
            });
        }
        
        // Pause/resume music with game if music is enabled
        if (isPaused) {
            bgMusic.pause();
        } else if (musicEnabled) {
            bgMusic.play().catch(e => console.log("Couldn't play background music:", e));
            lastTime = 0;
            draw();
        } else {
            lastTime = 0;
            draw();
        }
    });

    // Event listeners for multiplayer menu
    singlePlayerBtn.addEventListener('click', () => {
        isMultiplayer = false;
        showGameContainer();
    });

    multiplayerBtn.addEventListener('click', () => {
        isMultiplayer = true;
        
        // Load previously used player name from localStorage
        const savedName = localStorage.getItem('tetrisPlayerName') || '';
        playerNameInput.value = savedName;
        
        // Connect to WebSocket if not already connected
        if (!isConnected) {
            connectWebSocket();
        }
        
        showPlayerSetup();
    });

    startMultiplayerBtn.addEventListener('click', () => {
        playerName = playerNameInput.value.trim();
        
        if (playerName === '') {
            alert('Please enter a name');
            return;
        }
        
        // Save player name to localStorage
        localStorage.setItem('tetrisPlayerName', playerName);
        
        // Set up multiplayer game
        setupMultiplayerGame();
    });

    backBtn.addEventListener('click', () => {
        showGameModes();
    });

    cancelWaitBtn.addEventListener('click', () => {
        // Notify server player is leaving the queue
        if (isConnected && playerId) {
            sendMessage({
                type: 'LEAVE_GAME'
            });
        }
        
        showGameModes();
    });

    // Music toggle button event listener
    musicToggleBtn.addEventListener('click', () => {
        musicEnabled = !musicEnabled;
        
        // Save preference to localStorage
        localStorage.setItem('tetrisMusicEnabled', musicEnabled);
        
        // Update button state and music playback
        updateMusicToggleButton();
    });

    // UI state management functions
    function showGameModes() {
        gameModes.classList.remove('hidden');
        playerSetup.classList.add('hidden');
        waitingRoom.classList.add('hidden');
        gameContainer.classList.add('hidden');
        opponentBoards.classList.add('hidden');
    }

    function showPlayerSetup() {
        gameModes.classList.add('hidden');
        playerSetup.classList.remove('hidden');
        waitingRoom.classList.add('hidden');
        gameContainer.classList.add('hidden');
    }

    function showWaitingRoom() {
        gameModes.classList.add('hidden');
        playerSetup.classList.add('hidden');
        waitingRoom.classList.remove('hidden');
        gameContainer.classList.add('hidden');
    }

    function showGameContainer() {
        gameModes.classList.add('hidden');
        playerSetup.classList.add('hidden');
        waitingRoom.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        
        if (isMultiplayer) {
            opponentBoards.classList.remove('hidden');
            playerBoardName.textContent = playerName || 'You';
        } else {
            opponentBoards.classList.add('hidden');
            playerBoardName.textContent = 'You';
        }
        
        // Initialize or reset the game
        cancelAnimationFrame(animationId);
        init();
        isPaused = true; // Start paused, waiting for player to press Start

        // Try to enter fullscreen on mobile devices
        if (isMobileDevice()) {
            try {
                enterFullscreen();
            } catch (error) {
                console.error('Failed to enter fullscreen:', error);
                tryFallbackFullscreen();
            }
        }
    }

    // Initialize WebSocket connection when page loads
    connectWebSocket();
    
    // Set initial music toggle button state
    updateMusicToggleButton();

    // Function to fetch and display server status
    async function fetchServerStatus() {
        try {
            const response = await fetch('/status');
            const data = await response.json();
            console.log('Server status:', data);
            
            // Update waiting room display if we're in the waiting room
            if (!waitingRoom.classList.contains('hidden')) {
                playerCount.textContent = data.waitingPlayers;
            }
            
            // Log server stats for debugging
            console.log(`Active games: ${data.games} | Waiting players: ${data.waitingPlayers} | Connected players: ${data.connectedPlayers}`);
        } catch (error) {
            console.error('Error fetching server status:', error);
        }
    }

    // Fetch server status every 5 seconds
    setInterval(fetchServerStatus, 5000);
    // Initial fetch
    fetchServerStatus();

    // Mobile touch controls and fullscreen mode
    const fullscreenStats = document.getElementById('fullscreen-stats');
    const fsScore = document.getElementById('fs-score');
    const fsLevel = document.getElementById('fs-level');
    const fsLines = document.getElementById('fs-lines');
    
    // Touch gesture tracking variables
    let lastTap = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let touchCurrentY = 0;
    let touchStartTime = 0;
    let touchMoveInterval = null;
    let hasMoved = false;

    // Check if device is mobile
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Add fullscreen mute button
    function createFullscreenMuteButton() {
        console.log('Creating fullscreen mute button');
        const muteBtn = document.createElement('button');
        muteBtn.className = 'fullscreen-mute-btn';
        muteBtn.innerHTML = musicEnabled ? '🔊' : '🔇';
        muteBtn.title = 'Toggle Sound';
        
        // Add to game container instead of body
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            gameContainer.appendChild(muteBtn);
            console.log('Added mute button to game container');
        } else {
            console.error('Game container not found, adding to body');
            document.body.appendChild(muteBtn);
        }

        muteBtn.addEventListener('click', () => {
            musicEnabled = !musicEnabled;
            localStorage.setItem('tetrisMusicEnabled', musicEnabled);
            
            // Update button appearance
            muteBtn.innerHTML = musicEnabled ? '🔊' : '🔇';
            muteBtn.classList.toggle('off', !musicEnabled);
            
            // Update music playback
            if (musicEnabled) {
                if (!isPaused && !gameOver) {
                    bgMusic.play().catch(e => console.log("Couldn't play background music:", e));
                }
            } else {
                bgMusic.pause();
            }
            
            // Update the regular music toggle button to match
            musicToggleBtn.textContent = musicEnabled ? 'Music: On' : 'Music: Off';
            musicToggleBtn.classList.toggle('off', !musicEnabled);
        });

        return muteBtn;
    }

    // Create the mute button
    const fullscreenMuteBtn = createFullscreenMuteButton();

    // Update the enterFullscreen function to show the mute button
    async function enterFullscreen() {
        try {
            console.log('Entering fullscreen mode');
            const gameContainer = document.getElementById('game-container');
            
            // Try to lock screen orientation to portrait
            if (screen.orientation && screen.orientation.lock) {
                try {
                    await screen.orientation.lock('portrait');
                } catch (e) {
                    console.log('Could not lock screen orientation:', e);
                }
            }

            // Try different fullscreen methods
            if (gameContainer.requestFullscreen) {
                await gameContainer.requestFullscreen();
            } else if (gameContainer.webkitRequestFullscreen) { // Safari
                await gameContainer.webkitRequestFullscreen();
            } else if (gameContainer.mozRequestFullScreen) { // Firefox
                await gameContainer.mozRequestFullScreen();
            } else if (gameContainer.msRequestFullscreen) { // IE11
                await gameContainer.msRequestFullscreen();
            }

            // Add our custom fullscreen class
            document.body.classList.add('fullscreen-mode');
            console.log('Added fullscreen-mode class to body');
            
            fullscreenStats.style.display = 'block';
            
            // Update mute button state and ensure it's visible
            fullscreenMuteBtn.innerHTML = musicEnabled ? '🔊' : '🔇';
            fullscreenMuteBtn.classList.toggle('off', !musicEnabled);
            fullscreenMuteBtn.style.display = 'flex';
            console.log('Updated mute button state');
            
            // Track fullscreen event
            if (window.trackEvent) {
                trackEvent('Fullscreen Entered', {
                    fullscreen_active: true,
                    device_type: isMobileDevice() ? 'Mobile' : 'Desktop'
                });
            }
        } catch (error) {
            console.error('Error entering fullscreen:', error);
            tryFallbackFullscreen();
        }
    }

    // Update the exitFullscreen function to hide the mute button
    async function exitFullscreen() {
        try {
            console.log('Exiting fullscreen mode');
            // Unlock screen orientation
            if (screen.orientation && screen.orientation.unlock) {
                try {
                    await screen.orientation.unlock();
                } catch (e) {
                    console.log('Could not unlock screen orientation:', e);
                }
            }

            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { // Safari
                await document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) { // Firefox
                await document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) { // IE11
                await document.msExitFullscreen();
            }

            document.body.classList.remove('fullscreen-mode');
            console.log('Removed fullscreen-mode class from body');
            
            fullscreenStats.style.display = 'none';
            
            // Hide mute button
            fullscreenMuteBtn.style.display = 'none';
            console.log('Hidden mute button');
            
            // Track fullscreen event
            if (window.trackEvent) {
                trackEvent('Fullscreen Exited', {
                    fullscreen_active: false,
                    device_type: isMobileDevice() ? 'Mobile' : 'Desktop'
                });
            }
        } catch (error) {
            console.error('Error exiting fullscreen:', error);
        }
    }
    
    // Update fullscreen stats
    function updateFullscreenStats() {
        fsScore.textContent = score;
        fsLevel.textContent = level;
        fsLines.textContent = lines;
    }
    
    // Add to the updateScore function to update fullscreen stats
    const originalUpdateScore = updateScore;
    updateScore = function() {
        originalUpdateScore();
        updateFullscreenStats();
    };

    // Add escape key handler to exit fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('fullscreen-mode')) {
            exitFullscreen();
        }
    });

    // Add canvas as a touch area for gesture controls
    canvas.classList.add('touch-area');
    
    // Touch start - record position and time for swipe detection
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        // Handle starting the game with a tap when not playing
        if (gameOver) {
            // Restart the game if it's game over
            cancelAnimationFrame(animationId);
            init();
            isPaused = false;
            startBtn.textContent = 'Restart';
            draw();
            return;
        }
        
        if (isPaused) {
            // Unpause the game if it's paused
            isPaused = false;
            pauseBtn.textContent = 'Pause';
            lastTime = 0;
            draw();
            return;
        }
        
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchCurrentX = touch.clientX;
        touchCurrentY = touch.clientY;
        touchStartTime = Date.now();
        hasMoved = false;
        
        // Handle double-tap for hard drop
        const now = Date.now();
        const timeDiff = now - lastTap;
        
        if (timeDiff < 300) { // Double tap detected (within 300ms)
            hardDrop();
            lastTap = 0; // Reset to prevent triple-tap detection
        } else {
            lastTap = now;
        }
    });
    
    // Touch move - detect swipes for piece movement and rotation
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (gameOver || isPaused) return;
        
        const touch = e.touches[0];
        touchCurrentX = touch.clientX;
        touchCurrentY = touch.clientY;
        const deltaX = touchCurrentX - touchStartX;
        const deltaY = touchCurrentY - touchStartY;
        
        // Detect significant vertical movement for rotation
        if (Math.abs(deltaY) > 50) { // Swipe up or down
            if (deltaY < 0) { // Swipe up - clockwise rotation
                rotatePiece();
            } else { // Swipe down - counter-clockwise rotation
                rotatePieceCounterClockwise();
            }
            // Reset the touch start position to prevent multiple rotations
            touchStartY = touchCurrentY;
            return;
        }
        
        // Detect significant horizontal movement for piece movement
        if (Math.abs(deltaX) > 30) {
            hasMoved = true;
            
            // Clear any existing movement interval
            clearInterval(touchMoveInterval);
            
            // Determine direction and move piece
            const direction = deltaX > 0 ? 1 : -1;
            movePiece(direction);
            
            // Update starting position for continuous movement
            touchStartX = touchCurrentX;
            
            // Set up continuous movement when holding and swiping
            touchMoveInterval = setInterval(() => {
                movePiece(direction);
            }, 400);
        }
    });
    
    // Touch end - clean up intervals
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        // Clear any movement interval
        clearInterval(touchMoveInterval);
    });

    // Add fullscreen change event listener
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    function handleFullscreenChange() {
        console.log('Fullscreen change detected');
        if (!document.fullscreenElement && 
            !document.webkitFullscreenElement && 
            !document.mozFullScreenElement &&
            !document.msFullscreenElement) {
            // Exited fullscreen
            document.body.classList.remove('fullscreen-mode');
            console.log('Removed fullscreen-mode class from body');
            fullscreenStats.style.display = 'none';
            
            // Hide mute button
            fullscreenMuteBtn.style.display = 'none';
            console.log('Hidden mute button');
            
            // Try to unlock screen orientation
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock().catch(e => console.log('Could not unlock screen orientation:', e));
            }
        } else {
            // Entered fullscreen
            document.body.classList.add('fullscreen-mode');
            console.log('Added fullscreen-mode class to body');
            
            // Show mute button
            fullscreenMuteBtn.style.display = 'flex';
            console.log('Showed mute button');
        }
    }

    // Show game mode selection on page load
    showGameModes();
}); 