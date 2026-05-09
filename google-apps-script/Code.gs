const SHEET_NAME = "Reports";
const HEADERS = [
  "id",
  "reportDate",
  "submittedAt",
  "employeeName",
  "callDetails",
  "consultingPhysician",
  "surgeon",
  "orthos",
  "urologist",
  "gynacologist",
  "totalDoctors"
];

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    const payload = readPayload_(e, method);
    validateSecret_(payload.secret);

    if (payload.action === "list") {
      const date = String(payload.date || "");
      const submissions = listSubmissions_(date);
      return jsonResponse_({ ok: true, submissions: submissions });
    }

    if (payload.action === "append") {
      const submission = payload.submission || {};
      appendSubmission_(submission);
      return jsonResponse_({ ok: true });
    }

    if (payload.action === "ping") {
      return jsonResponse_({ ok: true });
    }

    return jsonResponse_({ ok: false, error: "Unsupported action." });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function readPayload_(e, method) {
  if (method === "GET") {
    return e.parameter || {};
  }

  if (!e.postData || !e.postData.contents) {
    throw new Error("Missing POST body.");
  }

  return JSON.parse(e.postData.contents);
}

function validateSecret_(providedSecret) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("APP_SECRET");
  if (!expectedSecret) {
    throw new Error("APP_SECRET is not configured in script properties.");
  }

  if (providedSecret !== expectedSecret) {
    throw new Error("Unauthorized request.");
  }
}

function appendSubmission_(submission) {
  const sheet = getSheet_();
  ensureHeaders_(sheet);

  const row = [
    safeCell_(submission.id),
    safeCell_(submission.reportDate),
    safeCell_(submission.submittedAt),
    safeCell_(submission.employeeName),
    safeCell_(submission.callDetails),
    numberCell_(submission.doctorCounts && submission.doctorCounts.consultingPhysician),
    numberCell_(submission.doctorCounts && submission.doctorCounts.surgeon),
    numberCell_(submission.doctorCounts && submission.doctorCounts.orthos),
    numberCell_(submission.doctorCounts && submission.doctorCounts.urologist),
    numberCell_(submission.doctorCounts && submission.doctorCounts.gynacologist),
    numberCell_(submission.totalDoctors)
  ];

  sheet.appendRow(row);
}

function listSubmissions_(date) {
  const sheet = getSheet_();
  ensureHeaders_(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .map(function(row) {
      return {
        id: String(row[0] || ""),
        reportDate: String(row[1] || ""),
        submittedAt: String(row[2] || ""),
        employeeName: String(row[3] || ""),
        callDetails: String(row[4] || ""),
        doctorCounts: {
          consultingPhysician: Number(row[5] || 0),
          surgeon: Number(row[6] || 0),
          orthos: Number(row[7] || 0),
          urologist: Number(row[8] || 0),
          gynacologist: Number(row[9] || 0)
        },
        totalDoctors: Number(row[10] || 0)
      };
    })
    .filter(function(entry) {
      return !date || entry.reportDate === date;
    });
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
}

function safeCell_(value) {
  const text = String(value || "");
  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }
  return text;
}

function numberCell_(value) {
  const number = Number(value);
  if (!isFinite(number) || number < 0) {
    return 0;
  }
  return Math.floor(number);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
