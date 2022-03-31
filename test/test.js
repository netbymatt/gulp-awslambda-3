const gulp = require('gulp');
const log = require('fancy-log');
const awsLambda = require('../index');

/* eslint-disable no-console */
const lambdaParams = {
	FunctionName: 'gulp-awslambda-3-test',
	Handler: 'index.handler',
	Runtime: 'nodejs14.x',
	Description: 'Test upload from gulp-awslambda-3',
	MemorySize: 128,
	Timeout: 10,
	Architectures: ['arm64'],
};

// default regions should appear in your aws credentials or environment variables
// or set it here
const opts = {
	publish: true,
	alias: {
		name: 'PRODUCTION',
		description: 'Production',
	},
	profile: 'default',
	retryCount: 5,
	statusVerbose: false,
	// region: 'us-east-1',
};

// do some checks then run the task
(async () => {
	if (!process.env.GULP_AWSLAMBDA_3_ROLE) {
		console.log('GULP_AWSLAMBDA_3_ROLE is not set');
	} else {
		// update parameters
		lambdaParams.Role = process.env.GULP_AWSLAMBDA_3_ROLE;
		// call the task
		try {
			// upload task
			gulp.src('hello.zip')
				.pipe(awsLambda(lambdaParams, opts)).on('error', log);
		} catch (e) {
			console.log(e);
		}
	}
})();
