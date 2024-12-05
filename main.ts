import { VERSION } from "./version.ts";

const APPNAME = "reptool";

const [cmd, target] = Deno.args;

const handleUsage = (): void => {
  console.log(
    `${APPNAME} version: ${VERSION}\n\nUsage: reptool <command> <target>\n\n`
  );
  console.log(
    `Example:\n\n${APPNAME} merge C:\\Users\\slynch\\Desktop\\Reports\n\n`
  );
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
): Promise<boolean> => {
  if (!target) throw new Error(`missing target ${type}`);

  const { isFile, isDirectory } = await Deno.stat(target);

  if (type === "DIR" && !isDirectory) {
    throw new Error(`Target ${target} is not a directory`);
  } else if (type === "FILE" && !isFile) {
    throw new Error(`Target ${target} is not a file`);
  }

  return true;
};

const cmdMerge = async (target: string): Promise<void> => {
  await targetIs("DIR", target);
  console.log(`Handling merge in ${target}`);
};

const main = async (): Promise<void> => {
  try {
    validateArgs(Deno.args);

    switch (cmd) {
      case "merge":
        await cmdMerge(target);
        break;
      default:
        throw new Error(`No such ${APPNAME} command: ${cmd}`);
    }
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
