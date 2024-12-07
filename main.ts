import { VERSION } from "./version.ts";
import {
  fromFileUrl,
  toFileUrl,
} from "https://deno.land/std@0.224.0/path/mod.ts";

const APPNAME = "reptool";
const OUTFILE = "MERGED.csv";
const HELPEMAIL = "support@ham.live";

// Define the list of commands
const CMDLIST = ["merge"] as const; // more commands to come...
type CMD = (typeof CMDLIST)[number];

// Type guard to check if a value is a valid command
const isCMD = (value: string): value is CMD => {
  return CMDLIST.includes(value as CMD);
};

// Get command-line arguments
const [cmd, target] = Deno.args;
// We can't append to this unless it has a trailing slash
const targetUrl = toFileUrl(target.endsWith("/") ? target : `${target}/`);

// Function to display usage information
const handleUsage = (): void => {
  console.log(`
${APPNAME} version: ${VERSION}

Usage: reptool <command> <target>

Available commands: ${CMDLIST.join(", ")}

Example:
  ${APPNAME} merge C:\\Users\\slynch\\Desktop\\Reports

Need help?: ${HELPEMAIL}
`);
};

// Function to validate command-line arguments
const validateArgs = (args: string[]): void => {
  if (args.length === 0) {
    handleUsage();
    throw new Error("Expected at least one argument");
  }
};

// Function to check if the target is a directory or file
const targetIs = async (
  type: "DIR" | "FILE",
  target: string
): Promise<void> => {
  if (!target) throw new Error(`Missing target ${type}`);

  const { isFile, isDirectory } = await Deno.stat(target);

  if (type === "DIR" && !isDirectory) {
    throw new Error(`Target ${target} is not a directory`);
  } else if (type === "FILE" && !isFile) {
    throw new Error(`Target ${target} is not a file`);
  }
};

const splitCSVLine = (line: string): string[] => {
  const result = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      // Handle escaped quotes
      field += '"';
      i++; // Skip the next quote
    } else if (char === '"') {
      // Toggle the inQuotes flag
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      // If not in quotes, this is a field separator
      result.push(field);
      field = "";
    } else {
      // Regular character
      field += char;
    }
  }

  // Add the last field
  result.push(field);

  return result;
};

