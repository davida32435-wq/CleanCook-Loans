(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u200))
(define-constant ERR-LOAN-NOT-FOUND (err u201))
(define-constant ERR-INVALID-EFFICIENCY (err u202))
(define-constant ERR-INVALID-USAGE (err u203))
(define-constant ERR-INVALID-COST (err u204))
(define-constant ERR-CALC-FAILED (err u205))
(define-constant ERR-STOVE-EXISTS (err u206))
(define-constant ERR-STOVE-NOT-FOUND (err u207))
(define-constant ERR-INVALID-MODEL (err u208))
(define-constant ERR-LOAN-NOT-ACTIVE (err u209))
(define-constant ERR-INSUFFICIENT-PROJECTED (err u210))

(define-data-var fuel-cost-per-unit uint u1000)
(define-data-var min-collateral-ratio uint u120)

(define-map approved-stoves
  (string-ascii 64)
  {
    efficiency-rate: uint,
    daily-usage-estimate: uint,
    verified: bool
  }
)

(define-map loan-projections
  uint
  {
    projected-annual: uint,
    calculated-at: uint,
    model-used: (string-ascii 64)
  }
)

(define-read-only (get-stove (model (string-ascii 64)))
  (map-get? approved-stoves model)
)

(define-read-only (get-projection (loan-id uint))
  (map-get? loan-projections loan-id)
)

(define-read-only (get-fuel-cost)
  (ok (var-get fuel-cost-per-unit))
)

(define-read-only (get-min-ratio)
  (ok (var-get min-collateral-ratio))
)

(define-read-only (calculate-savings (efficiency uint) (usage uint))
  (let (
    (cost (var-get fuel-cost-per-unit))
    (daily-saved (* (- u100 efficiency) usage cost))
    (annual (* daily-saved u365))
  )
    (ok (* annual u100))
  )
)

(define-private (validate-model (model (string-ascii 64)))
  (and (> (len model) u0) (<= (len model) u64))
)

(define-private (validate-efficiency (rate uint))
  (and (> rate u0) (<= rate u95))
)

(define-private (validate-usage (usage uint))
  (> usage u0)
)

(define-public (set-fuel-cost (new-cost uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (> new-cost u0) ERR-INVALID-COST)
    (var-set fuel-cost-per-unit new-cost)
    (ok true)
  )
)

(define-public (set-min-ratio (new-ratio uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (and (>= new-ratio u100) (<= new-ratio u300)) ERR-INVALID-EFFICIENCY)
    (var-set min-collateral-ratio new-ratio)
    (ok true)
  )
)

(define-public (register-stove
  (model (string-ascii 64))
  (efficiency uint)
  (daily-usage uint)
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (validate-model model) ERR-INVALID-MODEL)
    (asserts! (validate-efficiency efficiency) ERR-INVALID-EFFICIENCY)
    (asserts! (validate-usage daily-usage) ERR-INVALID-USAGE)
    (asserts! (is-none (map-get? approved-stoves model)) ERR-STOVE-EXISTS)
    (map-set approved-stoves model
      {
        efficiency-rate: efficiency,
        daily-usage-estimate: daily-usage,
        verified: true
      }
    )
    (ok true)
  )
)

(define-public (update-stove
  (model (string-ascii 64))
  (efficiency uint)
  (daily-usage uint)
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (validate-model model) ERR-INVALID-MODEL)
    (asserts! (validate-efficiency efficiency) ERR-INVALID-EFFICIENCY)
    (asserts! (validate-usage daily-usage) ERR-INVALID-USAGE)
    (match (map-get? approved-stoves model)
      stove (map-set approved-stoves model
              (merge stove {
                efficiency-rate: efficiency,
                daily-usage-estimate: daily-usage
              }))
      (err ERR-STOVE-NOT-FOUND)
    )
    (ok true)
  )
)

(define-public (project-collateral-for-loan
  (loan-id uint)
  (loan-amount uint)
  (stove-model (string-ascii 64))
)
  (let (
    (stove (unwrap! (map-get? approved-stoves stove-model) ERR-STOVE-NOT-FOUND))
    (savings (unwrap! (calculate-savings
                        (get efficiency-rate stove)
                        (get daily-usage-estimate stove)) ERR-CALC-FAILED))
    (required (* loan-amount (var-get min-collateral-ratio)))
  )
    (asserts! (>= savings required) ERR-INSUFFICIENT-PROJECTED)
    (map-set loan-projections loan-id
      {
        projected-annual: savings,
        calculated-at: block-height,
        model-used: stove-model
      }
    )
    (ok savings)
  )
)

(define-public (validate-loan-collateral
  (loan-id uint)
  (loan-amount uint)
  (stove-model (string-ascii 64))
)
  (let (
    (existing (map-get? loan-projections loan-id))
  )
    (match existing
      proj (ok (get projected-annual proj))
      (try! (project-collateral-for-loan loan-id loan-amount stove-model))
    )
  )
)