# Kanara Bank - PRD (Phase 1)

## 1. Product Overview
*   **Concept:** A digital-only fintech bank built for tech-savvy users.
*   **Problem:** Traditional banks require customers to visit physical branches for routine tasks. 
*   **Solution:** Provide a fully online web application where users can create accounts, manage virtual cards, and view statements. Cash handling is streamlined through a Teller portal.
*   **Target Audience:** Tech-savvy individuals.
*   **Platform:** Web Application (Backend Only).

---

## 2. Technical Stack & Architecture
*   **Framework:** Express.js (Node.js)
*   **Language:** TypeScript
*   **ORM:** Drizzle
*   **Database:** MySQL
*   **Validation:** Joi
*   **Password Hashing:** Argon2
*   **Authentication:** JWT (Access Token & Refresh Token)
*   **OTP Storage:** Local Memory Map (TTL: 5 minutes)
*   **Currency Format:** All amounts and balances are stored and served as **Paisa (Integer)**. No decimals. The client handles conversion to Rupees.

### Architecture Flow
All API requests must follow this strict layered architecture:
`Routes (Joi Validation Middleware) -> Controller -> Service -> Repository -> DB`
*   **Routes:** Validate `req.body` / `req.query` via Joi middleware.
*   **Controller:** Handles HTTP transport (`req`, `res`). No business logic, no DB access.
*   **Service:** Handles business logic. No `req`, `res`, or DB access.
*   **Repository:** Handles Drizzle/MySQL access.

---

## 3. API Communication Standards

### Success Response:
```json
{
  "success": true,
  "data": {
    // The primary payload (object, array, or null)
  },
  "meta": {
    // Optional: Pagination metadata
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Error Response:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message."
  }
}
```

### Error Classes Implementation
```typescript
class ApiError extends Error {
  public readonly status: number;
  public readonly code: Uppercase<string>;

  constructor(msg: string, code: Uppercase<string>, status: number = 500) {
    super(msg);
    this.status = status;
    this.code = code;
    this.name = new.target.name;
  }

  toJSON(): { [Key in keyof this]: (typeof this)[Key] } {
    return Object.keys(this).reduce(
      (acc, key) => {
        acc[key] = this[key as keyof typeof this];
        return acc;
      },
      {
        name: this.name,
        message: this.message,
      } as Record<string, unknown>
    ) as unknown as { [Key in keyof this]: (typeof this)[Key] };
  }
}

class ApiAtmError extends ApiError {
  constructor(msg: string, code: number) {
    super(msg, 'API_ATM_ERROR', code);
  }
}

class ApiBadError extends ApiError {
  constructor(msg: string) {
    super(msg, 'BAD_ERROR', 400);
  }
}
```

---

## 4. Database Schema (Drizzle / MySQL)
*Base Entity Trait:* Extract `id` (uuid, PK), `created_at` (timestamp), `updated_at` (timestamp) for all tables.

### `users` Table
Stores authentication and basic profile info for all system users.
*   `id` (uuid, PK)
*   `email` (varchar, Unique)
*   `pass` (varchar): Argon2 hashed password.
*   `role` (enum): `CUSTOMER`, `TELLER`, `MANAGER`, `ADMIN`.
*   `status` (enum): `ACTIVE`, `CLOSED`, `SUSPENDED`.
*   `verified_at` (timestamp, Nullable): When email was verified.
*   `created_at`, `updated_at`

### `accounts` Table
Represents financial buckets. Balance is NOT stored here.
*   `id` (uuid, PK)
*   `user_id` (uuid, FK -> users.id)
*   `type` (enum): `CHECKING`, `SAVINGS`.
*   `status` (enum): `OPEN`, `FROZEN`, `CLOSED`.
*   `created_at`, `updated_at`

### `transactions` Table
The parent record for a single financial event.
*   `id` (uuid, PK)
*   `type` (enum): `TRANSFER`, `DEPOSIT`, `WITHDRAWAL`, `FEE`.
*   `status` (enum): `PENDING`, `COMPLETED`, `FAILED`, `REVERSED`.
*   `reference` (varchar)
*   `created_by` (uuid, FK -> users.id)
*   `from_id` (uuid, FK -> accounts.id, Nullable for deposit/withdrawal/fee)
*   `to_id` (uuid, FK -> accounts.id, Nullable for deposit/withdrawal/fee)
*   `created_at`, `updated_at`

### `ledgers` Table
The immutable double-entry ledger.
*   `id` (uuid, PK)
*   `transaction_id` (uuid, FK -> transactions.id)
*   `account_id` (uuid, FK -> accounts.id)
*   `type` (enum): `CREDIT`, `DEBIT`.
*   `amount` (int): Amount moved in Paisa (always positive).
*   `balance` (int): Account balance at that time in Paisa (after add/remove).
*   `created_at`, `updated_at`

