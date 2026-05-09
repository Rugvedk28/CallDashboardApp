const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

// const HOST = process.env.HOST || "127.0.0.1";
// const PORT = Number(process.env.PORT || 3000);
const HOST = env.example.HOST || '0.0.0.0';
const PORT = env.example.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || "admin123";
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Kolkata";
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || "";
const GOOGLE_SCRIPT_SECRET = process.env.GOOGLE_SCRIPT_SECRET || "";

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const EXPORT_DIR = path.join(ROOT_DIR, "exports");
const STORAGE_FILE = path.join(DATA_DIR, "submissions.json");

const sessions = new Map();

function ensureAppFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(
      STORAGE_FILE,
      JSON.stringify(
        {
          submissions: [],
          meta: {
            lastAutoExportDate: null
          }
        },
        null,
        2
      )
    );
  }
}

function readStorage() {
  ensureAppFiles();
  const content = fs.readFileSync(STORAGE_FILE, "utf8");
  return JSON.parse(content);
}

function writeStorage(data) {
  ensureAppFiles();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function getLocalParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }

  return parts;
}

function getTodayString(date = new Date()) {
  const parts = getLocalParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDisplayDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON payload."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers
  });
  response.end(text);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".ico") return "image/x-icon";
  return "text/html; charset=utf-8";
}

function serveStatic(response, pathname) {
  const routePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, routePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": getMimeType(filePath)
  });
  fs.createReadStream(filePath).pipe(response);
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return header.split(";").reduce((cookies, item) => {
    const [key, ...rest] = item.trim().split("=");
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

function getAdminSession(request) {
  const cookies = parseCookies(request);
  const token = cookies.session;
  return token && sessions.has(token) ? sessions.get(token) : null;
}

function requireAdmin(request, response) {
  const session = getAdminSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Admin login required." });
    return false;
  }

  return true;
}

function normalizeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.floor(number);
}

