import { describe, it, expect, beforeEach } from "vitest";

interface Stove {
  "efficiency-rate": bigint;
  "daily-usage-estimate": bigint;
  verified: boolean;
}

interface Projection {
  "projected-annual": bigint;
  "calculated-at": bigint;
  "model-used": string;
}

interface Result<T> {
  isOk: boolean;
  value: T | bigint;
}

class CollateralManagerMock {
  state: {
    fuelCostPerUnit: bigint;
    minCollateralRatio: bigint;
    approvedStoves: Map<string, Stove>;
    loanProjections: Map<bigint, Projection>;
  } = {
    fuelCostPerUnit: 1000n,
    minCollateralRatio: 120n,
    approvedStoves: new Map(),
    loanProjections: new Map(),
  };
  blockHeight = 200n;
  caller = "ST1OWNER";
  owner = "ST1OWNER";

  reset() {
    this.state = {
      fuelCostPerUnit: 1000n,
      minCollateralRatio: 120n,
      approvedStoves: new Map(),
      loanProjections: new Map(),
    };
    this.blockHeight = 200n;
    this.caller = "ST1OWNER";
  }

  setFuelCost(newCost: bigint): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 200n };
    if (newCost <= 0n) return { isOk: false, value: 204n };
    this.state.fuelCostPerUnit = newCost;
    return { isOk: true, value: true };
  }

  setMinRatio(newRatio: bigint): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 200n };
    if (newRatio < 100n || newRatio > 300n) return { isOk: false, value: 202n };
    this.state.minCollateralRatio = newRatio;
    return { isOk: true, value: true };
  }

  registerStove(
    model: string,
    efficiency: bigint,
    dailyUsage: bigint
  ): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 200n };
    if (model.length === 0 || model.length > 64)
      return { isOk: false, value: 208n };
    if (efficiency <= 0n || efficiency > 95n)
      return { isOk: false, value: 202n };
    if (dailyUsage <= 0n) return { isOk: false, value: 203n };
    if (this.state.approvedStoves.has(model))
      return { isOk: false, value: 206n };

    this.state.approvedStoves.set(model, {
      "efficiency-rate": efficiency,
      "daily-usage-estimate": dailyUsage,
      verified: true,
    });
    return { isOk: true, value: true };
  }

  updateStove(
    model: string,
    efficiency: bigint,
    dailyUsage: bigint
  ): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 200n };
    if (model.length === 0 || model.length > 64)
      return { isOk: false, value: 208n };
    if (efficiency <= 0n || efficiency > 95n)
      return { isOk: false, value: 202n };
    if (dailyUsage <= 0n) return { isOk: false, value: 203n };
    if (!this.state.approvedStoves.has(model))
      return { isOk: false, value: 207n };

    const stove = this.state.approvedStoves.get(model)!;
    this.state.approvedStoves.set(model, {
      ...stove,
      "efficiency-rate": efficiency,
      "daily-usage-estimate": dailyUsage,
    });
    return { isOk: true, value: true };
  }

  projectCollateralForLoan(
    loanId: bigint,
    loanAmount: bigint,
    stoveModel: string
  ): Result<bigint> {
    const stove = this.state.approvedStoves.get(stoveModel);
    if (!stove) return { isOk: false, value: 207n };

    const dailySaved =
      (100n - stove["efficiency-rate"]) *
      stove["daily-usage-estimate"] *
      this.state.fuelCostPerUnit;
    const annual = dailySaved * 365n;
    const savings = annual * 100n;
    const required = loanAmount * this.state.minCollateralRatio;

    if (savings < required) return { isOk: false, value: 210n };

    this.state.loanProjections.set(loanId, {
      "projected-annual": savings,
      "calculated-at": this.blockHeight,
      "model-used": stoveModel,
    });
    return { isOk: true, value: savings };
  }

  validateLoanCollateral(
    loanId: bigint,
    loanAmount: bigint,
    stoveModel: string
  ): Result<bigint> {
    const existing = this.state.loanProjections.get(loanId);
    if (existing) return { isOk: true, value: existing["projected-annual"] };
    return this.projectCollateralForLoan(loanId, loanAmount, stoveModel);
  }

  getStove(model: string): Stove | null {
    return this.state.approvedStoves.get(model) || null;
  }

  getProjection(loanId: bigint): Projection | null {
    return this.state.loanProjections.get(loanId) || null;
  }
}

describe("CollateralManager", () => {
  let mock: CollateralManagerMock;

  beforeEach(() => {
    mock = new CollateralManagerMock();
    mock.reset();
  });

  it("sets fuel cost successfully", () => {
    const result = mock.setFuelCost(1500n);
    expect(result.isOk).toBe(true);
    expect(mock.state.fuelCostPerUnit).toBe(1500n);
  });

  it("rejects non-owner setting fuel cost", () => {
    mock.caller = "ST2USER";
    const result = mock.setFuelCost(1500n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(200n);
  });

  it("registers approved stove", () => {
    const result = mock.registerStove("EcoStove-Pro", 85n, 5n);
    expect(result.isOk).toBe(true);
    const stove = mock.getStove("EcoStove-Pro");
    expect(stove?.["efficiency-rate"]).toBe(85n);
    expect(stove?.["daily-usage-estimate"]).toBe(5n);
    expect(stove?.verified).toBe(true);
  });

  it("rejects duplicate stove model", () => {
    mock.registerStove("EcoStove-Pro", 85n, 5n);
    const result = mock.registerStove("EcoStove-Pro", 90n, 6n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(206n);
  });

  it("updates existing stove", () => {
    mock.registerStove("EcoStove-Pro", 85n, 5n);
    const result = mock.updateStove("EcoStove-Pro", 90n, 6n);
    expect(result.isOk).toBe(true);
    const stove = mock.getStove("EcoStove-Pro");
    expect(stove?.["efficiency-rate"]).toBe(90n);
    expect(stove?.["daily-usage-estimate"]).toBe(6n);
  });

  it("rejects update on non-existent stove", () => {
    const result = mock.updateStove("Unknown", 90n, 6n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(207n);
  });

  it("projects sufficient collateral", () => {
    mock.registerStove("EcoStove-Pro", 90n, 10n);
    const result = mock.projectCollateralForLoan(1n, 1000000n, "EcoStove-Pro");
    expect(result.isOk).toBe(true);
    const expected = 100n * 10n * 1000n * 365n * 100n;
    const required = 1000000n * 120n;
    expect(result.value).toBeGreaterThanOrEqual(required);
  });

  it("validates collateral using cached projection", () => {
    mock.registerStove("EcoStove-Pro", 90n, 10n);
    mock.projectCollateralForLoan(1n, 1000000n, "EcoStove-Pro");
    const result = mock.validateLoanCollateral(1n, 1000000n, "EcoStove-Pro");
    expect(result.isOk).toBe(true);
    const proj = mock.getProjection(1n);
    expect(proj?.["model-used"]).toBe("EcoStove-Pro");
  });

  it("rejects invalid efficiency rate", () => {
    const result = mock.registerStove("Invalid", 99n, 5n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(202n);
  });

  it("rejects zero daily usage", () => {
    const result = mock.registerStove("Invalid", 80n, 0n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(203n);
  });
});
