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
  private readonly mazeSize = 8;
  private readonly tiltDeadzone = 1;
  private offsetX = 0;
  private offsetY: number = 0;

  // Increase sub-steps for smoother collision detection
  private readonly subSteps = 5;
  // Add a tiny safety margin to prevent tunneling through walls
  private readonly safetyMargin = 0.01;

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

    this.cellSize = Math.min(
      containerWidth / this.mazeSize,
      containerHeight / this.mazeSize
    );

    this.offsetX = (this.canvas.width - this.mazeSize * this.cellSize) / 2;
    this.offsetY = (this.canvas.height - this.mazeSize * this.cellSize) / 2;

    this.ball.radius = this.cellSize * 0.3;

    if (this.gameActive) {
      this.draw();
    }
  }

  private createFixedMaze(): Cell[][] {
    const maze: Cell[][] = [];

    for (let y = 0; y < this.mazeSize; y++) {
      maze[y] = [];
      for (let x = 0; x < this.mazeSize; x++) {
        maze[y][x] = {
          x,
          y,
          walls: {
            top: true,
            right: true,
            bottom: true,
            left: true
          }
        };
      }
    }

    maze[0][0].walls.right = false;
    maze[0][1].walls.left = false;

    maze[0][1].walls.right = false;
    maze[0][2].walls.left = false;

    maze[0][3].walls.right = false;
    maze[0][4].walls.left = false;

    maze[0][5].walls.right = false;
    maze[0][6].walls.left = false;

    maze[1][0].walls.bottom = false;
    maze[2][0].walls.top = false;

    maze[1][2].walls.bottom = false;
    maze[2][2].walls.top = false;

    maze[1][2].walls.right = false;
    maze[1][3].walls.left = false;

    maze[1][4].walls.right = false;
    maze[1][5].walls.left = false;

    maze[1][6].walls.bottom = false;
    maze[2][6].walls.top = false;

    maze[2][0].walls.right = false;
    maze[2][1].walls.left = false;

    maze[2][3].walls.bottom = false;
    maze[3][3].walls.top = false;

    maze[2][4].walls.right = false;
    maze[2][5].walls.left = false;

    maze[2][5].walls.bottom = false;
    maze[3][5].walls.top = false;

    maze[2][6].walls.right = false;
    maze[2][7].walls.left = false;

    maze[3][0].walls.bottom = false;
    maze[4][0].walls.top = false;

    maze[3][1].walls.right = false;
    maze[3][2].walls.left = false;

    maze[3][2].walls.bottom = false;
    maze[4][2].walls.top = false;

    maze[3][3].walls.bottom = false;
    maze[4][3].walls.top = false;

    maze[3][3].walls.right = false;
    maze[3][4].walls.left = false;

    maze[3][4].walls.bottom = false;
    maze[4][4].walls.top = false;

    maze[3][5].walls.right = false;
    maze[3][6].walls.left = false;

    maze[3][7].walls.bottom = false;
    maze[4][7].walls.top = false;

    maze[4][0].walls.right = false;
    maze[4][1].walls.left = false;

    maze[4][1].walls.bottom = false;
    maze[5][1].walls.top = false;

    maze[4][2].walls.right = false;
    maze[4][3].walls.left = false;

    maze[4][4].walls.right = false;
    maze[4][5].walls.left = false;

    maze[4][5].walls.right = false;
    maze[4][6].walls.left = false;

    maze[4][6].walls.right = false;
    maze[4][7].walls.left = false;

    maze[5][0].walls.bottom = false;
    maze[6][0].walls.top = false;

    maze[5][1].walls.right = false;
    maze[5][2].walls.left = false;

    maze[5][2].walls.bottom = false;
    maze[6][2].walls.top = false;

    maze[5][3].walls.right = false;
    maze[5][4].walls.left = false;

    maze[5][4].walls.bottom = false;
    maze[6][4].walls.top = false;

    maze[5][5].walls.right = false;
    maze[5][6].walls.left = false;

    maze[5][7].walls.bottom = false;
    maze[6][7].walls.top = false;

    maze[6][0].walls.right = false;
    maze[6][1].walls.left = false;

    maze[6][2].walls.right = false;
    maze[6][3].walls.left = false;

    maze[6][4].walls.right = false;
    maze[6][5].walls.left = false;

    maze[6][5].walls.right = false;
    maze[6][6].walls.left = false;

    maze[6][6].walls.right = false;
    maze[6][7].walls.left = false;

    maze[7][0].walls.right = false;
    maze[7][1].walls.left = false;

    maze[7][2].walls.right = false;
    maze[7][3].walls.left = false;

    maze[7][3].walls.right = false;
    maze[7][4].walls.left = false;

    maze[7][4].walls.right = false;
    maze[7][5].walls.left = false;

    maze[7][5].walls.right = false;
    maze[7][6].walls.left = false;

    maze[7][6].walls.right = false;
    maze[7][7].walls.left = false;

    maze[0][2].walls.bottom = false;
    maze[1][2].walls.top = false;

    maze[0][4].walls.bottom = false;
    maze[1][4].walls.top = false;

    maze[0][6].walls.bottom = false;
    maze[1][6].walls.top = false;

    maze[1][1].walls.bottom = false;
    maze[2][1].walls.top = false;

    maze[1][3].walls.bottom = false;
    maze[2][3].walls.top = false;

    maze[1][5].walls.bottom = false;
    maze[2][5].walls.top = false;

    maze[2][1].walls.bottom = false;
    maze[3][1].walls.top = false;

    maze[2][6].walls.bottom = false;
    maze[3][6].walls.top = false;

    maze[3][0].walls.bottom = false;
    maze[4][0].walls.top = false;

    maze[3][5].walls.bottom = false;
    maze[4][5].walls.top = false;

    maze[4][2].walls.bottom = false;
    maze[5][2].walls.top = false;

    maze[4][4].walls.bottom = false;
    maze[5][4].walls.top = false;

    maze[4][6].walls.bottom = false;
    maze[5][6].walls.top = false;

    maze[5][0].walls.bottom = false;
    maze[6][0].walls.top = false;

    maze[5][6].walls.bottom = false;
    maze[6][6].walls.top = false;

    maze[6][1].walls.bottom = false;
    maze[7][1].walls.top = false;

    maze[6][3].walls.bottom = false;
    maze[7][3].walls.top = false;

    maze[6][5].walls.bottom = false;
    maze[7][5].walls.top = false;

    maze[6][7].walls.bottom = false;
    maze[7][7].walls.top = false;

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

  private update(deltaTime: number): void {
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
