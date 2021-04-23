const { mockClient } = require('aws-sdk-client-mock');
const gulp = require('gulp');
const path = require('path');
require('should');
const Vinyl = require('vinyl');
const {
	LambdaClient, UpdateFunctionCodeCommand, GetFunctionConfigurationCommand, CreateFunctionCommand,
} = require('@aws-sdk/client-lambda');
const awsLambdaTask = require('..');

const fixtures = (glob) => path.join(__dirname, 'fixtures', glob);

const mock = (args, done, cb) => {
	const { stream } = args;

	stream.write(new Vinyl({
		path: fixtures(args.fixture),
		contents: Buffer.from(args.contents),
	}));

	stream.on('data', cb);
	stream.on('end', done);
	stream.end();
};

const lambdaMock = mockClient(LambdaClient);

describe('gulp-awslambda-3', () => {
	beforeEach(() => {
		lambdaMock.reset();
	});

	it('should error if no code is provided for string params', (done) => {
		gulp.src('fake.zip', { allowEmpty: true })
			.pipe(awsLambdaTask('someFunction'))
			.on('error', (err) => {
				err.message.should.eql('No code provided');
				done();
			});
	});

	it('should error if no code is provided for object params', (done) => {
		gulp.src('fake.zip', { allowEmpty: true })
			.pipe(awsLambdaTask({ FunctionName: 'someFunction' }))
			.on('error', (err) => {
				err.message.should.eql('No code provided');
				done();
			});
	});

	it('should error on streamed file', (done) => {
		gulp.src(fixtures('hello.zip'), { buffer: false })
			.pipe(awsLambdaTask('someFunction'))
			.on('error', (err) => {
				err.message.should.eql('Streaming is not supported');
				done();
			});
	});

	it('should only accept ZIP files', (done) => {
		gulp.src(fixtures('index.js'))
			.pipe(awsLambdaTask('someFunction'))
			.on('error', (err) => {
				err.message.should.eql('Provided file is not a ZIP');
				done();
			});
	});

	it('should update code if passed a string', (done) => {
		lambdaMock.on(UpdateFunctionCodeCommand).resolves();
		mock({
			stream: awsLambdaTask('someFunction'),
			fixture: 'hello.zip',
			contents: 'test UpdateFunctionCodeCommand',
		}, done, (file) => {
			path.normalize(file.path).should.eql(fixtures('hello.zip'));
			lambdaMock.calls()[0].firstArg.should.be.an.instanceOf(UpdateFunctionCodeCommand);
			lambdaMock.calls()[0].firstArg.input.should.eql({
				FunctionName: 'someFunction',
				ZipFile: file.contents,
				Publish: false,
			});
		});
	});

	it('should create the function if it does not exist', (done) => {
		lambdaMock
			.on(GetFunctionConfigurationCommand).rejects()
			.on(CreateFunctionCommand).resolves();
		mock({
			stream: awsLambdaTask({ FunctionName: 'foo' }),
			fixture: 'hello.zip',
			contents: 'test createFunction',
		}, done, (file) => {
			lambdaMock.calls()[0].firstArg.should.be.an.instanceOf(GetFunctionConfigurationCommand);
			lambdaMock.calls()[1].firstArg.should.be.an.instanceOf(CreateFunctionCommand);
			lambdaMock.calls()[1].firstArg.input.should.eql({
				FunctionName: 'foo',
				Code: {
					ZipFile: file.contents,
				},
				Handler: 'index.handler',
				Runtime: 'nodejs10.x',
				Publish: false,
			});
		});
	});

	// it('should update the function if it already exists', (done) => {
	// 	const mocked = lambdaPlugin(sandbox, {
	// 		getFunctionConfiguration: null,
	// 		UpdateFunctionCodeCommand: null,
	// 		updateFunctionConfiguration: null,
	// 	});
	// 	mock({
	// 		stream: awsLambdaTask({ FunctionName: 'bar' }),
	// 		fixture: 'hello.zip',
	// 		contents: 'test updateFunctionConfiguration',
	// 	}, done, (file) => {
	// 		mocked.methods.getFunctionConfiguration.called.should.eql(true);
	// 		mocked.methods.UpdateFunctionCodeCommand.firstCall.args[0].should.eql({
	// 			FunctionName: 'bar',
	// 			ZipFile: file.contents,
	// 			Publish: false,
	// 		});
	// 		mocked.methods.updateFunctionConfiguration.firstCall.args[0].should.eql({
	// 			FunctionName: 'bar',
	// 		});
	// 	});
	// });

	// it('should update the function runtime if provided', (done) => {
	// 	const mocked = lambdaPlugin(sandbox, {
	// 		getFunctionConfiguration: null,
	// 		UpdateFunctionCodeCommand: null,
	// 		updateFunctionConfiguration: null,
	// 	});
	// 	mock({
	// 		stream: awsLambdaTask({ FunctionName: 'bar', Runtime: 'nodejs6.10' }),
	// 		fixture: 'hello.zip',
	// 		contents: 'test updateFunctionConfiguration',
	// 	}, done, () => {
	// 		mocked.methods.updateFunctionConfiguration.firstCall.args[0].should.eql({
	// 			FunctionName: 'bar',
	// 			Runtime: 'nodejs6.10',
	// 		});
	// 	});
	// });

	// it('should allow providing code from S3', (done) => {
	// 	const mocked = lambdaPlugin(sandbox, {
	// 		getFunctionConfiguration: true, // Cause an error
	// 		createFunction: null,
	// 	});
	// 	mock({
	// 		stream: awsLambdaTask({
	// 			FunctionName: 'foo',
	// 			Code: {
	// 				S3Bucket: 'myBucket',
	// 				S3Key: 'function.zip',
	// 			},
	// 		}),
	// 		fixture: 'hello.zip',
	// 		contents: 'test createFunction',
	// 	}, done, () => {
	// 		mocked.methods.createFunction.firstCall.args[0].Code.should.eql({
	// 			S3Bucket: 'myBucket',
	// 			S3Key: 'function.zip',
	// 		});
	// 	});
	// });

	// it('should allow publishing for update from a string', (done) => {
	// 	const mocked = lambdaPlugin(sandbox, {
	// 		UpdateFunctionCodeCommand: { data: { Version: 1 } },
	// 	});
	// 	mock({
	// 		stream: awsLambdaTask('someFunction', { publish: true }),
	// 		fixture: 'hello.zip',
	// 		contents: 'test UpdateFunctionCodeCommand',
	// 	}, done, () => {
	// 		mocked.methods.UpdateFunctionCodeCommand.firstCall.args[0].Publish.should.eql(true);
	// 	});
	// });

	// it('should favor Publish from params over opts', (done) => {
	// 	const mocked = lambdaPlugin(sandbox, {
	// 		getFunctionConfiguration: true, // Cause an error
	// 		createFunction: null,
	// 	});
	// 	mock({
	// 		stream: awsLambdaTask({
	// 			FunctionName: 'foo',
	// 			Publish: true,
	// 		}, { publish: false }),
	// 		fixture: 'hello.zip',
	// 		contents: 'test createFunction',
	// 	}, done, () => {
	// 		mocked.methods.createFunction.firstCall.args[0].Publish.should.eql(true);
	// 	});
	// });

	// it('should error on alias specified without name', (done) => {
	// 	const mocked = lambdaPlugin(sandbox);
	// 	gulp.src(fixtures('hello.zip'), { buffer: true })
	// 		.pipe(awsLambdaTask('someFunction', { publish: true, alias: {} }))
	// 		.on('error', (err) => {
	// 			err.message.should.eql('Alias requires a \u001b[31mname\u001b[39m parameter');
	// 			done();
	// 		});
	// });

	// it('should error if specified alias name is not a string', (done) => {
	// 	const mocked = lambdaPlugin(sandbox);
	// 	gulp.src(fixtures('hello.zip'), { buffer: true })
	// 		.pipe(awsLambdaTask('someFunction', { publish: true, alias: { name: 5 } }))
	// 		.on('error', (err) => {
	// 			err.message.should.eql('Alias \u001b[31mname\u001b[39m must be a string');
	// 			done();
	// 		});
	// });

	// it('should create an alias if necessary', (done) => {
	// 	const mocked = lambdaPlugin(sandbox, {
	// 		UpdateFunctionCodeCommand: { data: { Version: 1 } },
	// 		getAlias: true, // Cause an error
	// 		createAlias: null,
	// 	});
	// 	mock({
	// 		stream: awsLambdaTask('someFunction', { publish: true, alias: { name: 'alias' } }),
	// 		fixture: 'hello.zip',
	// 		contents: 'test UpdateFunctionCodeCommand',
	// 	}, done, () => {
	// 		mocked.methods.getAlias.firstCall.args[0].should.eql({
	// 			FunctionName: 'someFunction',
	// 			Name: 'alias',
	// 		});
	// 		mocked.methods.createAlias.firstCall.args[0].should.eql({
	// 			FunctionName: 'someFunction',
	// 			FunctionVersion: '1',
	// 			Name: 'alias',
	// 			Description: undefined,
	// 		});
	// 	});
	// });

	// it('should update an alias if necessary', (done) => {
	// 	const mocked = lambdaPlugin(sandbox, {
	// 		UpdateFunctionCodeCommand: { data: { Version: 1 } },
	// 		getAlias: null,
	// 		updateAlias: null,
	// 	});
	// 	// Also test all alias options
	// 	const alias = { name: 'alias', description: 'my alias', version: 42 };
	// 	mock({
	// 		stream: awsLambdaTask('someFunction', { publish: true, alias }),
	// 		fixture: 'hello.zip',
	// 		contents: 'test UpdateFunctionCodeCommand',
	// 	}, done, () => {
	// 		mocked.methods.updateAlias.firstCall.args[0].should.eql({
	// 			FunctionName: 'someFunction',
	// 			FunctionVersion: '42',
	// 			Name: 'alias',
	// 			Description: 'my alias',
	// 		});
	// 	});
	// });
});
