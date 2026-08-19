declare module 'rvo-js' {
  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
    plus(vector: Vector2): Vector2;
    minus(vector: Vector2): Vector2;
    multiply(vector: Vector2): number;
    scale(k: number): Vector2;
  }

  export class Agent {
    id: number;
    maxNeighbors: number;
    maxSpeed: number;
    neighborDist: number;
    radius: number;
    timeHorizon: number;
    timeHorizonObst: number;
    velocity: Vector2;
    prefVelocity: Vector2;
    simulator: Simulator;
  }

  export class Obstacle {
    point: Vector2;
    unitDir: Vector2;
    prevObstacle: Obstacle;
    nextObstacle: Obstacle;
    id: number;
    isConvex: boolean;
  }

  export class KdTree {
    simulator: Simulator;
    buildAgentTree(): void;
    buildObstacleTree(): void;
    queryVisibility(point1: Vector2, point2: Vector2, radius: number): boolean;
  }

  export namespace RVOMath {
    function absSq(v: Vector2): number;
    function normalize(v: Vector2): Vector2;
    function leftOf(a: Vector2, b: Vector2, c: Vector2): number;
    const RVO_EPSILON: number;
  }

  export class Simulator {
    constructor();
    agents: Agent[];
    obstacles: Obstacle[];
    goals: Vector2[];
    kdTree: KdTree;
    timeStep: number;
    defaultAgent: Agent;
    time: number;
    getGlobalTime(): number;
    getNumAgents(): number;
    getTimeStep(): number;
    setAgentPrefVelocity(i: number, vx: number, vy: number): void;
    setAgentPosition(i: number, x: number, y: number): void;
    setAgentGoal(i: number, x: number, y: number): void;
    setTimeStep(timeStep: number): void;
    getAgentPosition(i: number): Vector2;
    getAgentPrefVelocity(i: number): Vector2;
    getAgentVelocity(i: number): Vector2;
    getAgentRadius(i: number): number;
    getAgentOrcaLines(i: number): any[];
    addAgent(position: Vector2): number;
    setAgentDefaults(neighborDist: number, maxNeighbors: number, timeHorizon: number, timeHorizonObst: number, radius: number, maxSpeed: number, velocityX: number, velocityY: number): void;
    run(): void;
    reachedGoal(): boolean;
    addGoals(goals: Vector2[]): void;
    getGoal(goalNo: number): Vector2;
    addObstacle(vertices: Vector2[]): number;
    processObstacles(): void;
    getObstacles(): Obstacle[];
  }

  const RVO: {
    Simulator: typeof Simulator;
    Agent: typeof Agent;
    KdTree: typeof KdTree;
    Vector2: typeof Vector2;
    RVOMath: typeof RVOMath;
  };

  export default RVO;
}
