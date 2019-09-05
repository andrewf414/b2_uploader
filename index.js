//#region Requires / imports
const fs = require("fs");
const { readdirSync } = require("fs");
const fetch = require("node-fetch");
var crypto = require("crypto");
//#endregion

const GLOBALS = {
  LOG_PATH: "E:/Photos/",
  directory: "E:/Photos", // where we are uploading from
  recursive: true, // whether to do sub-directories
  rootDir: "E:/Photos/", // the base folder that everything should not be part of b2 file structure as it's the bucket
  b2uploaded: `E:/Photos/b2uploaded.txt`, // where the log of uploaded files is kept
  auth_token: "",
  apiUrl: "",
  bucketId: "",
  authorised: false
};

//#region Helper functions
function getDirectories(source) {
  return readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(
      dirent => `${source}${source.slice(-1) === "/" ? "" : "/"}${dirent.name}`
    );
}

function getDirectoriesRecursive(dir) {
  let dirs = getDirectories(dir);
  for (let i = 0; i < dirs.length; i++) {
    const moreDirs = getDirectoriesRecursive(dirs[i]);
    dirs.push(...moreDirs);
  }
  return dirs;
}

/**
 * Logs a message with timestamp to file
 * @param {string} msg The message to log
 * @param {string} filename Where to save the log, default is viking_log.txt
 * @param {boolean} timestamp Whether to print a timestamp with the message, default is true
 */
function Logging(msg, filename, timestamp = true) {
  if (timestamp) {
    fs.appendFileSync(
      "E:/Photos/" + filename,
      `${new Date().toISOString()}\t${msg}\n`
    );
  } else {
    fs.appendFileSync("E:/Photos/" + filename, `${msg}\n`);
  }
}

/**
 * Convert data into sha1 hash
 * @param {any} data
 */
function sha1(data) {
  var generator = crypto.createHash("sha1");
  generator.update(data);
  return generator.digest("hex");
}
//#endregion

// console.log(process.argv);

// Read in env variables
const rawenv = fs.readFileSync("./env.json", { encoding: "utf8" });
const env = JSON.parse(rawenv);

// Read in file of previously uploaded files to not duplicate
const uploaded = fs.readFileSync(`${GLOBALS.b2uploaded}`, { encoding: "utf8" });
const filesDone = uploaded.split("\n");

// Get all files in dir wanted to upload
const folders = GLOBALS.recursive
  ? getDirectoriesRecursive(GLOBALS.directory)
  : getDirectories(GLOBALS.directory);
folders.push(GLOBALS.directory);
console.log(folders);

// process.exit(0); // TODO: remove this when working

// Loop  all folders
async function loopFolders() {
  for (const folder of folders) {
    // Get files
    const files = readdirSync(`${folder}`, {
      withFileTypes: true
    })
      .filter(dirent => dirent.isFile())
      .map(dirent => dirent.name);
  
    // Loop files
    await loopFiles(folder, files);
  }
}
loopFolders();


/**
 * Loop  over each file and determine whether to upload or not, then attempt to upload
 * @param {*} folder
 * @param {*} files
 */
async function loopFiles(folder, files) {
  for (const fileName of files) {
    const extension = fileName.slice(-3).toLowerCase();
    if (extension === "mov") {
      // movies write it to file for movie files
      Logging(`${folder}/${fileName}`, "movies_files.txt", false);
    } else if (!["cr2", "jpg", "raf"].includes(extension)) {
      // not an image type we are looking for write to file skipped
      Logging(`${folder}/${fileName}`, "skipped.txt", false);
    } else if (!filesDone.includes(`${folder}/${fileName}`)) {
      // Hasn't been uploaded already so do it
      Logging(`${folder}/${fileName}`, "attempted.txt", false);
      await uploadFile(`${folder}/${fileName}`);
    }
  }
}

/**
 * Attempt to upload a file by gaining auth and upload url first
 * @param {string} path local path to file
 */