### `cards` Table
Virtual payment cards linked to accounts.
*   `id` (uuid, PK)
*   `account_id` (uuid, FK -> accounts.id)
*   `type` (enum): `BASIC` (Limit: 1000000 paisa), `CLASSIC` (Limit: 1500000 paisa). Others hidden in Phase 1.
*   `card_number` (varchar)
*   `cvv` (varchar) 
*   `expiry_date` (varchar 5): MM/YY format.
*   `status` (enum): `ACTIVE`, `FROZEN`, `BLOCKED`.
*   `daily_limit` (int): Limit in Paisa.
*   `created_at`, `updated_at`

---

## 5. Core Business Rules
1.  **Authentication:** OTP is required *only* for registration. Login uses Access/Refresh tokens.
2.  **Account Creation:** No KYC required to create accounts. Users can have multiple accounts.
3.  **KYC Thresholds:** Savings > ₹10,000 (1,000,000 paisa) or Current > ₹50,000 (5,000,000 paisa) triggers KYC requirement.
4.  **Deposits:** Never blocked, regardless of KYC status.
5.  **Withdrawals/Transfers:** Blocked if balance crosses the KYC threshold AND KYC is not completed.
6.  **Cards:** 1 Account can have *multiple* cards. 1 Card is linked to exactly *1* account. User manually selects tier (Basic/Classic).

---

## 6. Core API Routes & Types

### 6.1 Auth Routes (`/api/auth`)

**POST `/api/auth/register`**
*   **Middleware:** Joi validation
*   **Req Body:** `{ email: string, pass: string }`
*   **Res Data:** `{ message: "OTP sent to email" }`
*   **Logic:** Hash pass (Argon2), save user with `status: 'ACTIVE'`, `verified_at: null`. Generate 6-digit OTP, store in local map with 5min TTL. Send email.

**POST `/api/auth/verify-otp`**
*   **Req Body:** `{ email: string, otp: string }`
*   **Res Data:** `{ userId: string, accessToken: string, refreshToken: string }`
*   **Logic:** Validate OTP against local map. If valid, set `verified_at = now`. Return JWT tokens.

**POST `/api/auth/login`**
*   **Req Body:** `{ email: string, pass: string }`
*   **Res Data:** `{ accessToken: string, refreshToken: string }`
*   **Logic:** Verify password. Ensure `verified_at` is not null. Return tokens.

**POST `/api/auth/refresh`**
*   **Req Body:** `{ refreshToken: string }`
*   **Res Data:** `{ accessToken: string }`

---

### 6.2 Account Routes (`/api/accounts`)

**POST `/api/accounts`** *(Auth: Customer)*
*   **Req Body:** `{ type: 'CHECKING' | 'SAVINGS' }`
*   **Res Data:** Account object (without balance).
*   **Logic:** Create account with `status: 'OPEN'`.

**GET `/api/accounts`** *(Auth: Customer)*
*   **Res Data:** `Account[]`
*   **Logic:** Return all accounts owned by the user. (Balance must be fetched from `ledgers` table dynamically).

**GET `/api/accounts/:accountId/statement`** *(Auth: Customer)*
*   **Req Query:** `{ page: number, limit: number }`
*   **Res Data:** `Ledger[]` with `meta` object.
*   **Logic:** Fetch paginated ledger entries for the account.

---

### 6.3 Card Routes (`/api/cards`)

**POST `/api/cards`** *(Auth: Customer)*
*   **Req Body:** `{ accountId: string, type: 'BASIC' | 'CLASSIC' }`
*   **Res Data:** Card object.
*   **Logic:** Generate random `card_number`, `cvv`, `expiry_date` (MM/YY). Set `daily_limit` based on `type`. Save to DB.

**GET `/api/cards`** *(Auth: Customer)*
*   **Res Data:** `Card[]`

**PATCH `/api/cards/:cardId/freeze`** *(Auth: Customer)*
*   **Res Data:** Updated Card object.
*   **Logic:** Change `status` to `FROZEN`.

---

### 6.4 Transaction Routes (`/api/transactions`)

**POST `/api/transactions/deposit`** *(Auth: Teller/Manager)*
*   **Req Body:** `{ accountId: string, amount: number (in paisa), reference: string }`
*   **Res Data:** `{ transactionId: string, newBalance: number }`
*   **Logic:** 
    *   Create `transactions` record (`type: 'DEPOSIT'`, `to_id: accountId`, `status: 'COMPLETED'`).
    *   Create `ledgers` record (`type: 'CREDIT'`, `amount`, calculate `balance`).
    *   *KYC Check:* If new balance > threshold, return warning in response meta but *do not block*.

**POST `/api/transactions/withdraw`** *(Auth: Teller/Manager)*
*   **Req Body:** `{ accountId: string, amount: number (in paisa), reference: string }`
*   **Res Data:** `{ transactionId: string, newBalance: number }`
*   **Logic:** 
    *   Calculate current balance. Check if withdrawal makes balance cross threshold & if KYC is unverified -> Throw `ApiBadError("KYC required")`.
    *   Check sufficient balance -> Throw `ApiBadError("Insufficient funds")`.
    *   Create `transactions` record (`type: 'WITHDRAWAL'`, `from_id: accountId`).
    *   Create `ledgers` record (`type: 'DEBIT'`, `amount`, calculate `balance`).

