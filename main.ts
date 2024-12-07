import { VERSION } from "./version.ts";
import { toFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

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

// Define the structure of a report
interface Report {
  data: string;
  pathname: string;
}

// Function to display usage information
const handleUsage = (): void => {
  console.log(`
${APPNAME} version: ${VERSION}

Usage: reptool <command> <target>

Available commands: ${CMDLIST.join(", ")}

Example:
  ${APPNAME} merge C:\\Users\\jdoe\\Desktop\\Reports

Need help?: ${HELPEMAIL}

Description:
  reptool is a tool intended to manage Ham.Live reports.

License:
  This software is distributed under the MIT license with no warranty.
  Ham.Live has no liability for any damages, misuse, or bugs.

`);
};

// Function to validate command-line arguments
const processArgs = (): { cmd: CMD; target?: string } => {
  const [cmd, target] = Deno.args;

  if (!cmd) {
    handleUsage();
    throw new Error("Missing command argument");
  }

  if (!isCMD(cmd)) {
    handleUsage();
    throw new Error(`No such ${APPNAME} command: ${cmd}`);
  }

  console.debug(`Command: ${cmd}, Target: ${target}`);
  return { cmd, target };
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

// Improved function to split a CSV line into fields, handling quoted fields with commas
const splitCSVLine = (line: string): string[] => {
  const result: string[] = [];
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

// Function to sort input reports by the check-in date in descending order
const sortReportsByDate = (
  inputReports: Report[],
  checkInDateHeader: string
): void => {
  inputReports.sort((a, b) => {
    const [headerA, ...dataA] = a.data.split("\n");
    const [headerB, ...dataB] = b.data.split("\n");

    const headerAFields = headerA.split(",");
    const headerBFields = headerB.split(",");

    const dataAFirstRecordFields = splitCSVLine(dataA[0]);
    const dataBFirstRecordFields = splitCSVLine(dataB[0]);

    const locationA = headerAFields.indexOf(checkInDateHeader);
    const locationB = headerBFields.indexOf(checkInDateHeader);

    if (locationA === -1 || locationB === -1) {
      console.error(`Check-In Date header not found in one of the files.`);
      return 0;
    }

    let dateA = dataAFirstRecordFields[locationA];
    let dateB = dataBFirstRecordFields[locationB];

    // Remove double quotes
    dateA = dateA.replace(/"/g, "");
    dateB = dateB.replace(/"/g, "");

    const timeA = new Date(dateA).getTime();
    const timeB = new Date(dateB).getTime();

    if (isNaN(timeA) || isNaN(timeB)) {
      console.error(
        `Invalid date format in one of the files: ${dateA}, ${dateB}`
      );
      return 0;
    }

    return timeB - timeA;
  });
};

// Function to populate the merged report
const populateMergedReport = (
  inputReports: Report[],
  derivedReferenceHeaderFields: string[],
  mergedReport: string[]
): void => {
  inputReports.forEach((inputReport, reportIndex) => {
    const { data } = inputReport;
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

    let recordCount = 0;

    inputDataRecords.forEach((inputDataRecord) => {
      if (inputDataRecord) {
        let newRecord = "";

        const inputDataRecordFields = splitCSVLine(inputDataRecord);

        derivedReferenceHeaderFields.forEach((derivedReferenceHeaderField) => {
          const loc = inputFieldTranslationMap.get(derivedReferenceHeaderField);
          if (typeof loc != "undefined") {
            let field = inputDataRecordFields[loc];
            if (field.includes(",")) {
              field = `"${field}"`; // Quote fields containing commas
            }
            newRecord += `${field}`;
          }

          newRecord += ",";
        });

        mergedReport.push(newRecord);
        recordCount++;
      }
    });

    console.log(
      `Processed ${recordCount} records from report ${reportIndex + 1}`
    );
  });

  console.debug(`Merged report populated with data.`);
};

// Function to handle the "merge" command
const cmdMerge = async (target?: string): Promise<void> => {
  if (!target) {
    handleUsage();
    throw new Error("Missing target path argument for merge command");
  }

  // Will throw if target is not a directory
  await targetIs("DIR", target);

  const mergedReport: string[] = []; // Output
  const inputReports: Report[] = [];
  const checkInDateHeader = "Check-In Date";

  // Populate input file list
  const targetUrl = toFileUrl(target.endsWith("/") ? target : `${target}/`);
  const inputFileList: URL[] = [...Deno.readDirSync(target)]
    .filter(
      ({ isFile, name }) =>
        isFile && name.includes(".csv") && !name.includes(OUTFILE)
    )
    .map(({ name }) => new URL(name, targetUrl));

  // Check if OUTFILE exists and log it
  const outFilePath = new URL(OUTFILE, targetUrl);
  try {
    await Deno.stat(outFilePath);
    console.log(`Omitting existing output file from input: ${outFilePath}`);
  } catch {
    // File does not exist, no action needed
  }

  if (inputFileList.length === 0) {
    console.error("No CSV files found in the target directory.");
    handleUsage();
    Deno.exit(1);
  }

  console.log(`Found ${inputFileList.length} CSV files to process.`);

  // Store each input report (CSV) in memory
  (
    await Promise.all(
      inputFileList.map(async (url): Promise<Report> => {
        return { data: await Deno.readTextFile(url), pathname: url.pathname };
      })
    )
  ).forEach(
    ({ data, pathname }) =>
      (data.split("\n")[0].split(",").includes(checkInDateHeader) && //only store reports with a valid header
        inputReports.push({ data, pathname })) ||
      console.warn(`Ignoring file without valid header: ${pathname}`)
  );

  console.log(`Stored ${inputReports.length} reports with valid headers.`);

  // Sort reports by check-in date
  sortReportsByDate(inputReports, checkInDateHeader);

  console.log(`Reports sorted by most recent check-in date.`);

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

  console.log(`Reference header fields determined.`);

  // Populate Merged Report (output)
  mergedReport[0] = derivedReferenceHeader; // Set header
  populateMergedReport(
    inputReports,
    derivedReferenceHeaderFields,
    mergedReport
  );

  // Write to output
  await Deno.writeTextFile(outFilePath, mergedReport.join("\n"));

  console.log(
    `Merge process completed. Merged report saved to: ${outFilePath}`
  );
};

// Function to execute the given command
const executeCommand = async (cmd: CMD, target?: string): Promise<void> => {
  console.debug(`Executing command: ${cmd}`);
  switch (cmd) {
    case "merge":
      await cmdMerge(target);
      break;
    default:
      handleUsage();
      throw new Error(`No such ${APPNAME} command: ${cmd}`);
  }
};

// Main function to run the program
const main = async (): Promise<void> => {
  console.log(`${APPNAME} (v ${VERSION})`);
  const startTime = performance.now();
  try {
    const { cmd, target } = processArgs();
    await executeCommand(cmd, target);
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error("Unknown error occurred");
    }
    Deno.exit(1);
  } finally {
    const endTime = performance.now();
    const executionTime = (endTime - startTime) / 1000;
    console.log(`Execution time: ${executionTime.toFixed(2)} seconds`);
  }
};

// Run the main function
await main();
