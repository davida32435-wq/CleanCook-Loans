import { describe, it, expect, beforeEach } from "vitest";

interface Report {
  "reported-savings": bigint;
  "reported-at": bigint;
  verifier: string;
  verified: boolean;
}

interface Result<T> {
  isOk: boolean;
  value: T | bigint;
}

class MockLoanContract {
  loans: Map<bigint, { status: string }> = new Map();
  reported = false;

  getLoan(loanId: bigint) {
    const loan = this.loans.get(loanId);
    return loan ? { isOk: true, value: loan } : { isOk: false, value: 301n };
  }

  reportSavings(loanId: bigint, savings: bigint) {
    this.reported = true;
    return { isOk: true, value: true };
  }

  setLoanActive(loanId: bigint) {
    this.loans.set(loanId, { status: "active" });
  }
}

class FuelSavingsOracleMock {
  state: {
    reportingPeriod: bigint;
    verifierPrincipal: string;
    periodStartBlock: bigint;
    isLocked: boolean;
    savingsReports: Map<string, Report>;
    loanActivePeriods: Map<bigint, bigint>;
  } = {
    reportingPeriod: 30n,
    verifierPrincipal: "STVERIFIER",
    periodStartBlock: 0n,
    isLocked: false,
    savingsReports: new Map(),
    loanActivePeriods: new Map(),
  };
  blockHeight = 1000n;
  caller = "ST1OWNER";
  owner = "ST1OWNER";

  loanContract = new MockLoanContract();

  reset() {
    this.state = {
      reportingPeriod: 30n,
      verifierPrincipal: "STVERIFIER",
      periodStartBlock: 0n,
      isLocked: false,
      savingsReports: new Map(),
      loanActivePeriods: new Map(),
    };
    this.blockHeight = 1000n;
    this.caller = "ST1OWNER";
    this.loanContract = new MockLoanContract();
  }

  setVerifier(newVerifier: string): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 300n };
    this.state.verifierPrincipal = newVerifier;
    return { isOk: true, value: true };
  }

  setReportingPeriod(newPeriod: bigint): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 300n };
    if (newPeriod < 7n || newPeriod > 90n) return { isOk: false, value: 305n };
    this.state.reportingPeriod = newPeriod;
    return { isOk: true, value: true };
  }

  startNewPeriod(): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 300n };
    if (this.state.isLocked) return { isOk: false, value: 306n };
    this.state.periodStartBlock = this.blockHeight;
    this.state.isLocked = true;
    return { isOk: true, value: true };
  }

  endCurrentPeriod(): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: 300n };
    if (!this.state.isLocked) return { isOk: false, value: 306n };
    this.state.isLocked = false;
    return { isOk: true, value: true };
  }

  reportSavings(loanId: bigint, reportedSavings: bigint): Result<boolean> {
    if (this.caller !== this.state.verifierPrincipal)
      return { isOk: false, value: 307n };
    if (!this.state.isLocked) return { isOk: false, value: 306n };
    if (reportedSavings <= 0n) return { isOk: false, value: 303n };

    const period = this.getCurrentPeriod();
    const key = `${loanId}-${period}`;
    if (this.state.savingsReports.has(key)) return { isOk: false, value: 304n };

    const loanResult = this.loanContract.getLoan(loanId);
    if (!loanResult.isOk) return { isOk: false, value: loanResult.value };
    if (loanResult.value.status !== "active")
      return { isOk: false, value: 302n };

    this.state.savingsReports.set(key, {
      "reported-savings": reportedSavings,
      "reported-at": this.blockHeight,
      verifier: this.caller,
      verified: true,
    });
    this.state.loanActivePeriods.set(loanId, period);
    this.loanContract.reportSavings(loanId, reportedSavings);
    return { isOk: true, value: true };
  }

  getVerifiedSavingsForLoan(loanId: bigint): Result<bigint> {
    const period = this.state.loanActivePeriods.get(loanId) ?? 0n;
    const key = `${loanId}-${period}`;
    const report = this.state.savingsReports.get(key);
    return report
      ? { isOk: true, value: report["reported-savings"] }
      : { isOk: true, value: 0n };
  }

  getCurrentPeriod(): bigint {
    if (this.state.periodStartBlock === 0n) return 0n;
    return (
      (this.blockHeight - this.state.periodStartBlock) /
      this.state.reportingPeriod
    );
  }

  getReport(loanId: bigint, period: bigint): Report | null {
    return this.state.savingsReports.get(`${loanId}-${period}`) || null;
  }
}

describe("FuelSavingsOracle", () => {
  let mock: FuelSavingsOracleMock;

  beforeEach(() => {
    mock = new FuelSavingsOracleMock();
    mock.reset();
    mock.loanContract.setLoanActive(1n);
  });

  it("sets verifier successfully", () => {
    const result = mock.setVerifier("STNEWVERIFIER");
    expect(result.isOk).toBe(true);
    expect(mock.state.verifierPrincipal).toBe("STNEWVERIFIER");
  });

  it("rejects non-owner setting verifier", () => {
    mock.caller = "ST2USER";
    const result = mock.setVerifier("STNEWVERIFIER");
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(300n);
  });

  it("sets reporting period within bounds", () => {
    const result = mock.setReportingPeriod(60n);
    expect(result.isOk).toBe(true);
    expect(mock.state.reportingPeriod).toBe(60n);
  });

  it("rejects invalid reporting period", () => {
    const result = mock.setReportingPeriod(5n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(305n);
  });

  it("starts and ends period correctly", () => {
    const start = mock.startNewPeriod();
    expect(start.isOk).toBe(true);
    expect(mock.state.isLocked).toBe(true);

    const end = mock.endCurrentPeriod();
    expect(end.isOk).toBe(true);
    expect(mock.state.isLocked).toBe(false);
  });

  it("reports savings in active period", () => {
    mock.startNewPeriod();
    mock.caller = "STVERIFIER";
    const result = mock.reportSavings(1n, 500000n);
    expect(result.isOk).toBe(true);
    expect(mock.loanContract.reported).toBe(true);

    const report = mock.getReport(1n, 0n);
    expect(report?.["reported-savings"]).toBe(500000n);
    expect(report?.verified).toBe(true);
  });

  it("rejects report from non-verifier", () => {
    mock.startNewPeriod();
    mock.caller = "ST2HACKER";
    const result = mock.reportSavings(1n, 500000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(307n);
  });

  it("rejects report when period not locked", () => {
    mock.caller = "STVERIFIER";
    const result = mock.reportSavings(1n, 500000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(306n);
  });

  it("rejects duplicate report in same period", () => {
    mock.startNewPeriod();
    mock.caller = "STVERIFIER";
    mock.reportSavings(1n, 500000n);
    const result = mock.reportSavings(1n, 600000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(304n);
  });

  it("rejects report for non-active loan", () => {
    mock.loanContract.loans.set(2n, { status: "pending" });
    mock.startNewPeriod();
    mock.caller = "STVERIFIER";
    const result = mock.reportSavings(2n, 500000n);
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(302n);
  });

  it("retrieves verified savings correctly", () => {
    mock.startNewPeriod();
    mock.caller = "STVERIFIER";
    mock.reportSavings(1n, 750000n);
    const result = mock.getVerifiedSavingsForLoan(1n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(750000n);
  });

  it("returns zero for unreported loans", () => {
    const result = mock.getVerifiedSavingsForLoan(99n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(0n);
  });
});
