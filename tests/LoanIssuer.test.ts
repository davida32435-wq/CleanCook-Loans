import { describe, it, expect, beforeEach } from "vitest";
import {
  Cl,
  ClarityValue,
  uintCV,
  someCV,
  noneCV,
  tupleCV,
  listCV,
  stringAsciiCV,
} from "@stacks/transactions";

interface Loan {
  borrower: string;
  vendor: string;
  "stove-model": string;
  "loan-amount": bigint;
  "interest-rate": bigint;
  "term-blocks": bigint;
  status: string;
  "created-at": bigint;
  "activated-at": ClarityValue | null;
  "projected-savings": bigint;
  "verified-savings": bigint;
  "repaid-amount": bigint;
}

interface Result<T> {
  isOk: boolean;
  value: T;
}

class LoanIssuerMock {
  state: {
    nextLoanId: bigint;
    oracleContract: string | null;
    loanPoolBalance: bigint;
    loans: Map<bigint, Loan>;
    userLoans: Map<string, bigint[]>;
  } = {
    nextLoanId: 0n,
    oracleContract: null,
    loanPoolBalance: 0n,
    loans: new Map(),
    userLoans: new Map(),
  };
  blockHeight = 100n;
  caller = "ST1TEST";
  owner = "ST1OWNER";
  stxTransfers: Array<{ amount: bigint; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextLoanId: 0n,
      oracleContract: null,
      loanPoolBalance: 0n,
      loans: new Map(),
      userLoans: new Map(),
    };
    this.blockHeight = 100n;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setOracle(newOracle: string): Result<boolean> {
    if (this.caller !== this.owner) return { isOk: false, value: false };
    this.state.oracleContract = newOracle;
    return { isOk: true, value: true };
  }

  fundPool(amount: bigint): Result<bigint> {
    if (amount <= 0n) return { isOk: false, value: 100n };
    this.stxTransfers.push({
      amount,
      from: this.caller,
      to: this.contractAddress(),
    });
    this.state.loanPoolBalance += amount;
    return { isOk: true, value: amount };
  }

  applyForLoan(
    vendor: string,
    stoveModel: string,
    loanAmount: bigint,
    interestRate: bigint,
    termBlocks: bigint,
    projectedSavings: bigint
  ): Result<bigint> {
    if (loanAmount <= 0n || loanAmount > 100000000n)
      return { isOk: false, value: 101n };
    if (interestRate > 20n) return { isOk: false, value: 113n };
    if (termBlocks <= 0n || termBlocks > 52560n)
      return { isOk: false, value: 114n };
    if (projectedSavings < loanAmount * 12n)
      return { isOk: false, value: 105n };

    const loanId = this.state.nextLoanId;
    const loan: Loan = {
      borrower: this.caller,
      vendor,
      "stove-model": stoveModel,
      "loan-amount": loanAmount,
      "interest-rate": interestRate,
      "term-blocks": termBlocks,
      status: "pending",
      "created-at": this.blockHeight,
      "activated-at": null,
      "projected-savings": projectedSavings,
      "verified-savings": 0n,
      "repaid-amount": 0n,
    };
    this.state.loans.set(loanId, loan);
    const userList = this.state.userLoans.get(this.caller) || [];
    if (userList.length >= 200) return { isOk: false, value: 101n };
    this.state.userLoans.set(this.caller, [...userList, loanId]);
    this.state.nextLoanId += 1n;
    return { isOk: true, value: loanId };
  }

