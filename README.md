# 🌿 CleanCook Loans: Blockchain-Powered Financing for Clean Cookstoves

Welcome to CleanCook Loans, a Web3 project that tackles the global challenge of clean cooking access! In many developing regions, traditional cookstoves cause health issues, deforestation, and high fuel costs. This project uses the Stacks blockchain and Clarity smart contracts to provide microloans for adopting clean cookstoves, with repayments collateralized by verified fuel savings. By leveraging blockchain, we ensure transparent, tamper-proof lending, reduce default risks through automated collateral, and promote sustainable energy adoption.

## ✨ Features
🔄 Automated loan issuance based on user eligibility and stove purchase  
💰 Collateralization via projected and verified fuel savings (tracked on-chain)  
📊 Real-time repayment tracking with automated deductions from savings  
✅ Oracle integration for fuel usage verification (e.g., via IoT or community reports)  
🌍 Governance for community-driven updates to loan terms and interest rates  
🚀 Scalable for NGOs, vendors, and borrowers in emerging markets  
🔒 Secure user registry to prevent fraud and enable KYC-light processes  
📈 Analytics for lenders to monitor portfolio performance  

## 🛠 How It Works
**For Borrowers**  
- Register as a user and verify basic eligibility (e.g., location and income bracket).  
- Apply for a loan by selecting a clean cookstove from approved vendors.  
- The system calculates projected fuel savings as collateral (based on stove efficiency data).  
- Receive the loan in STX or a stable token, and purchase the stove.  
- Over time, report or auto-track fuel usage; savings are used to repay the loan automatically.  
- If savings exceed expectations, get bonuses or faster loan closure!  

**For Lenders/Investors**  
- Fund the loan pool and earn interest from repayments.  
- Monitor loans via dashboards showing real-time savings and repayment status.  
- Participate in governance to vote on parameters like interest rates or oracle sources.  

**For Vendors**  
- Register stoves with efficiency ratings.  
- Receive payments directly upon loan-funded purchases.  
- Verify installations to trigger loan activation.  

**For Verifiers/Oracles**  
- Submit fuel savings data (e.g., from apps or sensors) to unlock repayments.  
- Dispute resolutions handled on-chain for transparency.  

This project solves the real-world problem of clean cookstove adoption barriers by making financing accessible and risk-managed through blockchain. It reduces reliance on traditional banking in underserved areas, lowers carbon emissions, and empowers users with financial incentives tied to sustainability.

## 📜 Smart Contracts (in Clarity)
The system is built with 8 interconnected Clarity smart contracts for modularity, security, and scalability:  

1. **UserRegistry.clar**: Manages user registration, eligibility checks, and basic profiles to prevent sybil attacks.  
2. **LoanIssuer.clar**: Handles loan applications, approvals, and disbursements based on collateral calculations.  
3. **CollateralManager.clar**: Tracks projected vs. actual fuel savings as dynamic collateral, adjusting loan terms automatically.  
4. **FuelSavingsOracle.clar**: Integrates external data feeds (e.g., via APIs or community verifiers) to record and validate fuel usage savings.  
5. **RepaymentProcessor.clar**: Automates repayments by deducting from verified savings, handling interest, and closing loans.  
6. **VendorRegistry.clar**: Registers and verifies cookstove vendors, including stove models and efficiency ratings.  
7. **Governance.clar**: Enables token holders to propose and vote on system updates, like interest rates or oracle thresholds.  
8. **DisputeResolver.clar**: Manages on-chain disputes for fuel data or loan terms, with escrowed funds for fair resolution.  

These contracts interact seamlessly: e.g., LoanIssuer calls CollateralManager to set terms, and RepaymentProcessor queries FuelSavingsOracle for updates. Deploy on Stacks for Bitcoin-secured transactions!  

Get started by cloning the repo, deploying the contracts via Clarinet, and testing with sample data. Let's cook cleaner! 🚀