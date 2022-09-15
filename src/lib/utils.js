const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");
const { exit } = require("process");
const path = require("path");
const uuid = require("uuid");
const nReadlines = require("n-readlines");
const { exec } = require("child_process");

exports.setArgs = setArgs;
exports.setConfig = setConfig;
exports.setFiles = setFiles;
exports.parseFiles = parseFiles;
exports.outputResults = outputResults;
exports.convertToGif = convertToGif;
exports.setEnvs = setEnvs;

const defaultAnalyticsServers = [
  {
    name: "GA",
    method: "post",
    url: "https://www.google-analytics.com/mp/collect",
    params: {
      api_secret: "J_RJCtf0Rk-G42nX6XQBLQ",
      measurement_id: "G-5VDP3TNPWC",
    },
  },
];

// Define args
function setArgs(args) {
  if (!args) return {};
  let argv = yargs(hideBin(args))
    .option("config", {
      alias: "c",
      description: "Path to a custom config file.",
      type: "string",
    })
    .option("input", {
      alias: "i",
      description: "Path to a file or directory to parse for tests.",
      type: "string",
    })
    .option("output", {
      alias: "o",
      description: "Path for a JSON file of test result output.",
      type: "string",
    })
    .option("recursive", {
      alias: "r",
      description:
        "Boolean. Recursively find test files in the test directory. Defaults to true.",
      type: "string",
    })
    .option("ext", {
      alias: "e",
      description:
        "Comma-separated list of file extensions to test, including the leading period.",
      type: "string",
    })
    .option("mediaDir", {
      description: "Path to the media output directory.",
      type: "string",
    })
    .option("browserHeadless", {
      description:
        "Boolean. Whether to run the browser in headless mode. Defaults to true.",
      type: "string",
    })
    .option("browserPath", {
      description:
        "Path to a browser executable to run instead of puppeteer's bundled Chromium.",
      type: "string",
    })
    .option("browserHeight", {
      description:
        "Height of the browser viewport in pixels. Default is 600 px.",
      type: "number",
    })
    .option("browserWidth", {
      description:
        "Width of the browser viewport in pixels. Default is 800 px.",
      type: "number",
    })
    .option("verbose", {
      alias: "v",
      description:
        "Boolean. Defaults to false. Log command in-progress output to the console.",
      type: "string",
    })
    .option("analytics", {
      alias: "a",
      description:
        "Boolean. Defaults to false. Sends anonymous, aggregate analytics for usage and trend analysis. For details, see https://github.com/hawkeyexl/doc-unit-test#analytics.",
      type: "string",
    })
    .option("analyticsUserId", {
      description:
        "Identifier of the organization or individual running tests.",
      type: "string",
    })
    .option("analyticsDetailLevel", {
      description:
        "How much detail is included in the analytics object. Defaults to 'action'. Values: ['action', 'test', 'run']. For details, see https://github.com/hawkeyexl/doc-unit-test#analytics.",
      type: "string",
    })
    .help()
    .alias("help", "h").argv;

  return argv;
}

function setConfig(config, argv) {
  // Set config
  if (JSON.stringify(config) === JSON.stringify({}) && !argv.config) {
    console.log(
      "Error: No config specified. If using the 'run()' method, specify the 'config' argument. If running as a CLI tool, use the '-c' argument."
    );
    exit(1);
  }
  if (argv.config) config = JSON.parse(fs.readFileSync(argv.config));
  // Set config overrides from args
  if (argv.input) config.input = path.resolve(argv.input);
  if (argv.output) config.output = path.resolve(argv.output);
  if (argv.mediaDir) config.mediaDirectory = path.resolve(argv.mediaDir);
  if (argv.recursive) {
    switch (argv.recursive) {
      case "true":
        config.recursive = true;
        break;
      case "false":
        config.recursive = false;
        break;
    }
  }
  if (argv.ext) config.testExtensions = argv.ext.replace(/\s+/g, "").split(",");
  if (argv.browserHeadless)
    config.browserOptions.headless = argv.browserHeadless;
  if (argv.browserPath) config.browserOptions.path = argv.browserPath;
  if (argv.browserHeight) config.browserOptions.height = argv.browserHeight;
  if (argv.browserWidth) config.browserOptions.width = argv.browserWidth;
  if (argv.verbose) config.verbose = argv.verbose;
  if (argv.analytics) config.analytics.send = argv.analytics;
  if (argv.analyticsUserId) config.analytics.userId = argv.analyticsUserId;
  if (argv.analyticsDetailLevel)
    config.analytics.detailLevel = argv.analyticsDetailLevel;
  if (config.analytics.customServers.length > 0) {
    config.analytics.servers = defaultAnalyticsServers.concat(
      config.analytics.customServers
    );
  } else {
    config.analytics.servers = defaultAnalyticsServers;
  }

  // Analytics notice
  if (!config.analytics.send) {
    console.log("INFO: Thanks for using doc-unit-test!");
    console.log(
      "If you want to contribute to the project, consider sending analytics to help us understand usage patterns and functional gaps."
    );
    console.log(
      "To turn on analytics, set 'analytics.send = true' in your config, or use the '-a true' argument."
    );
    console.log("See https://github.com/hawkeyexl/doc-unit-test#analytics");
    console.log("");
  }

  return config;
}