function escapeCsv(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(submissions) {
  const headers = [
    "Report Date",
    "Submitted At",
    "Employee Name",
    "Call Details",
    "Consulting Physician",
    "Surgeon",
    "Orthos",
    "Urologist",
    "Gynacologist",
    "Total Doctors Covered"
  ];

  const rows = submissions.map((entry) => [
    entry.reportDate,
    entry.submittedAt,
    entry.employeeName,
    entry.callDetails,
    entry.doctorCounts.consultingPhysician,
    entry.doctorCounts.surgeon,
    entry.doctorCounts.orthos,
    entry.doctorCounts.urologist,
    entry.doctorCounts.gynacologist,
    entry.totalDoctors
  ]);

  return [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");
}

function getSummary(submissions) {
  return submissions.reduce(
    (summary, entry) => {
      summary.totalEntries += 1;
      summary.consultingPhysician += entry.doctorCounts.consultingPhysician;
      summary.surgeon += entry.doctorCounts.surgeon;
      summary.orthos += entry.doctorCounts.orthos;
      summary.urologist += entry.doctorCounts.urologist;
      summary.gynacologist += entry.doctorCounts.gynacologist;
      summary.totalDoctors += entry.totalDoctors;
      return summary;
    },
    {
      totalEntries: 0,
      consultingPhysician: 0,
      surgeon: 0,
      orthos: 0,
      urologist: 0,
      gynacologist: 0,
      totalDoctors: 0
    }
  );
}

function buildSubmission(payload) {
  const employeeName = String(payload.employeeName || "").trim();
  const callDetails = String(payload.callDetails || "").trim();

  if (!employeeName) {
    throw new Error("Employee name is required.");
  }

  const doctorCounts = {
    consultingPhysician: normalizeCount(payload.doctorCounts?.consultingPhysician),
    surgeon: normalizeCount(payload.doctorCounts?.surgeon),
    orthos: normalizeCount(payload.doctorCounts?.orthos),
    urologist: normalizeCount(payload.doctorCounts?.urologist),
    gynacologist: normalizeCount(payload.doctorCounts?.gynacologist)
  };

  return {
    id: crypto.randomUUID(),
    employeeName,
    reportDate: getTodayString(),
    submittedAt: new Date().toISOString(),
    callDetails,
    doctorCounts,
    totalDoctors: Object.values(doctorCounts).reduce((sum, value) => sum + value, 0)
  };
}

function normalizeSubmissionRecord(entry) {
  const doctorCounts = {
    consultingPhysician: normalizeCount(entry.doctorCounts?.consultingPhysician ?? entry.consultingPhysician),
    surgeon: normalizeCount(entry.doctorCounts?.surgeon ?? entry.surgeon),
    orthos: normalizeCount(entry.doctorCounts?.orthos ?? entry.orthos),
    urologist: normalizeCount(entry.doctorCounts?.urologist ?? entry.urologist),
    gynacologist: normalizeCount(entry.doctorCounts?.gynacologist ?? entry.gynacologist)
  };

  return {
    id: String(entry.id || crypto.randomUUID()),
    employeeName: String(entry.employeeName || ""),
    reportDate: String(entry.reportDate || ""),
    submittedAt: String(entry.submittedAt || ""),
    callDetails: String(entry.callDetails || ""),
    doctorCounts,
    totalDoctors: normalizeCount(
      entry.totalDoctors ?? Object.values(doctorCounts).reduce((sum, value) => sum + value, 0)
    )
  };
}

function listLocalSubmissionsByDate(dateString) {
  const storage = readStorage();
  return storage.submissions
    .filter((entry) => entry.reportDate === dateString)
    .map(normalizeSubmissionRecord)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

function saveLocalSubmission(submission) {
  const storage = readStorage();
  storage.submissions.push(submission);
  writeStorage(storage);
}

function ensureGoogleSheetsConfig() {
  if (!GOOGLE_SCRIPT_URL || !GOOGLE_SCRIPT_SECRET) {
    throw new Error(
      "Google Sheets mode requires GOOGLE_SCRIPT_URL and GOOGLE_SCRIPT_SECRET environment variables."
    );
  }
}

async function callGoogleScript(method, action, payload = {}) {
  ensureGoogleSheetsConfig();

  let targetUrl = new URL(GOOGLE_SCRIPT_URL);
  const options = {
    method,
    headers: {}
  };

  if (method === "GET") {
    targetUrl.searchParams.set("action", action);
    targetUrl.searchParams.set("secret", GOOGLE_SCRIPT_SECRET);
    for (const [key, value] of Object.entries(payload)) {
      targetUrl.searchParams.set(key, String(value));
    }
  } else {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify({
      action,
      secret: GOOGLE_SCRIPT_SECRET,
      ...payload
    });
  }

  const upstream = await fetch(targetUrl, options);
  const responseText = await upstream.text();

  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    throw new Error("Google Sheets connector returned an invalid response.");
  }

  if (!upstream.ok || data.ok === false) {
    throw new Error(data.error || "Google Sheets connector request failed.");
  }

  return data;
}

async function saveSubmission(submission) {
  if (STORAGE_PROVIDER === "google_sheets") {
    await callGoogleScript("POST", "append", { submission });
    return;
  }

  saveLocalSubmission(submission);
}

async function listSubmissionsByDate(dateString) {
  if (STORAGE_PROVIDER === "google_sheets") {
    const result = await callGoogleScript("GET", "list", { date: dateString });
    return Array.isArray(result.submissions)
      ? result.submissions.map(normalizeSubmissionRecord).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      : [];
  }

  return listLocalSubmissionsByDate(dateString);
}

function writeCsvExport(dateString, submissions) {
  ensureAppFiles();
  const fileName = `employee-call-report-${dateString}.csv`;
  const filePath = path.join(EXPORT_DIR, fileName);
  const csv = buildCsv(submissions);
  fs.writeFileSync(filePath, csv, "utf8");
  return { fileName, filePath, csv };
}

function runPendingAutoExports() {
  if (STORAGE_PROVIDER !== "local") {
    return;
  }

  const storage = readStorage();
  const today = getTodayString();
  const targetDates = Array.from(
    new Set(
      storage.submissions
        .map((entry) => entry.reportDate)
        .filter((date) => date < today)
    )
  ).sort();

  for (const date of targetDates) {
    if (!storage.meta.lastAutoExportDate || date > storage.meta.lastAutoExportDate) {
      writeCsvExport(date, listLocalSubmissionsByDate(date));
      storage.meta.lastAutoExportDate = date;
    }
  }

  writeStorage(storage);
}

function buildSessionCookie(request, token) {
  const isSecure = request.headers["x-forwarded-proto"] === "https";
  return [
    `session=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=28800",
    isSecure ? "Secure" : null
  ]
    .filter(Boolean)
    .join("; ");
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/healthz") {
    sendJson(response, 200, {
      ok: true,
      storageProvider: STORAGE_PROVIDER
    });
    return;
  }

  if (request.method === "GET" && pathname === "/api/meta") {
    sendJson(response, 200, {
      today: getTodayString(),
      displayDate: getDisplayDate(),
      timeZone: APP_TIME_ZONE,
      storageProvider: STORAGE_PROVIDER
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/submissions") {
    try {
      const payload = await parseBody(request);
      const submission = buildSubmission(payload);
      await saveSubmission(submission);

      sendJson(response, 201, {
        message: "Daily call report submitted successfully.",
        submission
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/login") {
    try {
      const payload = await parseBody(request);
      const code = String(payload.code || "");

      if (code !== ADMIN_CODE) {
        sendJson(response, 401, { error: "Invalid admin code." });
        return;
      }

      const token = crypto.randomBytes(24).toString("hex");
      sessions.set(token, {
        createdAt: new Date().toISOString()
      });

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": buildSessionCookie(request, token)
      });
      response.end(JSON.stringify({ message: "Admin login successful." }));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/logout") {
    const cookies = parseCookies(request);
    if (cookies.session) {
      sessions.delete(cookies.session);
    }

    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
    response.end(JSON.stringify({ message: "Logged out." }));
    return;
  }

  if (request.method === "GET" && pathname === "/api/admin/submissions") {
    if (!requireAdmin(request, response)) return;

    try {
      const date = url.searchParams.get("date") || getTodayString();
      const submissions = await listSubmissionsByDate(date);

      sendJson(response, 200, {
        date,
        submissions,
        summary: getSummary(submissions)
      });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/api/admin/export") {
    if (!requireAdmin(request, response)) return;

    try {
      const date = url.searchParams.get("date") || getTodayString();
      const submissions = await listSubmissionsByDate(date);
      const fileName = `employee-call-report-${date}.csv`;
      const csv = buildCsv([...submissions].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)));

      if (STORAGE_PROVIDER === "local") {
        writeCsvExport(date, submissions);
      }

      response.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`
      });
      response.end(csv);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && pathname === "/admin") {
    serveStatic(response, "/admin.html");
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(response, pathname);
    return;
  }

  sendText(response, 404, "Not found");
}

ensureAppFiles();
runPendingAutoExports();
setInterval(runPendingAutoExports, 60_000);

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 500, { error: "Something went wrong on the server." });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Employee reporting app running on ${HOST}:${PORT}`);
  console.log(`Admin dashboard: /admin`);
  console.log(`Current time zone: ${APP_TIME_ZONE}`);
  console.log(`Storage provider: ${STORAGE_PROVIDER}`);
});
