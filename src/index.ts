import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import type { Env } from "./types"
import { createDb } from "./db"
import { clipsRoutes } from "./routes/clips"
import { receiptsRoutes } from "./routes/receipts"
import { earningsRoutes } from "./routes/earnings"
import { uploadRoutes } from "./routes/upload"
import { conversionsRoutes } from "./routes/conversions"
import { walletRoutes } from "./routes/wallet"
import { rewardsRoutes } from "./routes/rewards"
import { couponsRoutes } from "./routes/coupons"
import { checkoutRoutes } from "./routes/checkout"

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const db = createDb(env.DATABASE_URL)

    const app = new Hono<{ Bindings: Env }>()

    // Middleware
    app.use("*", logger())
    app.use("*", cors())

    // Health check
    app.get("/", (c) => {
      return c.json({ status: "ok", service: "clipstakes" })
    })

    // Mount routes
    app.route("/clips", clipsRoutes(db))
    app.route("/receipt", receiptsRoutes(db))
    app.route("/earnings", earningsRoutes(db))
    app.route("/upload", uploadRoutes())
    app.route("/upload-url", uploadRoutes())
    app.route("/conversions", conversionsRoutes(db))
    app.route("/rewards", rewardsRoutes(db))
    app.route("/coupons", couponsRoutes(db))
    app.route("/wallet", walletRoutes(db))
    app.route("/checkout", checkoutRoutes(db))

    return app.fetch(request, env, ctx)
  },
}
