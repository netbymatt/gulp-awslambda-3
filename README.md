# [gulp](https://github.com/gulpjs/gulp)-awslambda-3

[![license](https://img.shields.io/badge/license-MIT-green.svg)](https://raw.githubusercontent.com/netbymatt/gulp-awslambda-3/master/LICENSE)

> A Gulp plugin for publishing your package to AWS Lambda

## Install

```bash
$ npm install --save-dev gulp-awslambda-3
```

## Function States
As of October 2021 the AWS Lambda interface has been updated to require querying the Function State before performing an update of function code. See https://docs.aws.amazon.com/lambda/latest/dg/functions-states.html. It's common for this routine to make multiple updating calls to AWS Lambda such as: upload then publish.

As of v1.3.0 this functionality has been added to this module using the following method:
- An internal function `checkStatus(FunctionName, lambda, count = 10)` has been added
- Before running any Lambda command that would modify the function a call to `checkStatus` is made.
- Check status will monitor the result of `GetFunctionConfigurationCommand` for `State = 'Active'` and `LastUpdateStatus !== 'InProgress'`.
- If the state requirements are not met, up to 10 retries at a 1 second interval are tried to allow AWS Lambda to complete it's initialization of the previous update.
- This function will throw an error if the 10 retires are exhausted or if the Lambda function returns an error state.
- This function will log `'Waiting for update to complete "${FunctionName}"'` to the console each time a retry situation is encountered.

## Enhancements
This project is forked from [gulp-awslambda](https://github.com/willyg302/gulp-awslambda) which has not been updated since 2017. The following enhancements were made:
- Changed to AWS SDK v3 (thus the -3 package name)
- Converted to async/await
- Used a modern set of linting rules
- Made some minor code readability updates that necessitated upgrading the minimum node version and removes some dependencies.
- Set a new reasonable default for Lambda runtime (nodejs10.x)

The source repository has deprecated dependencies (gulp-util), and dependencies with security vulnerabilities. This fork cleans up these issues.

## Usage

### AWS Credentials

It is recommended that you store your AWS Credentials in `~/.aws/credentials` as per [the docs](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).

### Basic Workflow

gulp-awslambda accepts a single ZIP file, uploads that to AWS Lambda, and passes it on down the stream. It works really well with [gulp-zip](https://github.com/sindresorhus/gulp-zip):

```js
var gulp   = require('gulp');
var lambda = require('gulp-awslambda-3');
var zip    = require('gulp-zip');

const lambdaParams = {
	FunctionName: 'testGulpAWSLambda',
	Role: '[YOUR ROLE ARN]', // if creating a new function
};

const opts = {
	region: 'us-east-1',
};

gulp.task('default', function() {
	return gulp.src('index.js')
		.pipe(zip('archive.zip'))
		.pipe(lambda(lambda_params, opts))
		.pipe(gulp.dest('.'));
});
```

For more information on `lambda_params` and `opts` see the [API section](#api).

### Example Project

See the `example/` directory of this repo for a full working example.

## API

```js
lambda(lambda_params, opts)
```

### `lambda_params`

Parameters describing the Lambda function. This can either be...

#### A String

corresponding to the name of an existing Lambda function. In this case gulp-awslambda will only update the function's code.

#### An Object

that is mostly the same as you would pass to [`UpdateFunctionConfigurationCommand()`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-lambda/classes/updatefunctionconfigurationcommand.html). The only required parameters are `FunctionName` and `Role` (when creating a new function). All the other parameters have the following default values:

- `Handler = 'index.handler'`: This assumes a valid `exports.handler` in `index.js` at the root of your ZIP
- `Runtime = 'nodejs10.x'`:

gulp-awslambda-3 will perform an *upsert*, meaning the function will be created if it does not already exist, and updated (both code and configuration) otherwise.

For code, gulp-awslambda-3 will default to passing the `ZipFile` property. However, you may alternatively pass e.g.:

```js
Code: {
	S3Bucket: 'myBucket',
	S3Key: 'function.zip',
},
...
```

to upload from S3.

### `opts`

Options configuring the AWS environment to be used when uploading the function. The following options are supported:

#### `profile`

If you [use a different credentials profile](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html), you can specify its name with this option.

#### `publish`

Allows you to publish a new version when passing in a string for `lambda_params`. Otherwise, you may simply specify `Publish` as a parameter. If both are provided, the value in `lambda_params` will take precedence.

#### `region = 'us-east-1'`

Set your AWS region.

#### `alias`

Requires publish=true.  Creates an alias for the version being published.  If the alias already exists, it is updated to point to the version being published. Alternate versions may be specified.  The following options are supported:

#### `name` 

Required string. The name of the alias.

#### `description`

Optional text to describe the function's version alias.

#### `version`

Optional version number to which to assign the alias.  If not specified, the alias will be assigned to the version just published.

#### `retryCount`

Number of calls to checkStatus that should be made when waiting for a function update to complete. Default = 10. Calls are made at ~1 per second. 10 is reasonable for functions that are not attached to a VPC, 45 is better for functions attached to a VPC.

# Tests
Travis-CI tests have been removed as of v1.4.0. In October 2021 Lambda changed the AWS Lambda API to require the examination of Function States before modifying functions. Because the tests all require connections to Lambda or mocks, I decided that writing new mocks to support these new requirements was too time consuming. Instead I have created a new test folder that provides a script that actually uploads a small function to lambda.

Set the environment variable `GULP_AWSLAMBDA_3_ROLE` to the arn of your lambda execution role before running the following test

``` bash
GULP_AWSLAMBDA_3_ROLE=<your role arn> node test/index.js
```