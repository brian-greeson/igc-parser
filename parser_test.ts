import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertExists,
} from "@std/assert";
import {
  igcParser,
  parseFix,
  parseLatitude,
  parseLongitude,
} from "./parser.ts";

// Read test file

// Test parseLatitude
Deno.test("parseLatitude should correctly parse coordinates", () => {
  // Test cases from B record format: DDMMMMM
  assertAlmostEquals(parseLatitude("46", "51", "388", "N"), 46.85647);
  assertAlmostEquals(parseLatitude("46", "51", "394", "N"), 46.85657);
  assertAlmostEquals(parseLatitude("00", "00", "000", "S"), 0);
  assertAlmostEquals(parseLatitude("23", "45", "678", "S"), -23.76130);
});

// Test parseLongitude
Deno.test("parseLongitude should correctly parse coordinates", () => {
  // Test cases from B record format: DDDMM.mmm

  assertAlmostEquals(
    parseLongitude("008", "20", "593", "E"),
    8.343216666,
  );
  assertAlmostEquals(
    parseLongitude("008", "20", "651", "E"),
    8.344183333,
  );
  assertAlmostEquals(parseLongitude("000", "00", "000", "W"), 0);
  assertAlmostEquals(
    parseLongitude("123", "45", "678", "W"),
    -123.76130,
  );
});

// Test full IGC parse
Deno.test("igcParse should parse the full IGC file correctly", async () => {
  const result = await igcParser({ filepath: "./short.igc" });

  // Test metadata
  assertEquals(result.metadata.pilot, "Teddy Tester");
  assertEquals(result.metadata.gliderModel, "Ozone Zeolite 2 GT");
  assertEquals(
    result.metadata.date?.getUTCFullYear(),
    2024,
    "Year should be 2024",
  );
  assertEquals(result.metadata.firmwareVersion, "3.0.6+2224");

  // Test track points exist and have correct format
  assertExists(result.trackPoints);
  assert(result.trackPoints.length > 0);

  // Test first track point
  const firstPoint = result.trackPoints[0];
  assertEquals(firstPoint.timestamp.toISOString().slice(11, 19), "08:44:50");
  assertEquals(firstPoint.lat, 46.85646666666667);
  assertEquals(firstPoint.long, 8.343216666666667);
  assertEquals(firstPoint.pressureAltitude, 1345);
  assertEquals(firstPoint.gpsAltitude, 1414);

  // Test phase changes are captured
  const takeoffPoint = result.trackPoints.find((p) =>
    p.phase?.includes("takingOff")
  );
  assertExists(takeoffPoint);

  const soaringPoint = result.trackPoints.find((p) =>
    p.phase?.includes("soaring")
  );
  assertExists(soaringPoint);
});

// Test fix parsing
Deno.test("parseFix should correctly parse B records", () => {
  const sampleBRecord = "B0844504651388N00820593EA0134501414";
  const date = new Date("2018-06-24");

  const fix = parseFix({
    line: sampleBRecord,
    date: date,
    activity: "fly",
    phase: "onGround",
  });

  assertExists(fix);
  assertEquals(fix?.timestamp.toISOString(), "2018-06-24T08:44:50.000Z");
  assertEquals(fix?.lat, 46.85646666666667);
  assertEquals(fix?.long, 8.343216666666667);
  assertEquals(fix?.pressureAltitude, 1345);
  assertEquals(fix?.gpsAltitude, 1414);
  assertEquals(fix?.activity, "fly");
  assertEquals(fix?.phase, "onGround");
});

// Test invalid B record handling
Deno.test("parseFix should return null for invalid fixes", () => {
  const invalidBRecord = "B0844504651388N00820593EV0134501414"; // Note the V instead of A
  const date = new Date("2018-06-24");

  const fix = parseFix({
    line: invalidBRecord,
    date: date,
  });

  assertEquals(fix, null);
});