// Function to handle the "merge" command
const cmdMerge = async (target: string): Promise<void> => {
  // Will throw if target is not a directory
  await targetIs("DIR", target);

  const mergedReport: string[] = []; // Output
  const inputReports: Array<{ data: string; pathname: string }> = [];
  const checkInDateHeader = "Check-In Date";

  // Populate input file list
  const inputFileList: URL[] = [...Deno.readDirSync(target)]
    .filter(
      ({ isFile, name }) =>
        isFile && name.includes(".csv") && !name.includes(OUTFILE)
    )
    .map(({ name }) => new URL(name, targetUrl));

  console.log(`Input files: ${JSON.stringify(inputFileList)}`);

  // Store each input report (CSV) in memory
  (
    await Promise.all(
      inputFileList.map(async (url) => {
        return { data: await Deno.readTextFile(url), pathname: url.pathname };
      })
    )
  ).forEach(
    ({ data, pathname }) =>
      (data.split("\n")[0].split(",").includes(checkInDateHeader) && //only store reports with a valid header
        inputReports.push({ data, pathname })) ||
      console.error(`Ignoring: ${pathname}`)
  );

  inputReports.sort((a, b) => {
    // Split the data into header and rows
    const [headerA, ...dataA] = a.data.split("\n");
    const [headerB, ...dataB] = b.data.split("\n");

    // Split the headers into fields
    const headerAFields = headerA.split(",");
    const headerBFields = headerB.split(",");

    // Split the first record of data into fields
    const dataAFirstRecordFields = dataA[0].split(",");
    const dataBFirstRecordFields = dataB[0].split(",");

    // Find the index of the check-in date header
    const locationA = headerAFields.indexOf(checkInDateHeader);
    const locationB = headerBFields.indexOf(checkInDateHeader);

    // If the check-in date header is not found, log an error and return 0
    if (locationA === -1 || locationB === -1) {
      console.error(`Check-In Date header not found in one of the files.`);
      return 0;
    }

    // Extract the check-in dates from the first record
    let dateA = dataAFirstRecordFields[locationA];
    let dateB = dataBFirstRecordFields[locationB];

    // Remove double quotes
    dateA = dateA.replace(/"/g, "");
    dateB = dateB.replace(/"/g, "");

    // Parse the dates into timestamps
    const timeA = new Date(dateA).getTime();
    const timeB = new Date(dateB).getTime();

    // If either date is invalid, log an error and return 0
    if (isNaN(timeA) || isNaN(timeB)) {
      console.error(
        `Invalid date format in one of the files: ${dateA}, ${dateB}`
      );
      return 0;
    }

    // Sort in descending order (most recent first)
    return timeB - timeA;
  });

  console.log(
    `Reports ordered by most recent check-in: ${JSON.stringify(
      inputReports.map((ir) => ir.pathname)
    )}`
  );

  const derivedReferenceHeader: string = inputReports[0].data.split("\n")[0];
  const derivedReferenceHeaderFields: string[] =
    derivedReferenceHeader.split(",");

  if (
    !(
      Array.isArray(derivedReferenceHeaderFields) &&
      derivedReferenceHeaderFields.length
    )
  )
    throw new Error("Could not determine reference header fields");

  console.log(
    `\n\nDerived Reference Header Fields: ${JSON.stringify(
      derivedReferenceHeaderFields
    )}`
  );

  //Popualte Merged Report (output)
  mergedReport[0] = derivedReferenceHeader; // Set header

  inputReports.forEach((inputReport) => {
    const { data, pathname } = inputReport;
    const inputReportRecords = data.split("\n");
    const [inputHeaderRecord, ...inputDataRecords] = inputReportRecords;

    const inputHeaderRecordFields = inputHeaderRecord.split(",");

    const inputFieldTranslationMap = new Map<string, number>();

    derivedReferenceHeaderFields.forEach((referenceHeaderField) => {
      const loc = inputHeaderRecordFields.indexOf(referenceHeaderField);

      if (loc !== -1) {
        inputFieldTranslationMap.set(referenceHeaderField, loc);
      }
    });

    console.log(
      `${pathname} translation map: ${JSON.stringify(
        Array.from(inputFieldTranslationMap)
      )}`
    );

    inputDataRecords.forEach((inputDataRecord) => {
      if (inputDataRecord) {
        let newRecord = "";

        const inputDataRecordFields = splitCSVLine(inputDataRecord);

        console.log("\nNew Record:");

        derivedReferenceHeaderFields.forEach((derivedReferenceHeaderField) => {
          const loc = inputFieldTranslationMap.get(derivedReferenceHeaderField);
          if (typeof loc != "undefined") {
            console.log(
              `Add to record (${derivedReferenceHeaderField}): ${inputDataRecordFields[loc]}`
            );
            newRecord += `${inputDataRecordFields[loc]}`;
          }

          newRecord += ",";
        });

        mergedReport.push(newRecord);
      }
    });

    console.log(`\n\n${mergedReport.join("\n")}`);

    // inputDataRecords.forEach((inputDataRecord) => {
    //   let newRecord = "";

    //   const inputDataRecordFields = inputDataRecord.split(",");

    //   derivedReferenceHeaderFields.forEach((derivedReferenceHeaderField) => {
    //     let newField = "";

    //     const loc = inputFieldTranslationMap.get(derivedReferenceHeaderField);
    //     if (loc) {
    //       newField += `"${inputDataRecordFields[loc]}"`;
    //     }

    //     newField += ",";
    //     newRecord += newField;
    //   });

    //   mergedReport.push(newRecord);
    // });
  });

  // if (mergedHeaders.size === 0)
  //   throw new Error("malformed input files, no headers found");

  // console.log(
  //   `Using combined headers: ${JSON.stringify(Array.from(mergedHeaders))}`
  // );

  //Agg: ["Net","Callsign","Role","Highlighted","Check-In Date","Name","Location","SigReport","URL","Net ID","Net Start Date"]
  //Individual: ["Net","Callsign","Role","Check-In Date","Name","Location","SigReport","URL","Net ID","Net Start Date"]

  // Pseudo Code:
  //Loop over inputReports
  //  For each report
  //    create a boolean Array called skipField
  //    create a Set for this specific report's headers called reportSpecificHeaders
  //
  //    Loop over mergedHeaders and keep the index (used below)
  //      If (reportSpecificHeaders.has(agg header)) {
  //        skipField[mergedHeaders index] = false
  //      } else {
  //        skipField[mergedHeaders index] = true
  //      }
  //
  //    Loop over rest of report....
  //       write each field to merged report, if field location is in skipField write ',,'
  //
  //    Determine which fields are NetId and Check-In date and sort new report
  //    Push agg headers onto new report
};

// Function to execute the given command
const executeCommand = async (cmd: CMD, target: string): Promise<void> => {
  switch (cmd) {
    case "merge":
      await cmdMerge(target);
      break;
    default:
      throw new Error(`No such ${APPNAME} command: ${cmd}`);
  }
};

// Main function to run the program
const main = async (): Promise<void> => {
  try {
    validateArgs(Deno.args);

    if (!isCMD(cmd)) {
      throw new Error(`No such ${APPNAME} command: ${cmd}`);
    }

    await executeCommand(cmd, target);
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Error: ${cmd ? cmd : ""} ${err.message}`);
    } else {
      console.error("Unknown error occurred");
    }
    Deno.exit(1);
  }
};

// Run the main function
await main();
