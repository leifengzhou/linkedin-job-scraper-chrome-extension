const test = require("node:test");
const assert = require("node:assert/strict");

const {
  appendExportFailure,
  appendExportJob,
  buildAggregateJsonFilename,
  buildJobJsonFileDescriptor,
  buildLocationFilterFilenameSegment,
  buildExportJobRecord,
  buildJsonExportPayload,
  buildPerJobJsonFileDescriptors,
  createJsonExportBuffer
} = require("../json_export.js");

test("buildExportJobRecord preserves job fields and annotates missing fields", () => {
  const record = buildExportJobRecord({
    title: "AI Strategist",
    company: "Distyl AI",
    location: "San Francisco, CA",
    salary: "Not listed",
    datePosted: "March 27, 2026",
    applyType: "Apply on company website",
    applyUrl: "https://distyl.example/jobs/123",
    linkedinUrl: "https://www.linkedin.com/jobs/view/123/",
    jobId: "123",
    description: "Role details...",
    aboutCompany: "Company details...",
    hiringTeam: [{
      name: "Michael Deayala",
      linkedinUrl: "https://www.linkedin.com/in/michaeldeayala/",
      memberTitle: "Senior Recruiter",
      linkedinMessage: "Hi Michael, I recently applied for the AI Strategist role at Distyl AI and would love to connect. I'm very interested in the opportunity and in the work your team is doing. Thanks!"
    }]
  }, {
    missingFields: ["aboutCompany"],
    exhaustedRetries: true
  });

  assert.deepEqual(record, {
    title: "AI Strategist",
    company: "Distyl AI",
    location: "San Francisco, CA",
    salary: "Not listed",
    datePosted: "March 27, 2026",
    applyType: "Apply on company website",
    applyUrl: "https://distyl.example/jobs/123",
    linkedinUrl: "https://www.linkedin.com/jobs/view/123/",
    jobId: "123",
    description: "Role details...",
    aboutCompany: "Company details...",
    hiringTeam: [{
      name: "Michael Deayala",
      linkedinUrl: "https://www.linkedin.com/in/michaeldeayala/",
      memberTitle: "Senior Recruiter",
      linkedinMessage: "Hi Michael, I recently applied for the AI Strategist role at Distyl AI and would love to connect. I'm very interested in the opportunity and in the work your team is doing. Thanks!"
    }],
    missingFields: ["aboutCompany"],
    exhaustedRetries: true
  });
});

test("appendExportJob counts partial jobs separately without treating them as failures", () => {
  const buffer = createJsonExportBuffer();

  appendExportJob(buffer, buildExportJobRecord({
    title: "AI Strategist",
    company: "Distyl AI",
    linkedinUrl: "https://www.linkedin.com/jobs/view/123/",
    applyUrl: "https://distyl.example/jobs/123",
    jobId: "123",
    description: "Role details...",
    aboutCompany: "",
    hiringTeam: []
  }, {
    missingFields: ["aboutCompany"],
    exhaustedRetries: true
  }));

  assert.equal(buffer.jobs.length, 1);
  assert.equal(buffer.partialCount, 1);
  assert.deepEqual(buffer.failures, []);
});

test("buildJsonExportPayload summarizes saved partial and failed results", () => {
  const buffer = createJsonExportBuffer();
  appendExportJob(buffer, buildExportJobRecord({
    title: "AI Strategist",
    company: "Distyl AI",
    linkedinUrl: "https://www.linkedin.com/jobs/view/123/",
    applyUrl: "https://distyl.example/jobs/123",
    jobId: "123",
    description: "Role details...",
    aboutCompany: "Company details...",
    hiringTeam: [{
      name: "Michael Deayala",
      linkedinUrl: "https://www.linkedin.com/in/michaeldeayala/",
      memberTitle: "Senior Recruiter",
      linkedinMessage: "Hi Michael, I recently applied for the AI Strategist role at Distyl AI and would love to connect. I'm very interested in the opportunity and in the work your team is doing. Thanks!"
    }]
  }, {
    missingFields: [],
    exhaustedRetries: false
  }));
  appendExportJob(buffer, buildExportJobRecord({
    title: "ML Engineer",
    company: "Acme",
    linkedinUrl: "https://www.linkedin.com/jobs/view/456/",
    applyUrl: "https://acme.example/jobs/456",
    jobId: "456",
    description: "Build systems",
    aboutCompany: "",
    hiringTeam: []
  }, {
    missingFields: ["aboutCompany"],
    exhaustedRetries: true
  }));
  appendExportFailure(buffer, {
    label: "Broken Co - Missing Job",
    error: "No currentJobId"
  });

  const payload = buildJsonExportPayload({
    exportedAt: "2026-03-27T18:30:00.000Z",
    runDate: "2026-03-27",
    buffer
  });

  assert.deepEqual(payload.summary, {
    savedCount: 2,
    failedCount: 1,
    partialCount: 1
  });
  assert.equal(payload.source, "linkedin-job-scraper");
  assert.equal(payload.jobs.length, 2);
  assert.deepEqual(payload.failures, [{
    label: "Broken Co - Missing Job",
    error: "No currentJobId"
  }]);
});

