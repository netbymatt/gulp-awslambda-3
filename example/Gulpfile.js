/* eslint-disable import/no-extraneous-dependencies */
const gulp = require('gulp');
const lambda = require('gulp-awslambda');
const zip = require('gulp-zip');

/**
 * For uploading the first time.
 * Subsequent updates on a function that has already been created only
 * require the name of the function (see task below).
 */
const lambdaParams = {
	FunctionName: 'testGulpAWSLambda',
	Role: '[YOUR LAMBDA EXEC ROLE HERE]',
};

const opts = {
	region: 'us-west-2',
};

gulp.task('default', () => gulp.src('index.js')
	.pipe(zip('archive.zip'))
// .pipe(lambda(lambdaParams, opts))
	.pipe(lambda('testGulpAWSLambda', opts))
	.pipe(gulp.dest('.')));
