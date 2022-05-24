const yargs = require("yargs");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const deleteFile = (fPath) => {
  try {
    if (fs.existsSync(fPath)) {
      console.log(`Deleting: ${fPath}`);
      fs.unlinkSync(fPath);
    }
  } catch (error) {
    console.error(error);
  }
};

const getArg = (args, arg) => {
  if (!args[arg]) {
    throw new Error(`Missing argument: ${arg} !`);
  }

  return args[arg];
};

const input = path.normalize(getArg(yargs.argv, "input"));
const dB = getArg(yargs.argv, "dB");
const output = path.normalize(getArg(yargs.argv, "output"));

deleteFile(output);

const execute = (command) => {
  const intervals = [];
  const res = exec(command, {stdio: 'inherit', encoding: "utf8"});
  
  res.stderr.on("data", (data) => {
    if (data.includes("silence_start:")) {
      const interval = { start: data.split("silence_start:")[1].split("\r")[0].trim() };
      intervals.push(interval);
    }

    if (data.includes("silence_end:")) {
      const lastInterval = intervals[intervals.length - 1];
      lastInterval.end = data.split("silence_end:")[1].split("|")[0].trim();
    }
  });

  const promisedResult = new Promise((resolve) => {
    res.stdout.on("end", () => {
      resolve(intervals);
    });
  });

  return promisedResult;
};

const createVoiceIntervalsCommand = (silences) => {
  let command = "";
  for (let i = 0; i < silences.length; i++) {
    if (i === 0) {
      command += `between(t,${silences[i].end},`;
    } else if (i === silences.length - 1) {
      command += `${silences[i].start})`;
    } else {
      command += `${silences[i].start})+between(t,${silences[i].end},`;
    }
  }


  return command;
};

const start = async () => {
  const silenceIntervals = await execute(`ffmpeg -i ${input} -af "silencedetect=n=-${dB}dB:d=0.2" temp.mp4`);    
  const voiceIntervalsCommand = createVoiceIntervalsCommand(silenceIntervals);

  await execute(
    `ffmpeg -i ${input} -vf "select='${voiceIntervalsCommand}',setpts=N/FRAME_RATE/TB" ` +
    `-af "aselect='${voiceIntervalsCommand}',asetpts=N/SR/TB" ${output}`
  );
  deleteFile("temp.mp4");
};

start();
