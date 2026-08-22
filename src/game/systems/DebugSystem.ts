/**
 * DebugSystem — отладочная информация и отрисовка.
 * Отвечает за отрисовку debug-оверлея и обработку отладочных клавиш.
 * Полностью автономен от игровой логики.
 */

export interface DebugDeps {
  canvas: HTMLCanvasElement;
  fsmState: string | null;
  wave: number;
  runTime: number;
  fps: number;
  zoneActive: boolean;
  zoneRadius: number;
  zoneTargetRadius: number;
  zoneAlpha: number;
  countdownActive: boolean;
  enemyCount: number;
  riftCount: number;
  waveTotal: number;
  kills: number;
  allocated: number;
  playerX: number;
  playerY: number;
  playerHp: number;
  playerMaxHp: number;
  inputAxisX: number;
  inputAxisY: number;
  mouseX: number;
  mouseY: number;
}

export class DebugSystem {
  private debugGod = false;
  private debugShow = false;
  private debugToggleTimer = 0;
  private _debugKeys: Record<string, boolean> | null = null;

  get isGodMode(): boolean {
    return this.debugGod;
  }

  get isDebugEnabled(): boolean {
    return this.debugShow;
  }

  toggleDebug(): void {
    this.debugShow = !this.debugShow;
    this.debugToggleTimer = 1;
  }

  setGodMode(on: boolean): void {
    this.debugGod = on;
  }

  /** Обработка клавиш (G — god mode, ` — debug overlay, R/Enter/Space — рестарт) */
  handleDebugKeys(isKey: (key: string) => boolean, isOver: boolean, onRestart: () => void): void {
    if (!this._debugKeys) this._debugKeys = {};
    const keys = this._debugKeys;

    // Backtick (`) for debug overlay toggle
    if (isKey('Backquote')) {
      if (!keys['`']) {
        this.toggleDebug();
        keys['`'] = true;
      }
    } else {
      keys['`'] = false;
    }

    // G for god mode
    if (isKey('KeyG')) {
      if (!keys['G']) {
        this.debugGod = !this.debugGod;
        keys['G'] = true;
      }
    } else {
      keys['G'] = false;
    }

    // R or Enter or Space to restart from "over" state
    if (isOver) {
      const restartKey = isKey('KeyR') || isKey('Enter') || isKey('Space');
      if (restartKey && !keys['restart']) {
        onRestart();
        keys['restart'] = true;
      }
    } else {
      keys['restart'] = false;
    }
  }

  /** Отрисовка debug-оверлея */
  renderDebug(deps: DebugDeps): void {
    if (!this.debugShow) return;
    const ctx = deps.canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.resetTransform();

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, 280, 320);

    // Title
    ctx.fillStyle = '#ff3b52';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('DEBUG OVERLAY [Tab]', 10, 22);

    // Game state info
    ctx.fillStyle = '#eaffff';
    ctx.font = '12px monospace';
    let y = 50;

    const lines = [
      `state: ${deps.fsmState}`,
      `wave: ${deps.wave}`,
      `time: ${deps.runTime.toFixed(1)}s`,
      `fps: ${deps.fps}`,
      '',
      'ZONE:',
      `  active: ${deps.zoneActive}`,
      `  radius: ${deps.zoneRadius.toFixed(1)}`,
      `  target: ${deps.zoneTargetRadius.toFixed(1)}`,
      `  alpha: ${deps.zoneAlpha.toFixed(2)}`,
      '',
      'SPAWN:',
      `  countdown: ${deps.countdownActive ? 'YES' : 'NO'}`,
      `  enemies: ${deps.enemyCount}`,
      `  rifts: ${deps.riftCount}`,
      `  total: ${deps.waveTotal}`,
      `  killed: ${deps.kills}`,
      `  allocated: ${deps.allocated}`,
      '',
      'PLAYER:',
      `  pos: ${deps.playerX.toFixed(0)}, ${deps.playerY.toFixed(0)}`,
      `  hp: ${deps.playerHp}/${deps.playerMaxHp}`,
      '',
      'INPUT:',
      `  axis: ${deps.inputAxisX.toFixed(2)}, ${deps.inputAxisY.toFixed(2)}`,
      `  mouse: [${deps.mouseX}, ${deps.mouseY}]`,
      '',
      'CONTROLS:',
      '  Tab: toggle debug',
      '  G: god mode',
    ];

    for (const line of lines) {
      // Color coding
      if (line.includes('YES') || line.includes('ON')) ctx.fillStyle = '#ff5d7e';
      else if (line.includes('NO') || line.includes('OFF')) ctx.fillStyle = '#d8ff3e';
      else if (line.includes('ZONE:') || line.includes('S') || line.includes('PLAYER:') || line.includes('INPUT:') || line.includes('CONTROLS:')) ctx.fillStyle = '#c06bff';
      else ctx.fillStyle = '#eaffff';

      ctx.fillText(line, 10, y);
      y += 16;
    }

    ctx.restore();
  }

  /** Сброс отладочных данных */
  reset(): void {
    this.debugGod = false;
    this.debugShow = false;
    this.debugToggleTimer = 0;
    this._debugKeys = null;
  }
}
