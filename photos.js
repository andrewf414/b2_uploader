import fs from "fs";
import { readdirSync } from "fs";
import fetch from "node-fetch";
import crypto from 'crypto';

function getDirectories(source) {
  return readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => `${source}${source.slice(-1) === '/' ? '' : '/'}${dirent.name}`);
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
      "E:/Google_Drive/backblaze/" + filename,
      `${new Date().toISOString()}\t${msg}\n`
    );
  } else {
    fs.appendFileSync("E:/Google_Drive/backblaze/" + filename, `${msg}\n`);
  }
}


// List of files that are already uploaded
const uploaded = fs.readFileSync(`E:/Google_Drive/backblaze/b2uploaded.txt`, { encoding: "utf8" });
const filesDone = uploaded.split("\r\n");
// console.log(filesDone);

// Folders that we need to upload pictures from
const folders = getDirectories('E:/Photos');
folders.push('E:/Photos');
// console.log(folders);

// #######################
const root = 'E:/Photos';
let validToken = false;
let auth_json;

// Loop over the folders and files within
(async () => {
  for (const folder of folders.slice(0,2)) {
    // Get files
    const files = readdirSync(`${folder}`, {
      withFileTypes: true
    })
      .filter(dirent => dirent.isFile())
      .map(dirent => dirent.name);

    // Loop files
    await loopFiles(folder, files);
  }
})();

/**
 * 
 * @param {string} folder the folder of photos
 * @param {string[]} files filenames within the folder
 */
async function loopFiles(folder, files) {
  const len = files.length;
  let counter = 0;
  for (const fileName of files) {
    console.log(`processing ${++counter} of ${len} in ${folder}`)
    const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
    if (extension === "mov") {
      // movies write it to file for movie files
      console.log(`movie in ${folder} called ${fileName}`)
    } else if (!["cr2", "jpg", "raf"].includes(extension)) {
      // not an image type we are looking for write to file skipped
      Logging(`${folder}/${fileName}`, "skipped.txt", false);
    } else if (!filesDone.includes(`${folder}/${fileName}`)) {
      // Hasn't been uploaded already so do it
      console.log(`upload ${folder}/${fileName}`)
      await uploadFile(`${folder}/${fileName}`)
    }
  }
}

async function uploadFile(path) {
  let succeeded = false;
  // try up to 5 times
  for (let i of Array.apply(null, Array(5)).map(function () {})) {
    if (succeeded) return;

    // Get a new upload URL and auth token, if needed.
    if (!validToken) {
        // Get authorisation
        auth_json = await authoriseAccount();    
    }
    try {
      const uploadURL_json = await getUploadURL(auth_json, "6b0bf82f31ebfbe06d330311");
      const auth_token = uploadURL_json.authorizationToken;
      const uploadUrl = uploadURL_json.uploadUrl;
  
      const destPath = path.replace(/[A-Z]:\//, '').replace('\\', '/').replace("!","").replace(" ", "_");
      const contentType = "b2/x-auto";   //Type of file i.e. image/jpeg, audio/mpeg...
  
      // Read the file into memory and take a sha1 of the data.
      const fileBuffer = fs.readFileSync(path);
      const hashSum = crypto.createHash('sha1');
      hashSum.update(fileBuffer);
      const sha1Str = hashSum.digest('hex'); //Sha1 verification for the file
  
      // Send over the wire
      await fetch(uploadUrl, {
        headers: {
          'Authorization': auth_token,
          'X-Bz-File-Name': destPath,
          'X-Bz-Content-Sha1': sha1Str,
          'Content-Type': contentType,
        },
        method: 'POST',
        body: fileBuffer,
      }).then(res => {
        console.log('success');
        fs.appendFileSync(`E:/Google_Drive/backblaze/b2uploaded.txt\r\n`, path)
        succeeded = true;
        validToken = true;
      }).catch(err => {
        if (err.status == 401 && err.code == 'expired_auth_token') {
          // Upload auth token has expired.  Time for a new one.
          validToken = false;
        } else if (err.status == 408) {
          // Request Timeout
          console.log('request timeout');
          // Retry and hope the upload goes faster this time
        } else if (err.status == 429) {
          // Too Many Requests
          console.log('too many requests');
        } else {
          // something else went wrong
          console.log(err)
        }
      });
    } catch (err) {
      console.log(err);
    }
    
  }
}

async function authoriseAccount() {
  const accountId = "bb8f1bb0d331";
  const applicationKey = "0022b8c224d3cfed859ae5a5deac8649132323c921";
  const credentials = Buffer.from(accountId + ":" + applicationKey).toString('base64');

  const json = await fetch('https://api.backblazeb2.com/b2api/v1/b2_authorize_account', {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    }
  }).then(res => res.json());

  //{
  //    "accountId": "YOUR_ACCOUNT_ID",
  //    "apiUrl": "https://apiNNN.backblazeb2.com",
  //    "authorizationToken": "2_20150807002553_443e98bf57f978fa58c284f8_24d25d99772e3ba927778b39c9b0198f412d2163_acct",
  //    "downloadUrl": "https://f700.backblazeb2.com",
  //    "minimumPartSize": 100000000
  //}
  return json;
}

async function getUploadURL(auth_json, bucketId) {
  const apiUrl = auth_json.apiUrl;
  const accountAuthorizationToken = auth_json.authorizationToken; //Provided by b2_authorize_account

  const res = await fetch(`${apiUrl}/b2api/v1/b2_get_upload_url`, {
    headers: {
      'Authorization': accountAuthorizationToken,
      'Content-Type': 'applicaiton/json',
    },
    method: 'POST',
    body: JSON.stringify({
      bucketId: bucketId
    })
  }).then(res => res.json());

  return res;
}