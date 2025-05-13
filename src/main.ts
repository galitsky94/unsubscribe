interface Position {
  x: number;
  y: number;
}

interface Velocity {
  x: number;
  y: number;
}

interface Cell {
  x: number;
  y: number;
  walls: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
}

interface MovingWall {
  position1: { x: number, y: number, side: keyof Cell['walls'] };
  position2: { x: number, y: number, side: keyof Cell['walls'] };
  currentPosition: 1 | 2;
  timer: number;
  interval: number;
  animating: boolean;
  animationProgress: number; // 0 to 1 for animation progress
  animationDuration: number; // How long the animation takes
}

class TiltMazeGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ball: {
    position: Position;
    velocity: Velocity;
    radius: number;
    color: string;
  };
  private maze: Cell[][];
  private cellSize: number;
  private gameActive = false;
  private gameWon = false;
  private startTime = 0;
  private lastFrameTime = 0;
  private startPosition: Position;
  private exitPosition: Position;
  private acceleration: Position = { x: 0, y: 0 };
  private deviceOrientationPermissionGranted = false;
  private readonly friction = 0.92;
  private readonly maxSpeed = 3.5;
  private readonly tiltScale = 0.05;
  private readonly mazeSize = 10;
  private readonly tiltDeadzone = 1;
  private offsetX = 0;
  private offsetY: number = 0;
  private readonly subSteps = 5;
  private readonly safetyMargin = 0.01;
  private movingWalls: MovingWall[] = [];

  private baselineBeta = 0;
  private baselineGamma = 0;

  constructor() {
    this.canvas = document.getElementById('maze-canvas') as HTMLCanvasElement;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = context;
    this.setupCanvas();

    this.startPosition = { x: 0, y: 0 };
    this.exitPosition = { x: this.mazeSize - 1, y: this.mazeSize - 1 };

    this.ball = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 0,
      color: '#FF5252'
    };

    this.maze = this.createFixedMaze();
    this.cellSize = 0;

    this.setupEventListeners();
    this.resize();
    this.showStartScreen();
  }

  private setupCanvas(): void {
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(this.canvas);
  }

  private resize(): void {
    const containerWidth = this.canvas.clientWidth;
    const containerHeight = this.canvas.clientHeight;

    this.canvas.width = containerWidth;
    this.canvas.height = containerHeight;

    const labelMargin = 20; // Space for coordinate labels

    // Reduce the available space for the maze to accommodate labels
    const availableWidth = containerWidth - (2 * labelMargin);
    const availableHeight = containerHeight - (2 * labelMargin);

    this.cellSize = Math.min(
      availableWidth / this.mazeSize,
      availableHeight / this.mazeSize
    );

    // Adjust offsetX and offsetY to make room for labels
    this.offsetX = (containerWidth - this.mazeSize * this.cellSize) / 2 + labelMargin;
    this.offsetY = (containerHeight - this.mazeSize * this.cellSize) / 2 + labelMargin;

    this.ball.radius = this.cellSize * 0.3;

    if (this.gameActive) {
      this.draw();
    }
  }

  private createFixedMaze(): Cell[][] {
    // Initialize grid with walls everywhere
    const maze: Cell[][] = [];
    for (let y = 0; y < this.mazeSize; y++) {
      maze[y] = [];
      for (let x = 0; x < this.mazeSize; x++) {
        maze[y][x] = {
          x, y,
          walls: { top: true, right: true, bottom: true, left: true }
        };
      }
    }

    // Using a deterministic pseudo-random generator with fixed seed
    // to produce the same maze every time
    class SeededRandom {
      private seed: number;

      constructor(seed: number) {
        this.seed = seed;
      }

      // Simple LCG random function
      next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
      }
    }

    const random = new SeededRandom(12345); // Fixed seed for consistent maze

    // Track visited cells
    const visited: boolean[][] = Array(this.mazeSize).fill(0).map(() => Array(this.mazeSize).fill(false));

    // Stack for backtracking
    const stack: [number, number][] = [];

    // Start at the top-left
    let currentX = 0;
    let currentY = 0;
    visited[currentY][currentX] = true;
    stack.push([currentX, currentY]);

    // Directions: right, down, left, up
    const directions = [
      [1, 0, 'right', 'left'],
      [0, 1, 'bottom', 'top'],
      [-1, 0, 'left', 'right'],
      [0, -1, 'top', 'bottom']
    ];

    // Continue until stack is empty (all cells visited with backtracking)
    while (stack.length > 0) {
      // Get the current cell
      [currentX, currentY] = stack[stack.length - 1];

      // Find unvisited neighbors
      const unvisitedNeighbors: number[][] = [];

      for (const [dx, dy, wallCurrent, wallNeighbor] of directions) {
        const newX = currentX + dx;
        const newY = currentY + dy;

        // Check if neighbor is valid and unvisited
        if (newX >= 0 && newX < this.mazeSize &&
            newY >= 0 && newY < this.mazeSize &&
            !visited[newY][newX]) {
          unvisitedNeighbors.push([newX, newY, dx, dy, wallCurrent as keyof Cell['walls'], wallNeighbor as keyof Cell['walls']]);
        }
      }

      if (unvisitedNeighbors.length > 0) {
        // Use seeded random to choose deterministically
        const randomIndex = Math.floor(random.next() * unvisitedNeighbors.length);
        const [nextX, nextY, , , wallCurrent, wallNeighbor] = unvisitedNeighbors[randomIndex];

        // Remove the walls between the current cell and the chosen neighbor
        maze[currentY][currentX].walls[wallCurrent] = false;
        maze[nextY][nextX].walls[wallNeighbor] = false;

        // Mark the neighbor as visited and add it to the stack
        visited[nextY][nextX] = true;
        stack.push([nextX, nextY]);
      } else {
        // No unvisited neighbors, backtrack
        stack.pop();
      }
    }

    // Open entrance and exit
    maze[0][0].walls.top = false; // Entry (top-left)
    maze[this.mazeSize - 1][this.mazeSize - 1].walls.bottom = false; // Exit (bottom-right)

    // Remove the wall between B0 and B1 as requested
    maze[0][1].walls.bottom = false;
    maze[1][1].walls.top = false;

    // Create a secondary path from the middle to bottom-right
    // First path - right side
    maze[4][6].walls.right = false;
    maze[4][7].walls.left = false;
    maze[4][7].walls.bottom = false;
    maze[5][7].walls.top = false;
    maze[5][7].walls.bottom = false;
    maze[6][7].walls.top = false;
    maze[6][7].walls.right = false;
    maze[6][8].walls.left = false;
    maze[6][8].walls.bottom = false;
    maze[7][8].walls.top = false;
    maze[7][8].walls.right = false;
    maze[7][9].walls.left = false;
    maze[7][9].walls.bottom = false;
    maze[8][9].walls.top = false;

    // Second path - bottom side
    maze[7][3].walls.right = false;
    maze[7][4].walls.left = false;
    maze[7][4].walls.bottom = false;
    maze[8][4].walls.top = false;
    maze[8][4].walls.right = false;
    maze[8][5].walls.left = false;
    maze[8][5].walls.right = false;
    maze[8][6].walls.left = false;

    // Create breaks in walls to add more path options
    maze[2][2].walls.bottom = false;
    maze[3][2].walls.top = false;

    maze[5][4].walls.right = false;
    maze[5][5].walls.left = false;

    // Add a few more strategic wall removals to ensure multiple paths
    maze[1][8].walls.right = false;
    maze[1][9].walls.left = false;

    maze[3][5].walls.bottom = false;
    maze[4][5].walls.top = false;

    // Remove any previous moving wall configurations
    maze[0][8].walls.bottom = false;
    maze[1][8].walls.top = false;
    maze[1][7].walls.right = false;
    maze[1][8].walls.left = false;

    // Setup all four moving walls as requested:

    // 1. Wall between F4-G4 (vertical) moving to G4-G5 (horizontal)
    maze[4][5].walls.right = true; // F4-G4 wall (vertical) - starting position
    maze[4][6].walls.left = true;  // G4 left
    maze[4][6].walls.bottom = false; // G4-G5 wall (horizontal) - not present initially
    maze[5][6].walls.top = false;    // G5 top

    // 2. Wall between I8-J8 (vertical) moving to J7-J8 (horizontal)
    maze[8][8].walls.right = true;  // I8-J8 wall - starting position
    maze[8][9].walls.left = true;   // J8 left
    maze[7][9].walls.bottom = false; // J7-J8 wall - not present initially
    maze[8][9].walls.top = false;    // J8 top

    // 3. Wall between C8-D8 moving to D8-E8
    maze[8][2].walls.right = true;  // C8-D8 wall - starting position
    maze[8][3].walls.left = true;   // D8 left
    maze[8][3].walls.right = false; // D8-E8 wall - not present initially
    maze[8][4].walls.left = false;  // E8 left

    // 4. Wall between B4-C4 (vertical) moving to C4-C5 (horizontal)
    maze[4][1].walls.right = true;  // B4-C4 wall - starting position
    maze[4][2].walls.left = true;   // C4 left
    maze[4][2].walls.bottom = false; // C4-C5 wall - not present initially
    maze[5][2].walls.top = false;    // C5 top

    // Update moving walls data structure to track all four walls
    this.movingWalls = [
      // Wall 1: F4-G4 (vertical) moving to G4-G5 (horizontal)
      {
        position1: { x: 5, y: 4, side: 'right' }, // F4-G4 (vertical)
        position2: { x: 6, y: 4, side: 'bottom' }, // G4-G5 (horizontal)
        currentPosition: 1,
        timer: 0,
        interval: 3000, // 3 seconds
        animating: false,
        animationProgress: 0,
        animationDuration: 300 // 300ms animation - slightly longer for smoother transition
      },
      // Wall 2: I8-J8 (vertical) moving to J7-J8 (horizontal)
      {
        position1: { x: 8, y: 8, side: 'right' }, // I8-J8
        position2: { x: 9, y: 7, side: 'bottom' }, // J7-J8
        currentPosition: 1,
        timer: 0,
        interval: 3000, // 3 seconds
        animating: false,
        animationProgress: 0,
        animationDuration: 300
      },
      // Wall 3: C8-D8 moving to D8-E8
      {
        position1: { x: 2, y: 8, side: 'right' }, // C8-D8
        position2: { x: 3, y: 8, side: 'right' }, // D8-E8
        currentPosition: 1,
        timer: 0,
        interval: 3000, // 3 seconds
        animating: false,
        animationProgress: 0,
        animationDuration: 300
      },
      // Wall 4: B4-C4 (vertical) moving to C4-C5 (horizontal)
      {
        position1: { x: 1, y: 4, side: 'right' }, // B4-C4
        position2: { x: 2, y: 4, side: 'bottom' }, // C4-C5
        currentPosition: 1,
        timer: 0,
        interval: 3000, // 3 seconds
        animating: false,
        animationProgress: 0,
        animationDuration: 300
      }
    ];

    return maze;
  }

  private setupEventListeners(): void {
    document.getElementById('start-button')?.addEventListener('click', this.startGame.bind(this));
    document.getElementById('restart-button')?.addEventListener('click', this.restartGame.bind(this));
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private requestDeviceOrientationPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!window.DeviceOrientationEvent) {
        console.error('Device orientation not supported by browser');
        resolve(false);
        return;
      }

      // @ts-ignore
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          // @ts-ignore
          DeviceOrientationEvent.requestPermission()
            .then((permissionState: string) => {
              if (permissionState === 'granted') {
                window.addEventListener('deviceorientation', this.handleDeviceOrientation.bind(this));
                resolve(true);
              } else {
                console.error('Permission denied for device orientation');
                resolve(false);
              }
            })
            .catch((error: Error) => {
              console.error('Error requesting device orientation permission:', error);
              resolve(false);
            });
        } catch (error) {
          console.error('Error requesting device orientation permission:', error);
          resolve(false);
        }
      } else {
        window.addEventListener('deviceorientation', this.handleDeviceOrientation.bind(this));
        resolve(true);
      }
    });
  }

  private handleDeviceOrientation(event: DeviceOrientationEvent): void {
    if (!this.gameActive) return;
    let beta = event.beta || 0;
    let gamma = event.gamma || 0;
    beta = Math.max(-90, Math.min(90, beta));
    gamma = Math.max(-90, Math.min(90, gamma));

    if (this.baselineBeta === 0 && this.baselineGamma === 0) {
      this.baselineBeta = beta;
      this.baselineGamma = gamma;
      return;
    }

    if (Math.abs(beta) < this.tiltDeadzone && Math.abs(gamma) < this.tiltDeadzone) {
      this.acceleration.x = 0;
      this.acceleration.y = 0;
      return;
    }

    const xScale = gamma < 0 ? this.tiltScale * 1.4 : this.tiltScale;
    this.acceleration.x = (gamma / 45) * xScale * 4;
    const yScale = beta < 0 ? this.tiltScale * 1.4 : this.tiltScale;
    this.acceleration.y = (beta / 45) * yScale * 4;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.gameActive || this.gameWon) return;

    switch (event.key) {
      case "ArrowUp":
        this.acceleration.y = -this.tiltScale;
        break;
      case "ArrowDown":
        this.acceleration.y = this.tiltScale;
        break;
      case "ArrowLeft":
        this.acceleration.x = -this.tiltScale;
        break;
      case "ArrowRight":
        this.acceleration.x = this.tiltScale;
        break;
    }
  }

  private showStartScreen(): void {
    const startScreen = document.getElementById('start-screen');
    const winScreen = document.getElementById('win-screen');

    if (startScreen && winScreen) {
      startScreen.classList.remove('hidden');
      winScreen.classList.add('hidden');
    }

    this.draw();
  }

  private showWinScreen(): void {
    const startScreen = document.getElementById('start-screen');
    const winScreen = document.getElementById('win-screen');

    if (startScreen && winScreen) {
      startScreen.classList.add('hidden');
      winScreen.classList.remove('hidden');
    }
  }

  private async startGame(): Promise<void> {
    if (!this.deviceOrientationPermissionGranted) {
      this.deviceOrientationPermissionGranted = await this.requestDeviceOrientationPermission();

      if (!this.deviceOrientationPermissionGranted) {
        console.warn('Device orientation permission denied. Using keyboard controls only.');
        this.showOrientationPermissionMessage();
      }
    }

    this.ball.position = {
      x: this.startPosition.x * this.cellSize + this.cellSize / 2 + this.offsetX,
      y: this.startPosition.y * this.cellSize + this.cellSize / 2 + this.offsetY
    };
    this.ball.velocity = { x: 0, y: 0 };
    this.baselineBeta = 0;
    this.baselineGamma = 0;
    this.gameActive = true;
    this.gameWon = false;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;

    // Reset moving wall timer
    for (const wall of this.movingWalls) {
      wall.timer = performance.now();
      wall.currentPosition = 1;
      wall.animating = false;
      wall.animationProgress = 0;
    }

    const startScreen = document.getElementById('start-screen');
    if (startScreen) {
      startScreen.classList.add('hidden');
    }

    const permissionMessage = document.getElementById('orientation-permission-message');
    if (permissionMessage) {
      permissionMessage.classList.add('hidden');
    }

    this.gameLoop();
  }

  private showOrientationPermissionMessage(): void {
    let messageEl = document.getElementById('orientation-permission-message');

    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'orientation-permission-message';
      messageEl.classList.add('permission-message');
      messageEl.innerHTML = `
        <div>
          <h2>Motion Sensors Required</h2>
          <p>This game works best with device motion sensors. On mobile, tilt your device to control the ball.</p>
          <p>On desktop, use arrow keys to move the ball.</p>
          <button id="dismiss-permission-message">Continue</button>
        </div>
      `;

      const gameContainer = document.getElementById('game-container');
      if (gameContainer) {
        gameContainer.appendChild(messageEl);
      }

      document.getElementById('dismiss-permission-message')?.addEventListener('click', () => {
        messageEl?.classList.add('hidden');
      });
    } else {
      messageEl.classList.remove('hidden');
    }
  }

  private restartGame(): void {
    const winScreen = document.getElementById('win-screen');
    if (winScreen) {
      winScreen.classList.add('hidden');
    }

    this.startGame();
  }

  private gameLoop(): void {
    if (!this.gameActive) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 16.667;
    this.lastFrameTime = currentTime;

    this.update(deltaTime);
    this.draw();

    if (!this.gameWon) {
      requestAnimationFrame(this.gameLoop.bind(this));
    }
  }

  // Update moving walls based on time
  private updateMovingWalls(currentTime: number, deltaTime: number): void {
    for (const wall of this.movingWalls) {
      // If currently animating, update animation progress
      if (wall.animating) {
        wall.animationProgress += deltaTime / wall.animationDuration;

        if (wall.animationProgress >= 1) {
          wall.animating = false;
          wall.animationProgress = 0;

          // Complete the wall movement after animation is done
          // We need to handle each wall based on its specific positions
          this.completeWallMovement(wall);

          // Reset the timer after the animation completes to ensure
          // the wall stays in the new position for the full interval
          wall.timer = currentTime;
        }
      }
      // Check if it's time to start a new wall animation
      else if (currentTime - wall.timer > wall.interval) {
        wall.animating = true;
        wall.animationProgress = 0;
        wall.currentPosition = wall.currentPosition === 1 ? 2 : 1;

        // During animation, temporarily remove both walls for smooth transition
        this.removeWallDuringAnimation(wall);
      }
    }
  }

  // Helper method to handle the completion of wall movement for each specific wall
  private completeWallMovement(wall: MovingWall): void {
    const pos1 = wall.position1;
    const pos2 = wall.position2;

    // Wall 1: F4-G4 (vertical) <-> G4-G5 (horizontal)
    if (pos1.x === 5 && pos1.y === 4) {
      if (wall.currentPosition === 1) {
        // F4-G4 wall (vertical)
        this.maze[4][5].walls.right = true;
        this.maze[4][6].walls.left = true;
        this.maze[4][6].walls.bottom = false;
        this.maze[5][6].walls.top = false;
      } else {
        // G4-G5 wall (horizontal)
        this.maze[4][5].walls.right = false;
        this.maze[4][6].walls.left = false;
        this.maze[4][6].walls.bottom = true;
        this.maze[5][6].walls.top = true;
      }
    }
    // Wall 2: I8-J8 (vertical) <-> J7-J8 (horizontal)
    else if (pos1.x === 8 && pos1.y === 8) {
      if (wall.currentPosition === 1) {
        // I8-J8 wall (vertical)
        this.maze[8][8].walls.right = true;
        this.maze[8][9].walls.left = true;
        this.maze[7][9].walls.bottom = false;
        this.maze[8][9].walls.top = false;
      } else {
        // J7-J8 wall (horizontal)
        this.maze[8][8].walls.right = false;
        this.maze[8][9].walls.left = false;
        this.maze[7][9].walls.bottom = true;
        this.maze[8][9].walls.top = true;
      }
    }
    // Wall 3: C8-D8 <-> D8-E8
    else if (pos1.x === 2 && pos1.y === 8) {
      if (wall.currentPosition === 1) {
        // C8-D8 wall
        this.maze[8][2].walls.right = true;
        this.maze[8][3].walls.left = true;
        this.maze[8][3].walls.right = false;
        this.maze[8][4].walls.left = false;
      } else {
        // D8-E8 wall
        this.maze[8][2].walls.right = false;
        this.maze[8][3].walls.left = false;
        this.maze[8][3].walls.right = true;
        this.maze[8][4].walls.left = true;
      }
    }
    // Wall 4: B4-C4 (vertical) <-> C4-C5 (horizontal)
    else if (pos1.x === 1 && pos1.y === 4) {
      if (wall.currentPosition === 1) {
        // B4-C4 wall (vertical)
        this.maze[4][1].walls.right = true;
        this.maze[4][2].walls.left = true;
        this.maze[4][2].walls.bottom = false;
        this.maze[5][2].walls.top = false;
      } else {
        // C4-C5 wall (horizontal)
        this.maze[4][1].walls.right = false;
        this.maze[4][2].walls.left = false;
        this.maze[4][2].walls.bottom = true;
        this.maze[5][2].walls.top = true;
      }
    }
  }

  // Helper method to temporarily remove walls during animation
  private removeWallDuringAnimation(wall: MovingWall): void {
    const pos1 = wall.position1;
    const pos2 = wall.position2;

    // Wall 1: F4-G4 (vertical) <-> G4-G5 (horizontal)
    if (pos1.x === 5 && pos1.y === 4) {
      this.maze[4][5].walls.right = false;
      this.maze[4][6].walls.left = false;
      this.maze[4][6].walls.bottom = false;
      this.maze[5][6].walls.top = false;
    }
    // Wall 2: I8-J8 (vertical) <-> J7-J8 (horizontal)
    else if (pos1.x === 8 && pos1.y === 8) {
      this.maze[8][8].walls.right = false;
      this.maze[8][9].walls.left = false;
      this.maze[7][9].walls.bottom = false;
      this.maze[8][9].walls.top = false;
    }
    // Wall 3: C8-D8 <-> D8-E8
    else if (pos1.x === 2 && pos1.y === 8) {
      this.maze[8][2].walls.right = false;
      this.maze[8][3].walls.left = false;
      this.maze[8][3].walls.right = false;
      this.maze[8][4].walls.left = false;
    }
    // Wall 4: B4-C4 (vertical) <-> C4-C5 (horizontal)
    else if (pos1.x === 1 && pos1.y === 4) {
      this.maze[4][1].walls.right = false;
      this.maze[4][2].walls.left = false;
      this.maze[4][2].walls.bottom = false;
      this.maze[5][2].walls.top = false;
    }
  }

  private update(deltaTime: number): void {
    const currentTime = performance.now();

    // Update moving walls with deltaTime for smooth animation
    this.updateMovingWalls(currentTime, deltaTime);

    // Apply acceleration
    this.ball.velocity.x += this.acceleration.x * deltaTime;
    this.ball.velocity.y += this.acceleration.y * deltaTime;

    // Apply friction
    this.ball.velocity.x *= this.friction;
    this.ball.velocity.y *= this.friction;

    // FORCE STOP on tiny velocities to prevent floats
    if (Math.abs(this.ball.velocity.x) < 0.01) this.ball.velocity.x = 0;
    if (Math.abs(this.ball.velocity.y) < 0.01) this.ball.velocity.y = 0;

    // Apply max speed
    const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y);
    if (speed > this.maxSpeed) {
      const ratio = this.maxSpeed / speed;
      this.ball.velocity.x *= ratio;
      this.ball.velocity.y *= ratio;
    }

    // Handle movement with sub-steps for better collision detection
    const subDeltaTime = deltaTime / this.subSteps;

    for (let i = 0; i < this.subSteps; i++) {
      // Calculate new position for this sub-step
      const newPosition = {
        x: this.ball.position.x + this.ball.velocity.x * subDeltaTime,
        y: this.ball.position.y + this.ball.velocity.y * subDeltaTime
      };

      // Handle collisions for this sub-step
      this.handleCollisions(newPosition);
    }

    // Check for win
    const cellX = Math.floor((this.ball.position.x - this.offsetX) / this.cellSize);
    const cellY = Math.floor((this.ball.position.y - this.offsetY) / this.cellSize);
    if (cellX === this.exitPosition.x && cellY === this.exitPosition.y) {
      this.gameActive = false;
      this.gameWon = true;
      this.showWinScreen();
    }
  }

  private handleCollisions(newPosition: Position): void {
    const r = this.ball.radius;
    // Original cell based on current ball position
    const cellX = Math.floor((this.ball.position.x - this.offsetX) / this.cellSize);
    const cellY = Math.floor((this.ball.position.y - this.offsetY) / this.cellSize);
    const cx = Math.max(0, Math.min(this.mazeSize - 1, cellX));
    const cy = Math.max(0, Math.min(this.mazeSize - 1, cellY));

    // Axis X
    if (newPosition.x > this.ball.position.x) {
      // moving right
      if (this.maze[cy][cx].walls.right) {
        const wallX = this.offsetX + (cx + 1) * this.cellSize;
        if (newPosition.x + r > wallX) {
          newPosition.x = wallX - r;
          this.ball.velocity.x = 0; // stop horizontal
        }
      }
    } else if (newPosition.x < this.ball.position.x) {
      // moving left
      if (this.maze[cy][cx].walls.left) {
        const wallX = this.offsetX + cx * this.cellSize;
        if (newPosition.x - r < wallX) {
          newPosition.x = wallX + r;
          this.ball.velocity.x = 0;
        }
      }
    }

    // After horizontal adjust, recompute vertical cell index
    const nxCellX = Math.floor((newPosition.x - this.offsetX) / this.cellSize);
    const vcx = Math.max(0, Math.min(this.mazeSize - 1, nxCellX));

    // Axis Y
    if (newPosition.y > this.ball.position.y) {
      // moving down
      if (this.maze[cy][vcx].walls.bottom) {
        const wallY = this.offsetY + (cy + 1) * this.cellSize;
        if (newPosition.y + r > wallY) {
          newPosition.y = wallY - r;
          this.ball.velocity.y = 0; // stop vertical
        }
      }
    } else if (newPosition.y < this.ball.position.y) {
      // moving up
      if (this.maze[cy][vcx].walls.top) {
        const wallY = this.offsetY + cy * this.cellSize;
        if (newPosition.y - r < wallY) {
          newPosition.y = wallY + r;
          this.ball.velocity.y = 0;
        }
      }
    }

    // Clamp inside maze area
    newPosition.x = Math.max(this.offsetX + r, Math.min(this.offsetX + this.mazeSize * this.cellSize - r, newPosition.x));
    newPosition.y = Math.max(this.offsetY + r, Math.min(this.offsetY + this.mazeSize * this.cellSize - r, newPosition.y));

    this.ball.position.x = newPosition.x;
    this.ball.position.y = newPosition.y;
  }

  private draw(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw coordinate labels around the maze
    const labelOffset = 15; // Space for the labels
    this.ctx.font = '12px Arial';
    this.ctx.fillStyle = '#333';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Draw column labels (A-J) above the maze
    for (let x = 0; x < this.mazeSize; x++) {
      const labelX = this.offsetX + x * this.cellSize + this.cellSize / 2;
      const labelY = this.offsetY - labelOffset;
      this.ctx.fillText(String.fromCharCode(65 + x), labelX, labelY);
    }

    // Draw row labels (0-9) to the left of the maze
    for (let y = 0; y < this.mazeSize; y++) {
      const labelX = this.offsetX - labelOffset;
      const labelY = this.offsetY + y * this.cellSize + this.cellSize / 2;
      this.ctx.fillText(y.toString(), labelX, labelY);
    }

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);

    this.ctx.strokeStyle = 'black';
    this.ctx.lineWidth = 2;

    for (let y = 0; y < this.mazeSize; y++) {
      for (let x = 0; x < this.mazeSize; x++) {
        const cell = this.maze[y][x];
        const cellX = x * this.cellSize;
        const cellY = y * this.cellSize;

        this.ctx.beginPath();
        this.ctx.strokeStyle = 'black'; // All walls are black now

        // Simple wall drawing without special animation effects
        if (cell.walls.top) {
          this.ctx.moveTo(cellX, cellY);
          this.ctx.lineTo(cellX + this.cellSize, cellY);
        }

        if (cell.walls.right) {
          this.ctx.moveTo(cellX + this.cellSize, cellY);
          this.ctx.lineTo(cellX + this.cellSize, cellY + this.cellSize);
        }

        if (cell.walls.bottom) {
          this.ctx.moveTo(cellX, cellY + this.cellSize);
          this.ctx.lineTo(cellX + this.cellSize, cellY + this.cellSize);
        }

        if (cell.walls.left) {
          this.ctx.moveTo(cellX, cellY);
          this.ctx.lineTo(cellX, cellY + this.cellSize);
        }

        this.ctx.stroke();
      }
    }

    this.ctx.fillStyle = '#4CAF50';
    this.ctx.fillRect(
      this.startPosition.x * this.cellSize,
      this.startPosition.y * this.cellSize,
      this.cellSize,
      this.cellSize
    );

    this.ctx.fillStyle = '#2196F3';
    this.ctx.fillRect(
      this.exitPosition.x * this.cellSize,
      this.exitPosition.y * this.cellSize,
      this.cellSize,
      this.cellSize
    );

    // No timer text for moving wall

    if (this.gameActive || this.gameWon) {
      this.ctx.fillStyle = this.ball.color;
      this.ctx.beginPath();
      this.ctx.arc(
        this.ball.position.x - this.offsetX,
        this.ball.position.y - this.offsetY,
        this.ball.radius,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    }

    this.ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new TiltMazeGame();
});