test("buildJobJsonFileDescriptor creates a dated json path for one saved job", () => {
  const descriptor = buildJobJsonFileDescriptor({
    runDate: "2026-05-04",
    locationFilterSegment: "Austin-Texas-Metropolitan-Area",
    jobRecord: buildExportJobRecord({
      title: "AI Strategist",
      company: "Distyl AI",
      linkedinUrl: "https://www.linkedin.com/jobs/view/123/",
      applyUrl: "https://distyl.example/jobs/123",
      jobId: "123",
      description: "Role details...",
      aboutCompany: "Company details...",
      hiringTeam: [{
        name: "Michael Deayala",
        linkedinUrl: "https://www.linkedin.com/in/michaeldeayala/",
        memberTitle: "Senior Recruiter",
        linkedinMessage: "Hi Michael, I recently applied for the AI Strategist role at Distyl AI and would love to connect. I'm very interested in the opportunity and in the work your team is doing. Thanks!"
      }]
    }, {
      missingFields: [],
      exhaustedRetries: false
    })
  });

  assert.equal(
    descriptor.filename,
    "scraped-jobs/2026-05-04/Distyl-AI_AI-Strategist_Austin-Texas-Metropolitan-Area_123.json"
  );
  assert.equal(descriptor.payload.jobId, "123");
  assert.deepEqual(descriptor.payload.hiringTeam, [{
    name: "Michael Deayala",
    linkedinUrl: "https://www.linkedin.com/in/michaeldeayala/",
    memberTitle: "Senior Recruiter",
    linkedinMessage: "Hi Michael, I recently applied for the AI Strategist role at Distyl AI and would love to connect. I'm very interested in the opportunity and in the work your team is doing. Thanks!"
  }]);
});

test("buildLocationFilterFilenameSegment turns comma-space separated filter text into a single-dash path segment", () => {
  assert.equal(
    buildLocationFilterFilenameSegment("Austin, Texas Metropolitan Area"),
    "Austin-Texas-Metropolitan-Area"
  );
});

test("buildAggregateJsonFilename includes the normalized full location segment", () => {
  assert.equal(
    buildAggregateJsonFilename({
      runDate: "2026-05-04",
      locationFilterSegment: "Austin-Texas-Metropolitan-Area"
    }),
    "Austin-Texas-Metropolitan-Area_scraped-jobs-2026-05-04.json"
  );
});

test("buildPerJobJsonFileDescriptors creates one json file per saved job only", () => {
  const buffer = createJsonExportBuffer();
  appendExportJob(buffer, buildExportJobRecord({
    title: "AI Strategist",
    company: "Distyl AI",
    linkedinUrl: "https://www.linkedin.com/jobs/view/123/",
    applyUrl: "https://distyl.example/jobs/123",
    jobId: "123",
    description: "Role details...",
    aboutCompany: "Company details...",
    hiringTeam: [{
      name: "Michael Deayala",
      linkedinUrl: "https://www.linkedin.com/in/michaeldeayala/",
      memberTitle: "Senior Recruiter",
      linkedinMessage: "Hi Michael, I recently applied for the AI Strategist role at Distyl AI and would love to connect. I'm very interested in the opportunity and in the work your team is doing. Thanks!"
    }]
  }, {
    missingFields: [],
    exhaustedRetries: false
  }));
  appendExportJob(buffer, buildExportJobRecord({
    title: "ML Engineer / Platform",
    company: "Acme: Labs",
    linkedinUrl: "https://www.linkedin.com/jobs/view/456/",
    applyUrl: "https://acme.example/jobs/456",
    jobId: "456",
    description: "Build systems",
    aboutCompany: "",
    hiringTeam: []
  }, {
    missingFields: ["aboutCompany"],
    exhaustedRetries: true
  }));
  appendExportFailure(buffer, {
    label: "Broken Co - Missing Job",
    error: "No currentJobId"
  });

  const files = buildPerJobJsonFileDescriptors({
    runDate: "2026-05-04",
    locationFilterSegment: "Austin-Texas-Metropolitan-Area",
    buffer
  });

  assert.deepEqual(files.map((file) => file.filename), [
    "scraped-jobs/2026-05-04/Distyl-AI_AI-Strategist_Austin-Texas-Metropolitan-Area_123.json",
    "scraped-jobs/2026-05-04/Acme-Labs_ML-Engineer-Platform_Austin-Texas-Metropolitan-Area_456.json"
  ]);
  assert.equal(files[1].payload.exhaustedRetries, true);
  assert.deepEqual(files[1].payload.missingFields, ["aboutCompany"]);
});