async function uploadFile(path) {
  // Get a new upload URL and auth token, if needed.
  if (!GLOBALS.authorised) {
    // Get authorisation
    let authorised = false;
    while (!authorised) {
      authorised = await requestAuth();
    }
  }

  // Set the path we will save it as (faux folder structure)
  const destPath = encodeURI(path.substring(path.indexOf(GLOBALS.rootDir) + GLOBALS.rootDir.length));
    // .replace(/\\/g, "/")
    // .replace("!", "")
    // .replace(/\s/g, "%20")
    // .replace(/&/g, "%26");

  // Get upload url
  let success = false;
  while (!success) {
    success = await attemptUpload(path, destPath);
  }
}

/**
 * Request auth token and upload url
 */
async function requestAuth() {
  await authoriseAccount()
    .then(auth_json => {
      GLOBALS.auth_token = auth_json.authorizationToken;
      GLOBALS.authorised = true;
      GLOBALS.apiUrl = auth_json.apiUrl;
      GLOBALS.bucketId = auth_json.allowed.bucketId;
    })
    .catch(err => {
      console.log(`authoriseAccount ${err}`);
    });
  return (GLOBALS.auth_token !== undefined && GLOBALS.auth_token !== '');
}

/**
 * Attempt to upload file and return true or false for success
 * @param {*} path
 * @param {*} destPath
 */
async function attemptUpload(path, destPath) {
  let uploadURL_json;
  while (uploadURL_json === undefined) {
    uploadURL_json = await getUploadURL();
    // .then(uploadURL_json => {
    //   auth_token = uploadURL_json.authorizationToken;
    //   uploadUrl = uploadURL_json.uploadUrl;
    // })
    // .catch(err => {
    //   console.log(`getUploadURL ${err}`);
    // });
  }
  let auth_token = uploadURL_json.authorizationToken;
  let uploadUrl = uploadURL_json.uploadUrl;

  if (uploadUrl !== undefined) {
    let res = await performUpload(auth_token, uploadUrl, path, destPath);
    return res !== 503;
  }
}

/**
 * Logs into the B2 API
 * Returns an authorization token
 */
async function authoriseAccount() {
  const credentials = Buffer.from(
    `${env.key_id}:${env.application_key}`,
    "utf8"
  ).toString("base64");

  let response;
  await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`
    }
  })
    .then(res => {
      return res.json();
    })
    .then(json => {
      response = json;
    })
    .catch(err => {
      response = err;
    });
  return response;
}

/**
 * Get an upload url to send file to
 */
async function getUploadURL() {
  let response;

  await fetch(encodeURI(`${GLOBALS.apiUrl}/b2api/v2/b2_get_upload_url`), {
    method: "POST",
    headers: {
      Authorization: GLOBALS.auth_token
    },
    body: `{\"bucketId\":\"${GLOBALS.bucketId}\"}`
  })
    .then(res => {
      return res.json();
    })
    .then(json => {
      response = json;
    })
    .catch(err => {
      console.log(`fetch in getUploadURL ${err}`);
    });

  return response;
}

async function performUpload(auth, uploadUrl, filePath, destination_path) {
  const contentType = "b2/x-auto"; // Type of file i.e. image/jpeg, audio/mpeg...
  let bytes = fs.readFileSync(filePath);
  const sha1hash = sha1(bytes);

  let response;

  await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: auth,
      "X-Bz-File-Name": destination_path,
      "X-Bz-Content-Sha1": sha1hash,
      "Content-Type": contentType
    },
    body: bytes
  })
    .then(res => {
      return res.json();
    })
    .then(json => {
      response = json.status;
      if (json.action === "upload") {
        // uploaded
        Logging(filePath, "b2uploaded.txt", false);
      } else if (json.status === 400) {
        // bad request
        console.log(json.message);
        console.log(destination_path);
      } else if (json.status === 401) {
        // unauthorized in some way
        console.log(json.message);
      } else if (json.status === 403) {
        // usage cap exceeded
        console.log(json.message);
      } else if (json.status === 408) {
        // request timeout
        console.log(json.message);
      } else if (json.status === 503) {
        // call get_upload_url again
        console.log("call get_upload_url again");
      }
    });

  return response;
}
