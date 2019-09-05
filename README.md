# B2 Uploader for photos

## Structure
Currently there is a GLOBALS object at the top of the script that is on my list to make command line args, but for now that's essentially some config.
Need to set where to log to, the dir to upload from, whether to do recursively or not, and the rootdir that won't be included in path name for b2. i.e. that's the bucket.

Need to have in same dir an env.json file that contains:
{
  "key_id": "",
  "application_key": "",
  "bucket_id": ""
}

The script will obtain array of all folders to be targeted, and then loop through those getting all the files in the folder.
For each file, it checks if it is a jpg, cr2, or raf, and will skip if not. It then checks if the file has already been uploaded.
If it hasn't, then it uploads it to b2 and moves onto the next.
Everything is setup to be synchronous.

## Order of stuff
Essentially the loop files is where things actually get kicked off, the rest is just running in execution of the main file. That's the first thing to call functions.
1. UploadFile(filepath)
2. If authorised, attemptUpload(), else requestAuth() until authorised
3. getUploadUrl(). If it gets one then
4. performUpload()

## API requirements
1. Get auth token from _b2_authorize_account_. This also includes a URL that should be used as base URL for subsequent API calls
_authorizationToken_ and _apiUrl_
2. Get upload url from _b2_get_upload_url_
Send the auth token as authorization
Include _bucketId_ in the body
get back _uploadUrl_ and _authorizationToken_
3. Call _b2_upload_file_ to send the file
