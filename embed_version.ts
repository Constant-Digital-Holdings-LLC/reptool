const getVersion = async (): Promise<string> => {
  const command = new Deno.Command("git", {
    args: ["rev-parse", "HEAD"],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, stderr } = await command.output();
  const output = stdout;
  const version = new TextDecoder().decode(output).trim();

  const { success } = await command.output();
  if (!success) {
    const errorString = new TextDecoder().decode(stderr);
    throw new Error(`Failed to get version from git: ${errorString}`);
  }

  return version;
};

const version = await getVersion();
await Deno.writeTextFile(
  "version.ts",
  `export const VERSION = "${version}";\n`
);
