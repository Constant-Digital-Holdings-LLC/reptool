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

// Function to split a CSV line into fields, handling quoted fields
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

// Function to sort input reports by the check-in date in descending order
const sortReportsByDate = (
  inputReports: Array<{ data: string; pathname: string }>,
  checkInDateHeader: string
): void => {
  inputReports.sort((a, b) => {
    const [headerA, ...dataA] = a.data.split("\n");
    const [headerB, ...dataB] = b.data.split("\n");

    const headerAFields = headerA.split(",");
    const headerBFields = headerB.split(",");

    const dataAFirstRecordFields = dataA[0].split(",");
    const dataBFirstRecordFields = dataB[0].split(",");

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
  inputReports: Array<{ data: string; pathname: string }>,
  derivedReferenceHeaderFields: string[],
  mergedReport: string[]
): void => {
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
      `\n${pathname} translation map: ${JSON.stringify(
        Array.from(inputFieldTranslationMap)
      )}`
    );

    inputDataRecords.forEach((inputDataRecord) => {
      if (inputDataRecord) {
        let newRecord = "";

        const inputDataRecordFields = splitCSVLine(inputDataRecord);

        derivedReferenceHeaderFields.forEach((derivedReferenceHeaderField) => {
          const loc = inputFieldTranslationMap.get(derivedReferenceHeaderField);
          if (typeof loc != "undefined") {
            newRecord += `${inputDataRecordFields[loc]}`;
          }

          newRecord += ",";
        });

        console.log(`Adding new record to merged report: ${newRecord}`);
        mergedReport.push(newRecord);
      }
    });
  });
};

// Function to handle the "merge" command
const cmdMerge = async (target: string): Promise<void> => {
  console.log(`Starting merge process for target directory: ${target}`);

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

  console.log(`Found ${inputFileList.length} CSV files to process.`);

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
      console.error(`Ignoring file without valid header: ${pathname}`)
  );

  console.log(`Stored ${inputReports.length} reports with valid headers.`);

  // Sort reports by check-in date
  sortReportsByDate(inputReports, checkInDateHeader);

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
    `Derived Reference Header Fields: ${JSON.stringify(
      derivedReferenceHeaderFields
    )}`
  );

  // Populate Merged Report (output)
  mergedReport[0] = derivedReferenceHeader; // Set header
  populateMergedReport(
    inputReports,
    derivedReferenceHeaderFields,
    mergedReport
  );

  //Lets write the new report out here...

  // console.log(
  //   `Merge process completed. Merged report:\n\n${mergedReport.join("\n")}`
  // );
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
