# Web-based Tetris Game

A classic Tetris game implemented using HTML5 Canvas, CSS, and JavaScript with real-time multiplayer functionality using WebSockets.

## Features

- Classic Tetris gameplay
- Score tracking and leveling system
- Next piece preview
- Responsive design
- Game controls displayed on screen
- Pause and restart functionality
- Real-time multiplayer with WebSockets
- Background music and sound effects

## How to Play (Single Player)

1. Open `index.html` in your web browser (or run the server and visit localhost:3000)
2. Click "Single Player" to play alone
3. Click "Start Game" to begin
4. Use arrow keys to control the tetromino:
   - Left/Right arrows: Move horizontally
   - Up arrow: Rotate piece
   - Down arrow: Soft drop (move down faster)
   - Space bar: Hard drop (instant drop)
5. Clear lines to score points
6. Game speeds up as you level up
7. Game ends when pieces stack to the top

## How to Play (Multiplayer)

### Setting Up the Server
1. Make sure you have Node.js installed
2. Run `npm install` to install dependencies
3. Start the server with `npm start`
4. Open http://localhost:3000 in your browser

### Playing with Others
1. Click "Multiplayer" on the main screen
2. Enter your name and click "Join Game"
3. Wait for another player to join (open the game in another browser window)
4. Once matched, click "Start Game" to indicate you're ready
5. Game begins when all players are ready
6. When you clear multiple lines at once, you'll send "garbage rows" to your opponents!
7. Last player standing wins!

## Scoring System

- 1 line cleared: 40 × level
- 2 lines cleared: 100 × level
- 3 lines cleared: 300 × level
- 4 lines cleared: 1200 × level

## Multiplayer Mechanics

- All players receive the same sequence of pieces
- Clearing 2+ lines sends garbage rows to opponents (lines cleared minus one)
- Garbage rows have one random gap for the opponent to work through
- Players are notified when opponents are defeated or leave the game
- Last player standing wins

## Implementation Details

This Tetris game is built with:
- HTML5 Canvas for rendering the game board and pieces
- CSS for styling and responsive design
- Vanilla JavaScript for game logic
- WebSockets for real-time multiplayer functionality
- Node.js backend using Express and ws libraries

## Development

To run the development server with auto-restart:
```
npm run dev
``` 