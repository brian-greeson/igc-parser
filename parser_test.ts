import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertExists,
  assertThrows,
} from "@std/assert";
import {
  convertToGeoJSON,
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

Deno.test("convertToGeoJSON should throw error for empty trackPoints", () => {
  assertThrows(
    () => {
      convertToGeoJSON([]);
    },
    Error,
    "No trackPoints provided",
  );
});

Deno.test("convertToGeoJSON should convert trackPoints to GeoJSON with default altitude offset", () => {
  const sampleTrackPoints = [
    {
      timestamp: new Date("2024-01-01T12:00:00.000Z"),
      lat: 46.85646666666667,
      long: 8.343216666666667,
      pressureAltitude: 1345,
      gpsAltitude: 1414,
      phase: "takingOff",
      activity: "fly",
    },
    {
      timestamp: new Date("2024-01-01T12:05:00.000Z"),
      lat: 46.85700000000000,
      long: 8.344000000000000,
      pressureAltitude: undefined,
      gpsAltitude: 1420,
      phase: "soaring",
      activity: "cruise",
    },
  ];

  const geoJSON = convertToGeoJSON(sampleTrackPoints);

  // Verify feature type and geometry type
  assertEquals(geoJSON.type, "Feature");
  assertEquals(geoJSON.geometry.type, "LineString");

  // Check coordinates count
  assertEquals(geoJSON.geometry.coordinates.length, sampleTrackPoints.length);

  // Check first coordinate uses pressureAltitude (1345) without offset
  const firstCoordinate = geoJSON.geometry.coordinates[0];
  assertEquals(firstCoordinate[0], sampleTrackPoints[0].long);
  assertEquals(firstCoordinate[1], sampleTrackPoints[0].lat);
  assertEquals(firstCoordinate[2], 1345); // pressureAltitude

  // Second coordinate uses gpsAltitude (1420) without offset
  const secondCoordinate = geoJSON.geometry.coordinates[1];
  assertEquals(secondCoordinate[0], sampleTrackPoints[1].long);
  assertEquals(secondCoordinate[1], sampleTrackPoints[1].lat);
  assertEquals(secondCoordinate[2], 1420); // gpsAltitude fallback

  // Check properties arrays
  assertEquals(geoJSON.properties.timestamps.length, sampleTrackPoints.length);
  assertEquals(geoJSON.properties.phases[0], "takingOff");
  assertEquals(geoJSON.properties.phases[1], "soaring");
  assertEquals(geoJSON.properties.activities[0], "fly");
  assertEquals(geoJSON.properties.activities[1], "cruise");

  // Validate timestamp ISO strings
  assertEquals(
    geoJSON.properties.timestamps[0],
    sampleTrackPoints[0].timestamp.toISOString(),
  );
  assertEquals(
    geoJSON.properties.timestamps[1],
    sampleTrackPoints[1].timestamp.toISOString(),
  );
});

Deno.test("convertToGeoJSON should apply altitude offset", () => {
  const altitudeOffset = 100;
  const sampleTrackPoints = [
    {
      timestamp: new Date("2024-01-01T12:00:00.000Z"),
      lat: 46.85646666666667,
      long: 8.343216666666667,
      pressureAltitude: 1345,
      gpsAltitude: 1414,
      phase: "takingOff",
      activity: "fly",
    },
    {
      timestamp: new Date("2024-01-01T12:05:00.000Z"),
      lat: 46.85700000000000,
      long: 8.344000000000000,
      pressureAltitude: undefined,
      gpsAltitude: 1420,
      phase: "soaring",
      activity: "cruise",
    },
  ];

  const geoJSON = convertToGeoJSON(sampleTrackPoints, altitudeOffset);

  // Check that altitude offset is applied on each coordinate altitude
  const firstCoordinate = geoJSON.geometry.coordinates[0];
  const secondCoordinate = geoJSON.geometry.coordinates[1];

  // For first point, altitude is pressureAltitude (1345) + offset
  assertEquals(firstCoordinate[2], 1345 + altitudeOffset);

  // For second point, altitude is gpsAltitude (1420) + offset
  assertEquals(secondCoordinate[2], 1420 + altitudeOffset);
});

Deno.test("convertToGeoJSON calculates verticalSpeeds correctly with no altitude offset", () => {
  const sampleTrackPoints = [
    {
      timestamp: new Date("2024-01-01T12:00:00.000Z"),
      lat: 46.0,
      long: 8.0,
      pressureAltitude: 1000,
      gpsAltitude: 1010,
      phase: "start",
      activity: "takeOff",
    },
    {
      timestamp: new Date("2024-01-01T12:01:00.000Z"),
      lat: 46.001,
      long: 8.001,
      pressureAltitude: 1020,
      gpsAltitude: 1030,
      phase: "cruise",
      activity: "fly",
    },
    {
      timestamp: new Date("2024-01-01T12:02:00.000Z"),
      lat: 46.002,
      long: 8.002,
      pressureAltitude: undefined,
      gpsAltitude: 1040,
      phase: "land",
      activity: "landing",
    },
  ];

  const geoJSON = convertToGeoJSON(sampleTrackPoints);
  // Calculation:
  // First point: altitude = preferredAltitude(1000) => 1000
  // Second point: altitude = preferredAltitude(1020) => 1020; verticalSpeed = 1020 - 1000 = 20
  // Third point: altitude = preferredAltitude(1040) (fallback to gpsAltitude) => 1040; verticalSpeed = 1040 - 1020 = 20

  assertEquals(
    geoJSON.properties.verticalSpeeds.length,
    sampleTrackPoints.length,
  );
  assertEquals(geoJSON.properties.verticalSpeeds[0], 0);
  assertEquals(geoJSON.properties.verticalSpeeds[1], 20);
  assertEquals(geoJSON.properties.verticalSpeeds[2], 20);
});

Deno.test("convertToGeoJSON calculates verticalSpeeds correctly with altitude offset", () => {
  const altitudeOffset = 50;
  const sampleTrackPoints = [
    {
      timestamp: new Date("2024-01-01T12:00:00.000Z"),
      lat: 46.0,
      long: 8.0,
      pressureAltitude: 1000,
      gpsAltitude: 1010,
      phase: "start",
      activity: "takeOff",
    },
    {
      timestamp: new Date("2024-01-01T12:01:00.000Z"),
      lat: 46.001,
      long: 8.001,
      pressureAltitude: 1020,
      gpsAltitude: 1030,
      phase: "cruise",
      activity: "fly",
    },
  ];

  const geoJSON = convertToGeoJSON(sampleTrackPoints, altitudeOffset);
  // Calculation:
  // First point altitude = 1000 + 50 = 1050
  // Second point altitude = 1020 + 50 = 1070; verticalSpeed = 1070 - 1050 = 20

  assertEquals(
    geoJSON.properties.verticalSpeeds.length,
    sampleTrackPoints.length,
  );
  assertEquals(geoJSON.properties.verticalSpeeds[0], 0);
  assertEquals(geoJSON.properties.verticalSpeeds[1], 20);
});