**POST `/api/transactions/transfer`** *(Auth: Customer)*
*   **Req Body:** `{ fromAccountId: string, toAccountId: string, amount: number (in paisa), reference: string }`
*   **Res Data:** `{ transactionId: string }`
*   **Logic:** 
    *   Verify user owns `fromAccountId`.
    *   Check KYC threshold on `fromAccount` -> Throw `ApiBadError("KYC required")` if threshold crossed & unverified.
    *   Check sufficient balance -> Throw `ApiBadError("Insufficient funds")`.
    *   Create `transactions` record (`type: 'TRANSFER'`, `from_id`, `to_id`).
    *   Create 2 `ledgers` records: DEBIT on `fromAccount`, CREDIT on `toAccount`.

---

### 6.5 Admin/Teller Search Route (`/api/admin`)

**GET `/api/admin/search`** *(Auth: Teller/Manager)*
*   **Req Query:** `{ accountNumber: string }`
*   **Res Data:** `{ user: { id, email }, account: { id, type, status, currentBalance } }`
*   **Logic:** Find account by ID. Fetch latest balance from `ledgers` table. Return warnings if KYC threshold crossed.

### 6.6 Support & Chat Routes (`/api/support`)

Since customer support was defined as an AI Chatbot and Live Chat in Phase 1, the backend needs to support message handling.

**POST `/api/support/ai`** *(Auth: Customer)*
*   **Req Body:** `{ message: string }`
*   **Res Data:** `{ reply: string }`
*   **Logic:** For Phase 1, this can be a simple rule-based engine or an API call to an LLM provider. The backend acts as a proxy to prevent exposing API keys to the frontend.

**POST `/api/support/tickets`** *(Auth: Customer)*
*   **Req Body:** `{ subject: string, message: string }`
*   **Res Data:** `{ ticketId: string, status: 'OPEN' }`
*   **Logic:** If the AI cannot resolve the issue, the user escalates to a Live Agent. Create a ticket in the database.

**GET `/api/support/tickets/:ticketId/messages`** *(Auth: Customer or Teller)*
*   **Req Query:** `{ page: number, limit: number }`
*   **Res Data:** `Message[]` with `meta` object.
*   **Logic:** Fetch paginated chat messages for the ticket. (For real-time Phase 1, frontend can poll this endpoint every X seconds, or we can upgrade to WebSockets in a later phase).

**POST `/api/support/tickets/:ticketId/messages`** *(Auth: Customer or Teller)*
*   **Req Body:** `{ message: string }`
*   **Res Data:** `{ messageId: string, createdAt: timestamp }`
*   **Logic:** Append a new message to the ticket.

---

## 7. Critical Backend Logic & Non-Functional Requirements

### 7.1 Atomic Database Transactions (Double-Entry Ledger)
Because the `ledgers` table represents a double-entry system, **all money movements must be wrapped in Drizzle transactions** (`db.transaction()`). 
*   **Deposit Example:** 
    1. Insert `transactions` record.
    2. Fetch latest `balance` from `ledgers` for the account.
    3. Insert `ledgers` record (CREDIT) with the new calculated balance.
    4. Commit transaction.
*   If any step fails, the entire transaction must rollback to prevent balance corruption.

### 7.2 Balance Calculation
Since `accounts` does not store the balance, the current balance of an account must be fetched by querying the `ledgers` table:
`SELECT balance FROM ledgers WHERE account_id = ? ORDER BY created_at DESC LIMIT 1;`
*Ensure an index exists on `(account_id, created_at)` in the `ledgers` table for performance.*

### 7.3 OTP Security (Local Map)
Since OTPs are stored in a local memory map for Phase 1:
*   **TTL:** 5 Minutes (300 seconds).
*   **Rate Limiting:** Express middleware must rate limit the `POST /api/auth/register` and `POST /api/auth/verify-otp` routes (e.g., max 3 requests per 10 minutes per IP/Email) to prevent OTP bombing.
*   **Cleanup:** Implement a `setInterval` to periodically remove expired OTPs from the local map to prevent memory leaks.

### 7.4 KYC Check Guard
A middleware or service-level guard must intercept `POST /api/transactions/withdraw` and `POST /api/transactions/transfer`.
*   **Logic:** `if (accountBalance >= kycThreshold && user.verified_at === null) throw new ApiBadError("KYC required for this transaction")`.

---

## 8. Phase 1 Out of Scope (Future Phases)
To ensure the development team stays focused, the following items are explicitly out of scope for Phase 1:
*   Video KYC execution and approval workflows (Phase 3).
*   Manager approval workflows for premium cards (Gold, Platinum, Diamond).
*   Physical cash deposits via ATM/NPC machines (Only Teller-led branch deposits).
*   WebSockets for real-time chat (Polling is acceptable for MVP).
*   Frontend development (Strictly backend API in Phase 1).
*   Interest calculations on Savings/Current accounts.
