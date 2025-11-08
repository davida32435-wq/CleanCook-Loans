(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-AMOUNT (err u101))
(define-constant ERR-LOAN-EXISTS (err u102))
(define-constant ERR-LOAN-NOT-FOUND (err u103))
(define-constant ERR-STOVE-NOT-APPROVED (err u104))
(define-constant ERR-INSUFFICIENT-COLLATERAL (err u105))
(define-constant ERR-INVALID-STATUS (err u106))
(define-constant ERR-NOT-BORROWER (err u107))
(define-constant ERR-ALREADY-ACTIVE (err u108))
(define-constant ERR-NOT-PENDING (err u109))
(define-constant ERR-COLLATERAL-CALC (err u110))
(define-constant ERR-VENDOR-MISMATCH (err u111))
(define-constant ERR-TRANSFER-FAILED (err u112))
(define-constant ERR-INVALID-INTEREST (err u113))
(define-constant ERR-INVALID-TERM (err u114))
(define-constant ERR-ORACLE-NOT-SET (err u115))

(define-data-var next-loan-id uint u0)
(define-data-var oracle-contract (optional principal) none)
(define-data-var loan-pool-balance uint u0)

(define-map loans
  { loan-id: uint }
  {
    borrower: principal,
    vendor: principal,
    stove-model: (string-ascii 64),
    loan-amount: uint,
    interest-rate: uint,
    term-blocks: uint,
    status: (string-ascii 20),
    created-at: uint,
    activated-at: (optional uint),
    projected-savings: uint,
    verified-savings: uint,
    repaid-amount: uint
  }
)

(define-map user-loans principal (list 200 uint))

(define-read-only (get-loan (loan-id uint))
  (map-get? loans { loan-id: loan-id })
)

(define-read-only (get-user-loans (user principal))
  (map-get? user-loans user)
)

(define-read-only (get-next-loan-id)
  (ok (var-get next-loan-id))
)

(define-read-only (get-pool-balance)
  (ok (var-get loan-pool-balance))
)

(define-read-only (calculate-projected-savings (stove-efficiency uint) (daily-usage uint) (fuel-cost-per-unit uint))
  (let (
    (daily-savings (* (- u100 stove-efficiency) daily-usage fuel-cost-per-unit))
    (annual-savings (* daily-savings u365))
  )
    (ok (* annual-savings u100))
  )
)

(define-private (validate-loan-amount (amount uint))
  (and (> amount u0) (<= amount u100000000))
)

(define-private (validate-interest-rate (rate uint))
  (<= rate u20)
)

(define-private (validate-term (term uint))
  (and (> term u0) (<= term u52560))
)

(define-private (is-loan-pending (loan-data { borrower: principal, vendor: principal, stove-model: (string-ascii 64), loan-amount: uint, interest-rate: uint, term-blocks: uint, status: (string-ascii 20), created-at: uint, activated-at: (optional uint), projected-savings: uint, verified-savings: uint, repaid-amount: uint }))
  (is-eq (get status loan-data) "pending")
)

(define-private (is-loan-active (loan-data { borrower: principal, vendor: principal, stove-model: (string-ascii 64), loan-amount: uint, interest-rate: uint, term-blocks: uint, status: (string-ascii 20), created-at: uint, activated-at: (optional uint), projected-savings: uint, verified-savings: uint, repaid-amount: uint }))
  (is-eq (get status loan-data) "active")
)

(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set oracle-contract (some new-oracle))
    (ok true)
  )
)

(define-public (fund-pool)
  (let ((amount (stx-get-balance tx-sender)))
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (match (stx-transfer? amount tx-sender (as-contract tx-sender))
      success (begin
        (var-set loan-pool-balance (+ (var-get loan-pool-balance) amount))
        (ok amount)
      )
      error ERR-TRANSFER-FAILED
    )
  )
)