// Set array of test files
function setFiles(config) {
  let dirs = [];
  let files = [];

  // Validate input
  const input = path.resolve(config.input);
  let isFile = fs.statSync(input).isFile();
  let isDir = fs.statSync(input).isDirectory();
  if (!isFile && !isDir) {
    console.log("Error: Input isn't a valid file or directory.");
    exit(1);
  }

  // Parse input
  if (isFile) {
    // if single file specified
    files[0] = input;
    return files;
  } else if (isDir) {
    // Load files from drectory
    dirs[0] = input;
    for (let i = 0; i < dirs.length; i++) {
      fs.readdirSync(dirs[i]).forEach((object) => {
        let content = path.resolve(dirs[i] + "/" + object);
        let isFile = fs.statSync(content).isFile();
        let isDir = fs.statSync(content).isDirectory();
        if (isFile) {
          // is a file
          if (
            // No specified extension filter list, or file extension is present in extension filter list.
            config.testExtensions === "" ||
            config.testExtensions.includes(path.extname(content))
          ) {
            files.push(content);
          }
        } else if (isDir) {
          // is a directory
          if (config.recursive) {
            // recursive set to true
            dirs.push(content);
          }
        }
      });
    }
    return files;
  }
}

// Parse files for tests
function parseFiles(config, files) {
  let json = { tests: [] };

  // Loop through test files
  files.forEach((file) => {
    if (config.verbose) console.log(`file: ${file}`);
    let id = uuid.v4();
    let line;
    let lineNumber = 1;
    let inputFile = new nReadlines(file);
    let extension = path.extname(file);
    let fileType = config.fileTypes.find((fileType) =>
      fileType.extensions.includes(extension)
    );
    if (!fileType && extension !== ".json") {
      // Missing filetype options
      console.log(
        `Error: Specify options for the ${extension} extension in your config file.`
      );
      exit(1);
    }

    // If file is JSON, add tests straight to array
    if (path.extname(file) === ".json") {
      content = require(file);
      content.tests.forEach((test) => {
        json.tests.push(test);
      });
    } else {
      // Loop through lines
      while ((line = inputFile.next())) {
        let lineJson = "";
        let subStart = "";
        let subEnd = "";
        if (line.includes(fileType.openTestStatement)) {
          const lineAscii = line.toString("ascii");
          if (fileType.closeTestStatement) {
            subEnd = lineAscii.lastIndexOf(fileType.closeTestStatement);
          } else {
            subEnd = lineAscii.length;
          }
          subStart =
            lineAscii.indexOf(fileType.openTestStatement) +
            fileType.openTestStatement.length;
          lineJson = JSON.parse(lineAscii.substring(subStart, subEnd));
          if (!lineJson.testId) {
            lineJson.testId = id;
          }
          let test = json.tests.find((item) => item.id === lineJson.testId);
          if (!test) {
            json.tests.push({ id: lineJson.testId, file, actions: [] });
            test = json.tests.find((item) => item.id === lineJson.testId);
          }
          delete lineJson.testId;
          lineJson.line = lineNumber;
          test.actions.push(lineJson);
        }
        lineNumber++;
      }
    }
  });
  return json;
}

async function outputResults(config, results) {
  let data = JSON.stringify(results, null, 2);
  fs.writeFile(config.output, data, (err) => {
    if (err) throw err;
  });
}

async function convertToGif(config, input, fps, width) {
  if (!fs.existsSync(input)) return { error: "Invalid input." };
  let output = path.join(
    path.parse(input).dir,
    path.parse(input).name + ".gif"
  );
  if (!fps) fps = 15;
  let command = `ffmpeg -nostats -loglevel 0 -y -i ${input} -vf "fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 ${output}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      if (config.verbose) console.log(error.message);
      return { error: error.message };
    }
    if (stderr) {
      if (config.verbose) console.log(stderr);
      return { stderr };
    }
    if (config.verbosev) console.log(stdout);
    return { stdout };
  });
  return output;
}

async function setEnvs(envsFile) {
  const fileExists = fs.existsSync(envsFile);
  if (fileExists) {
    require('dotenv').config({ path: envsFile, override: true })
    return { status: "PASS", description: "Envs set."}
  } else {
    return { status: "FAIL", description: "Invalid file."}
  }
}