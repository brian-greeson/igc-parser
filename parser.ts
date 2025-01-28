/** Type definition of IGC meta data returned from parser */
export type IGCHeader = {
  date?: Date;
  fixAccuracy?: number;
  pilot?: string;
  copilot?: string;
  gliderModel?: string;
  gliderID?: string;
  gpsDatum?: number;
  firmwareVersion?: string;
  hardwareVersion?: string;
  flightRecorderType?: string;
  gpsType?: string;
  pressureSensorType?: string;
  competitionID?: string;
  competitionClass?: string;
  security?: string;
};
/** Type definition of tracklog data returned from parser */
export type IGCFix = {
  timestamp: Date;
  lat: number;
  long: number;
  alt?: number;
  fixAccuracy?: number;
  pressureAltitude?: number;
  gpsAltitude?: number;
  activity?: string;
  phase?: string;
};
/** Type definition of parser return object */
export type IGCData = {
  metadata: IGCHeader;
  trackPoints: IGCFix[];
};

export const parseMetadata = (igcLines: string[]) => {
  const defaultTextRegex = /(?:.{0,}?:(.*)|(.*))$/;
  const metadata: IGCHeader = {};
  for (const line of igcLines) {
    if (line[0] === "H" || line[0] === "A") {
      const key = line.slice(0, 5);
      if (key === "HFDTE") {
        const recordData = line.match(/(\d\d)(\d\d)(\d{2,3})/);
        if (recordData) {
          const century = recordData[3].length === 2 ? "20" : "19";
          metadata.date = new Date(
            Date.UTC(
              parseInt(`${century}${recordData[3]}`),
              parseInt(`${recordData[2]}`) - 1,
              parseInt(`${recordData[1]}`),
            ),
          );
        }
      } else if (key === "HFFXA") {
        const recordData = line.match(/\d*/);
        if (recordData) {
          metadata.fixAccuracy = parseInt(recordData[1]);
        }
      } else {
        const matches = line.match(defaultTextRegex);
        if (!matches) continue; // Skip if no matches
        const recordData = matches[1];
        if (recordData) {
          switch (key) {
            case "HFPLT":
              metadata.pilot = recordData;
              break;
            case "HFCM2":
              metadata.copilot = recordData;
              break;
            case "HFGTY":
              metadata.gliderModel = recordData;
              break;
            case "HFGID":
              metadata.gliderID = recordData;
              break;
            case "HFDTM":
              metadata.gpsDatum = parseInt(recordData);
              break;
            case "HFRFW":
              metadata.firmwareVersion = recordData;
              break;
            case "HFRHW":
              metadata.hardwareVersion = recordData;
              break;
            case "HFFTY":
              metadata.flightRecorderType = recordData;
              break;
            case "HFGPS":
              metadata.gpsType = recordData;
              break;
            case "HFPRS":
              metadata.pressureSensorType = recordData;
              break;
            case "HFCID":
              metadata.competitionID = recordData;
              break;
            case "HFCCL":
              metadata.competitionClass = recordData;
              break;
          }
        }
      }
    }
  }
  return metadata;
};

export const parseLatitude = (
  dd: string,
  mm: string,
  mmm: string,
  ns: string,
) => {
  const degrees = parseInt(dd, 10) + (parseFloat(`${mm}.${mmm}0000`) / 60);
  return (ns === "S") ? -degrees : degrees;
};
export const parseLongitude = (
  ddd: string,
  mm: string,
  mmm: string,
  ew: string,
) => {
  const degrees = parseInt(ddd, 10) + parseFloat(mm + "." + mmm) / 60;
  return (ew === "W") ? -degrees : degrees;
};

export const parseFix = (
  { line, activity, phase, date, prevTimestamp }: {
    line: string;
    activity?: string;
    phase?: string;
    date: Date;
    prevTimestamp?: Date;
  },
): IGCFix | null => {
  const bRegex =
    /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})([NS])(\d{3})(\d{2})(\d{3})([EW])([AV])(-\d{4}|\d{5})(-\d{4}|\d{5})/;
  const matches = line.match(bRegex);
  if (!matches) throw new Error("Invalid B record");
  const [hours, minutes, seconds] = [
    parseInt(matches[1]),
    parseInt(matches[2]),
    parseInt(matches[3]),
  ];
  const valid = matches[12] === "A";
  if (!valid) return null;

  const timestamp = new Date(`${date.toISOString().slice(0, 10)}`);

  timestamp.setUTCHours(
    hours,
    minutes,
    seconds,
  );

  const isNextDay = prevTimestamp
    ? checkForDayRollover(prevTimestamp, timestamp)
    : false;

  if (isNextDay) {
    timestamp.setDate(timestamp.getDate() + 1);
  }

  return {
    timestamp,
    lat: parseLatitude(matches[4], matches[5], matches[6], matches[7]),
    long: parseLongitude(
      matches[8],
      matches[9],
      matches[10],
      matches[11],
    ),
    activity,
    phase,
    pressureAltitude: matches[13] === "00000"
      ? undefined
      : parseInt(matches[13], 10),
    gpsAltitude: matches[14] === "00000"
      ? undefined
      : parseInt(matches[14], 10),
  };
};
const checkForDayRollover = (prevTime: Date, currTime: Date) => {
  return (currTime.getTime() < (prevTime.getTime() - (1000 * 60 * 60)));
};
/** This Function takes either a path to an igc file or the contents of the file and parses metadata (IGC header records) and tracklog fixes (IGC B records) */
export const igcParser = async (
  { filepath, igcString }: { filepath?: string; igcString?: string },
): Promise<IGCData> => {
  if (!filepath && !igcString) {
    throw new Error("Either filepath or igcString must be provided");
  }
  const lines = filepath
    ? (await Deno.readTextFile(filepath)).split(/\r?\n/)
    : igcString?.split(/\r?\n/);
  if (!lines) throw new Error("Error reading source");
  const metadata = parseMetadata(lines.slice(0, 30)); // Assume the header is within the first 30 lines as per the IGC standard

  // Get the fixes for each phase of the flight
  const trackPoints: IGCFix[] = [];
  let lastActivity: string | undefined;
  let lastPhase: string | undefined;
  for (const line of lines) {
    if (line[0] === "H") continue; // Ignore header lines
    if (line[0] === "G") {
      metadata.security = line;
      break; // End of fixes
    }
    if (line[0] === "L") {
      if (line.includes("ACTIVITY")) lastActivity = line;
      else if (line.includes("PHASE")) lastPhase = line;
    }
    if (line[0] === "B") {
      const fix = parseFix({
        line,
        activity: lastActivity,
        phase: lastPhase,
        date: metadata.date ?? new Date(),
        prevTimestamp: trackPoints[trackPoints.length - 1]?.timestamp,
      });
      if (fix) trackPoints.push(fix);
    }
  }

  return { metadata, trackPoints };
};
