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

// Function to handle the "merge" command
const cmdMerge = async (target: string): Promise<void> => {
  // Will throw if target is not a directory
  await targetIs("DIR", target);
  console.log(`Handling merge in ${target}`);

  const requiredHeaders = ["Check-In Date", "Net ID"] as const; //We should throw an error if individual reports are misssing these
  const mergedHeaders = new Set<string>();
  const mergedReport: string[] = [];
  const inputReports: string[] = [];

  // Populate input file list
  const inputFileList: URL[] = [...Deno.readDirSync(target)]
    .filter(
      ({ isFile, name }) =>
        isFile && name.includes(".csv") && !name.includes(OUTFILE)
    )
    .map(({ name }) => new URL(name, targetUrl));

  console.log(`Input files: ${JSON.stringify(inputFileList)}`);

  // Determine Aggregate *New Headers and store each CSV in memory
  (
    await Promise.all(inputFileList.map((url) => Deno.readTextFile(url)))
  ).forEach((inputReport) => {
    //Save report for later
    inputReports.push(inputReport);

    //Populate agg header set
    inputReport
      .split("\n")[0]
      .split(",")
      .forEach((header) => header.length && mergedHeaders.add(header));
  });

  if (mergedHeaders.size === 0)
    throw new Error("malformed input files, no headers found");

  console.log(
    `Using combined headers: ${JSON.stringify(Array.from(mergedHeaders))}`
  );

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