  approveLoan(loanId: bigint): Result<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan) return { isOk: false, value: false };
    if (loan.status !== "pending") return { isOk: false, value: false };
    if (this.state.loanPoolBalance < loan["loan-amount"])
      return { isOk: false, value: 101n };

    this.stxTransfers.push({
      amount: loan["loan-amount"],
      from: this.contractAddress(),
      to: loan.borrower,
    });
    this.state.loanPoolBalance -= loan["loan-amount"];
    this.state.loans.set(loanId, {
      ...loan,
      status: "active",
      "activated-at": someCV(uintCV(this.blockHeight)),
    });
    return { isOk: true, value: true };
  }

  reportSavings(loanId: bigint, verifiedSavings: bigint): Result<boolean> {
    if (this.caller !== this.state.oracleContract)
      return { isOk: false, value: false };
    const loan = this.state.loans.get(loanId);
    if (!loan || loan.status !== "active") return { isOk: false, value: false };

    const updated = {
      ...loan,
      "verified-savings": loan["verified-savings"] + verifiedSavings,
    };
    this.state.loans.set(loanId, updated);
    this.processRepayment(loanId);
    return { isOk: true, value: true };
  }

  private processRepayment(loanId: bigint): void {
    const loan = this.state.loans.get(loanId)!;
    const totalDue =
      loan["loan-amount"] +
      (loan["loan-amount"] * loan["interest-rate"]) / 100n;
    const available = loan["verified-savings"];
    const repayAmount =
      available > totalDue - loan["repaid-amount"]
        ? totalDue - loan["repaid-amount"]
        : available;

    if (repayAmount > 0n) {
      this.state.loans.set(loanId, {
        ...loan,
        "repaid-amount": loan["repaid-amount"] + repayAmount,
        "verified-savings": loan["verified-savings"] - repayAmount,
      });
      this.state.loanPoolBalance += repayAmount;
    }
  }

  closeLoan(loanId: bigint): Result<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan || loan.borrower !== this.caller)
      return { isOk: false, value: false };
    const totalDue =
      loan["loan-amount"] +
      (loan["loan-amount"] * loan["interest-rate"]) / 100n;
    if (loan["repaid-amount"] < totalDue) return { isOk: false, value: false };

    this.state.loans.set(loanId, { ...loan, status: "closed" });
    return { isOk: true, value: true };
  }

  cancelLoan(loanId: bigint): Result<boolean> {
    const loan = this.state.loans.get(loanId);
    if (!loan || loan.borrower !== this.caller || loan.status !== "pending")
      return { isOk: false, value: false };
    this.state.loans.delete(loanId);
    return { isOk: true, value: true };
  }

  getLoan(loanId: bigint): Loan | null {
    return this.state.loans.get(loanId) || null;
  }

  getPoolBalance(): bigint {
    return this.state.loanPoolBalance;
  }

  contractAddress(): string {
    return "STLOANISSUER";
  }
}

describe("LoanIssuer", () => {
  let mock: LoanIssuerMock;

  beforeEach(() => {
    mock = new LoanIssuerMock();
    mock.reset();
    mock.owner = "ST1OWNER";
    mock.caller = "ST1OWNER";
  });

  it("sets oracle successfully", () => {
    const result = mock.setOracle("STORACLE");
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects non-owner setting oracle", () => {
    mock.caller = "ST2USER";
    const result = mock.setOracle("STORACLE");
    expect(result.isOk).toBe(false);
  });

  it("funds pool correctly", () => {
    mock.caller = "ST1LENDER";
    const result = mock.fundPool(5000000n);
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(5000000n);
    expect(mock.getPoolBalance()).toBe(5000000n);
  });

  it("rejects insufficient collateral", () => {
    const result = mock.applyForLoan(
      "STVENDOR",
      "EcoStove",
      1000000n,
      10n,
      3650n,
      1000000n
    );
    expect(result.isOk).toBe(false);
    expect(result.value).toBe(105n);
  });

  it("approves pending loan", () => {
    mock.fundPool(10000000n);
    mock.applyForLoan("STVENDOR", "EcoStove", 1000000n, 10n, 3650n, 15000000n);
    const result = mock.approveLoan(0n);
    expect(result.isOk).toBe(true);
    const loan = mock.getLoan(0n);
    expect(loan?.status).toBe("active");
    expect(mock.getPoolBalance()).toBe(9000000n);
  });

  it("reports savings and processes repayment", () => {
    mock.caller = "ST1OWNER";
    mock.setOracle("STORACLE");
    mock.caller = "ST1LENDER";
    mock.fundPool(10000000n);
    mock.caller = "ST1BORROWER";
    mock.applyForLoan("STVENDOR", "EcoStove", 1000000n, 10n, 3650n, 20000000n);
    mock.caller = "ST1OWNER";
    mock.approveLoan(0n);
    mock.caller = "STORACLE";
    const result = mock.reportSavings(0n, 1500000n);
    expect(result.isOk).toBe(true);
    const loan = mock.getLoan(0n);
    expect(loan?.["repaid-amount"]).toBe(1100000n);
    expect(mock.getPoolBalance()).toBe(10100000n);
  });

  it("closes fully repaid loan", () => {
    mock.caller = "ST1OWNER";
    mock.setOracle("STORACLE");
    mock.caller = "ST1LENDER";
    mock.fundPool(10000000n);
    mock.caller = "ST1BORROWER";
    mock.applyForLoan("STVENDOR", "EcoStove", 1000000n, 10n, 3650n, 20000000n);
    mock.caller = "ST1OWNER";
    mock.approveLoan(0n);
    mock.caller = "STORACLE";
    mock.reportSavings(0n, 2000000n);
    mock.caller = "ST1BORROWER";
    const result = mock.closeLoan(0n);
    expect(result.isOk).toBe(true);
    const loan = mock.getLoan(0n);
    expect(loan?.status).toBe("closed");
  });

  it("cancels pending loan", () => {
    mock.applyForLoan("STVENDOR", "EcoStove", 1000000n, 10n, 3650n, 15000000n);
    const result = mock.cancelLoan(0n);
    expect(result.isOk).toBe(true);
    expect(mock.getLoan(0n)).toBeNull();
  });
});
