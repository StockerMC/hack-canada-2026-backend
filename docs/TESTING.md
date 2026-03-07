# CLIPSTAKES Testing Guide

## Overview

Tests are written using [Bun's built-in test runner](https://bun.sh/docs/cli/test), which provides a fast, Jest-compatible testing experience.

## Test Types

| Type | What it tests | Database | Speed |
|------|---------------|----------|-------|
| **Unit tests** | Route handlers, validation, response format | Mocked | Fast (~100ms) |
| **Integration tests** | Real DB queries, full API flow | Real Neon | Slower (~2s) |

**Unit tests** verify code logic works correctly in isolation.
**Integration tests** verify the code actually works with a real database.

## Running Tests

```bash
# Unit tests only (fast, no DB required)
bun run test

# Unit tests in watch mode
bun run test:watch

# Integration tests (requires DATABASE_URL)
DATABASE_URL=postgres://... bun run test:integration

# All tests
bun run test:all
```

## Test Structure

```
tests/
├── api.test.ts         # Unit: API route tests (mocked DB)
├── lib.test.ts         # Unit: Utility function tests
├── db.test.ts          # Unit: Database interface tests (in-memory)
└── integration.test.ts # Integration: Real DB + full API flow
```

---

## Test Files

### `tests/api.test.ts`

Tests the HTTP API routes by making requests to a Hono app instance with a mocked database.

**What it tests:**
- **Clips API**
  - `GET /clips/:productId` - Returns clips sorted by conversions
  - `POST /clips` - Creates clips, validates input, handles auth
- **Receipts API**
  - `GET /receipt/:id` - Returns receipt details, handles 404
- **Earnings API**
  - `GET /earnings/:userId` - Returns earnings in cents/dollars format
- **Upload API**
  - `POST /upload-url` - Generates unique upload URLs

**Example test:**
```typescript
test("GET /clips/:productId returns clips ranked by conversions", async () => {
  const app = new Hono()
  app.route("/clips", clipsRoutes(mockDb))

  const res = await app.request("/clips/product-abc")

  expect(res.status).toBe(200)
  const json = await res.json()
  expect(json.clips[0].conversions).toBeGreaterThanOrEqual(json.clips[1].conversions)
})
```

### `tests/lib.test.ts`

Tests utility functions from `src/lib/`.

**What it tests:**
- **R2 Helpers**
  - `generateVideoKey()` - Generates unique video IDs and keys
  - `getVideoUrl()` - Constructs video URLs with custom domains

**Example test:**
```typescript
test("generates unique video IDs", () => {
  const results = Array.from({ length: 10 }, () => generateVideoKey())
  const ids = results.map((r) => r.videoId)
  const uniqueIds = new Set(ids)

  expect(uniqueIds.size).toBe(10)
})
```

### `tests/db.test.ts`

Tests the database interface using an in-memory implementation that mirrors the real Neon database behavior.

**What it tests:**
- **Type contracts** - Ensures User, Clip, Receipt types have required fields
- **User operations** - Create, find by device ID, update earnings/push token
- **Clip operations** - Create, find, increment conversions, sort by conversions
- **Receipt operations** - Create, find, mark as used

**Example test:**
```typescript
test("getClipsByProductId returns clips sorted by conversions", async () => {
  const db = createInMemoryDb()
  const user = await db.createUser("device-123", null)

  const clip1 = await db.createClip(user.id, "product-abc", "https://example.com/1.mp4")
  const clip2 = await db.createClip(user.id, "product-abc", "https://example.com/2.mp4")

  await db.incrementClipConversions(clip2.id)
  await db.incrementClipConversions(clip2.id)

  const clips = await db.getClipsByProductId("product-abc")

  expect(clips[0].id).toBe(clip2.id) // Higher conversions first
})
```

### `tests/integration.test.ts`

Tests the real database operations and full API flow. **Requires a real Neon database.**

**What it tests:**
- Actual SQL queries work correctly
- Database constraints (unique device_id, foreign keys)
- Full request → DB → response flow
- Data persists and retrieves correctly

**Example test:**
```typescript
test("full clip creation flow", async () => {
  const deviceId = `integration-test-${Date.now()}`

  // 1. Create clip via API (hits real DB)
  const createRes = await app.request("/clips", {
    method: "POST",
    headers: { "X-Device-ID": deviceId, "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: "test", video_url: "https://..." }),
  })

  // 2. Verify it's in the database
  const { clips } = await app.request(`/clips/test`).then(r => r.json())
  expect(clips.some(c => c.id === clip.id)).toBe(true)
})
```

**Running integration tests:**
```bash
# Use a test database, NOT production!
DATABASE_URL=postgres://user:pass@host/testdb bun run test:integration
```

---

## Mocking

### Mock Database

API tests use a mock database that returns predictable test data:

```typescript
function createMockDb(): Db {
  return {
    getUserByDeviceId: mock(() => Promise.resolve(null)),
    createUser: mock(() => Promise.resolve({
      id: "user-123",
      device_id: "device-abc",
      // ...
    })),
    // ... other methods
  }
}
```

### In-Memory Database

Database tests use a full in-memory implementation that behaves like the real database:

```typescript
function createInMemoryDb(): Db {
  const users = new Map<string, User>()
  const clips = new Map<string, Clip>()

  return {
    async createUser(deviceId, pushToken) {
      const user = { id: crypto.randomUUID(), device_id: deviceId, ... }
      users.set(user.id, user)
      return user
    },
    // ... real implementation logic
  }
}
```

---

## Writing New Tests

### API Route Test

```typescript
import { describe, test, expect, beforeEach } from "bun:test"
import { Hono } from "hono"
import { myRoutes } from "../src/routes/my-route"

describe("My API", () => {
  let mockDb: Db

  beforeEach(() => {
    mockDb = createMockDb()
  })

  test("handles valid request", async () => {
    const app = new Hono()
    app.route("/my-route", myRoutes(mockDb))

    const res = await app.request("/my-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "test" }),
    })

    expect(res.status).toBe(200)
  })
})
```

### Utility Function Test

```typescript
import { describe, test, expect } from "bun:test"
import { myFunction } from "../src/lib/my-lib"

describe("myFunction", () => {
  test("returns expected result", () => {
    const result = myFunction("input")
    expect(result).toBe("expected")
  })
})
```

---

## Test Coverage

Bun doesn't have built-in coverage yet, but you can use:

```bash
# Using c8 (requires Node.js)
npx c8 bun test
```

---

## Best Practices

1. **Test behavior, not implementation** - Focus on what the API returns, not how it works internally

2. **Use descriptive test names** - Names should describe the scenario and expected outcome

3. **One assertion per concept** - Keep tests focused; multiple expects are fine if testing one behavior

4. **Reset state in beforeEach** - Ensure tests don't affect each other

5. **Test edge cases** - Empty arrays, null values, missing data, invalid input

6. **Test error responses** - Verify 400, 401, 404 responses have correct error messages
