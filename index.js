const {
	LambdaClient, GetAliasCommand, GetFunctionConfigurationCommand,
	UpdateFunctionCodeCommand, CreateFunctionCommand, UpdateFunctionConfigurationCommand,
	CreateAliasCommand, UpdateAliasCommand,
} = require('@aws-sdk/client-lambda');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const through = require('through2');
const PluginError = require('plugin-error');
const log = require('fancy-log');
const colors = require('ansi-colors');

const DEFAULT_OPTS = {
	profile: null,
	region: 'us-east-1',
};

const DEFAULT_PARAMS = {
	Handler: 'index.handler',
	Runtime: 'nodejs10.x',
};

const makeErr = (message) => new PluginError('gulp-awslambda', message);

const updateFunctionCode = (lambda, name, upload, params, opts) => {
	delete params.Runtime;
	const code = params.Code || { ZipFile: upload.contents };
	return lambda.send(new UpdateFunctionCodeCommand({
		FunctionName: name,
		...code,
		Publish: opts.publish || false,
	}));
};

const createFunction = (lambda, upload, params, opts) => {
	params.Code = params.Code || { ZipFile: upload.contents };
	return lambda.send(new CreateFunctionCommand({
		...DEFAULT_PARAMS,
		Publish: opts.publish || false,
		...params,
	}));
};

const upsertAlias = async (operation, lambda, functionName, functionVersion, alias, aliasDesc) => {
	const params = {
		FunctionName: functionName,
		FunctionVersion: functionVersion,
		Name: alias,
		Description: aliasDesc,
	};
	// get command
	let Command = UpdateAliasCommand;
	if (operation === 'create') Command = CreateAliasCommand;
	try {
		await lambda.send(new Command(params));
		log(`${operation}d alias ${colors.magenta(alias)} for version ${colors.magenta(functionVersion)}`);
	} catch (err) {
		log(`Could not ${operation} alias ${alias}:${err}`);
	}
};

module.exports = (params, _opts) => {
	const opts = { ...DEFAULT_OPTS, ..._opts };

	const lambda = new LambdaClient({
		region: opts.region,
		credentials: fromIni({ profile: opts.profile || 'default' }),
	});

	let toUpload;
	const functionName = typeof params === 'string' ? params : params.FunctionName;

	const updateOrCreateAlias = async (response) => {
		if (opts.publish && opts.alias) {
			let operation = 'update';
			try {
				await lambda.send(new GetAliasCommand({
					FunctionName: functionName,
					Name: opts.alias.name,
				}));
			} catch (err) {
				operation = 'create';
			} finally {
				await upsertAlias(operation, lambda, functionName,
					(opts.alias.version || response.data.Version).toString(),
					opts.alias.name,
					opts.alias.description);
			}
		}
	};

	const printVersion = (response) => {
		if (opts.publish) {
			log(`Publishing Function Version: ${colors.magenta(response.data.Version)}`);
		}
	};

	const successfulUpdate = (response) => {
		printVersion(response);
		return updateOrCreateAlias(response);
	};

	const successfulCreation = (response) => {
		printVersion(response);
		return updateOrCreateAlias(response);
	};

	const transform = (file, enc, cb) => {
		if (file.isNull()) {
			return cb();
		}
		if (file.isStream()) {
			return cb(makeErr('Streaming is not supported'));
		}
		if (!toUpload) {
			toUpload = file;
		}
		cb();
	};

	async function flush(cb) {
		if (!toUpload && (typeof params === 'string' || !params.Code)) {
			return cb(makeErr('No code provided'));
		}
		if (toUpload && toUpload.path.slice(-4) !== '.zip') {
			return cb(makeErr('Provided file is not a ZIP'));
		}
		if (opts.alias) {
			if (!opts.alias.name) {
				return cb(makeErr(`Alias requires a ${colors.red('name')} parameter`));
			} if (!(typeof opts.alias.name === 'string')) {
				return cb(makeErr(`Alias ${colors.red('name')} must be a string`));
			}
		}

		log(`Uploading Lambda function "${functionName}"...`);

		const stream = this;

		const done = (err) => {
			if (err) {
				return cb(makeErr(err.message));
			}
			log(`Lambda function "${functionName}" successfully uploaded`);
			stream.push(toUpload);
			cb();
		};

		if (typeof params === 'string') {
			// Just updating code
			try {
				const update = await updateFunctionCode(lambda, params, toUpload, params, opts);
				await successfulUpdate(update);
				done();
			} catch (err) {
				done(err);
			}
		} else {
			try {
				const existingParams = await lambda.send(new GetFunctionConfigurationCommand({
					FunctionName: params.FunctionName,
				}));
				// combine new parameters with existing
				const newParams = { ...params, ...existingParams };
				// remove unneeded paramaters
				delete newParams.CodeSha256;
				delete newParams.CodeSize;
				delete newParams.FunctionArn;
				delete newParams.LastModified;
				delete newParams.LastUpdateStatus;
				delete newParams.LastUpdateStatusReason;
				delete newParams.LastUpdateStatusCodeReason;
				delete newParams.RevisionId;
				delete newParams.Version;
				try {
					const result = await updateFunctionCode(lambda, params.FunctionName, toUpload, params, opts);
					await successfulUpdate(result);
					await lambda.send(new UpdateFunctionConfigurationCommand(newParams, done));
					done();
				} catch (err) {
					done(err);
				}
			} catch (err) {
				try {
					// Creating a function
					const result = await createFunction(lambda, toUpload, params, opts);
					successfulCreation(result);
					done();
				} catch (err2) {
					done(err2);
				}
			}
		}
	}

	return through.obj(transform, flush);
};
