(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-LOAN-NOT-FOUND (err u301))
(define-constant ERR-LOAN-NOT-ACTIVE (err u302))
(define-constant ERR-INVALID-SAVINGS (err u303))
(define-constant ERR-REPORT-EXISTS (err u304))
(define-constant ERR-INVALID-PERIOD (err u305))
(define-constant ERR-ORACLE-LOCKED (err u306))
(define-constant ERR-INVALID-VERIFIER (err u307))
(define-constant ERR-PERIOD-CLOSED (err u308))
(define-constant ERR-TOO-EARLY (err u309))

(define-data-var reporting-period uint u30)
(define-data-var verifier-principal principal tx-sender)
(define-data-var period-start-block uint u0)
(define-data-var is-locked bool false)

(define-map savings-reports
  { loan-id: uint, period: uint }
  {
    reported-savings: uint,
    reported-at: uint,
    verifier: principal,
    verified: bool
  }
)

(define-map loan-active-periods uint uint)

(define-read-only (get-report (loan-id uint) (period uint))
  (map-get? savings-reports { loan-id: loan-id, period: period })
)

(define-read-only (get-current-period)
  (let ((start (var-get period-start-block)))
    (if (is-eq start u0)
      (ok u0)
      (ok (/ (- block-height start) (var-get reporting-period)))
    )
  )
)

(define-read-only (get-period-start)
  (ok (var-get period-start-block))
)

(define-read-only (get-reporting-period)
  (ok (var-get reporting-period))
)

(define-read-only (is-period-active)
  (not (var-get is-locked))
)

(define-private (validate-savings (amount uint))
  (> amount u0)
)

(define-private (is-current-period (period uint))
  (let ((current (unwrap! (get-current-period) false)))
    (is-eq period current)
  )
)

(define-public (set-verifier (new-verifier principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set verifier-principal new-verifier)
    (ok true)
  )
)

(define-public (set-reporting-period (new-period uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (and (>= new-period u7) (<= new-period u90)) ERR-INVALID-PERIOD)
    (var-set reporting-period new-period)
    (ok true)
  )
)

(define-public (start-new-period)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get is-locked)) ERR-ORACLE-LOCKED)
    (var-set period-start-block block-height)
    (var-set is-locked true)
    (ok true)
  )
)

(define-public (end-current-period)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (var-get is-locked) ERR-ORACLE-LOCKED)
    (var-set is-locked false)
    (ok true)
  )
)

(define-public (report-savings
  (loan-id uint)
  (reported-savings uint)
  (loan-contract principal)
)
  (let (
    (period (unwrap! (get-current-period) ERR-INVALID-PERIOD))
    (report-key { loan-id: loan-id, period: period })
  )
    (asserts! (is-eq tx-sender (var-get verifier-principal)) ERR-INVALID-VERIFIER)
    (asserts! (var-get is-locked) ERR-ORACLE-LOCKED)
    (asserts! (validate-savings reported-savings) ERR-INVALID-SAVINGS)
    (asserts! (is-none (map-get? savings-reports report-key)) ERR-REPORT-EXISTS)
    (asserts! (contract-call? loan-contract get-loan loan-id) ERR-LOAN-NOT-FOUND)
    (asserts! (is-eq (get status (unwrap! (contract-call? loan-contract get-loan loan-id) ERR-LOAN-NOT-FOUND)) "active") ERR-LOAN-NOT-ACTIVE)
    (map-set savings-reports report-key
      {
        reported-savings: reported-savings,
        reported-at: block-height,
        verifier: tx-sender,
        verified: true
      }
    )
    (map-set loan-active-periods loan-id period)
    (try! (contract-call? loan-contract report-savings loan-id reported-savings))
    (ok true)
  )
)

(define-public (get-verified-savings-for-loan (loan-id uint) (loan-contract principal))
  (let (
    (period (default-to u0 (map-get? loan-active-periods loan-id)))
    (report (map-get? savings-reports { loan-id: loan-id, period: period }))
  )
    (match report
      r (ok (get reported-savings r))
      (ok u0)
    )
  )
)