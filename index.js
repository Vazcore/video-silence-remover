const yargs = require("yargs");
const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");

const videoFilterPath = path.normalize("vf.txt");
const audioFilterPath = path.normalize("af.txt");

const getArg = (args, arg) => {
  const argument = args[arg];

  if (!argument) {
    throw new Error(`Argument "${arg}" is missing!`);
  }

  return argument;
};

const deleteFile = (fPath) => {
  try {
    if (fs.existsSync(fPath)) {
      console.log(`Deleting: ${fPath}`)
      fs.unlinkSync(fPath);
    }
  } catch (error) {
    
  }
};

const input = getArg(yargs.argv, "input");
const dB = getArg(yargs.argv, "dB");
const output = getArg(yargs.argv, "output");
const duration = getArg(yargs.argv, "duration");

deleteFile(output);
deleteFile("temp.mp3");

const execution = (command) => {
  let result = "";
  const process = exec(command);
  process.stderr.on("data", data => result += data);
  
  const promise = new Promise((resolve) => {
    process.stdout.on("end", () => {
      resolve(result);
    });
  });

  return promise;
};

const getVoiceIntervals = (consoleData) => {
  let command = "";
  let isBetweenFinished = true;

  consoleData
  .split("\n")
  .filter(str => str.includes("silencedetect"))
  .map(line => {
    if (line.includes("silence_start:")) {
      return line.split("silence_start:")[1].split("\r")[0].trim()
    }
    if (line.includes("silence_end:")) {
      return line.split("silence_end:")[1].split("|")[0].trim()
    }
  })
  .forEach((element, index, array) => {      
    if (index !== 0 && index !== array.length - 1) {
      if (isBetweenFinished) {
        command += `between(t,${element},`;
        isBetweenFinished = false;
      } else {
        command += `${element})`;
        if (index !== array.length - 2) {
          command += "+";
        }
        isBetweenFinished = true;
      }
    }
  })
  
  return command;
};

const writeToFile = (filepath, data) => {
  try {
    const fPath = path.normalize(filepath);
    fs.writeFileSync(fPath, data, { encoding: "utf8" });
  } catch (error) {    
    console.log(`Error writting to ${filepath}`);
    console.log(error);
  }  
}

const start = async () => {
  const consoleData = await execution(`ffmpeg -i ${input} -af "silencedetect=n=-${dB}dB:d=${duration}" temp.mp3`);
  const voiceIntervals = getVoiceIntervals(consoleData);
  writeToFile(videoFilterPath, `select='${voiceIntervals}',setpts=N/FRAME_RATE/TB`);
  writeToFile(audioFilterPath, `aselect='${voiceIntervals}',asetpts=N/SR/TB`);

  await execution(
    `ffmpeg -i ${input} -filter_script:v ${videoFilterPath} -filter_script:a ${audioFilterPath} ${output}`
  );
  deleteFile("temp.mp3");
  deleteFile(videoFilterPath);
  deleteFile(audioFilterPath);
};

start();