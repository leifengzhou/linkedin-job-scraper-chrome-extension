const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectJobDataWithRetries,
  getMissingCriticalFields
} = require("../retry_policy.js");

test("getMissingCriticalFields returns all blank critical fields", () => {
  const missingFields = getMissingCriticalFields({
    title: "",
    company: "Acme",
    linkedinUrl: "",
    applyUrl: "",
    description: "(Description not available)",
    aboutCompany: ""
  });

  assert.deepEqual(missingFields, [
    "title",
    "linkedinUrl",
    "applyUrl",
    "description"
  ]);
});

test("getMissingCriticalFields treats a missing job object as all critical fields missing", () => {
  const missingFields = getMissingCriticalFields(null);

  assert.deepEqual(missingFields, [
    "title",
    "company",
    "linkedinUrl",
    "applyUrl",
    "description"
  ]);
});

test("collectJobDataWithRetries retries with increasing delays until data is complete", async () => {
  const attempts = [];
  const delays = [];
  const snapshots = [
    { title: "", company: "Acme", linkedinUrl: "https://linkedin.com/jobs/view/1/", applyUrl: "", description: "", aboutCompany: "" },
    { title: "Engineer", company: "Acme", linkedinUrl: "https://linkedin.com/jobs/view/1/", applyUrl: "", description: "Role details", aboutCompany: "" },
    { title: "Engineer", company: "Acme", linkedinUrl: "https://linkedin.com/jobs/view/1/", applyUrl: "https://acme.example/jobs/1", description: "Role details", aboutCompany: "Company overview" }
  ];

  const result = await collectJobDataWithRetries({
    maxRetries: 10,
    collect: async (attemptNumber) => {
      attempts.push(attemptNumber);
      return snapshots[attemptNumber - 1];
    },
    sleep: async (ms) => {
      delays.push(ms);
    }
  });

  assert.equal(result.exhaustedRetries, false);
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.jobData.applyUrl, "https://acme.example/jobs/1");
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(delays, [1000, 2000]);
});

test("collectJobDataWithRetries does not retry when only aboutCompany is missing", async () => {
  const attempts = [];
  const delays = [];

  const result = await collectJobDataWithRetries({
    maxRetries: 10,
    collect: async (attemptNumber) => {
      attempts.push(attemptNumber);
      return {
        title: "Engineer",
        company: "Acme",
        linkedinUrl: "https://linkedin.com/jobs/view/1/",
        applyUrl: "https://linkedin.com/jobs/view/1/",
        description: "Role details",
        aboutCompany: ""
      };
    },
    sleep: async (ms) => {
      delays.push(ms);
    }
  });

  assert.equal(result.exhaustedRetries, false);
  assert.deepEqual(result.missingFields, []);
  assert.equal(attempts.length, 1);
  assert.deepEqual(delays, []);
});

test("collectJobDataWithRetries returns missing fields after the tenth failed attempt", async () => {
  let attempts = 0;

  const result = await collectJobDataWithRetries({
    maxRetries: 10,
    collect: async () => {
      attempts++;
      return {
        title: "",
        company: "Acme",
        linkedinUrl: "https://linkedin.com/jobs/view/1/",
        applyUrl: "",
        description: "",
        aboutCompany: ""
      };
    },
    sleep: async () => {}
  });

  assert.equal(attempts, 10);
  assert.equal(result.exhaustedRetries, true);
  assert.deepEqual(result.missingFields, ["title", "applyUrl", "description"]);
});
