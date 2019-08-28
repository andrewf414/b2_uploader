# B2 Uploader for photos

## Structure


## API requirements
1. Get auth token from _b2_authorize_account_. This also includes a URL that should be used as base URL for subsequent API calls
_authorizationToken_ and _apiUrl_
2. Get upload url from _b2_get_upload_url_
Send the auth token as authorization
Include _bucketId_ in the body
get back _uploadUrl_ and _authorizationToken_
3. Call _b2_upload_file_ to send the file
