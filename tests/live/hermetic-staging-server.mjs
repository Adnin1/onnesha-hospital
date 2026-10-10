/**
 * In-Build Hermetic Staging Supabase Server
 * 
 * Provides an authentic, in-process, zero-dependency HTTP mock server
 * implementing GoTrue Auth and PostgREST endpoints with runtime Row-Level Security (RLS)
 * for authenticated cross-tenant isolation testing.
 */

import http from "node:http";
import crypto from "node:crypto";

export function createHermeticStagingServer() {
  const jwtSecret = crypto.randomBytes(32).toString("hex");
  const serviceRoleKey = "sb_secret_hermetic_service_role_" + crypto.randomBytes(16).toString("hex");
  const anonKey = "sb_publishable_hermetic_anon_" + crypto.randomBytes(16).toString("hex");

  // In-memory data stores
  const users = new Map();
  const usersByEmail = new Map();

  const tables = new Map([
    ["organizations", new Map()],
    ["profiles", new Map()],
    ["patients", new Map()],
    ["organization_integrations", new Map()],
    ["invoices", new Map()],
    ["appointments", new Map()],
    ["payment_intents", new Map()],
    ["audit_logs", new Map()],
  ]);

  function getTable(name) {
    if (!tables.has(name)) {
      tables.set(name, new Map());
    }
    return tables.get(name);
  }

  function signJwt(userId, email) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      sub: userId,
      email: email,
      role: "authenticated",
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
    })).toString("base64url");
    const signature = crypto.createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
  }

  function verifyJwt(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
    if (sig !== expectedSig) return null;
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }

  function resolveAuth(req) {
    const authHeader = req.headers["authorization"] || "";
    const apiKey = req.headers["apikey"] || "";
    let token = "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (apiKey) {
      token = apiKey;
    }

    if (token === serviceRoleKey) {
      return { role: "service_role", isAdmin: true, userId: null, orgId: null };
    }

    const payload = verifyJwt(token);
    if (payload && payload.sub) {
      const userId = payload.sub;
      const profilesTable = getTable("profiles");
      const userProfile = profilesTable.get(userId);
      const orgId = userProfile?.organization_id || null;
      return { role: "authenticated", isAdmin: false, userId, orgId };
    }

    return { role: "anon", isAdmin: false, userId: null, orgId: null };
  }

  function parseQueryFilters(searchParams) {
    const filters = [];
    let selectFields = "*";

    for (const [key, val] of searchParams.entries()) {
      if (key === "select") {
        selectFields = val;
      } else if (val.startsWith("eq.")) {
        filters.push({ column: key, op: "eq", value: val.slice(3) });
      } else if (val.startsWith("neq.")) {
        filters.push({ column: key, op: "neq", value: val.slice(4) });
      }
    }
    return { filters, selectFields };
  }

  function matchesRow(row, filters) {
    for (const f of filters) {
      const cellVal = String(row[f.column] ?? "");
      if (f.op === "eq" && cellVal !== f.value) return false;
      if (f.op === "neq" && cellVal === f.value) return false;
    }
    return true;
  }

  function projectRow(row, selectFields) {
    if (!selectFields || selectFields === "*") return { ...row };
    const fields = selectFields.split(",").map((s) => s.trim());
    const res = {};
    for (const f of fields) {
      if (f in row) {
        res[f] = row[f];
      }
    }
    return res;
  }

  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, "http://127.0.0.1");
    const pathname = urlObj.pathname;
    const auth = resolveAuth(req);

    let bodyData = "";
    req.on("data", (chunk) => {
      bodyData += chunk;
    });

    req.on("end", () => {
      let body = {};
      if (bodyData.trim()) {
        try {
          body = JSON.parse(bodyData);
        } catch {
          body = {};
        }
      }

      // -----------------------------------------------------------------------
      // GoTrue Auth Endpoints
      // -----------------------------------------------------------------------
      if (pathname === "/auth/v1/admin/users" && req.method === "POST") {
        if (!auth.isAdmin) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Admin privileges required" }));
        }
        const id = crypto.randomUUID();
        const user = {
          id,
          email: body.email,
          password: body.password,
          user_metadata: body.user_metadata || {},
          app_metadata: { provider: "email", providers: ["email"] },
          created_at: new Date().toISOString(),
        };
        users.set(id, user);
        usersByEmail.set(body.email, id);

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          app_metadata: user.app_metadata,
          created_at: user.created_at,
        }));
      }

      if (pathname.startsWith("/auth/v1/admin/users/") && req.method === "DELETE") {
        if (!auth.isAdmin) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Admin privileges required" }));
        }
        const userId = pathname.replace("/auth/v1/admin/users/", "");
        const existing = users.get(userId);
        if (existing) {
          usersByEmail.delete(existing.email);
          users.delete(userId);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({}));
      }

      if (pathname === "/auth/v1/token" && req.method === "POST") {
        const userId = usersByEmail.get(body.email);
        const user = userId ? users.get(userId) : null;
        if (!user || user.password !== body.password) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid login credentials",
          }));
        }

        const token = signJwt(user.id, user.email);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          access_token: token,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh-" + crypto.randomUUID(),
          user: {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata,
          },
        }));
      }

      // -----------------------------------------------------------------------
      // PostgREST REST Endpoints: /rest/v1/:table
      // -----------------------------------------------------------------------
      if (pathname.startsWith("/rest/v1/")) {
        const table = pathname.replace("/rest/v1/", "").split("/")[0];
        const tableStore = getTable(table);
        const { filters, selectFields } = parseQueryFilters(urlObj.searchParams);
        const accept = req.headers["accept"] || "";
        const prefer = req.headers["prefer"] || "";
        const isSingle = accept.includes("application/vnd.pgrst.object+json");
        const returnRepresentation = prefer.includes("return=representation");

        // 1. GET (SELECT)
        if (req.method === "GET") {
          const matched = [];
          for (const row of tableStore.values()) {
            // RLS check for authenticated non-admin users:
            if (!auth.isAdmin) {
              if (table === "organizations") {
                if (row.id !== auth.orgId) continue;
              } else {
                if (row.organization_id !== auth.orgId) continue;
              }
            }
            if (matchesRow(row, filters)) {
              matched.push(projectRow(row, selectFields));
            }
          }

          if (isSingle) {
            if (matched.length === 1) {
              res.writeHead(200, { "Content-Type": "application/json" });
              return res.end(JSON.stringify(matched[0]));
            }
            res.writeHead(406, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              code: "PGRST116",
              details: `The result contains ${matched.length} rows`,
              message: "JSON object requested, multiple (or no) rows returned",
            }));
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(matched));
        }

        // 2. POST (INSERT / UPSERT)
        if (req.method === "POST") {
          const incomingRows = Array.isArray(body) ? body : [body];
          const inserted = [];

          for (const row of incomingRows) {
            // RLS check for non-admin:
            if (!auth.isAdmin) {
              // Block cross-tenant insertions
              if (row.organization_id && row.organization_id !== auth.orgId) {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                  code: "42501",
                  message: `new row violates row-level security policy for table "${table}"`,
                  details: "Cross-tenant insertion rejected by hermetic RLS policy",
                }));
              }
            }

            const rowId = row.id || crypto.randomUUID();
            const storedRow = { ...row, id: rowId };
            tableStore.set(rowId, storedRow);
            inserted.push(projectRow(storedRow, selectFields));
          }

          if (isSingle && inserted.length > 0) {
            res.writeHead(201, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(inserted[0]));
          }

          if (returnRepresentation) {
            res.writeHead(201, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(inserted));
          }

          res.writeHead(201, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(inserted));
        }

        // 3. PATCH (UPDATE)
        if (req.method === "PATCH") {
          const updated = [];
          for (const [id, row] of tableStore.entries()) {
            // RLS: non-admin can only update own tenant
            if (!auth.isAdmin) {
              if (row.organization_id !== auth.orgId) continue;
            }
            if (matchesRow(row, filters)) {
              const patched = { ...row, ...body };
              tableStore.set(id, patched);
              updated.push(projectRow(patched, selectFields));
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(updated));
        }

        // 4. DELETE
        if (req.method === "DELETE") {
          const deleted = [];
          const toDelete = [];
          for (const [id, row] of tableStore.entries()) {
            // RLS: non-admin can only delete own tenant
            if (!auth.isAdmin) {
              if (row.organization_id !== auth.orgId) continue;
            }
            if (matchesRow(row, filters)) {
              toDelete.push(id);
              deleted.push(projectRow(row, selectFields));
            }
          }
          for (const id of toDelete) {
            tableStore.delete(id);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(deleted));
        }
      }

      // Fallback 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint not found" }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        serviceRoleKey,
        anonKey,
        close: () => new Promise((cb) => server.close(cb)),
      });
    });
  });
}
