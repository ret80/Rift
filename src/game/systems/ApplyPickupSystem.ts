import { PickupKind } from "../balance";
import {
  DASH_BONUS_TIME,
  GUN_BONUS_TIME,
  MISSILE_DURATION,
} from "../balance/player";

interface PickupDependencies {
  heal(amount: number): void;
  boostRate(): void;
  addGunBonus(guns: number, duration: number): void;
  spawnDrone(droneList: Array<any>, playerPos: { x: number; y: number }, maxHp: number): void;
  setDashT(duration: number): void;
  setMineT(value: number): void;
  addMinerals(count: number): void;
  addScore(amount: number): void;
  activateMissileLauncher(duration: number): void;
  playPickupSound(kind: string): void;
}

export class ApplyPickupSystem {
  constructor(private deps: PickupDependencies) {}

  apply(kind: PickupKind, droneList: Array<any>, playerPos: { x: number; y: number }, maxHp: number): void {
    const handlers: Record<PickupKind, () => void> = {
      heal25: () => this.deps.heal(25),
      heal50: () => this.deps.heal(50),
      heal100: () => this.deps.heal(100),
      hp: () => this.deps.heal(25),
      rate20: () => this.deps.boostRate(),
      rate40: () => this.deps.boostRate(),
      rate60: () => this.deps.boostRate(),
      rate: () => this.deps.boostRate(),
      gun: () => this.deps.addGunBonus(2, GUN_BONUS_TIME),
      drone: () => this.deps.spawnDrone(droneList, playerPos, maxHp),
      dash: () => this.deps.setDashT(DASH_BONUS_TIME),
      miner: () => this.deps.setMineT(0),
      mine: () => this.deps.setMineT(0),
      mineral: () => {
        this.deps.addMinerals(1);
        this.deps.addScore(50);
      },
      missile: () => this.deps.activateMissileLauncher(MISSILE_DURATION),
    };

    const handler = handlers[kind];
    if (handler) {
      handler();
    }

    this.deps.playPickupSound(kind);
  }
}