(define-public (apply-for-loan
  (vendor principal)
  (stove-model (string-ascii 64))
  (loan-amount uint)
  (interest-rate uint)
  (term-blocks uint)
  (projected-savings uint)
)
  (let (
    (loan-id (var-get next-loan-id))
    (borrower tx-sender)
  )
    (asserts! (validate-loan-amount loan-amount) ERR-INVALID-AMOUNT)
    (asserts! (validate-interest-rate interest-rate) ERR-INVALID-INTEREST)
    (asserts! (validate-term term-blocks) ERR-INVALID-TERM)
    (asserts! (>= projected-savings (* loan-amount u12)) ERR-INSUFFICIENT-COLLATERAL)
    (map-set loans
      { loan-id: loan-id }
      {
        borrower: borrower,
        vendor: vendor,
        stove-model: stove-model,
        loan-amount: loan-amount,
        interest-rate: interest-rate,
        term-blocks: term-blocks,
        status: "pending",
        created-at: block-height,
        activated-at: none,
        projected-savings: projected-savings,
        verified-savings: u0,
        repaid-amount: u0
      }
    )
    (map-set user-loans borrower
      (unwrap! (as-max-len? (append (default-to (list) (map-get? user-loans borrower)) loan-id) u200) ERR-INVALID-AMOUNT)
    )
    (var-set next-loan-id (+ loan-id u1))
    (print { event: "loan-applied", loan-id: loan-id, borrower: borrower })
    (ok loan-id)
  )
)

(define-public (approve-loan (loan-id uint))
  (let (
    (loan (unwrap! (map-get? loans { loan-id: loan-id }) ERR-LOAN-NOT-FOUND))
  )
    (asserts! (is-loan-pending loan) ERR-NOT-PENDING)
    (asserts! (>= (var-get loan-pool-balance) (get loan-amount loan)) ERR-INVALID-AMOUNT)
    (match (as-contract (stx-transfer? (get loan-amount loan) tx-sender (get borrower loan)))
      success (begin
        (var-set loan-pool-balance (- (var-get loan-pool-balance) (get loan-amount loan)))
        (map-set loans { loan-id: loan-id }
          (merge loan {
            status: "active",
            activated-at: (some block-height)
          })
        )
        (print { event: "loan-approved", loan-id: loan-id })
        (ok true)
      )
      error ERR-TRANSFER-FAILED
    )
  )
)

(define-public (report-savings (loan-id uint) (verified-savings uint))
  (let (
    (loan (unwrap! (map-get? loans { loan-id: loan-id }) ERR-LOAN-NOT-FOUND))
    (oracle (unwrap! (var-get oracle-contract) ERR-ORACLE-NOT-SET))
  )
    (asserts! (is-eq tx-sender oracle) ERR-NOT-AUTHORIZED)
    (asserts! (is-loan-active loan) ERR-INVALID-STATUS)
    (map-set loans { loan-id: loan-id }
      (merge loan {
        verified-savings: (+ (get verified-savings loan) verified-savings)
      })
    )
    (try! (process-repayment loan-id))
    (ok true)
  )
)

(define-private (process-repayment (loan-id uint))
  (let (
    (loan (unwrap! (get-loan loan-id) ERR-LOAN-NOT-FOUND))
    (total-due (+ (get loan-amount loan) (/ (* (get loan-amount loan) (get interest-rate loan)) u100)))
    (available-savings (get verified-savings loan))
    (repay-amount (if (> available-savings total-due) (- total-due (get repaid-amount loan)) available-savings))
  )
    (if (> repay-amount u0)
      (begin
        (map-set loans { loan-id: loan-id }
          (merge loan {
            repaid-amount: (+ (get repaid-amount loan) repay-amount),
            verified-savings: (- (get verified-savings loan) repay-amount)
          })
        )
        (var-set loan-pool-balance (+ (var-get loan-pool-balance) repay-amount))
        (print { event: "repayment-processed", loan-id: loan-id, amount: repay-amount })
        (ok repay-amount)
      )
      (ok u0)
    )
  )
)

(define-public (close-loan (loan-id uint))
  (let (
    (loan (unwrap! (map-get? loans { loan-id: loan-id }) ERR-LOAN-NOT-FOUND))
    (total-due (+ (get loan-amount loan) (/ (* (get loan-amount loan) (get interest-rate loan)) u100)))
  )
    (asserts! (is-eq tx-sender (get borrower loan)) ERR-NOT-BORROWER)
    (asserts! (>= (get repaid-amount loan) total-due) ERR-INVALID-STATUS)
    (map-set loans { loan-id: loan-id }
      (merge loan { status: "closed" })
    )
    (print { event: "loan-closed", loan-id: loan-id })
    (ok true)
  )
)

(define-public (cancel-loan (loan-id uint))
  (let ((loan (unwrap! (map-get? loans { loan-id: loan-id }) ERR-LOAN-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get borrower loan)) ERR-NOT-BORROWER)
    (asserts! (is-loan-pending loan) ERR-NOT-PENDING)
    (map-delete loans { loan-id: loan-id })
    (print { event: "loan-cancelled", loan-id: loan-id })
    (ok true)
  )
)