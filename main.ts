import { VERSION } from "./version.ts";

const APPNAME = "reptool";

const CMDLIST = ["merge"] as const; // more commands to come...
type CMD = (typeof CMDLIST)[number];
const isCMD = (value: string): value is CMD => {
  return CMDLIST.includes(value as CMD);
};

const [cmd, target] = Deno.args;

const handleUsage = (): void => {
  console.log(
    `${APPNAME} version: ${VERSION}\n\nUsage: reptool <command> <target>\n\n`
  );
  console.log(
    `Example: ${APPNAME} merge C:\\Users\\slynch\\Desktop\\Reports\n\n`
  );
  console.log(`Available commands: ${CMDLIST}\n\n`);
};

const validateArgs = (args: string[]): void => {
  if (args.length === 0) {
    handleUsage();
    throw new Error("Expected at least one argument");
  }
};

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

const cmdMerge = async (target: string): Promise<void> => {
  await targetIs("DIR", target);
  console.log(`Handling merge in ${target}`);
};

const executeCommand = async (cmd: CMD, target: string): Promise<void> => {
  switch (cmd) {
    case "merge":
      await cmdMerge(target);
      break;
    default:
      throw new Error(`No such ${APPNAME} command: ${cmd}`);
  }
};

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

await main();
